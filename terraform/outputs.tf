output "instance_id" {
  description = "ID of the EC2 instance"
  value       = aws_instance.app_server.id
}

output "public_ip" {
  description = "Public IP address of the EC2 instance"
  value       = aws_eip.app_ip.public_ip
}

output "public_dns" {
  description = "Public DNS name of the EC2 instance"
  value       = aws_eip.app_ip.public_dns
}

output "s3_backup_bucket" {
  description = "Name of the S3 backup bucket"
  value       = aws_s3_bucket.backups.id
}

output "ssh_connection_command" {
  description = "SSH connection command"
  value       = "ssh -i ~/.ssh/budget-app-key.pem ubuntu@${aws_eip.app_ip.public_ip}"
}

output "application_url" {
  description = "Application URL (after nginx setup)"
  value       = "http://${aws_eip.app_ip.public_ip}"
}

output "security_group_id" {
  description = "Security group ID for the EC2 instance"
  value       = aws_security_group.app_sg.id
}