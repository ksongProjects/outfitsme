alter table if exists public.user_settings
  add column if not exists user_role text not null default 'trial';

update public.user_settings
set user_role = 'premium'
where coalesce(is_premium, false) = true
  and coalesce(user_role, '') not in ('premium', 'admin');

update public.user_settings
set user_role = 'trial'
where coalesce(user_role, '') = '';

alter table if exists public.user_settings
  drop constraint if exists user_settings_user_role_check;

alter table if exists public.user_settings
  add constraint user_settings_user_role_check
  check (user_role in ('trial', 'premium', 'admin'));
