-- 0031_frq_tickets.sql -- turn an existing FRQ ledger row into a durable,
-- leased grade ticket without rewriting item_ledger.
--
-- Expected lock profile: on PostgreSQL 11+, nullable columns and columns with
-- constant defaults are metadata-only ADD COLUMN operations. The single ALTER
-- acquires ACCESS EXCLUSIVE once. The two partial index builds below acquire a
-- SHARE lock; at the current item_ledger row count each build is expected to take
-- seconds. Operators who cannot accept that lock should use the commented
-- non-transactional CONCURRENTLY alternative below instead of the two ordinary
-- CREATE INDEX statements. No statement in this migration rewrites the table.

alter table item_ledger
  add column if not exists frq_response_version bigint not null default 0,
  add column if not exists frq_response_hash text,
  add column if not exists frq_ready_at timestamptz,
  add column if not exists frq_claim_token uuid,
  add column if not exists frq_claim_owner text,
  add column if not exists frq_claimed_until timestamptz,
  add column if not exists frq_retry_count int not null default 0,
  add column if not exists frq_next_attempt_at timestamptz,
  add column if not exists frq_last_error text,
  add column if not exists frq_result jsonb,
  add column if not exists frq_rubric_version text,
  add column if not exists frq_appeal_count int not null default 0,
  add column if not exists frq_appeal_pending jsonb,
  add column if not exists frq_last_appeal jsonb;

