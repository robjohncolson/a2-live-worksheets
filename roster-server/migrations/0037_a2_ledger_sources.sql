-- A2 sources use the same ledger, receipt and transcript paths.
alter table item_ledger drop constraint if exists item_ledger_source_check;
alter table item_ledger add constraint item_ledger_source_check
  check (source in ('worksheet','frq','curriculum_quiz','blooket','quiz_exception','quiz_review',
    'lesson-check','try-it','topic-assessment','flashcard'));

-- Atomic best-score preservation for retries using the same ledger attempt.
-- Distinct attempts remain separate evidence; the grade adapter selects their best.
create or replace function preserve_a2_best_score() returns trigger
language plpgsql as $$
begin
  if (new.source in ('lesson-check', 'topic-assessment', 'flashcard')
      or (new.item_id like 'BL-%-DESK_DONE' and new.source = 'worksheet'))
      and old.score is not null then
    new.score := greatest(old.score, new.score);
  end if;
  return new;
end;
$$;
drop trigger if exists item_ledger_a2_best_score on item_ledger;
create trigger item_ledger_a2_best_score before update on item_ledger
for each row execute function preserve_a2_best_score();
