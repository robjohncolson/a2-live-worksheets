create table if not exists a2_lesson_pacing (
  lesson text primary key,
  sections jsonb,
  onenote_url text
);
create table if not exists a2_rescore_requests (
  student_id uuid references roster(student_id) on delete cascade,
  item_id text not null,
  requested_at timestamptz not null default now(),
  primary key (student_id, item_id)
);
alter table a2_lesson_pacing enable row level security;
alter table a2_rescore_requests enable row level security;
revoke all on a2_lesson_pacing, a2_rescore_requests from anon, authenticated;
grant all on a2_lesson_pacing, a2_rescore_requests to service_role;
