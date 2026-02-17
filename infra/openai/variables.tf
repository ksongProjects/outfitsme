variable "openai_model" {
  description = "Default OpenAI model for the app."
  type        = string
  default     = "gpt-4.1-mini"
}

variable "openai_api_base" {
  description = "Optional base URL override."
  type        = string
  default     = "https://api.openai.com/v1"
}

variable "openai_project" {
  description = "Optional OpenAI project ID."
  type        = string
  default     = ""
}

variable "openai_organization" {
  description = "Optional OpenAI organization ID."
  type        = string
  default     = ""
}

variable "openai_api_key" {
  description = "Optional OpenAI API key (sensitive)."
  type        = string
  default     = ""
  sensitive   = true
}

variable "include_api_key_in_generated_file" {
  description = "Whether to include openai_api_key in generated config JSON."
  type        = bool
  default     = false
}
