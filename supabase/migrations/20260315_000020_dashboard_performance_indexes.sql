create index if not exists photos_user_created_idx
on public.photos(user_id, created_at desc);

create index if not exists outfit_analyses_user_created_idx
on public.outfit_analyses(user_id, created_at desc);

create index if not exists items_user_created_idx
on public.items(user_id, created_at desc);

create index if not exists analysis_jobs_user_status_completed_idx
on public.analysis_jobs(user_id, status, completed_at desc);
