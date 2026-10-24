-- Class Log node mastery (school/class-log/KNOWLEDGE_TREE_SPEC.md, WP-1 1.3).
-- Run by hand in the Supabase SQL editor (as postgres), then
-- `NOTIFY pgrst, 'reload schema';`. Every name is schema-qualified with a2.
-- because the SQL editor does not keep `SET search_path`. Idempotent: safe to
-- run again. Until it runs, PUT /class-log/mastery and GET /teacher/mastery answer
-- 503 and GET /teacher/decks reports `ready: null` (the decks themselves still load).
-- The phone never touches this table; roster-server writes it with the service key.
--
-- node_mastery: per device, per course, per lesson-tree node, the phone's BKT
-- probability that the teacher has it ready (`p`), mirrored for the Desk. The phone
-- is the source of truth; updated_at is the phone's clock and a row is replaced only
-- by a newer one (a2.put_node_mastery, below), so a late retry never rolls p back.
create table if not exists a2.node_mastery (
  device      text not null,
  course      text not null check (course in ('algebra2','apstats')),
  node_id     text not null check (node_id ~ '^[0-9a-f]{12}$'),
  lesson      text not null,
  p           real not null check (p >= 0 and p <= 1),
  asked       int not null check (asked >= 0),
  again       int not null check (again >= 0),
  known_at    timestamptz,
  updated_at  timestamptz not null default now(),
  primary key (device, course, node_id)
);
create index if not exists node_mastery_course_lesson on a2.node_mastery (course, lesson);

alter table a2.node_mastery enable row level security;
revoke all on a2.node_mastery from anon, authenticated;
grant all on a2.node_mastery to service_role;

-- PUT /class-log/mastery in one statement. p_nodes is the validated array
-- [{node_id, lesson, p, asked, again, known_at, updated_at}] (roster-server/
-- node-mastery.js runs first). A row is inserted, or replaced only when the incoming
-- updated_at is newer than the stored one. Returns {written}.
create or replace function a2.put_node_mastery(p_device text, p_course text, p_nodes jsonb) returns jsonb
language plpgsql as $$
declare
  v_written int;
begin
  if jsonb_typeof(p_nodes) is distinct from 'array' then
    raise exception 'p_nodes must be a json array' using errcode = '22023';
  end if;
  with incoming as (
    select value->>'node_id' as node_id, value->>'lesson' as lesson, (value->>'p')::real as p,
           (value->>'asked')::int as asked, (value->>'again')::int as again,
           (value->>'known_at')::timestamptz as known_at, (value->>'updated_at')::timestamptz as updated_at
    from jsonb_array_elements(p_nodes)
  ), written as (
    insert into a2.node_mastery as m (device, course, node_id, lesson, p, asked, again, known_at, updated_at)
    select p_device, p_course, node_id, lesson, p, asked, again, known_at, updated_at from incoming
    on conflict (device, course, node_id) do update set
      lesson = excluded.lesson, p = excluded.p, asked = excluded.asked, again = excluded.again,
      known_at = excluded.known_at, updated_at = excluded.updated_at
    where m.updated_at < excluded.updated_at
    returning 1
  )
  select count(*) into v_written from written;
  return jsonb_build_object('written', v_written);
end;
$$;
revoke all on function a2.put_node_mastery(text, text, jsonb) from public, anon, authenticated;
grant execute on function a2.put_node_mastery(text, text, jsonb) to service_role;
