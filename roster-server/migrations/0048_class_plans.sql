-- Atomic Class Log plans and durable commitments. Apply after 0041-0047.
-- One scope lock protects summary ingestion, status changes, and plan publication.
-- Package revisions are immutable; heads hold the current authoring inputs.
create table if not exists a2.class_plan_scopes (
  course text not null check (course in ('algebra2','apstats')),
  section text not null check (length(section) between 1 and 16),
  version bigint not null default 0,
  latest_summary jsonb,
  latest_summary_hash text,
  pending_summary jsonb,
  pending_summary_hash text,
  updated_at timestamptz not null default now(),
  primary key (course, section)
);

create table if not exists a2.class_commitments (
  course text not null,
  section text not null,
  id text not null check (length(id) between 1 and 128),
  kind text not null check (kind in ('promise','prep','question')),
  text text not null,
  status text not null check (status in ('open','done','deferred','cancelled')),
  source jsonb not null default '{}'::jsonb,
  source_date date,
  due_date date,
  deferred_until date,
  version bigint not null default 1,
  updated_at timestamptz not null default now(),
  primary key (course, section, id),
  foreign key (course, section) references a2.class_plan_scopes(course, section),
  check (status <> 'deferred' or deferred_until is not null)
);

-- Raw evidence is private and append-only, including revisions received before
-- any lesson plan exists. class_summaries remains the compatible latest view.
create table if not exists a2.class_summary_revisions (
  date date not null,
  course text not null,
  section text not null,
  revision text not null,
  summary jsonb not null,
  created_at timestamptz not null default now(),
  primary key (date, course, section, revision),
  foreign key (course, section) references a2.class_plan_scopes(course, section)
);

create table if not exists a2.class_plan_packages (
  date date not null,
  course text not null,
  section text not null,
  revision text not null,
  package jsonb not null,
  created_at timestamptz not null default now(),
  primary key (date, course, section, revision),
  foreign key (course, section) references a2.class_plan_scopes(course, section)
);

create table if not exists a2.class_plan_heads (
  date date not null,
  course text not null,
  section text not null,
  revision text not null,
  inputs jsonb not null,
  updated_at timestamptz not null default now(),
  primary key (date, course, section),
  foreign key (date, course, section, revision)
    references a2.class_plan_packages(date, course, section, revision)
);

create table if not exists a2.class_plan_operations (
  course text not null,
  section text not null,
  operation_id text not null,
  request_hash text not null,
  result jsonb not null,
  created_at timestamptz not null default now(),
  primary key (course, section, operation_id),
  foreign key (course, section) references a2.class_plan_scopes(course, section)
);

alter table a2.class_plan_scopes enable row level security;
alter table a2.class_commitments enable row level security;
alter table a2.class_plan_packages enable row level security;
alter table a2.class_plan_heads enable row level security;
alter table a2.class_plan_operations enable row level security;
alter table a2.class_summary_revisions enable row level security;
revoke all on a2.class_plan_scopes, a2.class_commitments, a2.class_plan_packages,
  a2.class_plan_heads, a2.class_plan_operations, a2.class_summary_revisions from anon, authenticated;
grant all on a2.class_plan_scopes, a2.class_commitments, a2.class_plan_packages,
  a2.class_plan_heads, a2.class_plan_operations, a2.class_summary_revisions to service_role;
revoke update, delete, truncate on a2.class_plan_packages, a2.class_summary_revisions from service_role;

create or replace function a2.class_plan_package_immutable() returns trigger
language plpgsql as $$
begin
  raise exception 'class_plan_package_is_immutable' using errcode = '55000';
end;
$$;
revoke all on function a2.class_plan_package_immutable() from public, anon, authenticated;
grant execute on function a2.class_plan_package_immutable() to service_role;
do $trigger$
begin
  if not exists (select 1 from pg_trigger where tgname = 'class_plan_package_immutable'
      and tgrelid = 'a2.class_plan_packages'::regclass) then
    create trigger class_plan_package_immutable before update or delete on a2.class_plan_packages
      for each row execute function a2.class_plan_package_immutable();
  end if;
