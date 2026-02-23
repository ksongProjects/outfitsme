# Terraform Infrastructure Templates

This folder contains Terraform templates for:
- `infra/aws`: AWS Bedrock Agent creation (plus IAM role/policy).
- `infra/aws-minimal`: Minimal AWS production app stack (EC2 + TLS + optional CloudFront/WAF).
- `infra/google`: Google Cloud setup template for Gemini/Vertex usage.
- `infra/openai`: OpenAI app configuration template.

## Prerequisites

- Terraform `>= 1.6.0`
- Cloud credentials configured for the provider you are using
- A separate state backend for non-local environments (S3/GCS/Terraform Cloud)

## Recommended Workflow

For any provider folder:

1. `cd infra/<provider>`
2. Copy example vars:
   - PowerShell: `Copy-Item terraform.tfvars.example terraform.tfvars`
3. Edit `terraform.tfvars`
4. Run:
   - `terraform init`
   - `terraform plan`
   - `terraform apply`

## AWS (Bedrock Agent)

Folder: `infra/aws`

What it creates:
- IAM role trusted by Bedrock Agent service
- IAM inline policy to invoke foundation models
- Bedrock Agent
- Bedrock Agent Alias

Use outputs for app settings:
- `agent_id`
- `agent_alias_id`
- `aws_region`

These map directly to your app Settings fields:
- Bedrock agent ID
- Bedrock agent alias ID
- AWS region

## Google (Template)

Folder: `infra/google`

What it creates:
- Enables required APIs (Vertex AI, Secret Manager, IAM Credentials)
- Service account for your app
- Optional Secret Manager secret for Gemini API key

This is a template for GCP model integration and secret management.

## OpenAI (Template)

Folder: `infra/openai`

What it creates:
- Standardized app config artifact (`generated/openai-config.json`)

This template provides a consistent Terraform-managed config flow even though
OpenAI itself is not a cloud infra provider in this setup.

## Notes

- Do not commit real `terraform.tfvars` with secrets.
- Do not commit `*.tfstate` files.
- For production, store secrets in a secret manager and inject them at runtime.
