output "api_function_url" {
  value = aws_lambda_function_url.api.function_url
}

output "analysis_queue_url" {
  value = aws_sqs_queue.analysis_jobs.id
}

output "analysis_queue_arn" {
  value = aws_sqs_queue.analysis_jobs.arn
}

output "backend_api_ecr_repository_url" {
  value = aws_ecr_repository.backend_api.repository_url
}

output "backend_worker_ecr_repository_url" {
  value = aws_ecr_repository.backend_worker.repository_url
}
