resource "aws_sqs_queue" "analysis_jobs_dlq" {
  name                      = "${local.name_prefix}-analysis-jobs-dlq"
  message_retention_seconds = 1209600
}

resource "aws_sqs_queue" "analysis_jobs" {
  name                       = "${local.name_prefix}-analysis-jobs"
  visibility_timeout_seconds = var.analysis_queue_visibility_timeout_seconds
  message_retention_seconds  = var.analysis_queue_message_retention_seconds
  receive_wait_time_seconds  = 20

  redrive_policy = jsonencode({
    deadLetterTargetArn = aws_sqs_queue.analysis_jobs_dlq.arn
    maxReceiveCount     = 3
  })
}
