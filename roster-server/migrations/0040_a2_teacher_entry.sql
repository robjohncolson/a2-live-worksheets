-- Section collection is independent of pacing and survives roster changes.
create table if not exists a2_tryit_assignments (
  lesson text not null,
  section text not null check (section in ('C', 'D', 'G')),
  assigned_date date not null,
  primary key (lesson, section)
);
alter table a2_tryit_assignments enable row level security;
grant all on a2_tryit_assignments to service_role;

alter table item_ledger drop constraint if exists item_ledger_source_check;
alter table item_ledger add constraint item_ledger_source_check
  check (source in ('worksheet','frq','curriculum_quiz','blooket','quiz_exception','quiz_review',
    'lesson-check','try-it','topic-assessment','flashcard','quiz','daily-engagement','bonus'));

-- Teacher corrections replace scores, including a lower topic-assessment score.
create or replace function preserve_a2_best_score() returns trigger
language plpgsql as $$
begin
  if (new.source in ('lesson-check', 'flashcard')
      or (new.item_id like 'BL-%-DESK_DONE' and new.source = 'worksheet'))
      and old.score is not null then
    new.score := greatest(old.score, new.score);
  end if;
  return new;
end;
$$;
