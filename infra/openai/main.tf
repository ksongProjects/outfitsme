locals {
  config_payload = {
    model        = var.openai_model
    api_base     = var.openai_api_base
    project      = var.openai_project
    organization = var.openai_organization
    api_key      = var.include_api_key_in_generated_file ? var.openai_api_key : ""
  }
}

resource "local_sensitive_file" "openai_config" {
  filename = "${path.module}/generated/openai-config.json"
  content  = jsonencode(local.config_payload)
}
