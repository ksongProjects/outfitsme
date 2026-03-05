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

resource "aws_iam_instance_profile" "ec2_profile" {
  name = "EC2_SSM_Profile"
  role = aws_iam_role.ec2_ssm_role.name
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

output "ec2_instance_id" {
  value = aws_instance.app_server.id
}
