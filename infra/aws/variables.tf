variable "aws_region" {
  description = "AWS region where Bedrock Agent resources are created."
  type        = string
}

variable "agent_name" {
  description = "Bedrock Agent name."
  type        = string
}

variable "agent_alias_name" {
  description = "Bedrock Agent alias name."
  type        = string
  default     = "prod"
}

variable "foundation_model" {
  description = "Foundation model ID for the agent."
  type        = string
  default     = "anthropic.claude-3-5-sonnet-20240620-v1:0"
}

variable "agent_instruction" {
  description = "Agent instruction prompt."
  type        = string
}

variable "session_ttl_seconds" {
  description = "Idle session TTL in seconds."
  type        = number
  default     = 900
}

variable "allowed_model_arns" {
  description = "Optional list of allowed model ARNs for InvokeModel permissions. If empty, '*' is used."
  type        = list(string)
  default     = []
}
