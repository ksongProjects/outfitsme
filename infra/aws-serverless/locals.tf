locals {
  name_prefix = "${var.project_name}-${var.environment}"

  common_backend_env = {
    FLASK_ENV                = var.flask_env
    DEBUG                    = "false"
    AWS_REGION               = var.aws_region
    PORT                     = "8080"
    APP_URL                  = var.app_url
    BETTER_AUTH_URL          = var.better_auth_url
    BETTER_AUTH_JWKS_URL     = var.better_auth_jwks_url
    BETTER_AUTH_JWT_ISSUER   = var.better_auth_jwt_issuer
    BETTER_AUTH_JWT_AUDIENCE = var.better_auth_jwt_audience
    CORS_ALLOWED_ORIGINS     = join(",", var.frontend_allowed_origins)
    SUPABASE_URL             = var.supabase_url
    SUPABASE_SECRET_KEY      = var.supabase_secret_key
    SUPABASE_BUCKET          = var.supabase_bucket
    GEMINI_API_KEY           = var.gemini_api_key
    GEMINI_MODEL             = var.gemini_model
    GEMINI_IMAGE_MODEL       = var.gemini_image_model
    SETTINGS_ENCRYPTION_KEY  = var.settings_encryption_key
    DEFAULT_ANALYSIS_MODEL   = var.default_analysis_model
    UPLOAD_MAX_BYTES         = tostring(var.upload_max_bytes)
  }
}