end;
$trigger$;

create or replace function a2.class_summary_revision_immutable() returns trigger
language plpgsql as $$
begin
  raise exception 'class_summary_revision_is_immutable' using errcode = '55000';
end;
$$;
revoke all on function a2.class_summary_revision_immutable() from public, anon, authenticated;
grant execute on function a2.class_summary_revision_immutable() to service_role;
do $trigger$
begin
  if not exists (select 1 from pg_trigger where tgname = 'class_summary_revision_immutable'
      and tgrelid = 'a2.class_summary_revisions'::regclass) then
    create trigger class_summary_revision_immutable before update or delete on a2.class_summary_revisions
      for each row execute function a2.class_summary_revision_immutable();
  end if;
end;
$trigger$;

-- Legacy writers share the publisher's scope advisory lock. Checking only a
-- head before mutation would race a first publication and permit a torn plan.
create or replace function a2.guard_packaged_class_plan() returns trigger
language plpgsql as $$
declare
  candidates jsonb := '[]'::jsonb; candidate jsonb; previous jsonb; following jsonb;
begin
  if current_setting('a2.class_plan_write',true) = 'on' then
    if tg_op = 'DELETE' then return old; else return new; end if;
  end if;
  if tg_op <> 'INSERT' then previous := to_jsonb(old); end if;
  if tg_op <> 'DELETE' then following := to_jsonb(new); end if;
  if tg_table_name = 'observer_cards' then
    candidates := jsonb_build_array(previous,following);
  else
    select coalesce(jsonb_agg(to_jsonb(c)),'[]'::jsonb) into candidates
      from a2.observer_cards c where c.id::text in (previous->>'card_id',following->>'card_id');
  end if;
  for candidate in select distinct value from jsonb_array_elements(candidates)
    where value->>'section' is not null order by value loop
    perform pg_advisory_xact_lock(hashtextextended((candidate->>'course')||'|'||(candidate->>'section'),0));
    if exists(select 1 from a2.class_plan_heads where date=(candidate->>'date')::date
        and course=candidate->>'course' and section=candidate->>'section') then
      raise exception 'atomic_plan_required' using errcode='P0001';
    end if;
  end loop;
  if tg_op = 'DELETE' then return old; else return new; end if;
end;
$$;
revoke all on function a2.guard_packaged_class_plan() from public, anon, authenticated;
grant execute on function a2.guard_packaged_class_plan() to service_role;
do $trigger$
begin
  if not exists(select 1 from pg_trigger where tgname='guard_packaged_class_plan_cards'
      and tgrelid='a2.observer_cards'::regclass) then
    create trigger guard_packaged_class_plan_cards before insert or update or delete on a2.observer_cards
      for each row execute function a2.guard_packaged_class_plan();
  end if;
  if not exists(select 1 from pg_trigger where tgname='guard_packaged_class_plan_decks'
      and tgrelid='a2.card_decks'::regclass) then
    create trigger guard_packaged_class_plan_decks before insert or update or delete on a2.card_decks
      for each row execute function a2.guard_packaged_class_plan();
  end if;
end;
$trigger$;

