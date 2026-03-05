# 1. Define the Provider
provider "aws" {
  region = "us-west-2" # Change to your preferred region
}

# 2. Create a Security Group
resource "aws_security_group" "web_stack_sg" {
  name        = "web-stack-sg"
  description = "Allow Nginx, React, and Flask traffic"

  # SSH Access
  ingress {
    from_port   = 22
    to_port     = 22
    protocol    = "tcp"
    cidr_blocks = ["0.0.0.0/0"] # For production, limit this to your IP
  }

  # Nginx / React (HTTP)
  ingress {
    from_port   = 80
    to_port     = 80
    protocol    = "tcp"
    cidr_blocks = ["0.0.0.0/0"]
  }

  # Flask Backend (Commonly port 5000 or 8000)
  ingress {
    from_port   = 5000
    to_port     = 5000
    protocol    = "tcp"
    cidr_blocks = ["0.0.0.0/0"]
  }

  # Allow all outbound traffic (so the server can download Docker/Updates)
  egress {
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }
}

# 3. Create the EC2 Instance
resource "aws_instance" "app_server" {
  ami           = "ami-0c7217cdde317cfec" # Ubuntu 22.04 LTS in us-east-1
  instance_type = "t2.micro"             # Free tier eligible
  
  key_name      = "your-key-pair-name"    # MUST match a key pair in your AWS console
  vpc_security_group_ids = [aws_security_group.web_stack_sg.id]

  tags = {
    Name = "React-Flask-Production"
  }
}

# 4. Output the IP
output "ec2_public_ip" {
  description = "The public IP address of the main server"
  value       = aws_instance.app_server.public_ip
}