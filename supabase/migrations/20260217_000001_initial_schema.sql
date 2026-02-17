-- OutfitMe initial schema and security policies

create extension if not exists pgcrypto;

create table if not exists public.photos (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  storage_path text not null,
  created_at timestamptz not null default now()
);

create table if not exists public.outfit_analyses (
  id uuid primary key default gen_random_uuid(),
  photo_id uuid not null references public.photos(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  style_label text,
  raw_json jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.items (
  id uuid primary key default gen_random_uuid(),
  analysis_id uuid not null references public.outfit_analyses(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  category text,
  name text,
  color text,
  attributes_json jsonb,
  created_at timestamptz not null default now()
);

alter table public.photos enable row level security;
alter table public.outfit_analyses enable row level security;
alter table public.items enable row level security;

-- Photos policies
drop policy if exists photos_owner_select on public.photos;
create policy "photos_owner_select" on public.photos
for select using (auth.uid() = user_id);

drop policy if exists photos_owner_insert on public.photos;
create policy "photos_owner_insert" on public.photos
for insert with check (auth.uid() = user_id);

drop policy if exists photos_owner_update on public.photos;
create policy "photos_owner_update" on public.photos
for update using (auth.uid() = user_id);

drop policy if exists photos_owner_delete on public.photos;
create policy "photos_owner_delete" on public.photos
for delete using (auth.uid() = user_id);

-- Outfit analyses policies
drop policy if exists analyses_owner_select on public.outfit_analyses;
create policy "analyses_owner_select" on public.outfit_analyses
for select using (auth.uid() = user_id);

drop policy if exists analyses_owner_insert on public.outfit_analyses;
create policy "analyses_owner_insert" on public.outfit_analyses
for insert with check (auth.uid() = user_id);

drop policy if exists analyses_owner_update on public.outfit_analyses;
create policy "analyses_owner_update" on public.outfit_analyses
for update using (auth.uid() = user_id);

drop policy if exists analyses_owner_delete on public.outfit_analyses;
create policy "analyses_owner_delete" on public.outfit_analyses
for delete using (auth.uid() = user_id);

-- Items policies
drop policy if exists items_owner_select on public.items;
create policy "items_owner_select" on public.items
for select using (auth.uid() = user_id);

drop policy if exists items_owner_insert on public.items;
create policy "items_owner_insert" on public.items
for insert with check (auth.uid() = user_id);

drop policy if exists items_owner_update on public.items;
create policy "items_owner_update" on public.items
for update using (auth.uid() = user_id);

drop policy if exists items_owner_delete on public.items;
create policy "items_owner_delete" on public.items
for delete using (auth.uid() = user_id);

-- Storage bucket + policies for private user images
insert into storage.buckets (id, name, public)
values ('outfit-images', 'outfit-images', false)
on conflict (id) do nothing;

drop policy if exists outfit_images_owner_select on storage.objects;
create policy "outfit_images_owner_select" on storage.objects
for select using (bucket_id = 'outfit-images' and auth.uid()::text = (storage.foldername(name))[1]);

drop policy if exists outfit_images_owner_insert on storage.objects;
create policy "outfit_images_owner_insert" on storage.objects
for insert with check (bucket_id = 'outfit-images' and auth.uid()::text = (storage.foldername(name))[1]);

drop policy if exists outfit_images_owner_update on storage.objects;
create policy "outfit_images_owner_update" on storage.objects
for update using (bucket_id = 'outfit-images' and auth.uid()::text = (storage.foldername(name))[1]);

drop policy if exists outfit_images_owner_delete on storage.objects;
create policy "outfit_images_owner_delete" on storage.objects
for delete using (bucket_id = 'outfit-images' and auth.uid()::text = (storage.foldername(name))[1]);
