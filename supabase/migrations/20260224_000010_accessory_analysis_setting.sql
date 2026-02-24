alter table if exists public.user_settings
  add column if not exists enable_accessory_analysis boolean not null default false;
