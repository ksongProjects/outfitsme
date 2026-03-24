create table if not exists public.photos (
  id uuid primary key default gen_random_uuid(),
  user_id text not null references public.users(id) on delete cascade,
  storage_path text not null,
  created_at timestamptz not null default now()
);

create index if not exists photos_user_created_idx
  on public.photos(user_id, created_at desc);

create table if not exists public.user_settings (
  user_id text primary key references public.users(id) on delete cascade,
  user_role text not null default 'trial',
  profile_gender text,
  profile_age integer,
  profile_photo_path text,
  enable_outfit_image_generation boolean not null default true,
  enable_online_store_search boolean not null default false,
  enable_accessory_analysis boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint user_settings_user_role_check
    check (user_role in ('trial', 'premium', 'admin'))
);

alter table public.photos enable row level security;
alter table public.user_settings enable row level security;

drop policy if exists photos_owner_select on public.photos;
create policy "photos_owner_select" on public.photos
for select using (public.current_better_auth_user_id() = user_id);

drop policy if exists photos_owner_insert on public.photos;
create policy "photos_owner_insert" on public.photos
for insert with check (public.current_better_auth_user_id() = user_id);

drop policy if exists photos_owner_update on public.photos;
create policy "photos_owner_update" on public.photos
for update using (public.current_better_auth_user_id() = user_id);

drop policy if exists photos_owner_delete on public.photos;
create policy "photos_owner_delete" on public.photos
for delete using (public.current_better_auth_user_id() = user_id);

drop policy if exists user_settings_owner_select on public.user_settings;
create policy "user_settings_owner_select" on public.user_settings
for select using (public.current_better_auth_user_id() = user_id);

drop policy if exists user_settings_owner_insert on public.user_settings;
create policy "user_settings_owner_insert" on public.user_settings
for insert with check (public.current_better_auth_user_id() = user_id);

drop policy if exists user_settings_owner_update on public.user_settings;
create policy "user_settings_owner_update" on public.user_settings
for update using (public.current_better_auth_user_id() = user_id);

drop policy if exists user_settings_owner_delete on public.user_settings;
create policy "user_settings_owner_delete" on public.user_settings
for delete using (public.current_better_auth_user_id() = user_id);
