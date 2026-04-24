resource "aws_lambda_function_url" "api" {
  function_name      = aws_lambda_function.api.function_name
  authorization_type = "NONE"

  cors {
    allow_credentials = true
    allow_headers     = ["Authorization", "Content-Type"]
    allow_methods     = ["*"]
    allow_origins     = var.frontend_allowed_origins
    expose_headers    = ["x-amzn-requestid"]
    max_age           = 86400
  }
}

resource "aws_lambda_permission" "api_function_url_public" {
  statement_id           = "AllowPublicInvokeFunctionUrl"
  action                 = "lambda:InvokeFunctionUrl"
  function_name          = aws_lambda_function.api.function_name
  principal              = "*"
  function_url_auth_type = "NONE"
}

resource "aws_lambda_permission" "api_function_url_public_invoke" {
  statement_id             = "AllowPublicInvokeFunction"
  action                   = "lambda:InvokeFunction"
  function_name            = aws_lambda_function.api.function_name
  principal                = "*"
  invoked_via_function_url = true
}
