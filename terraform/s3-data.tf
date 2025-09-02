# S3 bucket for application data storage
resource "aws_s3_bucket" "app_data" {
  bucket = "budget-app-data-${random_id.bucket_suffix.hex}"

  tags = {
    Name        = "Budget App Data Storage"
    Environment = "production"
    Purpose     = "Primary data storage for budget application"
  }
}

# Enable versioning for data protection
resource "aws_s3_bucket_versioning" "app_data_versioning" {
  bucket = aws_s3_bucket.app_data.id

  versioning_configuration {
    status = "Enabled"
  }
}

# Enable server-side encryption
resource "aws_s3_bucket_server_side_encryption_configuration" "app_data_encryption" {
  bucket = aws_s3_bucket.app_data.id

  rule {
    apply_server_side_encryption_by_default {
      sse_algorithm = "AES256"
    }
  }
}

# Block public access to the data bucket
resource "aws_s3_bucket_public_access_block" "app_data_public_access_block" {
  bucket = aws_s3_bucket.app_data.id

  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

# Lifecycle policy for cost optimization
resource "aws_s3_bucket_lifecycle_configuration" "app_data_lifecycle" {
  bucket = aws_s3_bucket.app_data.id

  rule {
    id     = "archive-old-versions"
    status = "Enabled"
    
    filter {}

    # Move old versions to cheaper storage after 30 days
    noncurrent_version_transition {
      noncurrent_days = 30
      storage_class   = "STANDARD_IA"
    }

    # Delete old versions after 90 days
    noncurrent_version_expiration {
      noncurrent_days = 90
    }
  }

  rule {
    id     = "cleanup-incomplete-uploads"
    status = "Enabled"
    
    filter {}

    # Clean up incomplete multipart uploads after 7 days
    abort_incomplete_multipart_upload {
      days_after_initiation = 7
    }
  }
}

# Update IAM policy to allow EC2 instance to access the data bucket
resource "aws_iam_role_policy" "ec2_s3_data_access" {
  name = "ec2_s3_data_access"
  role = aws_iam_role.ec2_s3_role.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect = "Allow"
        Action = [
          "s3:GetObject",
          "s3:PutObject",
          "s3:DeleteObject",
          "s3:ListBucket"
        ]
        Resource = [
          aws_s3_bucket.app_data.arn,
          "${aws_s3_bucket.app_data.arn}/*"
        ]
      }
    ]
  })
}

# Output the data bucket name
output "s3_data_bucket" {
  value       = aws_s3_bucket.app_data.id
  description = "S3 bucket name for application data storage"
}