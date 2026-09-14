-- 0010_schoology_sync: Schoology grade-sync tables (assignments, delta tracking, run log).

-- One row per Schoology gradebook column (assignment).
create table if not exists schoology_assignment (
  id                       uuid primary key default gen_random_uuid(),
  section                  text not null,
  lesson_key               text not null,
  kind                     text not null check (kind in ('lesson','test','progress_check')),
  title                    text not null,
  points                   integer not null default 100,
  due_date                 date,
  category                 text,
  schoology_assignment_id  text,
  schoology_course_id      text,
  created_at               timestamptz not null default now(),
  updated_at               timestamptz not null default now(),
  unique (section, lesson_key)
);

-- Delta tracking: what value was last pushed to Schoology for each (student, assignment).
create table if not exists schoology_grade_sync (
  student_id               text not null,
  assignment_id            uuid not null references schoology_assignment(id) on delete cascade,
  last_synced_value        numeric,
  last_synced_at           timestamptz,
  last_attempted_at        timestamptz,
  last_error               text,
  primary key (student_id, assignment_id)
);

-- One row per sync run.
create table if not exists schoology_sync_log (
  id                       uuid primary key default gen_random_uuid(),
  run_id                   text not null,
  section                  text,
  started_at               timestamptz not null,
  finished_at              timestamptz,
  success                  boolean,
  assignments_created      integer default 0,
  grades_pushed            integer default 0,
  grades_skipped           integer default 0,
  errors_json              jsonb,
  notes                    text,
  created_at               timestamptz not null default now()
);

create index if not exists schoology_sync_log_finished_idx on schoology_sync_log(finished_at desc);

alter table schoology_assignment enable row level security;
alter table schoology_grade_sync enable row level security;
alter table schoology_sync_log enable row level security;
