resource "aws_cloudwatch_log_group" "lambda_api" {
  name              = "/aws/lambda/${aws_lambda_function.api.function_name}"
  retention_in_days = var.log_retention_days
}

resource "aws_cloudwatch_log_group" "lambda_worker" {
  name              = "/aws/lambda/${aws_lambda_function.analysis_worker.function_name}"
  retention_in_days = var.log_retention_days
}
