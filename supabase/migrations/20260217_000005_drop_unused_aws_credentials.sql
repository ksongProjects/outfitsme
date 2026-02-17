alter table public.user_settings
  drop column if exists aws_access_key_id_enc,
  drop column if exists aws_secret_access_key_enc,
  drop column if exists aws_session_token_enc;

