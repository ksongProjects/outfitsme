create or replace function public.current_better_auth_user_id()
returns text
language sql
stable
as $$
  select nullif(auth.jwt() ->> 'sub', '');
$$;

do $$
declare
  target_table text;
  policy_row record;
begin
  foreach target_table in array array[
    'photos',
    'outfit_analyses',
    'items',
    'user_settings',
    'analysis_jobs',
    'outfits',
    'outfit_items'
  ]
  loop
    for policy_row in
      select policyname
      from pg_policies
      where schemaname = 'public'
        and tablename = target_table
    loop
      execute format('drop policy if exists %I on public.%I', policy_row.policyname, target_table);
    end loop;
  end loop;

  for policy_row in
    select policyname
    from pg_policies
    where schemaname = 'storage'
      and tablename = 'objects'
  loop
    if policy_row.policyname like 'outfit\_images\_%' escape '\' then
      execute format('drop policy if exists %I on storage.objects', policy_row.policyname);
    end if;
  end loop;
end
$$;

alter table if exists public.photos
  drop constraint if exists photos_user_id_fkey;
alter table if exists public.outfit_analyses
  drop constraint if exists outfit_analyses_user_id_fkey;
alter table if exists public.items
  drop constraint if exists items_user_id_fkey;
alter table if exists public.user_settings
  drop constraint if exists user_settings_user_id_fkey;
alter table if exists public.analysis_jobs
  drop constraint if exists analysis_jobs_user_id_fkey;
alter table if exists public.outfits
  drop constraint if exists outfits_user_id_fkey;
alter table if exists public.outfit_items
  drop constraint if exists outfit_items_user_id_fkey;

alter table if exists public.photos
  alter column user_id type text using user_id::text;
alter table if exists public.outfit_analyses
  alter column user_id type text using user_id::text;
alter table if exists public.items
  alter column user_id type text using user_id::text;
alter table if exists public.user_settings
  alter column user_id type text using user_id::text;
alter table if exists public.analysis_jobs
  alter column user_id type text using user_id::text;
alter table if exists public.outfits
  alter column user_id type text using user_id::text;
alter table if exists public.outfit_items
  alter column user_id type text using user_id::text;

alter table if exists public.photos
  add constraint photos_user_id_fkey
  foreign key (user_id) references public.users(id) on delete cascade not valid;
alter table if exists public.outfit_analyses
  add constraint outfit_analyses_user_id_fkey
  foreign key (user_id) references public.users(id) on delete cascade not valid;
alter table if exists public.items
  add constraint items_user_id_fkey
  foreign key (user_id) references public.users(id) on delete cascade not valid;
alter table if exists public.user_settings
  add constraint user_settings_user_id_fkey
  foreign key (user_id) references public.users(id) on delete cascade not valid;
alter table if exists public.analysis_jobs
  add constraint analysis_jobs_user_id_fkey
  foreign key (user_id) references public.users(id) on delete cascade not valid;
alter table if exists public.outfits
  add constraint outfits_user_id_fkey
  foreign key (user_id) references public.users(id) on delete cascade not valid;
alter table if exists public.outfit_items
  add constraint outfit_items_user_id_fkey
  foreign key (user_id) references public.users(id) on delete cascade not valid;

create policy "photos_owner_select" on public.photos
for select using (public.current_better_auth_user_id() = user_id);

create policy "photos_owner_insert" on public.photos
for insert with check (public.current_better_auth_user_id() = user_id);

create policy "photos_owner_update" on public.photos
for update using (public.current_better_auth_user_id() = user_id);

create policy "photos_owner_delete" on public.photos
for delete using (public.current_better_auth_user_id() = user_id);

create policy "analyses_owner_select" on public.outfit_analyses
for select using (public.current_better_auth_user_id() = user_id);

create policy "analyses_owner_insert" on public.outfit_analyses
for insert with check (public.current_better_auth_user_id() = user_id);

