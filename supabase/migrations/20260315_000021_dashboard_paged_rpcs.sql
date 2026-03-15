create or replace function public.get_item_catalog_rows(
  p_user_id text,
  p_limit integer default 20,
  p_offset integer default 0
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
  limit greatest(coalesce(p_limit, 20), 1)
  offset greatest(coalesce(p_offset, 0), 0);
$$;


create or replace function public.get_wardrobe_rows(
  p_user_id text,
  p_limit integer default 20,
  p_offset integer default 0
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
    p.storage_path,
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
  limit greatest(coalesce(p_limit, 20), 1)
  offset greatest(coalesce(p_offset, 0), 0);
$$;
