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

create unique index if not exists accounts_provider_account_unique on public.accounts (provider_id, account_id);
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
