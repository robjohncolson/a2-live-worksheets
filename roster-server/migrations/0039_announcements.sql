create table if not exists announcements (
  week_of date primary key,
  text text not null,
  updated_at timestamptz not null,
  updated_by text
);
alter table announcements enable row level security;
revoke all on announcements from anon, authenticated;
grant all on announcements to service_role;
