terraform {
  required_version = ">= 1.0"
  
  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.0"
    }
    random = {
      source  = "hashicorp/random"
      version = "~> 3.0"
    }
  }
  
  # For now, we'll use local backend. Can migrate to S3 later
  backend "local" {
    path = "terraform.tfstate"
  }
}

provider "aws" {
  region = var.aws_region
  
  default_tags {
    tags = {
      Project     = "household-budgeting"
      Environment = "production"
      ManagedBy   = "terraform"
    }
  }
}

# Data source to get the latest Ubuntu AMI for ARM64
data "aws_ami" "ubuntu" {
  most_recent = true
  owners      = ["099720109477"] # Canonical

  filter {
    name   = "name"
    values = ["ubuntu/images/hvm-ssd/ubuntu-jammy-22.04-arm64-server-*"]
  }

  filter {
    name   = "virtualization-type"
    values = ["hvm"]
  }

  filter {
    name   = "architecture"
    values = ["arm64"]
  }
}

# SSH Key Pair
resource "aws_key_pair" "ssh_key" {
  key_name   = "budget-app-key"
  public_key = var.ssh_public_key
  
  tags = {
    Name = "budget-app-ssh-key"
  }
}

# Security Group
resource "aws_security_group" "app_sg" {
  name        = "budget-app-security"
  description = "Security group for household budgeting app"
  
  # HTTP
  ingress {
    description = "HTTP from anywhere"
    from_port   = 80
    to_port     = 80
    protocol    = "tcp"
    cidr_blocks = ["0.0.0.0/0"]
  }
  
  # HTTPS
  ingress {
    description = "HTTPS from anywhere"
    from_port   = 443
    to_port     = 443
    protocol    = "tcp"
    cidr_blocks = ["0.0.0.0/0"]
  }
  
  # SSH (restricted to admin IP)
  ingress {
    description = "SSH from admin IP"
    from_port   = 22
    to_port     = 22
    protocol    = "tcp"
    cidr_blocks = [var.admin_ip_cidr]
  }
  
  
  # Allow all outbound traffic
  egress {
    description = "Allow all outbound traffic"
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }
  
  tags = {
    Name = "budget-app-security-group"
  }
}

# EC2 Instance
resource "aws_instance" "app_server" {
  ami           = data.aws_ami.ubuntu.id
  instance_type = "t4g.micro"  # ARM-based, Free tier eligible
  
  key_name               = aws_key_pair.ssh_key.key_name
  vpc_security_group_ids = [aws_security_group.app_sg.id]
  iam_instance_profile   = aws_iam_instance_profile.ec2_profile.name
  
  # Enable detailed monitoring (free tier includes basic monitoring)
  monitoring = false
  
  # Root block device with encryption
  root_block_device {
    volume_type = "gp3"
    volume_size = 20
    encrypted   = true
    
    tags = {
      Name = "budget-app-root-volume"
    }
  }
  
  # User data script for initial setup
  user_data = base64encode(templatefile("${path.module}/user_data.sh", {
    node_version = "20"
  }))
  
  tags = {
    Name = "budget-app-server"
  }
}

# Elastic IP
resource "aws_eip" "app_ip" {
  instance = aws_instance.app_server.id
  domain   = "vpc"
  
  tags = {
    Name = "budget-app-elastic-ip"
  }
}

# S3 Bucket for Backups
resource "random_id" "bucket_suffix" {
  byte_length = 4
}

resource "aws_s3_bucket" "backups" {
  bucket = "budget-app-backups-${random_id.bucket_suffix.hex}"
  
  tags = {
    Name = "budget-app-backups"
  }
}

# S3 Bucket Versioning
resource "aws_s3_bucket_versioning" "backups_versioning" {
  bucket = aws_s3_bucket.backups.id
  
  versioning_configuration {
    status = "Enabled"
  }
}

# S3 Bucket Encryption
resource "aws_s3_bucket_server_side_encryption_configuration" "backups_encryption" {
  bucket = aws_s3_bucket.backups.id
  
  rule {
    apply_server_side_encryption_by_default {
      sse_algorithm = "AES256"
    }
  }
}

# S3 Bucket Lifecycle Configuration
resource "aws_s3_bucket_lifecycle_configuration" "backups_lifecycle" {
  bucket = aws_s3_bucket.backups.id
  
  rule {
    id     = "backup-lifecycle"
    status = "Enabled"
    
    # Apply to all objects in the bucket
    filter {}
    
    # Transition to Glacier after 30 days
    transition {
      days          = 30
      storage_class = "GLACIER"
    }
    
    # Delete after 365 days
    expiration {
      days = 365
    }
  }
}

# S3 Bucket Public Access Block
resource "aws_s3_bucket_public_access_block" "backups_pab" {
  bucket = aws_s3_bucket.backups.id
  
  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

# IAM Role for EC2 to access S3
resource "aws_iam_role" "ec2_s3_role" {
  name = "budget-app-ec2-s3-role"
  
  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Action = "sts:AssumeRole"
        Effect = "Allow"
        Principal = {
          Service = "ec2.amazonaws.com"
        }
      }
    ]
  })
  
  tags = {
    Name = "budget-app-ec2-role"
  }
}

# IAM Policy for S3 access
resource "aws_iam_role_policy" "ec2_s3_policy" {
  name = "budget-app-s3-policy"
  role = aws_iam_role.ec2_s3_role.id
  
  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect = "Allow"
        Action = [
          "s3:PutObject",
          "s3:GetObject",
          "s3:ListBucket"
        ]
        Resource = [
          aws_s3_bucket.backups.arn,
          "${aws_s3_bucket.backups.arn}/*"
        ]
      }
    ]
  })
}

# Instance Profile for EC2
resource "aws_iam_instance_profile" "ec2_profile" {
  name = "budget-app-ec2-profile"
  role = aws_iam_role.ec2_s3_role.name
  
  tags = {
    Name = "budget-app-instance-profile"
  }
}

# Attach the instance profile to EC2 (update the EC2 resource)
# Note: This requires updating the aws_instance resource above
# Add: iam_instance_profile = aws_iam_instance_profile.ec2_profile.name

# CloudWatch Log Group for application logs
resource "aws_cloudwatch_log_group" "app_logs" {
  name              = "/aws/ec2/budget-app"
  retention_in_days = 7  # Keep logs for 7 days (free tier includes 5GB)
  
  tags = {
    Name = "budget-app-logs"
  }
}

# Budget Alert
resource "aws_budgets_budget" "monthly_budget" {
  name         = "budget-app-monthly-cost"
  budget_type  = "COST"
  limit_amount = "10"
  limit_unit   = "USD"
  time_unit    = "MONTHLY"
  
  notification {
    comparison_operator        = "GREATER_THAN"
    threshold                  = 80
    threshold_type            = "PERCENTAGE"
    notification_type         = "ACTUAL"
    subscriber_email_addresses = [var.alert_email]
  }
}