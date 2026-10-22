-- Class Log card decks and rehearsal results (school/class-log/REHEARSAL_SPEC.md, WP-1 1.1).
-- Run by hand in the Supabase SQL editor (as postgres), then
-- `NOTIFY pgrst, 'reload schema';`. Every name is schema-qualified with a2.
-- because the SQL editor does not keep `SET search_path`. Idempotent: safe to
-- run again. Needs 0041 (a2.observer_cards). Until it runs, GET /class-log/decks,
-- POST /class-log/deck-results and the /teacher/decks routes answer 503 and the
-- phone logs `Decks: fetch failed (HTTP 503)` at most hourly.
-- The phone never touches these tables; roster-server reads and writes them with
-- the service key (scripts/draft-card-decks.mjs --apply fills card_decks through
-- PUT /teacher/decks; the phone posts grades to deck_results).
--
-- card_decks: one deck per observer card. date/course/section are copied from the
-- card so the phone's by-date query needs no join. items is the validated JSON
-- array (roster-server/deck-rules.js); content_hash covers items and model, and a
-- PUT writes only when it differs, all decks of a PUT in one transaction
-- (a2.put_card_decks, below).
create table if not exists a2.card_decks (
  card_id       uuid primary key references a2.observer_cards(id) on delete cascade,
  date          date not null,
  course        text not null check (course in ('algebra2','apstats')),
  section       text,                                   -- null = the course-wide card
  items         jsonb not null check (jsonb_typeof(items) = 'array'),
  model         text,
  generated_at  timestamptz,
  updated_at    timestamptz not null default now(),
  content_hash  text not null
);
create index if not exists card_decks_date on a2.card_decks (date);

-- deck_results: one row per grade the phone recorded. No foreign key: results
-- outlive a deleted or replaced deck so the Desk keeps the history.
create table if not exists a2.deck_results (
  id           bigserial primary key,
  card_id      uuid not null,
  device       text not null,
  section      text not null,
  date         date not null,
  session      int not null,
  item_id      text not null,
  grade        text not null check (grade in ('again','got_it')),
  at           timestamptz not null,                    -- the phone's clock
  latency_ms   int,
  received_at  timestamptz not null default now(),      -- server clock
  unique (card_id, device, session, item_id, at)
);
create index if not exists deck_results_card on a2.deck_results (card_id);

alter table a2.card_decks enable row level security;
alter table a2.deck_results enable row level security;
revoke all on a2.card_decks, a2.deck_results from anon, authenticated;
revoke all on sequence a2.deck_results_id_seq from anon, authenticated;
grant all on a2.card_decks, a2.deck_results to service_role;
grant usage, select on sequence a2.deck_results_id_seq to service_role;

-- Any UPDATE (Desk push or a hand edit in the SQL editor) bumps updated_at.
-- Same function as 0042/0044; recreated here so this file also stands alone.
create or replace function a2.a2_touch_updated_at() returns trigger
language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end;
$$;
revoke all on function a2.a2_touch_updated_at() from public, anon, authenticated;
grant execute on function a2.a2_touch_updated_at() to service_role;

do $trigger$
begin
  if not exists (
    select 1 from pg_trigger
    where tgname = 'card_decks_touch_updated_at' and tgrelid = 'a2.card_decks'::regclass
  ) then
    create trigger card_decks_touch_updated_at
      before update on a2.card_decks
      for each row execute function a2.a2_touch_updated_at();
  end if;
end;
$trigger$;

-- PUT /teacher/decks in one transaction. p_decks is the validated array
-- [{card_id, items, model, generated_at, content_hash}] (roster-server/deck-rules.js
-- runs first). Every card must exist, else nothing is written and the error is
-- SQLSTATE P0002 with message 'card_not_found:<uuid>' (the route answers 404).
-- date/course/section are copied from the card; a deck is written only when its
-- content hash or those copied fields differ. Returns {written, unchanged}.
create or replace function a2.put_card_decks(p_decks jsonb) returns jsonb
language plpgsql as $$
declare
  d jsonb;
  v_card uuid;
  v_date date; v_course text; v_section text;
  v_hash text; v_old_date date; v_old_course text; v_old_section text; v_exists boolean;
  v_written int := 0;
  v_unchanged int := 0;
begin
  if jsonb_typeof(p_decks) is distinct from 'array' then
    raise exception 'p_decks must be a json array' using errcode = '22023';
  end if;
  for d in select value from jsonb_array_elements(p_decks) loop
    v_card := (d->>'card_id')::uuid;
    perform 1 from a2.observer_cards where id = v_card for share;
    if not found then
      raise exception 'card_not_found:%', v_card using errcode = 'P0002';
    end if;
  end loop;
  for d in select value from jsonb_array_elements(p_decks) loop
    v_card := (d->>'card_id')::uuid;
    select date, course, section into v_date, v_course, v_section from a2.observer_cards where id = v_card;
    select content_hash, date, course, section into v_hash, v_old_date, v_old_course, v_old_section
      from a2.card_decks where card_id = v_card for update;
    v_exists := found;
    if v_exists and v_hash = d->>'content_hash' and v_old_date = v_date and v_old_course = v_course
       and v_old_section is not distinct from v_section then
      v_unchanged := v_unchanged + 1;
    else
      insert into a2.card_decks (card_id, date, course, section, items, model, generated_at, content_hash, updated_at)
      values (v_card, v_date, v_course, v_section, d->'items', d->>'model', (d->>'generated_at')::timestamptz, d->>'content_hash', now())
      on conflict (card_id) do update set
        date = excluded.date, course = excluded.course, section = excluded.section, items = excluded.items,
        model = excluded.model, generated_at = excluded.generated_at, content_hash = excluded.content_hash;
      v_written := v_written + 1;
    end if;
  end loop;
  return jsonb_build_object('written', v_written, 'unchanged', v_unchanged);
end;
$$;
revoke all on function a2.put_card_decks(jsonb) from public, anon, authenticated;
grant execute on function a2.put_card_decks(jsonb) to service_role;
