alter table if exists public.outfits
  add column if not exists source_type text not null default 'photo_analysis';

alter table if exists public.outfits
  add column if not exists source_outfit_id uuid references public.outfits(id) on delete set null;

alter table if exists public.outfits
  add column if not exists generated_image_path text;

update public.outfits o
set source_type = case
  when p.storage_path like 'virtual/composed/%' then 'custom_outfit'
  else 'photo_analysis'
end
from public.photos p
where p.id = o.photo_id
  and coalesce(o.source_type, '') not in ('photo_analysis', 'custom_outfit', 'outfitsme_generated');

alter table if exists public.outfits
  drop constraint if exists outfits_source_type_check;

alter table if exists public.outfits
  add constraint outfits_source_type_check
  check (source_type in ('photo_analysis', 'custom_outfit', 'outfitsme_generated'));

create index if not exists outfits_user_source_type_created_idx
  on public.outfits(user_id, source_type, created_at desc);

create index if not exists outfits_source_outfit_idx
  on public.outfits(source_outfit_id);

create or replace function public.get_wardrobe_rows(
  p_user_id uuid,
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