-- WHY: frq_ready_at + ledger_id provide the claim query's due-time order and
-- stable tie-breaker. The trailing retry/lease columns cover its remaining time
-- eligibility checks before the bounded set of rows is visited and locked. The
-- immutable partial predicate keeps drafts and non-FRQ rows out of the index.
create index if not exists item_ledger_frq_claim_scan_idx
  on item_ledger (frq_ready_at, ledger_id, frq_next_attempt_at, frq_claimed_until)
  where source = 'frq'
    and score is null
    and response is not null
    and jsonb_typeof(response) = 'string'
    and char_length(response #>> '{}') >= 20
    and frq_ready_at is not null;

-- WHY: appeals use recorded_at for their due-time order and are absent from the
-- initial-work partition. The remaining keys cover the tie-breaker and time gates.
create index if not exists item_ledger_frq_appeal_scan_idx
  on item_ledger (recorded_at, ledger_id, frq_next_attempt_at, frq_claimed_until)
  where source = 'frq' and score is not null and frq_appeal_pending is not null;

-- Non-transactional alternative for a larger production table (do not run these
-- inside a migration transaction; comment out the two ordinary builds above):
--   -- DROP also removes an invalid index left by an interrupted prior build.
--   drop index concurrently if exists item_ledger_frq_claim_scan_idx;
--   create index concurrently item_ledger_frq_claim_scan_idx
--     on item_ledger (frq_ready_at, ledger_id, frq_next_attempt_at, frq_claimed_until)
--     where source = 'frq' and score is null and response is not null
--       and jsonb_typeof(response) = 'string'
--       and char_length(response #>> '{}') >= 20 and frq_ready_at is not null;
--   drop index concurrently if exists item_ledger_frq_appeal_scan_idx;
--   create index concurrently item_ledger_frq_appeal_scan_idx
--     on item_ledger (recorded_at, ledger_id, frq_next_attempt_at, frq_claimed_until)
--     where source = 'frq' and score is not null and frq_appeal_pending is not null;

-- Atomically create or refresh the unique (student, frq, item, attempt=1) ticket.
-- ON CONFLICT takes the same row lock an explicit SELECT FOR UPDATE would take.
-- A graded row is deliberately immutable here: score and its bound response/hash
-- survive cached drafts and OfflineQueue replay.
create or replace function record_frq_draft(
  p_student_id uuid,
  p_item_id text,
  p_response text,
  p_response_hash text,
  p_ready_at timestamptz
)
returns table (
  ledger_id uuid,
  status text,
  response_version bigint
)
language sql
as $$
  with upserted as (
    insert into item_ledger (
      student_id,
      source,
      item_id,
      response,
      score,
      attempt,
      frq_response_version,
      frq_response_hash,
      frq_ready_at
    )
    values (
      p_student_id,
      'frq',
      p_item_id,
      to_jsonb(p_response),
      null,
      1,
      1,
      p_response_hash,
      p_ready_at
    )
    on conflict (student_id, source, item_id, attempt) do update
    set
      response = case
        when item_ledger.score is null
          and item_ledger.frq_response_hash is distinct from excluded.frq_response_hash
          then excluded.response
        else item_ledger.response
      end,
      frq_response_version = case
        when item_ledger.score is null
          and item_ledger.frq_response_hash is distinct from excluded.frq_response_hash
          then item_ledger.frq_response_version + 1
        else item_ledger.frq_response_version
      end,
      frq_response_hash = case
        when item_ledger.score is null
          and item_ledger.frq_response_hash is distinct from excluded.frq_response_hash
          then excluded.frq_response_hash
        else item_ledger.frq_response_hash
      end,
      -- An identical blur/Done replay may only make work ready sooner. It must
      -- not delay an existing ticket or invalidate a worker grading the same text.
      frq_ready_at = case
        when item_ledger.score is not null then item_ledger.frq_ready_at
        when item_ledger.frq_response_hash is distinct from excluded.frq_response_hash
          then excluded.frq_ready_at
        else coalesce(
          least(item_ledger.frq_ready_at, excluded.frq_ready_at),
          item_ledger.frq_ready_at,
          excluded.frq_ready_at
        )
      end,
      frq_claim_token = case
        when item_ledger.score is null
          and item_ledger.frq_response_hash is distinct from excluded.frq_response_hash
          then null
        else item_ledger.frq_claim_token
      end,
      frq_claim_owner = case
        when item_ledger.score is null
          and item_ledger.frq_response_hash is distinct from excluded.frq_response_hash
          then null
        else item_ledger.frq_claim_owner
      end,
      frq_claimed_until = case
        when item_ledger.score is null
          and item_ledger.frq_response_hash is distinct from excluded.frq_response_hash
          then null
        else item_ledger.frq_claimed_until
      end,
      frq_retry_count = case
        when item_ledger.score is null
          and item_ledger.frq_response_hash is distinct from excluded.frq_response_hash
          then 0
        else item_ledger.frq_retry_count
      end,
      frq_next_attempt_at = case
        when item_ledger.score is null
          and item_ledger.frq_response_hash is distinct from excluded.frq_response_hash
          then null
        else item_ledger.frq_next_attempt_at
      end,
      frq_last_error = case
        when item_ledger.score is null
          and item_ledger.frq_response_hash is distinct from excluded.frq_response_hash
          then null
        else item_ledger.frq_last_error
      end
    returning item_ledger.*
  )
  select
    u.ledger_id,
    case
      when u.score is not null then 'graded'
      when u.frq_claimed_until > now() then 'grading'
      when u.frq_next_attempt_at > now() then 'retrying'
      when u.response is null
        or jsonb_typeof(u.response) <> 'string'
        or char_length(u.response #>> '{}') < 20
        or u.frq_ready_at is null then 'draft'
      else 'queued'
    end,
    u.frq_response_version
  from upserted as u;
$$;

-- Claim and return one stable snapshot in one statement. FOR UPDATE SKIP LOCKED
-- is the distributed arbiter: concurrent Railway processes cannot select the
-- same current lease, while an expired lease remains recoverable.
-- Remove the superseded clock-injection overload if an earlier draft of this
-- migration was applied. Production eligibility is always based on the DB clock.
drop function if exists claim_frq_tickets(text, int, bigint, timestamptz);
drop function if exists claim_frq_tickets(text, int, bigint);

create or replace function claim_frq_tickets(
  p_worker text,
  p_limit int,
  p_lease_ms bigint
)
returns table (
  ledger_id uuid,
  student_id uuid,
  item_id text,
  response jsonb,
  frq_response_version bigint,
  frq_response_hash text,
  frq_claim_token uuid,
  frq_retry_count int,
  is_appeal boolean,
  attempt int,
  evidence_tier text,
  score numeric,
  frq_result jsonb,
  frq_appeal_pending jsonb,
  graded_at timestamptz
)
language sql
as $$
  with claim_clock as (
    -- One stable database timestamp drives both eligibility and lease expiry.
    select statement_timestamp() as at
  ),
  candidates as (
    select l.ledger_id
    from item_ledger as l
    cross join claim_clock as clock
    where l.source = 'frq'
      and (l.frq_claimed_until is null or l.frq_claimed_until <= clock.at)
      and (l.frq_next_attempt_at is null or l.frq_next_attempt_at <= clock.at)
      and (
        (
          l.score is null
          and l.response is not null
          and jsonb_typeof(l.response) = 'string'
          and char_length(l.response #>> '{}') >= 20
          and l.frq_ready_at is not null
          and l.frq_ready_at <= clock.at
        )
        or
        (
          l.score is not null
          and l.frq_appeal_pending is not null
        )
      )
    order by
      case when l.score is null then l.frq_ready_at else l.recorded_at end,
      l.ledger_id
    for update of l skip locked
    limit greatest(coalesce(p_limit, 0), 0)
  ),
  claimed as (
    update item_ledger as l
    set
      frq_claim_token = gen_random_uuid(),
      frq_claim_owner = p_worker,
      frq_claimed_until = clock.at
        + least(greatest(coalesce(p_lease_ms, 5000), 5000), 600000)
          * interval '1 millisecond'
    from candidates as c
    cross join claim_clock as clock
    where l.ledger_id = c.ledger_id
    returning l.*
  )
  select
    c.ledger_id,
    c.student_id,
    c.item_id,
    c.response,
    c.frq_response_version,
    c.frq_response_hash,
    c.frq_claim_token,
    c.frq_retry_count,
    c.score is not null and c.frq_appeal_pending is not null,
    c.attempt,
    c.evidence_tier,
    c.score,
    c.frq_result,
    c.frq_appeal_pending,
    c.graded_at
  from claimed as c
  order by c.ledger_id;
$$;

-- Queue an appeal under the same row lock used by apply_frq_verdict. This keeps
-- count, dedup, cooldown, and pending replacement one atomic decision and keeps
-- a live worker claim from consuming a newly replaced request.
-- The revised-text parameter changed the argument list; CREATE OR REPLACE with a
-- different signature would ADD an overload (and make 4-argument calls ambiguous,
-- SQLSTATE 42725), so drop the original signature first. Re-run-safe.
drop function if exists queue_frq_appeal(uuid, text, text, timestamptz);
create or replace function queue_frq_appeal(
  p_student_id uuid,
  p_item_id text,
  p_appeal_text text,
  p_requested_at timestamptz default statement_timestamp(),
  p_revised_text text default null
)
returns table (
  queued boolean,
  appeal_count int,
  reason text
)
language plpgsql
as $$
declare
  v_row item_ledger%rowtype;
  -- p_requested_at remains only for rollout signature compatibility. Security
  -- decisions always use the database statement clock.
  v_now timestamptz := statement_timestamp();
  v_appeal_hash text := md5(regexp_replace(btrim(coalesce(p_appeal_text, '')), '[[:space:]]+', ' ', 'g'));
  v_pending_hash text;
  v_last_hash text;
  v_pending_at timestamptz;
  v_last_at timestamptz;
  v_revised_text text;
begin
  select l.*
    into v_row
    from item_ledger as l
    where l.student_id = p_student_id
      and l.source = 'frq'
      and l.item_id = p_item_id
      and l.attempt = 1
    for update;

  if not found then
    return query select false, 0, 'not_found'::text;
    return;
  end if;
  if v_row.score is null then
    return query select false, v_row.frq_appeal_count, 'not_graded'::text;
    return;
  end if;
  if v_row.frq_appeal_count >= 3 then
    return query select false, v_row.frq_appeal_count, 'limit'::text;
    return;
  end if;
  v_revised_text := case
    when p_revised_text is null then null
    when btrim(p_revised_text) = btrim(coalesce(v_row.response #>> '{}', '')) then null
    else btrim(p_revised_text)
  end;
  v_pending_hash := coalesce(
    v_row.frq_appeal_pending ->> 'hash',
    case when v_row.frq_appeal_pending ->> 'text' is not null
      then md5(regexp_replace(btrim(v_row.frq_appeal_pending ->> 'text'), '[[:space:]]+', ' ', 'g'))
    end
  );
  v_last_hash := v_row.frq_last_appeal ->> 'hash';
  if v_appeal_hash = v_pending_hash or v_appeal_hash = v_last_hash then
    return query select false, v_row.frq_appeal_count, 'duplicate'::text;
    return;
  end if;

  begin
    v_pending_at := nullif(v_row.frq_appeal_pending ->> 'requestedAt', '')::timestamptz;
  exception when others then
    v_pending_at := null;
  end;
  begin
    v_last_at := nullif(v_row.frq_last_appeal ->> 'at', '')::timestamptz;
  exception when others then
    v_last_at := null;
  end;
  if v_row.frq_claimed_until > v_now
    or (v_pending_at is not null and v_pending_at > v_now - interval '60 seconds')
    or (v_last_at is not null and v_last_at > v_now - interval '60 seconds') then
    return query select false, v_row.frq_appeal_count, 'cooldown'::text;
    return;
  end if;

  update item_ledger as l
  set
    frq_appeal_count = l.frq_appeal_count + 1,
    frq_appeal_pending = jsonb_strip_nulls(jsonb_build_object(
      'text', p_appeal_text,
      'hash', v_appeal_hash,
      'requestedAt', v_now,
      'version', l.frq_response_version,
      'revisedText', v_revised_text
    )),
    frq_last_appeal = jsonb_build_object('hash', v_appeal_hash, 'at', v_now),
    frq_claim_token = null,
    frq_claim_owner = null,
    frq_claimed_until = null,
    frq_retry_count = 0,
    frq_next_attempt_at = null,
    frq_last_error = null
  where l.ledger_id = v_row.ledger_id
  returning l.frq_appeal_count into v_row.frq_appeal_count;

  return query select true, v_row.frq_appeal_count, 'queued'::text;
end;
$$;

-- (No four-argument compatibility overload: keeping one would make
-- four-argument calls ambiguous against the five-argument default (42725).
-- The old production signature is dropped above; all callers pass named params.)

-- Apply under a row lock so the version/hash decision, max floor, result write,
-- and lease release serialize with drafts and competing graders. responseHash is
-- accepted as internal envelope metadata in p_result and removed before the
-- student-visible result is stored; response_version remains the required binding
-- for callers using the contracted sanitized result shape without that key.
create or replace function apply_frq_verdict(
  p_ledger_id uuid,
  p_claim_token uuid,
  p_response_version bigint,
  p_score numeric,
  p_result jsonb,
  p_rubric_version text,
  p_graded_at timestamptz,
  p_teacher boolean default false
)
returns table (
  applied boolean,
  stale boolean,
  previous_score numeric,
  score numeric,
  ledger_id uuid
)
language plpgsql
as $$
declare
  v_row item_ledger%rowtype;
  v_expected_hash text;
  v_previous_score numeric;
  v_final_score numeric;
  v_applied boolean;
  v_was_appeal boolean;
  v_hash_matches boolean;
  v_claim_matches boolean;
begin
  -- Invalid model output is not a verdict. In particular, do not release its
  -- lease; the caller must classify the failure with fail_frq_claim.
  if p_score is null or p_score not in (0::numeric, 0.5::numeric, 1::numeric) then
    select l.score
      into v_previous_score
      from item_ledger as l
      where l.ledger_id = p_ledger_id;

    return query
      select false, false, v_previous_score, v_previous_score, p_ledger_id;
    return;
  end if;

  -- WHY: every decision below is based on this exact row image; the lock makes
  -- a simultaneous draft or verdict wait and re-evaluate after our atomic write.
  select l.*
    into v_row
    from item_ledger as l
    where l.ledger_id = p_ledger_id
    for update;

  if not found then
    return query select false, true, null::numeric, null::numeric, p_ledger_id;
    return;
  end if;

  v_expected_hash := coalesce(
    p_result ->> 'responseHash',
    p_result ->> 'response_hash'
  );
  v_hash_matches := v_expected_hash is not null
    and v_row.frq_response_hash is not distinct from v_expected_hash;
  -- coalesce: a released/reissued claim leaves frq_claim_token NULL or different;
  -- NULL = uuid is SQL-null, and "not null" in the elsif below would silently treat
  -- that as a match-adjacent fallthrough. A worker token matches ONLY a stored equal token.
  v_claim_matches := p_claim_token is not null
    and coalesce(v_row.frq_claim_token = p_claim_token, false);

  if v_row.frq_response_version is distinct from p_response_version then
    return query
      select false, true, v_row.score, v_row.score, v_row.ledger_id;
    return;
  end if;

  if p_claim_token is null then
    -- Teacher/sweep calls have no lease token, so both the explicit authority
    -- bit and caller-carried response hash are mandatory.
    if not coalesce(p_teacher, false) or not v_hash_matches then
      return query
        select false, true, v_row.score, v_row.score, v_row.ledger_id;
      return;
    end if;
  elsif not v_claim_matches then
    -- A non-null worker token must be the token still stored on the row. An
    -- expired-but-unreclaimed owner may finish, but after reclaim the old token
    -- is stale. This intentionally spends one extra model call when a lease
    -- expires mid-grade; accepting a hash plus arbitrary/old token is unsafe.
    return query
      select false, true, v_row.score, v_row.score, v_row.ledger_id;
    return;
  else
    -- The token binds the snapshot. If the caller also carries the hash, reject
    -- disagreement instead of silently trusting one of the two bindings.
    if v_expected_hash is not null and not v_hash_matches then
      return query
        select false, true, v_row.score, v_row.score, v_row.ledger_id;
      return;
    end if;
  end if;

  v_previous_score := v_row.score;
  v_was_appeal := v_row.score is not null and v_row.frq_appeal_pending is not null;
  v_final_score := case
    when v_row.score is null then p_score
    else greatest(v_row.score, p_score)
  end;
  v_applied := v_final_score is distinct from v_row.score
    and v_final_score is not null;

  update item_ledger as l
  set
    score = v_final_score,
    frq_result = case
      when v_applied then
        (
          case when jsonb_typeof(p_result) = 'object' then p_result else '{}'::jsonb end
          - 'responseHash'
          - 'response_hash'
        ) || jsonb_build_object('score', v_final_score)
      else l.frq_result
    end,
    frq_rubric_version = case
      when v_applied then p_rubric_version
      else l.frq_rubric_version
    end,
    graded_at = case
      when v_applied then coalesce(p_graded_at, statement_timestamp())
      else l.graded_at
    end,
    frq_claim_token = null,
    frq_claim_owner = null,
    frq_claimed_until = null,
    frq_retry_count = 0,
    frq_next_attempt_at = null,
    frq_last_error = null,
    -- Preserve the completed request for the student while retaining the hash
    -- and request time used by queue_frq_appeal for dedup and cooldown.
    frq_last_appeal = case
      when v_was_appeal then jsonb_strip_nulls(jsonb_build_object(
        'text', v_row.frq_appeal_pending -> 'text',
        'revisedText', v_row.frq_appeal_pending -> 'revisedText',
        'hash', coalesce(
          v_row.frq_appeal_pending -> 'hash',
          v_row.frq_last_appeal -> 'hash'
        ),
        'at', coalesce(
          v_row.frq_appeal_pending -> 'requestedAt',
          v_row.frq_last_appeal -> 'at',
          to_jsonb(statement_timestamp())
        ),
        'outcome', case when v_applied then 'raised' else 'maintained' end
      ))
      else l.frq_last_appeal
    end,
    frq_appeal_pending = case
      when v_was_appeal then null
      else l.frq_appeal_pending
    end
  where l.ledger_id = p_ledger_id;

  return query
    select v_applied, false, v_previous_score, v_final_score, p_ledger_id;
end;
$$;

-- Release only the lease identified by the caller's token. A reclaimed row has
-- a new token, so a late failure from the old worker cannot erase the new lease.
create or replace function fail_frq_claim(
  p_ledger_id uuid,
  p_claim_token uuid,
  p_error text,
  p_next_attempt_at timestamptz
)
returns boolean
language sql
as $$
  with failure_clock as (
    select statement_timestamp() as at
  ),
  released as (
    update item_ledger as l
    set
      frq_claim_token = null,
      frq_claim_owner = null,
      frq_claimed_until = null,
      frq_retry_count = l.frq_retry_count + 1,
      -- Only operational categories cross this boundary. Provider payloads and
      -- exception text are deliberately collapsed to unknown.
      frq_last_error = case
        when p_error = any (array[
          'timeout',
          'http_4xx',
          'http_5xx',
          'bad_verdict',
          'prompt_error',
          'network',
          'stale',
          'unknown'
        ]::text[]) then p_error
        else 'unknown'
      end,
      frq_next_attempt_at = case
        -- A missing committed rubric cannot heal through model retries. Infinity
        -- keeps the row visible as a durable failed ticket without rescanning it.
        when p_error = 'prompt_error' then 'infinity'::timestamptz
        else least(
          coalesce(p_next_attempt_at, clock.at),
          clock.at + interval '15 minutes'
        )
      end
    from failure_clock as clock
    where l.ledger_id = p_ledger_id
      and l.frq_claim_token = p_claim_token
    returning 1
  )
  select exists(select 1 from released);
$$;

-- Functions are RPCs for the roster service, not public database APIs.
revoke all on function record_frq_draft(uuid, text, text, text, timestamptz) from public;
revoke all on function claim_frq_tickets(text, int, bigint) from public;
revoke all on function apply_frq_verdict(uuid, uuid, bigint, numeric, jsonb, text, timestamptz, boolean) from public;
revoke all on function fail_frq_claim(uuid, uuid, text, timestamptz) from public;
revoke all on function queue_frq_appeal(uuid, text, text, timestamptz, text) from public;

-- Supabase normally provides anon/authenticated/service_role. Local PostgreSQL
-- and differently named platforms may not, so optional role changes are guarded.
-- If service_role is absent, the migration owner retains its normal owner rights
-- and the operator must grant the platform's equivalent service role explicitly.
do $permissions$
declare
  v_role text;
begin
  foreach v_role in array array['anon', 'authenticated'] loop
    if exists (select 1 from pg_roles where rolname = v_role) then
      execute format(
        'revoke all on function record_frq_draft(uuid, text, text, text, timestamptz) from %I',
        v_role
      );
      execute format(
        'revoke all on function claim_frq_tickets(text, int, bigint) from %I',
        v_role
      );
      execute format(
        'revoke all on function apply_frq_verdict(uuid, uuid, bigint, numeric, jsonb, text, timestamptz, boolean) from %I',
        v_role
      );
      execute format(
        'revoke all on function fail_frq_claim(uuid, uuid, text, timestamptz) from %I',
        v_role
      );
      execute format(
        'revoke all on function queue_frq_appeal(uuid, text, text, timestamptz, text) from %I',
        v_role
      );
    end if;
  end loop;

  if exists (select 1 from pg_roles where rolname = 'service_role') then
    execute 'grant execute on function record_frq_draft(uuid, text, text, text, timestamptz) to service_role';
    execute 'grant execute on function claim_frq_tickets(text, int, bigint) to service_role';
    execute 'grant execute on function apply_frq_verdict(uuid, uuid, bigint, numeric, jsonb, text, timestamptz, boolean) to service_role';
    execute 'grant execute on function fail_frq_claim(uuid, uuid, text, timestamptz) to service_role';
    execute 'grant execute on function queue_frq_appeal(uuid, text, text, timestamptz, text) to service_role';
  end if;
end;
$permissions$;
