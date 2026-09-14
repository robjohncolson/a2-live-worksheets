create table if not exists public.study_guide_state_backups (
  worksheet_id text not null,
  student_username text not null,
  student_period text,
  saved_at timestamptz not null default now(),
  state_json jsonb not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (worksheet_id, student_username)
);

create or replace function public.touch_study_guide_state_backups_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_study_guide_state_backups_updated_at on public.study_guide_state_backups;
create trigger trg_study_guide_state_backups_updated_at
before update on public.study_guide_state_backups
for each row
execute function public.touch_study_guide_state_backups_updated_at();

alter table public.study_guide_state_backups enable row level security;

drop policy if exists "study guide state backups are readable" on public.study_guide_state_backups;
create policy "study guide state backups are readable"
on public.study_guide_state_backups
for select
using (true);

drop policy if exists "study guide state backups are insertable" on public.study_guide_state_backups;
create policy "study guide state backups are insertable"
on public.study_guide_state_backups
for insert
with check (true);

drop policy if exists "study guide state backups are updateable" on public.study_guide_state_backups;
create policy "study guide state backups are updateable"
on public.study_guide_state_backups
for update
using (true)
with check (true);
