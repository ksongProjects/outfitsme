variable "project_id" {
  description = "GCP project ID."
  type        = string
}

variable "region" {
  description = "Primary GCP region."
  type        = string
  default     = "us-central1"
}

variable "service_account_id" {
  description = "Service account ID (without domain)."
  type        = string
  default     = "outfitme-app"
}

variable "create_gemini_secret" {
  description = "Whether to create a Secret Manager secret for Gemini API key."
  type        = bool
  default     = false
}

variable "gemini_api_key" {
  description = "Optional Gemini API key to seed in Secret Manager."
  type        = string
  sensitive   = true
  default     = ""
}
