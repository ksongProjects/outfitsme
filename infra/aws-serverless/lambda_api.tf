resource "aws_lambda_function" "api" {
  function_name                  = "${local.name_prefix}-api"
  role                           = aws_iam_role.lambda_api_exec.arn
  package_type                   = "Image"
  image_uri                      = var.api_image_uri
  architectures                  = [var.lambda_architecture]
  memory_size                    = var.api_memory_size
  timeout                        = var.api_timeout
  reserved_concurrent_executions = var.api_reserved_concurrency

  environment {
    variables = merge(
      local.common_backend_env,
      {
        ANALYSIS_QUEUE_URL           = aws_sqs_queue.analysis_jobs.id
        AWS_LWA_PORT                 = "8080"
        AWS_LWA_READINESS_CHECK_PATH = "/health"
      }
    )
  }

  depends_on = [
    aws_iam_role_policy.lambda_api_send_sqs,
    aws_iam_role_policy_attachment.lambda_api_basic_execution,
  ]
}
