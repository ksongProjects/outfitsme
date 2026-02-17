output "project_id" {
  value       = var.project_id
  description = "Configured GCP project."
}

output "service_account_email" {
  value       = google_service_account.app.email
  description = "Service account email for app workloads."
}

output "gemini_secret_name" {
  value       = var.create_gemini_secret ? google_secret_manager_secret.gemini[0].secret_id : null
  description = "Secret ID for Gemini key, if created."
}
