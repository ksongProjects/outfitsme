output "api_function_url" {
  value = aws_lambda_function_url.api.function_url
}

output "backend_api_base_url" {
  value = aws_lambda_function_url.api.function_url
}

output "analysis_queue_url" {
  value = aws_sqs_queue.analysis_jobs.id
}

output "analysis_queue_arn" {
  value = aws_sqs_queue.analysis_jobs.arn
}

output "backend_api_ecr_repository_url" {
  value = aws_ecr_repository.backend_api.repository_url
}

output "backend_worker_ecr_repository_url" {
  value = aws_ecr_repository.backend_worker.repository_url
}

output "vercel_environment" {
  value = {
    APP_URL                     = var.app_url
    NEXT_PUBLIC_APP_URL         = var.app_url
    NEXT_PUBLIC_API_BASE_URL    = aws_lambda_function_url.api.function_url
    BETTER_AUTH_URL             = var.better_auth_url
    BETTER_AUTH_TRUSTED_ORIGINS = join(",", var.frontend_allowed_origins)
  }
}

output "google_oauth_redirect_uri" {
  value = "${trim(var.better_auth_url, "/")}/api/auth/callback/google"
}
