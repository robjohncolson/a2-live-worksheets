-- Class Log lesson summaries (school/class-log/POLISH2_SPEC.md, WP-C C3).
-- Run by hand in the Supabase SQL editor (as postgres), then
-- `NOTIFY pgrst, 'reload schema';`. Every name is schema-qualified with a2.
-- because the SQL editor does not keep `SET search_path`. Idempotent: safe to
-- run again. Until it runs, POST /class-log/summaries answers 503 and the
-- phone keeps retrying.
-- The phone never touches this table; roster-server writes it with the service
-- key (POST /class-log/summaries) and the Desk reads it (GET /teacher/summaries).
create table if not exists a2.class_summaries (
  date              date not null,
  course            text not null check (course in ('algebra2','apstats')),
  section           text not null,
  model             text,                                 -- summary model id
  markdown          text not null,                        -- the published summary
  landed            jsonb not null default '[]'::jsonb,   -- arrays of short strings
  student_questions jsonb not null default '[]'::jsonb,
  promises          jsonb not null default '[]'::jsonb,
  next_prep         jsonb not null default '[]'::jsonb,
  transcript_path   text,                                 -- paths in the data repo
  summary_path      text,
  recorded_at       timestamptz not null default now(),
  primary key (date, course, section)
);

alter table a2.class_summaries enable row level security;
revoke all on a2.class_summaries from anon, authenticated;
grant all on a2.class_summaries to service_role;
