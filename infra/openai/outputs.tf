output "openai_model" {
  description = "Configured default OpenAI model."
  value       = var.openai_model
}

output "openai_api_base" {
  description = "Configured OpenAI API base URL."
  value       = var.openai_api_base
}

output "generated_config_path" {
  description = "Path to generated local OpenAI config file."
  value       = local_sensitive_file.openai_config.filename
}
