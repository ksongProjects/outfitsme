create table if not exists public.outfits (
  id uuid primary key default gen_random_uuid(),
  photo_id uuid not null references public.photos(id) on delete cascade,
  analysis_id uuid not null references public.outfit_analyses(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  outfit_index integer not null default 0,
  style_label text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (analysis_id, outfit_index)
);

create table if not exists public.outfit_items (
  id uuid primary key default gen_random_uuid(),
  outfit_id uuid not null references public.outfits(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  category text,
  name text,
  color text,
  attributes_json jsonb,
  created_at timestamptz not null default now()
);

create index if not exists outfits_user_created_idx on public.outfits(user_id, created_at desc);
create index if not exists outfits_photo_idx on public.outfits(photo_id);
create index if not exists outfit_items_outfit_idx on public.outfit_items(outfit_id);

alter table public.outfits enable row level security;
alter table public.outfit_items enable row level security;

drop policy if exists outfits_owner_select on public.outfits;
create policy "outfits_owner_select" on public.outfits
for select using (auth.uid() = user_id);

drop policy if exists outfits_owner_insert on public.outfits;
create policy "outfits_owner_insert" on public.outfits
for insert with check (auth.uid() = user_id);

drop policy if exists outfits_owner_update on public.outfits;
create policy "outfits_owner_update" on public.outfits
for update using (auth.uid() = user_id);

drop policy if exists outfits_owner_delete on public.outfits;
create policy "outfits_owner_delete" on public.outfits
for delete using (auth.uid() = user_id);

drop policy if exists outfit_items_owner_select on public.outfit_items;
create policy "outfit_items_owner_select" on public.outfit_items
for select using (auth.uid() = user_id);

drop policy if exists outfit_items_owner_insert on public.outfit_items;
create policy "outfit_items_owner_insert" on public.outfit_items
for insert with check (auth.uid() = user_id);

drop policy if exists outfit_items_owner_update on public.outfit_items;
create policy "outfit_items_owner_update" on public.outfit_items
for update using (auth.uid() = user_id);

drop policy if exists outfit_items_owner_delete on public.outfit_items;
create policy "outfit_items_owner_delete" on public.outfit_items
for delete using (auth.uid() = user_id);

insert into public.outfits (photo_id, analysis_id, user_id, outfit_index, style_label, created_at, updated_at)
select
  a.photo_id,
  a.id as analysis_id,
  a.user_id,
  (entry.ordinality - 1)::integer as outfit_index,
  coalesce(nullif(btrim(entry.outfit ->> 'style'), ''), nullif(btrim(a.style_label), ''), 'Unlabeled') as style_label,
  a.created_at,
  now()
from public.outfit_analyses a
cross join lateral jsonb_array_elements(
  case
    when jsonb_typeof(a.raw_json -> 'outfits') = 'array' then a.raw_json -> 'outfits'
    else '[]'::jsonb
  end
) with ordinality as entry(outfit, ordinality)
on conflict (analysis_id, outfit_index) do nothing;

insert into public.outfits (photo_id, analysis_id, user_id, outfit_index, style_label, created_at, updated_at)
select
  a.photo_id,
  a.id as analysis_id,
  a.user_id,
  0 as outfit_index,
  coalesce(nullif(btrim(a.style_label), ''), 'Unlabeled') as style_label,
  a.created_at,
  now()
from public.outfit_analyses a
where not exists (
  select 1
  from public.outfits o
  where o.analysis_id = a.id
)
on conflict (analysis_id, outfit_index) do nothing;

insert into public.outfit_items (outfit_id, user_id, category, name, color, attributes_json, created_at)
select
  o.id as outfit_id,
  i.user_id,
  i.category,
  i.name,
  i.color,
  i.attributes_json,
  i.created_at
from public.items i
join public.outfits o
  on o.analysis_id = i.analysis_id
 and o.user_id = i.user_id
 and o.outfit_index = case
   when coalesce(i.attributes_json ->> 'outfit_index', '') ~ '^[0-9]+$'
     then (i.attributes_json ->> 'outfit_index')::integer
   else 0
 end
where not exists (
  select 1
  from public.outfit_items oi
  where oi.outfit_id = o.id
    and oi.user_id = i.user_id
    and coalesce(oi.name, '') = coalesce(i.name, '')
    and coalesce(oi.category, '') = coalesce(i.category, '')
    and coalesce(oi.color, '') = coalesce(i.color, '')
);
