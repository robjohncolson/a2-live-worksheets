create table if not exists review_marks (
  review_id        uuid primary key default gen_random_uuid(),
  ledger_id        uuid not null references item_ledger(ledger_id) on delete cascade,
  student_id       uuid not null,
  teacher_username text not null,
  seen_at          timestamptz not null default now(),
  comment          text,                            -- nullable; route caps <= 500 chars
  receipt_id       text,                            -- signed t:'review' receipt (best-effort persist)
  receipt_compact  text,
  updated_at       timestamptz not null default now(),
  unique (ledger_id)
);
create index if not exists review_marks_student_idx on review_marks (student_id);
create index if not exists review_marks_seen_idx     on review_marks (seen_at);

alter table review_marks enable row level security;
