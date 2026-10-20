-- Class Log observer cards (school/class-log/OBSERVER_CARD_DB_SPEC.md).
-- Run by hand in the Supabase SQL editor (as postgres; the server reaches the
-- tables with the service role), in the A2 schema like every other migration
-- (deploy/RUNBOOK.md): `SET search_path TO a2;`, then this file, then
-- `NOTIFY pgrst, 'reload schema';`. Idempotent: safe to run again.
-- The phone never touches these tables; roster-server reads and writes them with
-- the service key (GET/POST /class-log/cards..., PUT /teacher/cards).
create table if not exists observer_cards (
  id          uuid primary key default gen_random_uuid(),
  date        date not null,
  course      text not null check (course in ('algebra2','apstats')),
  section     text,                         -- null = every section of the course that day
  lesson      text,                         -- '1-3'
  title       text not null,                -- one line, shown on the main screen
  mode        text not null default 'whiteboards'
              check (mode in ('whiteboards','ipad','poster','pairs','jam','other')),
  minutes     int not null default 10,
  frame       text,                         -- sentence frame
  body        text not null,                -- markdown: ## headings and paragraphs only
  source      text not null default 'desk', -- 'desk' (day-log script), 'manual' (teacher)
  updated_at  timestamptz not null default now(),
  unique (date, course, section)
);
create index if not exists observer_cards_date on observer_cards (date, course);

create table if not exists observer_card_outcomes (
  card_id     uuid references observer_cards(id) on delete cascade,
  date        date not null,
  section     text not null,
  ran         boolean not null,
  at          time,                         -- HH:MM local when the button was tapped
  device      text not null default 's24',
  recorded_at timestamptz not null default now(),
  primary key (card_id, section, device)
);

alter table observer_cards enable row level security;
alter table observer_card_outcomes enable row level security;
revoke all on observer_cards, observer_card_outcomes from anon, authenticated;
grant all on observer_cards, observer_card_outcomes to service_role;
