alter table if exists public.user_settings
  add column if not exists is_premium boolean not null default false;

