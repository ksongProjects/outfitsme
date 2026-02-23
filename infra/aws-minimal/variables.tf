variable "project_name" {
  description = "Project name prefix for AWS resources."
  type        = string
  default     = "outfitme"
}

variable "environment" {
  description = "Environment name (dev, staging, prod)."
  type        = string
  default     = "prod"
}

variable "aws_region" {
  description = "AWS region for deployment."
  type        = string
  default     = "us-east-1"
}

variable "vpc_cidr" {
  description = "CIDR block for the VPC."
  type        = string
  default     = "10.30.0.0/16"
}

variable "public_subnet_cidr" {
  description = "CIDR block for the public subnet."
  type        = string
  default     = "10.30.1.0/24"
}

variable "availability_zone" {
  description = "Availability zone for the EC2 instance (leave empty for random)."
  type        = string
  default     = ""
}

variable "instance_type" {
  description = "EC2 instance type."
  type        = string
  default     = "t3.small"
}

variable "allow_ssh_cidr_blocks" {
  description = "Optional SSH allow list. Keep empty and use SSM Session Manager."
  type        = list(string)
  default     = []
}

variable "tls_email" {
  description = "Email used by Caddy for certificate issuance."
  type        = string
  default     = ""
}

variable "domain_name" {
  description = "Public domain for the app (example: app.example.com). Leave empty for HTTP-only."
  type        = string
  default     = ""
}

variable "route53_zone_id" {
  description = "Route53 hosted zone ID for domain_name. Leave empty to skip DNS records."
  type        = string
  default     = ""
}

variable "app_repo_url" {
  description = "Git repository URL for the app source."
  type        = string
}

variable "app_repo_ref" {
  description = "Branch or tag to deploy from app_repo_url."
  type        = string
  default     = "main"
}

variable "backend_env_parameter" {
  description = "SSM SecureString parameter name containing backend/.env content."
  type        = string
}

variable "frontend_env_parameter" {
  description = "SSM SecureString parameter name containing frontend env content."
  type        = string
}

variable "monthly_budget_usd" {
  description = "Monthly AWS cost budget in USD."
  type        = string
  default     = "30"
}

variable "budget_alert_email" {
  description = "Email for AWS budget alerts."
  type        = string
}

variable "enable_edge_protection" {
  description = "Enable CloudFront + WAF edge throttling in front of EC2."
  type        = bool
  default     = false

  validation {
    condition     = !var.enable_edge_protection || (var.domain_name != "" && var.route53_zone_id != "")
    error_message = "domain_name and route53_zone_id are required when enable_edge_protection is true."
  }
}

variable "waf_rate_limit_per_5m" {
  description = "WAF rate-based rule limit per 5-minute window per source IP."
  type        = number
  default     = 200
}
