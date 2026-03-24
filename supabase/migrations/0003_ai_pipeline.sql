create table if not exists public.ai_jobs (
  id uuid primary key default gen_random_uuid(),
  user_id text not null references public.users(id) on delete cascade,
  photo_id uuid references public.photos(id) on delete set null,
  job_type text not null,
  status text not null default 'pending',
  model_used text,
  tokens_input integer not null default 0,
  tokens_output integer not null default 0,
  error_message text,
  created_at timestamptz not null default now(),
  completed_at timestamptz
);

create table if not exists public.outfits (
  id uuid primary key default gen_random_uuid(),
  user_id text not null references public.users(id) on delete cascade,
  job_id uuid references public.ai_jobs(id) on delete set null,
  photo_id uuid references public.photos(id) on delete cascade,
  style_label text,
  generated_image_path text,
  is_favorite boolean not null default false,
  created_at timestamptz not null default now()
);

create table if not exists public.items (
  id uuid primary key default gen_random_uuid(),
  user_id text not null references public.users(id) on delete cascade,
  name text not null,
  category text,
  color text,
  brand text,
  material text,
  description text,
  image_path text,
  created_at timestamptz not null default now()
);

create table if not exists public.outfit_items (
  outfit_id uuid not null references public.outfits(id) on delete cascade,
  item_id uuid not null references public.items(id) on delete cascade,
  primary key (outfit_id, item_id)
);

create index if not exists ai_jobs_user_created_idx
  on public.ai_jobs(user_id, created_at desc);
create index if not exists ai_jobs_photo_idx
  on public.ai_jobs(photo_id, created_at desc);
create index if not exists outfits_user_created_idx
  on public.outfits(user_id, created_at desc);
create index if not exists outfits_photo_created_idx
  on public.outfits(photo_id, created_at desc);
create index if not exists items_user_created_idx
  on public.items(user_id, created_at desc);
create index if not exists outfit_items_item_idx
  on public.outfit_items(item_id);

alter table public.ai_jobs enable row level security;
alter table public.outfits enable row level security;
alter table public.items enable row level security;
alter table public.outfit_items enable row level security;

drop policy if exists ai_jobs_owner_select on public.ai_jobs;
create policy "ai_jobs_owner_select" on public.ai_jobs
for select using (public.current_better_auth_user_id() = user_id);

drop policy if exists ai_jobs_owner_insert on public.ai_jobs;
create policy "ai_jobs_owner_insert" on public.ai_jobs
for insert with check (public.current_better_auth_user_id() = user_id);

drop policy if exists ai_jobs_owner_update on public.ai_jobs;
create policy "ai_jobs_owner_update" on public.ai_jobs
for update using (public.current_better_auth_user_id() = user_id);

drop policy if exists ai_jobs_owner_delete on public.ai_jobs;
create policy "ai_jobs_owner_delete" on public.ai_jobs
for delete using (public.current_better_auth_user_id() = user_id);

drop policy if exists outfits_owner_select on public.outfits;
create policy "outfits_owner_select" on public.outfits
for select using (public.current_better_auth_user_id() = user_id);

drop policy if exists outfits_owner_insert on public.outfits;
create policy "outfits_owner_insert" on public.outfits
for insert with check (public.current_better_auth_user_id() = user_id);

drop policy if exists outfits_owner_update on public.outfits;
create policy "outfits_owner_update" on public.outfits
for update using (public.current_better_auth_user_id() = user_id);

drop policy if exists outfits_owner_delete on public.outfits;
create policy "outfits_owner_delete" on public.outfits
for delete using (public.current_better_auth_user_id() = user_id);

drop policy if exists items_owner_select on public.items;
create policy "items_owner_select" on public.items
for select using (public.current_better_auth_user_id() = user_id);

drop policy if exists items_owner_insert on public.items;
create policy "items_owner_insert" on public.items
for insert with check (public.current_better_auth_user_id() = user_id);

drop policy if exists items_owner_update on public.items;
create policy "items_owner_update" on public.items
for update using (public.current_better_auth_user_id() = user_id);

drop policy if exists items_owner_delete on public.items;
create policy "items_owner_delete" on public.items
for delete using (public.current_better_auth_user_id() = user_id);

drop policy if exists outfit_items_owner_select on public.outfit_items;
create policy "outfit_items_owner_select" on public.outfit_items
for select using (
  exists (
    select 1
    from public.outfits o
    join public.items i
      on i.id = outfit_items.item_id
    where o.id = outfit_items.outfit_id
      and o.user_id = public.current_better_auth_user_id()
      and i.user_id = public.current_better_auth_user_id()
  )
);

drop policy if exists outfit_items_owner_insert on public.outfit_items;
create policy "outfit_items_owner_insert" on public.outfit_items
for insert with check (
  exists (
    select 1
    from public.outfits o
    join public.items i
      on i.id = outfit_items.item_id
    where o.id = outfit_items.outfit_id
      and o.user_id = public.current_better_auth_user_id()
      and i.user_id = public.current_better_auth_user_id()
  )
);

drop policy if exists outfit_items_owner_update on public.outfit_items;
create policy "outfit_items_owner_update" on public.outfit_items
for update using (
  exists (
    select 1
    from public.outfits o
    join public.items i
      on i.id = outfit_items.item_id
    where o.id = outfit_items.outfit_id
      and o.user_id = public.current_better_auth_user_id()
      and i.user_id = public.current_better_auth_user_id()
  )
);

drop policy if exists outfit_items_owner_delete on public.outfit_items;
create policy "outfit_items_owner_delete" on public.outfit_items
for delete using (
  exists (
    select 1
    from public.outfits o
    join public.items i
      on i.id = outfit_items.item_id
    where o.id = outfit_items.outfit_id
      and o.user_id = public.current_better_auth_user_id()
      and i.user_id = public.current_better_auth_user_id()
  )
);
