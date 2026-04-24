resource "aws_ecr_repository" "backend_api" {
  name                 = "${local.name_prefix}-backend-api"
  image_tag_mutability = "MUTABLE"

  image_scanning_configuration {
    scan_on_push = true
  }
}

resource "aws_ecr_repository" "backend_worker" {
  name                 = "${local.name_prefix}-backend-worker"
  image_tag_mutability = "MUTABLE"

  image_scanning_configuration {
    scan_on_push = true
  }
}
