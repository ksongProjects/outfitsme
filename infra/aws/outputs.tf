output "agent_id" {
  description = "Bedrock Agent ID for app settings."
  value       = aws_bedrockagent_agent.agent.agent_id
}

output "agent_alias_id" {
  description = "Bedrock Agent Alias ID for app settings."
  value       = aws_bedrockagent_agent_alias.alias.agent_alias_id
}

output "aws_region" {
  description = "AWS region used by the deployment."
  value       = var.aws_region
}

output "agent_iam_role_arn" {
  description = "IAM role ARN used by the Bedrock Agent."
  value       = aws_iam_role.bedrock_agent_role.arn
}
