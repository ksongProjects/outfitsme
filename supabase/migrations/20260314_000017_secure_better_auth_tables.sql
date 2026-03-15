alter table if exists public.users enable row level security;
alter table if exists public.sessions enable row level security;
alter table if exists public.accounts enable row level security;
alter table if exists public.verifications enable row level security;

revoke all on table public.users from anon, authenticated;
revoke all on table public.sessions from anon, authenticated;
revoke all on table public.accounts from anon, authenticated;
revoke all on table public.verifications from anon, authenticated;

comment on table public.users is
  'Better Auth private table. Access is restricted to trusted server-side database connections.';
comment on table public.sessions is
  'Better Auth private table. Access is restricted to trusted server-side database connections.';
comment on table public.accounts is
  'Better Auth private table. Access is restricted to trusted server-side database connections.';
comment on table public.verifications is
  'Better Auth private table. Access is restricted to trusted server-side database connections.';