create policy "analyses_owner_update" on public.outfit_analyses
for update using (public.current_better_auth_user_id() = user_id);

create policy "analyses_owner_delete" on public.outfit_analyses
for delete using (public.current_better_auth_user_id() = user_id);

create policy "items_owner_select" on public.items
for select using (public.current_better_auth_user_id() = user_id);

create policy "items_owner_insert" on public.items
for insert with check (public.current_better_auth_user_id() = user_id);

create policy "items_owner_update" on public.items
for update using (public.current_better_auth_user_id() = user_id);

create policy "items_owner_delete" on public.items
for delete using (public.current_better_auth_user_id() = user_id);

create policy "user_settings_owner_select" on public.user_settings
for select using (public.current_better_auth_user_id() = user_id);

create policy "user_settings_owner_insert" on public.user_settings
for insert with check (public.current_better_auth_user_id() = user_id);

create policy "user_settings_owner_update" on public.user_settings
for update using (public.current_better_auth_user_id() = user_id);

create policy "user_settings_owner_delete" on public.user_settings
for delete using (public.current_better_auth_user_id() = user_id);

create policy "analysis_jobs_owner_select" on public.analysis_jobs
for select using (public.current_better_auth_user_id() = user_id);

create policy "analysis_jobs_owner_insert" on public.analysis_jobs
for insert with check (public.current_better_auth_user_id() = user_id);

create policy "analysis_jobs_owner_update" on public.analysis_jobs
for update using (public.current_better_auth_user_id() = user_id);

create policy "analysis_jobs_owner_delete" on public.analysis_jobs
for delete using (public.current_better_auth_user_id() = user_id);

create policy "outfits_owner_select" on public.outfits
for select using (public.current_better_auth_user_id() = user_id);

create policy "outfits_owner_insert" on public.outfits
for insert with check (public.current_better_auth_user_id() = user_id);

create policy "outfits_owner_update" on public.outfits
for update using (public.current_better_auth_user_id() = user_id);

create policy "outfits_owner_delete" on public.outfits
for delete using (public.current_better_auth_user_id() = user_id);

create policy "outfit_items_owner_select" on public.outfit_items
for select using (public.current_better_auth_user_id() = user_id);

create policy "outfit_items_owner_insert" on public.outfit_items
for insert with check (public.current_better_auth_user_id() = user_id);

create policy "outfit_items_owner_update" on public.outfit_items
for update using (public.current_better_auth_user_id() = user_id);

create policy "outfit_items_owner_delete" on public.outfit_items
for delete using (public.current_better_auth_user_id() = user_id);

create policy "outfit_images_owner_select" on storage.objects
for select using (
  bucket_id = 'outfit-images'
  and public.current_better_auth_user_id() = (storage.foldername(name))[1]
);

create policy "outfit_images_owner_insert" on storage.objects
for insert with check (
  bucket_id = 'outfit-images'
  and public.current_better_auth_user_id() = (storage.foldername(name))[1]
);

create policy "outfit_images_owner_update" on storage.objects
for update using (
  bucket_id = 'outfit-images'
  and public.current_better_auth_user_id() = (storage.foldername(name))[1]
);

create policy "outfit_images_owner_delete" on storage.objects
for delete using (
  bucket_id = 'outfit-images'
  and public.current_better_auth_user_id() = (storage.foldername(name))[1]
);

drop function if exists public.get_analysis_history_rows(uuid, integer);
drop function if exists public.get_item_catalog_rows(uuid, integer);
drop function if exists public.get_wardrobe_rows(uuid, integer);

