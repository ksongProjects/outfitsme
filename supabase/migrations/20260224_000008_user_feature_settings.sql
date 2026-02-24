alter table if exists public.user_settings
  add column if not exists profile_gender text,
  add column if not exists profile_age integer,
  add column if not exists enable_outfit_image_generation boolean not null default false,
  add column if not exists enable_online_store_search boolean not null default false;
