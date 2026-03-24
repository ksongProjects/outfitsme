create extension if not exists pgcrypto;

create table if not exists public.users (
  id text primary key,
  name text not null,
  email text not null,
  email_verified boolean not null default false,
  image text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists users_email_unique on public.users (email);

create table if not exists public.sessions (
  id text primary key,
  expires_at timestamptz not null,
  token text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  ip_address text,
  user_agent text,
  user_id text not null references public.users (id) on delete cascade
);

create unique index if not exists sessions_token_unique on public.sessions (token);
create index if not exists sessions_user_id_idx on public.sessions (user_id);

create table if not exists public.accounts (
  id text primary key,
  account_id text not null,
  provider_id text not null,
  user_id text not null references public.users (id) on delete cascade,
  access_token text,
  refresh_token text,
  id_token text,
  access_token_expires_at timestamptz,
  refresh_token_expires_at timestamptz,
  scope text,
  password text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists accounts_provider_account_unique
  on public.accounts (provider_id, account_id);
create index if not exists accounts_user_id_idx on public.accounts (user_id);

create table if not exists public.verifications (
  id text primary key,
  identifier text not null,
  value text not null,
  expires_at timestamptz not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists verifications_identifier_idx on public.verifications (identifier);

create table if not exists public.jwks (
  id text primary key,
  public_key text not null,
  private_key text not null,
  created_at timestamptz not null default now(),
  expires_at timestamptz,
  alg text,
  crv text
);

create index if not exists jwks_created_at_idx on public.jwks (created_at desc);

alter table if exists public.users enable row level security;
alter table if exists public.sessions enable row level security;
alter table if exists public.accounts enable row level security;
alter table if exists public.verifications enable row level security;
alter table if exists public.jwks enable row level security;

revoke all on table public.users from anon, authenticated;
revoke all on table public.sessions from anon, authenticated;
revoke all on table public.accounts from anon, authenticated;
revoke all on table public.verifications from anon, authenticated;
revoke all on table public.jwks from anon, authenticated;

comment on table public.users is
  'Better Auth private table. Access is restricted to trusted server-side database connections.';
comment on table public.sessions is
  'Better Auth private table. Access is restricted to trusted server-side database connections.';
comment on table public.accounts is
  'Better Auth private table. Access is restricted to trusted server-side database connections.';
comment on table public.verifications is
  'Better Auth private table. Access is restricted to trusted server-side database connections.';
comment on table public.jwks is
  'Better Auth private JWKS table. Access is restricted to trusted server-side database connections.';

create or replace function public.current_better_auth_user_id()
returns text
language sql
stable
as $$
  select nullif(auth.jwt() ->> 'sub', '');
$$;

insert into storage.buckets (id, name, public)
values ('outfit-images', 'outfit-images', false)
on conflict (id) do nothing;

drop policy if exists outfit_images_owner_select on storage.objects;
create policy "outfit_images_owner_select" on storage.objects
for select using (
  bucket_id = 'outfit-images'
  and public.current_better_auth_user_id() = (storage.foldername(name))[1]
);

drop policy if exists outfit_images_owner_insert on storage.objects;
create policy "outfit_images_owner_insert" on storage.objects
for insert with check (
  bucket_id = 'outfit-images'
  and public.current_better_auth_user_id() = (storage.foldername(name))[1]
);

drop policy if exists outfit_images_owner_update on storage.objects;
create policy "outfit_images_owner_update" on storage.objects
for update using (
  bucket_id = 'outfit-images'
  and public.current_better_auth_user_id() = (storage.foldername(name))[1]
);

drop policy if exists outfit_images_owner_delete on storage.objects;
create policy "outfit_images_owner_delete" on storage.objects
for delete using (
  bucket_id = 'outfit-images'
  and public.current_better_auth_user_id() = (storage.foldername(name))[1]
);
