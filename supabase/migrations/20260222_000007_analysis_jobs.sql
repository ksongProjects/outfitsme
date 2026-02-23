create table if not exists public.analysis_jobs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  photo_id uuid not null references public.photos(id) on delete cascade,
  storage_path text not null,
  mime_type text not null default 'image/jpeg',
  analysis_model text not null,
  status text not null default 'queued' check (status in ('queued', 'processing', 'completed', 'failed')),
  error_message text,
  result_json jsonb,
  created_at timestamptz not null default now(),
  started_at timestamptz,
  completed_at timestamptz,
  updated_at timestamptz not null default now()
);

create index if not exists analysis_jobs_user_created_idx on public.analysis_jobs(user_id, created_at desc);
create index if not exists analysis_jobs_status_created_idx on public.analysis_jobs(status, created_at asc);

alter table public.analysis_jobs enable row level security;

drop policy if exists analysis_jobs_owner_select on public.analysis_jobs;
create policy "analysis_jobs_owner_select" on public.analysis_jobs
for select using (auth.uid() = user_id);

drop policy if exists analysis_jobs_owner_insert on public.analysis_jobs;
create policy "analysis_jobs_owner_insert" on public.analysis_jobs
for insert with check (auth.uid() = user_id);

drop policy if exists analysis_jobs_owner_update on public.analysis_jobs;
create policy "analysis_jobs_owner_update" on public.analysis_jobs
for update using (auth.uid() = user_id);

drop policy if exists analysis_jobs_owner_delete on public.analysis_jobs;
create policy "analysis_jobs_owner_delete" on public.analysis_jobs
for delete using (auth.uid() = user_id);
