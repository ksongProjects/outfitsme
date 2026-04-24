variable "aws_region" {
  description = "AWS region for serverless resources."
  type        = string
  default     = "us-west-2"
}

variable "project_name" {
  description = "Project prefix for resource names."
  type        = string
  default     = "outfitsme"
}

variable "environment" {
  description = "Environment name."
  type        = string
  default     = "prod"
}

variable "flask_env" {
  description = "Flask runtime environment."
  type        = string
  default     = "production"
}

variable "lambda_architecture" {
  description = "Lambda CPU architecture."
  type        = string
  default     = "x86_64"
}

variable "frontend_allowed_origins" {
  description = "Allowed browser origins for backend CORS and Lambda Function URL CORS."
  type        = list(string)
}

variable "app_url" {
  description = "Primary frontend application URL."
  type        = string
}

variable "better_auth_url" {
  description = "Public Better Auth base URL served by Vercel."
  type        = string
}

variable "better_auth_jwks_url" {
  description = "Better Auth JWKS URL used by backend JWT validation."
  type        = string
}

variable "better_auth_jwt_issuer" {
  description = "Expected Better Auth JWT issuer."
  type        = string
}

variable "better_auth_jwt_audience" {
  description = "Expected Better Auth JWT audience."
  type        = string
}

variable "supabase_url" {
  description = "Supabase project URL."
  type        = string
}

variable "supabase_secret_key" {
  description = "Supabase service role key."
  type        = string
  sensitive   = true
}

variable "supabase_bucket" {
  description = "Supabase storage bucket."
  type        = string
  default     = "outfit-images"
}

variable "gemini_api_key" {
  description = "Gemini API key."
  type        = string
  sensitive   = true
}

variable "gemini_model" {
  description = "Default Gemini analysis model."
  type        = string
  default     = "gemini-2.5-flash"
}

variable "gemini_image_model" {
  description = "Default Gemini image model."
  type        = string
  default     = "gemini-2.5-flash-image"
}

variable "settings_encryption_key" {
  description = "Backend settings encryption key."
  type        = string
  sensitive   = true
}

variable "default_analysis_model" {
  description = "Default analysis model stored in ai_jobs."
  type        = string
  default     = "gemini-2.5-flash"
}

variable "api_image_uri" {
  description = "ECR image URI for backend API Lambda."
  type        = string
}

variable "worker_image_uri" {
  description = "ECR image URI for analysis worker Lambda."
  type        = string
}

variable "api_memory_size" {
  description = "Memory size for API Lambda."
  type        = number
  default     = 1024
}

variable "api_timeout" {
  description = "Timeout in seconds for API Lambda."
  type        = number
  default     = 30
}

variable "api_reserved_concurrency" {
  description = "Reserved concurrency for API Lambda."
  type        = number
  default     = 5
}

variable "worker_memory_size" {
  description = "Memory size for worker Lambda."
  type        = number
  default     = 2048
}

variable "worker_timeout" {
  description = "Timeout in seconds for worker Lambda."
  type        = number
  default     = 300
}

variable "worker_reserved_concurrency" {
  description = "Reserved concurrency for worker Lambda."
  type        = number
  default     = 2
}

variable "analysis_queue_visibility_timeout_seconds" {
  description = "SQS visibility timeout for analysis jobs."
  type        = number
  default     = 330
}

variable "analysis_queue_message_retention_seconds" {
  description = "SQS message retention for analysis jobs."
  type        = number
  default     = 345600
}

variable "log_retention_days" {
  description = "CloudWatch log retention in days."
  type        = number
  default     = 14
}
