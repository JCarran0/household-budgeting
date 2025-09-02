# Optional: Security group rule for GitHub Actions CI/CD access
# 
# IMPORTANT: This file allows SSH access from GitHub Actions for CI/CD deployments.
# 
# Options for enabling CI/CD:
# 
# Option 1: TEMPORARY - Allow all IPs (less secure, but works immediately)
# Uncomment the following resource to allow SSH from anywhere.
# Remember to remove this after setting up a better solution!

# resource "aws_security_group_rule" "github_actions_ssh_temp" {
#   type              = "ingress"
#   from_port         = 22
#   to_port           = 22
#   protocol          = "tcp"
#   cidr_blocks       = ["0.0.0.0/0"]
#   security_group_id = aws_security_group.app_sg.id
#   description       = "TEMPORARY: SSH from anywhere for GitHub Actions"
# }

# Option 2: RECOMMENDED - Use specific GitHub Actions IP ranges
# GitHub publishes their IP ranges at: https://api.github.com/meta
# These ranges change occasionally, so you'll need to update them.
# 
# To get current ranges:
# curl -s https://api.github.com/meta | jq -r '.actions[]' | head -20

# resource "aws_security_group_rule" "github_actions_ssh" {
#   type              = "ingress"
#   from_port         = 22
#   to_port           = 22
#   protocol          = "tcp"
#   cidr_blocks       = [
#     # Add current GitHub Actions IP ranges here
#     # Example (these change, so get current ones):
#     # "20.237.0.0/16",
#     # "20.249.0.0/16",
#     # etc...
#   ]
#   security_group_id = aws_security_group.app_sg.id
#   description       = "SSH from GitHub Actions runners"
# }

# Option 3: MOST SECURE - Use AWS Systems Manager Session Manager
# This eliminates the need for SSH access entirely.
# See: https://docs.aws.amazon.com/systems-manager/latest/userguide/session-manager.html
# 
# Steps:
# 1. Install SSM Agent on EC2 (already included in Ubuntu AMI)
# 2. Add IAM role permissions for Systems Manager
# 3. Update GitHub Actions to use AWS CLI with session manager
# 4. Remove SSH ingress rules entirely

# Option 4: Use a bastion host or VPN
# Set up a separate bastion host that GitHub Actions connects through,
# or use AWS Client VPN for secure access.

# QUICK FIX FOR IMMEDIATE DEPLOYMENT:
# Run this command to temporarily allow GitHub Actions (replace with your current IP):
# 
# aws ec2 authorize-security-group-ingress \
#   --group-id $(terraform output -raw security_group_id) \
#   --protocol tcp \
#   --port 22 \
#   --cidr 0.0.0.0/0 \
#   --group-rule-description "Temporary GitHub Actions access"
# 
# To remove it later:
# aws ec2 revoke-security-group-ingress \
#   --group-id $(terraform output -raw security_group_id) \
#   --protocol tcp \
#   --port 22 \
#   --cidr 0.0.0.0/0