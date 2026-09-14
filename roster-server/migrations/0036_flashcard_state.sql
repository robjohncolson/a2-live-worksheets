-- Fresh-schema replacement for the removed trainer practice-state route.
create table if not exists flashcard_state (
  student_id uuid primary key references roster(student_id) on delete cascade,
  state jsonb not null check (jsonb_typeof(state) = 'object'),
  -- The route caps the UTF-8 request blob at 256 KiB. jsonb::text adds spaces,
  -- so measuring that representation would reject valid boundary-size blobs.
  updated_at timestamptz not null default clock_timestamp()
);

alter table flashcard_state enable row level security;
revoke all on flashcard_state from anon, authenticated;
grant select, insert, update, delete on flashcard_state to service_role;