-- This snapshot is one SQL statement: commitments and heads cannot come from
-- opposite sides of a concurrent status transaction.
create or replace function a2.class_plan_snapshot(p_course text, p_section text) returns jsonb
language sql stable as $$
  select jsonb_build_object(
    'course', p_course, 'section', p_section,
    'version', coalesce((select version from a2.class_plan_scopes where course=p_course and section=p_section),0),
    'latestSummary', (select latest_summary from a2.class_plan_scopes where course=p_course and section=p_section),
    'latestSummaryHash', (select latest_summary_hash from a2.class_plan_scopes where course=p_course and section=p_section),
    'pendingSummary', (select pending_summary from a2.class_plan_scopes where course=p_course and section=p_section),
    'pendingSummaryHash', (select pending_summary_hash from a2.class_plan_scopes where course=p_course and section=p_section),
    'commitments', coalesce((select jsonb_agg(jsonb_build_object(
      'id', c.id, 'course', c.course, 'section', c.section, 'kind', c.kind, 'text', c.text,
      'status', c.status, 'source', c.source, 'sourceDate', c.source_date,
      'dueDate', c.due_date, 'deferredUntil', c.deferred_until, 'version', c.version,
      'updatedAt', c.updated_at) order by c.source_date,c.id)
      from a2.class_commitments c where c.course=p_course and c.section=p_section),'[]'::jsonb),
    'plans', coalesce((select jsonb_agg(p.package || jsonb_build_object('inputs',h.inputs,'updatedAt',h.updated_at,
      'scopeVersion',(select version from a2.class_plan_scopes where course=p_course and section=p_section)) order by h.date)
      from a2.class_plan_heads h join a2.class_plan_packages p using(date,course,section,revision)
      where h.course=p_course and h.section=p_section),'[]'::jsonb)
  );
$$;
revoke all on function a2.class_plan_snapshot(text,text) from public, anon, authenticated;
grant execute on function a2.class_plan_snapshot(text,text) to service_role;

-- One date's head and complete package are read together; there is no card/deck
-- join against mutable legacy rows on the phone's new read path.
create or replace function a2.class_plans_for_date(p_date date) returns jsonb
language sql stable as $$
  select coalesce(jsonb_agg(p.package || jsonb_build_object('inputs',h.inputs,'updatedAt',h.updated_at,'scopeVersion',s.version)
    order by h.course,h.section),'[]'::jsonb)
  from a2.class_plan_heads h join a2.class_plan_packages p using(date,course,section,revision)
    join a2.class_plan_scopes s using(course,section)
  where h.date=p_date;
$$;
revoke all on function a2.class_plans_for_date(date) from public, anon, authenticated;
grant execute on function a2.class_plans_for_date(date) to service_role;

-- All changes in a request share a transaction. Scope locks are acquired in a
-- stable order to avoid deadlocks across a batch. p_changes is server-validated;
-- no phone or browser has permission to call this RPC directly.
create or replace function a2.apply_class_plan_changes(p_changes jsonb) returns jsonb
language plpgsql as $$
declare
  s jsonb; c jsonb; p jsonb; summary jsonb; old_operation record; old_head record;
  v_course text; v_section text; v_version bigint; v_card_id uuid; v_package jsonb;
  v_changed boolean; v_written int; v_unchanged int; v_result jsonb;
  v_results jsonb := '[]'::jsonb; v_plans jsonb; v_current_commitments jsonb;
  v_previous_write_flag text := current_setting('a2.class_plan_write',true);
