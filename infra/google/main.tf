resource "google_project_service" "required" {
  for_each = toset([
    "aiplatform.googleapis.com",
    "secretmanager.googleapis.com",
    "iamcredentials.googleapis.com"
  ])

  project = var.project_id
  service = each.key
}

resource "google_service_account" "app" {
  account_id   = var.service_account_id
  display_name = "OutfitMe App Service Account"
  depends_on   = [google_project_service.required]
}

resource "google_secret_manager_secret" "gemini" {
  count = var.create_gemini_secret ? 1 : 0

  secret_id = "outfitme-gemini-api-key"

  replication {
    auto {}
  }

  depends_on = [google_project_service.required]
}

resource "google_secret_manager_secret_version" "gemini_current" {
  count = var.create_gemini_secret && var.gemini_api_key != "" ? 1 : 0

  secret      = google_secret_manager_secret.gemini[0].id
  secret_data = var.gemini_api_key
}
