terraform {
  required_version = ">= 1.6.0"

  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = ">= 5.0"
    }
  }
}

provider "aws" {
  region = "us-west-2"
}

variable "terraform_execution_role_name" {
  description = "IAM role name used to run Terraform. If set, a scoped iam:PassRole policy is attached."
  type        = string
  default     = null
}

variable "deploy_artifacts_bucket_name" {
  description = "Private S3 bucket used to stage deploy bundles for SSM-based production deploys."
  type        = string
  default     = "outfitme-deploy-artifacts"
}

data "aws_ami" "ubuntu_2404" {
  most_recent = true
  owners      = ["099720109477"] # Canonical

  filter {
    name   = "name"
    values = ["ubuntu/images/hvm-ssd-gp3/ubuntu-noble-24.04-amd64-server-*"]
  }

  filter {
    name   = "virtualization-type"
    values = ["hvm"]
  }
}

# 1. IAM Role so EC2 can talk to Systems Manager (SSM)
resource "aws_iam_role" "ec2_ssm_role" {
  name = "EC2_SSM_Managed_Role"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Action = "sts:AssumeRole"
      Effect = "Allow"
      Principal = { Service = "ec2.amazonaws.com" }
    }]
  })
}

resource "aws_iam_role_policy_attachment" "ssm_attach" {
  role       = aws_iam_role.ec2_ssm_role.name
  policy_arn = "arn:aws:iam::aws:policy/AmazonSSMManagedInstanceCore"
}

resource "aws_iam_role_policy" "ec2_deploy_bundle_read" {
  name = "Ec2ReadDeployBundles"
  role = aws_iam_role.ec2_ssm_role.id
  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect   = "Allow"
        Action   = ["s3:GetObject"]
        Resource = "${aws_s3_bucket.deploy_artifacts.arn}/deploy-bundles/*"
      }
    ]
  })
}

resource "aws_iam_instance_profile" "ec2_profile" {
  name = "EC2_SSM_Profile"
  role = aws_iam_role.ec2_ssm_role.name
}

resource "aws_s3_bucket" "deploy_artifacts" {
  bucket = var.deploy_artifacts_bucket_name

  tags = {
    Name = "outfitme-deploy-artifacts"
  }
}

resource "aws_s3_bucket_public_access_block" "deploy_artifacts" {
  bucket = aws_s3_bucket.deploy_artifacts.id

  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

resource "aws_s3_bucket_versioning" "deploy_artifacts" {
  bucket = aws_s3_bucket.deploy_artifacts.id

  versioning_configuration {
    status = "Enabled"
  }
}

resource "aws_s3_bucket_server_side_encryption_configuration" "deploy_artifacts" {
  bucket = aws_s3_bucket.deploy_artifacts.id

  rule {
    apply_server_side_encryption_by_default {
      sse_algorithm = "AES256"
    }
  }
}

# Least-privilege PassRole grant for Terraform execution role.
# This avoids wildcard iam:PassRole and limits passing only to EC2 service.
resource "aws_iam_role_policy" "terraform_passrole_ec2_profile" {
  count = var.terraform_execution_role_name == null ? 0 : 1

  name = "ScopedPassRoleForEc2Profile"
  role = var.terraform_execution_role_name
  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect   = "Allow"
      Action   = "iam:PassRole"
      Resource = aws_iam_role.ec2_ssm_role.arn
      Condition = {
        StringEquals = {
          "iam:PassedToService" = "ec2.amazonaws.com"
        }
      }
    }]
  })
}

# 2. Security Group (Port 22 is intentionally closed; use SSM only)
resource "aws_security_group" "web_stack_sg" {
  name_prefix = "web-stack-sg-"
  description = "Allow HTTP/HTTPS traffic"

  ingress {
    from_port   = 80
    to_port     = 80
    protocol    = "tcp"
    cidr_blocks = ["0.0.0.0/0"]
  }

  ingress {
    from_port   = 443
    to_port     = 443
    protocol    = "tcp"
    cidr_blocks = ["0.0.0.0/0"]
  }

  egress {
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }

  tags = {
    Name = "web-stack-sg"
  }
}

# 3. EC2 Instance
resource "aws_instance" "app_server" {
  ami                  = data.aws_ami.ubuntu_2404.id
  instance_type        = "t3.micro"
  iam_instance_profile = aws_iam_instance_profile.ec2_profile.name
  monitoring           = true

  vpc_security_group_ids = [aws_security_group.web_stack_sg.id]

  metadata_options {
    http_endpoint = "enabled"
    http_tokens   = "required"
  }

  root_block_device {
    encrypted             = true
    volume_type           = "gp3"
    volume_size           = 20
    delete_on_termination = true
  }

  # Startup script to install Docker automatically
  user_data = <<-EOF
              #!/bin/bash
              set -euxo pipefail
              apt-get update
              apt-get install -y docker.io docker-compose-v2
              systemctl enable --now docker
              usermod -aG docker ubuntu
              EOF

  tags = {
    Name = "React-Flask-Production"
  }
}

resource "aws_eip" "app_server_eip" {
  domain   = "vpc"
  instance = aws_instance.app_server.id

  tags = {
    Name = "react-flask-production-eip"
  }
}

output "ec2_instance_id" {
  value = aws_instance.app_server.id
}

output "ec2_elastic_ip" {
  value = aws_eip.app_server_eip.public_ip
}

output "ec2_elastic_ip_allocation_id" {
  value = aws_eip.app_server_eip.allocation_id
}

output "deploy_artifacts_bucket_name" {
  value = aws_s3_bucket.deploy_artifacts.bucket
}
