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

alter table if exists public.jwks enable row level security;

revoke all on table public.jwks from anon, authenticated;

comment on table public.jwks is
  'Better Auth private JWKS table. Access is restricted to trusted server-side database connections.';