begin
  if jsonb_typeof(p_changes) is distinct from 'array' then
    raise exception 'changes must be an array' using errcode='22023';
  end if;
  perform set_config('a2.class_plan_write','on',true);
  for s in select value from jsonb_array_elements(p_changes) order by value->>'course',value->>'section' loop
    v_course := s->>'course'; v_section := s->>'section';
    perform pg_advisory_xact_lock(hashtextextended(v_course||'|'||v_section,0));
    insert into a2.class_plan_scopes(course,section) values(v_course,v_section) on conflict do nothing;
    perform 1 from a2.class_plan_scopes where course=v_course and section=v_section for update;
  end loop;
  for s in select value from jsonb_array_elements(p_changes) order by value->>'course',value->>'section' loop
    v_course := s->>'course'; v_section := s->>'section';
    v_changed := false; v_written := 0; v_unchanged := 0; v_plans := '[]'::jsonb;
    select * into old_operation from a2.class_plan_operations
      where course=v_course and section=v_section and operation_id=s->>'operationId';
    if found then
      if old_operation.request_hash is distinct from s->>'requestHash' then
        raise exception 'operation_conflict' using errcode='P0001';
      end if;
      v_results := v_results || jsonb_build_array(old_operation.result || '{"replayed":true}'::jsonb);
      continue;
    end if;
    select version into v_version from a2.class_plan_scopes where course=v_course and section=v_section;
    if v_version is distinct from (s->>'expectedScopeVersion')::bigint then
      raise exception 'scope_conflict' using errcode='P0001';
    end if;
    -- Check every head before writing anything in this scope.
    for p in select value from jsonb_array_elements(coalesce(s->'plans','[]'::jsonb)) loop
      select revision,inputs into old_head from a2.class_plan_heads
        where date=(p->>'date')::date and course=v_course and section=v_section;
      if (case when found then old_head.revision else null end) is distinct from p->>'expectedRevision' then
        raise exception 'plan_conflict:%', p->>'date' using errcode='P0001';
      end if;
    end loop;
    if s ? 'statusChange' then
      c := s->'statusChange';
      perform 1 from a2.class_commitments where course=v_course and section=v_section and id=c->>'id';
      if not found then raise exception 'commitment_not_found' using errcode='P0002'; end if;
      perform 1 from a2.class_commitments where course=v_course and section=v_section and id=c->>'id'
        and version=(c->>'expectedVersion')::bigint;
      if not found then raise exception 'commitment_conflict' using errcode='P0001'; end if;
    end if;
    -- Projected full rows come from a scope snapshot and its checked version.
    -- Omitted commitments are retained; a new summary never clears old promises.
    for c in select value from jsonb_array_elements(coalesce(s->'commitments','[]'::jsonb)) loop
      insert into a2.class_commitments(course,section,id,kind,text,status,source,source_date,due_date,deferred_until,version)
      values(v_course,v_section,c->>'id',c->>'kind',c->>'text',c->>'status',coalesce(c->'source','{}'::jsonb),
        (c->>'sourceDate')::date,(c->>'dueDate')::date,(c->>'deferredUntil')::date,(c->>'version')::bigint)
      on conflict(course,section,id) do update set kind=excluded.kind,text=excluded.text,status=excluded.status,
        source=excluded.source,source_date=excluded.source_date,due_date=excluded.due_date,
        deferred_until=excluded.deferred_until,version=excluded.version,updated_at=now()
      where (a2.class_commitments.kind,a2.class_commitments.text,a2.class_commitments.status,a2.class_commitments.source,
        a2.class_commitments.source_date,a2.class_commitments.due_date,a2.class_commitments.deferred_until,a2.class_commitments.version)
        is distinct from (excluded.kind,excluded.text,excluded.status,excluded.source,excluded.source_date,
          excluded.due_date,excluded.deferred_until,excluded.version);
      if found then v_changed := true; end if;
    end loop;
    if s ? 'summary' then
      summary := s->'summary';
      insert into a2.class_summary_revisions(date,course,section,revision,summary)
        values((summary->>'date')::date,v_course,v_section,s->>'summaryRevision',summary) on conflict do nothing;
      insert into a2.class_summaries(date,course,section,model,markdown,landed,student_questions,promises,next_prep,transcript_path,summary_path,recorded_at)
      values((summary->>'date')::date,v_course,v_section,summary->>'model',summary->>'markdown',summary->'landed',
        summary->'student_questions',summary->'promises',summary->'next_prep',summary->>'transcript_path',summary->>'summary_path',
        (summary->>'recorded_at')::timestamptz)
      on conflict(date,course,section) do update set model=excluded.model,markdown=excluded.markdown,landed=excluded.landed,
        student_questions=excluded.student_questions,promises=excluded.promises,next_prep=excluded.next_prep,
        transcript_path=excluded.transcript_path,summary_path=excluded.summary_path,recorded_at=excluded.recorded_at;
      v_changed := true;
    end if;
    if s ? 'latestSummary' then
      update a2.class_plan_scopes set latest_summary=s->'latestSummary',latest_summary_hash=s->>'latestSummaryHash'
        where course=v_course and section=v_section and latest_summary_hash is distinct from s->>'latestSummaryHash';
      if found then v_changed := true; end if;
    end if;
    if s ? 'pendingSummary' then
      update a2.class_plan_scopes set pending_summary=s->'pendingSummary',pending_summary_hash=s->>'pendingSummaryHash'
        where course=v_course and section=v_section and pending_summary_hash is distinct from s->>'pendingSummaryHash';
      if found then v_changed := true; end if;
    end if;
    if coalesce((s->>'clearPending')::boolean,false) then
      update a2.class_plan_scopes set pending_summary=null,pending_summary_hash=null
        where course=v_course and section=v_section and pending_summary is not null;
      if found then v_changed := true; end if;
    end if;
    for p in select value from jsonb_array_elements(coalesce(s->'plans','[]'::jsonb)) loop
      select revision,inputs into old_head from a2.class_plan_heads
        where date=(p->>'date')::date and course=v_course and section=v_section;
      if found and old_head.revision=p->>'revision' then
        v_unchanged := v_unchanged+1;
        if old_head.inputs is distinct from p->'inputs' then
          update a2.class_plan_heads set inputs=p->'inputs',updated_at=now()
            where date=(p->>'date')::date and course=v_course and section=v_section;
          v_changed := true;
        end if;
      else
        c := p->'card';
        insert into a2.observer_cards(date,course,section,lesson,title,mode,minutes,frame,body,source)
        values((p->>'date')::date,v_course,v_section,c->>'lesson',c->>'title',c->>'mode',(c->>'minutes')::int,
          c->>'frame',c->>'body',coalesce(c->>'source','desk'))
        on conflict(date,course,section) do update set lesson=excluded.lesson,title=excluded.title,mode=excluded.mode,
          minutes=excluded.minutes,frame=excluded.frame,body=excluded.body,source=excluded.source
        returning id into v_card_id;
        insert into a2.card_decks(card_id,date,course,section,items,model,generated_at,content_hash)
        values(v_card_id,(p->>'date')::date,v_course,v_section,p->'deck'->'items',p->'deck'->>'model',now(),p->'deck'->>'contentHash')
        on conflict(card_id) do update set date=excluded.date,course=excluded.course,section=excluded.section,
          items=excluded.items,model=excluded.model,generated_at=excluded.generated_at,content_hash=excluded.content_hash;
        v_package := (p->'package') || jsonb_build_object(
          'card',(p->'package'->'card') || jsonb_build_object('id',v_card_id,'updatedAt',now()),
          'deck',(p->'package'->'deck') || jsonb_build_object('cardId',v_card_id,'updatedAt',now(),'generatedAt',now()),
          'updatedAt',now());
        insert into a2.class_plan_packages(date,course,section,revision,package)
        values((p->>'date')::date,v_course,v_section,p->>'revision',v_package) on conflict do nothing;
        insert into a2.class_plan_heads(date,course,section,revision,inputs)
        values((p->>'date')::date,v_course,v_section,p->>'revision',p->'inputs')
        on conflict(date,course,section) do update set revision=excluded.revision,inputs=excluded.inputs,updated_at=now();
        v_written := v_written+1; v_changed := true;
      end if;
      select pp.package || jsonb_build_object('inputs',h.inputs,'updatedAt',h.updated_at) into v_package
        from a2.class_plan_heads h join a2.class_plan_packages pp using(date,course,section,revision)
        where h.date=(p->>'date')::date and h.course=v_course and h.section=v_section;
      v_plans := v_plans || jsonb_build_array(v_package);
    end loop;
    if v_changed then
      update a2.class_plan_scopes set version=version+1,updated_at=now() where course=v_course and section=v_section
        returning version into v_version;
    end if;
    v_current_commitments := a2.class_plan_snapshot(v_course,v_section)->'commitments';
    select coalesce(jsonb_agg(value || jsonb_build_object('scopeVersion',v_version)),'[]'::jsonb)
      into v_plans from jsonb_array_elements(v_plans);
    v_result := jsonb_build_object('course',v_course,'section',v_section,'version',v_version,
      'written',v_written,'unchanged',v_unchanged,'plans',v_plans,'commitments',v_current_commitments);
    insert into a2.class_plan_operations(course,section,operation_id,request_hash,result)
      values(v_course,v_section,s->>'operationId',s->>'requestHash',v_result);
    v_results := v_results || jsonb_build_array(v_result);
  end loop;
  perform set_config('a2.class_plan_write',coalesce(v_previous_write_flag,''),true);
  return v_results;
