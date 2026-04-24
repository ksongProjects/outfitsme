resource "aws_lambda_function" "analysis_worker" {
  function_name                  = "${local.name_prefix}-analysis-worker"
  role                           = aws_iam_role.lambda_worker_exec.arn
  package_type                   = "Image"
  image_uri                      = var.worker_image_uri
  architectures                  = [var.lambda_architecture]
  memory_size                    = var.worker_memory_size
  timeout                        = var.worker_timeout
  reserved_concurrent_executions = var.worker_reserved_concurrency

  environment {
    variables = merge(
      local.common_backend_env,
      {
        ANALYSIS_QUEUE_URL = aws_sqs_queue.analysis_jobs.id
      }
    )
  }

  depends_on = [
    aws_iam_role_policy_attachment.lambda_worker_basic_execution,
    aws_iam_role_policy_attachment.lambda_worker_sqs_execution,
  ]
}

resource "aws_lambda_event_source_mapping" "analysis_jobs" {
  event_source_arn        = aws_sqs_queue.analysis_jobs.arn
  function_name           = aws_lambda_function.analysis_worker.arn
  batch_size              = 1
  function_response_types = ["ReportBatchItemFailures"]

  scaling_config {
    maximum_concurrency = var.worker_reserved_concurrency
  }
}
