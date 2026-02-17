alter table if exists public.user_settings
  drop column if exists aws_bedrock_model_id;
