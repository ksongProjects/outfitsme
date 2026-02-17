data "aws_caller_identity" "current" {}

data "aws_iam_policy_document" "bedrock_agent_assume_role" {
  statement {
    sid = "AllowBedrockAgentAssumeRole"

    actions = ["sts:AssumeRole"]

    principals {
      type        = "Service"
      identifiers = ["bedrock.amazonaws.com"]
    }
  }
}

resource "aws_iam_role" "bedrock_agent_role" {
  name               = "${var.agent_name}-bedrock-agent-role"
  assume_role_policy = data.aws_iam_policy_document.bedrock_agent_assume_role.json
}

locals {
  model_resource_arns = length(var.allowed_model_arns) > 0 ? var.allowed_model_arns : ["*"]
}

data "aws_iam_policy_document" "bedrock_agent_permissions" {
  statement {
    sid = "AllowInvokeFoundationModel"

    actions = [
      "bedrock:InvokeModel",
      "bedrock:InvokeModelWithResponseStream"
    ]

    resources = local.model_resource_arns
  }
}

resource "aws_iam_role_policy" "bedrock_agent_policy" {
  name   = "${var.agent_name}-bedrock-agent-policy"
  role   = aws_iam_role.bedrock_agent_role.id
  policy = data.aws_iam_policy_document.bedrock_agent_permissions.json
}

resource "aws_bedrockagent_agent" "agent" {
  agent_name                  = var.agent_name
  description                 = "Outfit image analysis agent managed by Terraform."
  instruction                 = var.agent_instruction
  foundation_model            = var.foundation_model
  agent_resource_role_arn     = aws_iam_role.bedrock_agent_role.arn
  idle_session_ttl_in_seconds = var.session_ttl_seconds
}

resource "aws_bedrockagent_agent_alias" "alias" {
  agent_alias_name = var.agent_alias_name
  agent_id         = aws_bedrockagent_agent.agent.agent_id
  description      = "Primary alias managed by Terraform."
}
