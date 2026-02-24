alter table if exists public.user_settings
  add column if not exists profile_photo_path text;