create or replace function public.get_analysis_history_rows(
  p_user_id text,
  p_limit integer default 50
)
returns table (
  job_id uuid,
  photo_id uuid,
  storage_path text,
  analysis_model text,
  status text,
  error_message text,
  created_at timestamptz,
  started_at timestamptz,
  completed_at timestamptz,
  updated_at timestamptz,
  photo_created_at timestamptz,
  outfit_count bigint
)
language sql
stable
security definer
set search_path = public
as $$
  with outfit_counts as (
    select o.photo_id, count(*)::bigint as outfit_count
    from public.outfits o
    where o.user_id = p_user_id
    group by o.photo_id
  )
  select
    j.id as job_id,
    j.photo_id,
    p.storage_path,
    j.analysis_model,
    j.status,
    j.error_message,
    j.created_at,
    j.started_at,
    j.completed_at,
    j.updated_at,
    p.created_at as photo_created_at,
    coalesce(oc.outfit_count, 0)::bigint as outfit_count
  from public.analysis_jobs j
  left join public.photos p
    on p.id = j.photo_id
    and p.user_id = p_user_id
  left join outfit_counts oc
    on oc.photo_id = j.photo_id
  where j.user_id = p_user_id
  order by j.created_at desc
  limit greatest(coalesce(p_limit, 50), 1);
$$;

create or replace function public.get_item_catalog_rows(
  p_user_id text,
  p_limit integer default 200
)
returns table (
  id uuid,
  analysis_id uuid,
  category text,
  name text,
  color text,
  attributes_json jsonb,
  created_at timestamptz,
  style_label text
)
language sql
stable
security definer
set search_path = public
as $$
  select
    i.id,
    i.analysis_id,
    i.category,
    i.name,
    i.color,
    i.attributes_json,
    i.created_at,
    coalesce(
      nullif(btrim(i.attributes_json ->> 'outfit_style'), ''),
      nullif(btrim(a.style_label), ''),
      'Unknown'
    ) as style_label
  from public.items i
  left join public.outfit_analyses a
    on a.id = i.analysis_id
    and a.user_id = p_user_id
  where i.user_id = p_user_id
  order by i.created_at desc
  limit greatest(coalesce(p_limit, 200), 1);
$$;

create or replace function public.get_wardrobe_rows(
  p_user_id text,
  p_limit integer default 20
)
returns table (
  row_id text,
  outfit_id uuid,
  photo_id uuid,
  analysis_id uuid,
  outfit_index integer,
  style_label text,
  source_type text,
  source_outfit_id uuid,
  generated_image_path text,
  created_at timestamptz,
  storage_path text,
  photo_created_at timestamptz,
  outfit_count bigint,
  outfit_items_count bigint
)
language sql
stable
security definer
set search_path = public
as $$
  with outfit_counts as (
    select o.photo_id, count(*)::bigint as outfit_count
    from public.outfits o
    where o.user_id = p_user_id
    group by o.photo_id
  ),
  item_counts as (
    select oi.outfit_id, count(*)::bigint as outfit_items_count
    from public.outfit_items oi
    where oi.user_id = p_user_id
    group by oi.outfit_id
  )
  select
    coalesce(o.id::text, o.photo_id::text || ':' || coalesce(o.outfit_index, 0)::text) as row_id,
    o.id as outfit_id,
    o.photo_id,
    o.analysis_id,
    coalesce(o.outfit_index, 0) as outfit_index,
    o.style_label,
    coalesce(o.source_type, 'photo_analysis') as source_type,
    o.source_outfit_id,
    o.generated_image_path,
    o.created_at,
    case
      when coalesce(o.source_type, 'photo_analysis') = 'custom_outfit'
        and nullif(o.generated_image_path, '') is not null
      then o.generated_image_path
      else p.storage_path
    end as storage_path,
    p.created_at as photo_created_at,
    coalesce(oc.outfit_count, 1)::bigint as outfit_count,
    coalesce(ic.outfit_items_count, 0)::bigint as outfit_items_count
  from public.outfits o
  left join public.photos p
    on p.id = o.photo_id
    and p.user_id = p_user_id
  left join outfit_counts oc
    on oc.photo_id = o.photo_id
  left join item_counts ic
    on ic.outfit_id = o.id
  where o.user_id = p_user_id
  order by o.created_at desc
  limit greatest(coalesce(p_limit, 20), 1);
$$;
