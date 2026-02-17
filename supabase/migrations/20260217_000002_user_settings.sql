create table if not exists public.user_settings (
  user_id uuid primary key references auth.users(id) on delete cascade,
  preferred_model text not null default 'gemini-2.5-flash',
  gemini_api_key_enc text,
  aws_access_key_id_enc text,
  aws_secret_access_key_enc text,
  aws_session_token_enc text,
  aws_region text,
  aws_bedrock_model_id text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.user_settings enable row level security;

drop policy if exists user_settings_owner_select on public.user_settings;
create policy "user_settings_owner_select" on public.user_settings
for select using (auth.uid() = user_id);

drop policy if exists user_settings_owner_insert on public.user_settings;
create policy "user_settings_owner_insert" on public.user_settings
for insert with check (auth.uid() = user_id);

drop policy if exists user_settings_owner_update on public.user_settings;
create policy "user_settings_owner_update" on public.user_settings
for update using (auth.uid() = user_id);

drop policy if exists user_settings_owner_delete on public.user_settings;
create policy "user_settings_owner_delete" on public.user_settings
for delete using (auth.uid() = user_id);
