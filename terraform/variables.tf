variable "aws_region" {
  description = "AWS region for resources"
  type        = string
  default     = "us-east-1"
}

variable "ssh_public_key" {
  description = "SSH public key for EC2 access"
  type        = string
  sensitive   = true
}

variable "admin_ip_cidr" {
  description = "CIDR block for admin SSH access (e.g., 'YOUR_IP/32')"
  type        = string
  sensitive   = true
}

variable "alert_email" {
  description = "Email address for budget alerts"
  type        = string
}