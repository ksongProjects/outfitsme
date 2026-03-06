alter table if exists public.user_settings
  drop column if exists gemini_api_key_enc,
  drop column if exists preferred_model,
  drop column if exists aws_region,
  drop column if exists aws_bedrock_agent_id,
  drop column if exists aws_bedrock_agent_alias_id,
  drop column if exists is_premium;
