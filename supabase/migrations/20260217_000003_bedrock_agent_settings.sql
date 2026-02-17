alter table if exists public.user_settings
  add column if not exists aws_bedrock_agent_id text,
  add column if not exists aws_bedrock_agent_alias_id text,
  drop column if exists aws_bedrock_model_id;
