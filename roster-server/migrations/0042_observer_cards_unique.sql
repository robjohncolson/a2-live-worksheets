-- Class Log observer cards, follow-up to 0041 (already applied).
-- Run by hand in the Supabase SQL editor: `SET search_path TO a2;`, then this
-- file, then `NOTIFY pgrst, 'reload schema';`. Idempotent: safe to run again.
--
-- 1. One card per (date, course, section) even for the course-wide card: the 0041
--    UNIQUE treats NULL sections as distinct, so map NULL to '' in an index.
--    (If this fails with a duplicate-key error, two course-wide cards already
--    exist for one day: delete the older one, then rerun.)
create unique index if not exists observer_cards_day_key
  on observer_cards (date, course, coalesce(section, ''));

-- 2. Any UPDATE (Desk push or a hand edit in the SQL editor) bumps updated_at.
create or replace function a2_touch_updated_at() returns trigger
language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end;
$$;
revoke all on function a2_touch_updated_at() from public, anon, authenticated;
grant execute on function a2_touch_updated_at() to service_role;

do $trigger$
begin
  if not exists (
    select 1 from pg_trigger
    where tgname = 'observer_cards_touch_updated_at' and tgrelid = 'observer_cards'::regclass
  ) then
    create trigger observer_cards_touch_updated_at
      before update on observer_cards
      for each row execute function a2_touch_updated_at();
  end if;
end;
$trigger$;
