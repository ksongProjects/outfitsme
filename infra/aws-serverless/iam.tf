data "aws_iam_policy_document" "lambda_assume_role" {
  statement {
    effect = "Allow"

    actions = ["sts:AssumeRole"]

    principals {
      type        = "Service"
      identifiers = ["lambda.amazonaws.com"]
    }
  }
}

resource "aws_iam_role" "lambda_api_exec" {
  name               = "${local.name_prefix}-api-exec"
  assume_role_policy = data.aws_iam_policy_document.lambda_assume_role.json
}

resource "aws_iam_role" "lambda_worker_exec" {
  name               = "${local.name_prefix}-worker-exec"
  assume_role_policy = data.aws_iam_policy_document.lambda_assume_role.json
}

resource "aws_iam_role_policy_attachment" "lambda_api_basic_execution" {
  role       = aws_iam_role.lambda_api_exec.name
  policy_arn = "arn:aws:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole"
}

resource "aws_iam_role_policy_attachment" "lambda_worker_basic_execution" {
  role       = aws_iam_role.lambda_worker_exec.name
  policy_arn = "arn:aws:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole"
}

resource "aws_iam_role_policy_attachment" "lambda_worker_sqs_execution" {
  role       = aws_iam_role.lambda_worker_exec.name
  policy_arn = "arn:aws:iam::aws:policy/service-role/AWSLambdaSQSQueueExecutionRole"
}

data "aws_iam_policy_document" "lambda_api_send_sqs" {
  statement {
    effect = "Allow"

    actions = [
      "sqs:GetQueueAttributes",
      "sqs:GetQueueUrl",
      "sqs:SendMessage",
    ]

    resources = [aws_sqs_queue.analysis_jobs.arn]
  }
}

resource "aws_iam_role_policy" "lambda_api_send_sqs" {
  name   = "${local.name_prefix}-api-send-sqs"
  role   = aws_iam_role.lambda_api_exec.id
  policy = data.aws_iam_policy_document.lambda_api_send_sqs.json
}