end;
$$;
revoke all on function a2.apply_class_plan_changes(jsonb) from public, anon, authenticated;
grant execute on function a2.apply_class_plan_changes(jsonb) to service_role;

-- Bootstrap existing recordings without resetting any previously reviewed status.
-- The stable id uses the same normalized scope/kind/text digest as the server.
insert into a2.class_plan_scopes(course,section)
  select distinct course,upper(trim(section)) from a2.class_summaries on conflict do nothing;
insert into a2.class_summary_revisions(date,course,section,revision,summary)
  select date,course,upper(trim(section)),md5((to_jsonb(s)-'recorded_at')::text),to_jsonb(s)
  from a2.class_summaries s where not exists(select 1 from a2.class_summary_revisions r
    where r.date=s.date and r.course=s.course and r.section=upper(trim(s.section))
      and r.summary-'recorded_at'=to_jsonb(s)-'recorded_at') on conflict do nothing;
with latest as (
  select distinct on(course,upper(trim(section))) * from a2.class_summaries
  order by course,upper(trim(section)),date desc,recorded_at desc
)
update a2.class_plan_scopes sc set latest_summary=jsonb_build_object(
  'date',s.date,'course',s.course,'section',upper(trim(s.section)),'recordedAt',s.recorded_at,
  'landed',s.landed,'studentQuestions',s.student_questions,'promises',s.promises,'nextPrep',s.next_prep,
  'markdown',s.markdown,'model',s.model,'transcriptPath',s.transcript_path,'summaryPath',s.summary_path,
  'revision',md5((to_jsonb(s)-'recorded_at')::text)),latest_summary_hash=md5((to_jsonb(s)-'recorded_at')::text)
