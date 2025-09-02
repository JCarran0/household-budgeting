# AWS Systems Manager (SSM) Setup for GitHub Actions Deployment
# This enables secure deployment without SSH access

# Attach SSM managed policy to the existing EC2 IAM role
resource "aws_iam_role_policy_attachment" "ssm_managed_instance_core" {
  role       = aws_iam_role.ec2_s3_role.name
  policy_arn = "arn:aws:iam::aws:policy/AmazonSSMManagedInstanceCore"
}

# Additional policy for SSM session logging (optional but recommended)
resource "aws_iam_role_policy" "ssm_session_logging" {
  name = "ssm-session-logging"
  role = aws_iam_role.ec2_s3_role.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect = "Allow"
        Action = [
          "s3:PutObject",
          "s3:GetObject",
          "s3:GetObjectVersion"
        ]
        Resource = "${aws_s3_bucket.backups.arn}/session-logs/*"
      },
      {
        Effect = "Allow"
        Action = [
          "logs:CreateLogGroup",
          "logs:CreateLogStream",
          "logs:PutLogEvents",
          "logs:DescribeLogStreams"
        ]
        Resource = "arn:aws:logs:${var.aws_region}:*:*"
      }
    ]
  })
}

# Output the instance ID for SSM connections
output "ssm_instance_id" {
  value       = aws_instance.app_server.id
  description = "Instance ID for SSM Session Manager connections"
}

# Note: SSM Agent is pre-installed on Ubuntu 20.04+ AMIs
# No additional installation needed!