from latest s where sc.course=s.course and sc.section=upper(trim(s.section)) and sc.latest_summary is null;
with evidence as (
  select s.*,kind,trim(regexp_replace(value,'\s+',' ','g')) as text
  from a2.class_summaries s cross join lateral (
    select 'promise' as kind,value from jsonb_array_elements_text(s.promises)
    union all select 'prep' as kind,value from jsonb_array_elements_text(s.next_prep)
  ) e where s.markdown !~* '(recording|transcript)( was| is)? (unusable|unintelligible)|unusable recording|no usable (audio|recording)|(^|\n)\s*(transcriptQuality|quality|Transcript quality):\s*["'']?poor\y'
), commitments as (
  select distinct on(course,upper(trim(section)),kind,lower(text)) * from evidence
  where text <> '' and text !~* '^(none|n/a|no (promises|next prep|follow.up)( recorded)?)[.!]?$'
  order by course,upper(trim(section)),kind,lower(text),date,recorded_at
)
insert into a2.class_commitments(course,section,id,kind,text,status,source,source_date)
select course,upper(trim(section)),md5(course||'|'||upper(trim(section))||'|'||kind||'|'||lower(text)),
  kind,text,'open',jsonb_build_object('date',date,'recordedAt',recorded_at,'kind',kind),date
from commitments on conflict do nothing;

notify pgrst, 'reload schema';
