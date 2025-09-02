# AWS Infrastructure Setup for Household Budgeting App

This directory contains Terraform configuration for deploying the household budgeting application to AWS.

## Architecture Overview

- **EC2 Instance**: t4g.micro (ARM-based, free tier eligible)
- **Storage**: 20GB encrypted EBS volume
- **Networking**: Elastic IP for static address
- **Backup**: S3 bucket with lifecycle policies
- **Security**: Security groups, IAM roles, SSH key authentication
- **Monitoring**: CloudWatch logs, budget alerts

## Prerequisites

### 1. AWS Account Setup

1. Create an AWS account at https://aws.amazon.com/
2. Enable MFA on your root account for security
3. Create an IAM user for Terraform with programmatic access:
   - Go to IAM → Users → Add User
   - Select "Programmatic access"
   - Attach policy: `AdministratorAccess` (or create a custom policy)
   - Save the Access Key ID and Secret Access Key

### 2. Install Required Tools

```bash
# macOS with Homebrew
brew install terraform awscli

# Ubuntu/Debian
sudo apt-get update
sudo apt-get install -y terraform awscli

# Verify installations
terraform --version  # Should be 1.0+
aws --version
```

### 3. Configure AWS CLI

```bash
aws configure
# Enter your:
# - AWS Access Key ID
# - AWS Secret Access Key
# - Default region: us-east-1
# - Default output format: json
```

## Setup Instructions

### Step 1: Generate SSH Key Pair

```bash
# Generate a new SSH key pair for EC2 access
ssh-keygen -t ed25519 -f ~/.ssh/budget-app-key -C "budget-app"

# Set correct permissions
chmod 600 ~/.ssh/budget-app-key
chmod 644 ~/.ssh/budget-app-key.pub

# Display public key (you'll need this for terraform.tfvars)
cat ~/.ssh/budget-app-key.pub
```

### Step 2: Configure Terraform Variables

```bash
# Copy the example file
cp terraform.tfvars.example terraform.tfvars

# Edit terraform.tfvars with your values
nano terraform.tfvars
```

Required variables:
- `ssh_public_key`: Your public key from Step 1
- `admin_ip_cidr`: Your current IP address with /32 suffix
- `alert_email`: Email for AWS budget alerts

To get your current IP:
```bash
curl ifconfig.me
# Example: If your IP is 123.45.67.89, use "123.45.67.89/32"
```

### Step 3: Initialize Terraform

```bash
# Initialize Terraform (downloads providers)
terraform init

# Validate configuration
terraform validate

# Review the execution plan
terraform plan
```

### Step 4: Deploy Infrastructure

```bash
# Deploy the infrastructure
terraform apply

# Type 'yes' when prompted to confirm

# Save the outputs
terraform output > infrastructure-outputs.txt
```

## Post-Deployment Steps

### 1. Connect to Your Server

After deployment, connect to your EC2 instance:

```bash
# Get the connection command from Terraform
terraform output ssh_connection_command

# Or manually:
ssh -i ~/.ssh/budget-app-key ubuntu@$(terraform output -raw public_ip)
```

### 2. Verify Server Setup

Once connected, verify the initial setup:

```bash
# Check Node.js installation
node --version  # Should show v20.x.x
npm --version

# Check PM2
pm2 --version

# Check nginx
sudo systemctl status nginx

# Check firewall
sudo ufw status

# Check fail2ban
sudo systemctl status fail2ban

# View user data script logs
sudo tail -f /var/log/user-data.log
```

### 3. Deploy Your Application

```bash
# On your local machine, build the application
cd ../backend
npm run build

cd ../frontend
npm run build

# Copy files to server
SERVER_IP=$(cd ../terraform && terraform output -raw public_ip)

# Copy backend
scp -i ~/.ssh/budget-app-key -r ../backend/dist/* ubuntu@$SERVER_IP:/home/appuser/app/backend/
scp -i ~/.ssh/budget-app-key ../backend/package*.json ubuntu@$SERVER_IP:/home/appuser/app/backend/

# Copy frontend
scp -i ~/.ssh/budget-app-key -r ../frontend/dist/* ubuntu@$SERVER_IP:/home/appuser/app/frontend/

# Copy environment file (create this first!)
scp -i ~/.ssh/budget-app-key ../backend/.env.production ubuntu@$SERVER_IP:/home/appuser/app/backend/.env
```

### 4. Set Up Environment Variables

Create `.env.production` file locally first:

```bash
NODE_ENV=production
PORT=3001
JWT_SECRET=your-strong-jwt-secret-here
JWT_EXPIRES_IN=7d
PLAID_CLIENT_ID=your-plaid-client-id
PLAID_SECRET=your-plaid-secret
PLAID_ENV=sandbox
DATA_DIR=/home/appuser/budget-data
ENCRYPTION_KEY=your-32-byte-hex-encryption-key
```

### 5. Start the Application

```bash
# SSH into the server
ssh -i ~/.ssh/budget-app-key ubuntu@$(terraform output -raw public_ip)

# Switch to appuser
sudo su - appuser

# Install backend dependencies
cd /home/appuser/app/backend
npm ci --production

# Start with PM2
pm2 start /home/appuser/app/ecosystem.config.js
pm2 save
pm2 startup systemd -u appuser --hp /home/appuser

# Check status
pm2 status
pm2 logs
```

### 6. Set Up SSL (Optional but Recommended)

```bash
# Install Certbot
sudo snap install --classic certbot
sudo ln -s /snap/bin/certbot /usr/bin/certbot

# Get certificate (replace with your domain)
sudo certbot --nginx -d yourdomain.com

# Auto-renewal is set up automatically
sudo certbot renew --dry-run
```

## Managing Your Infrastructure

### View Current State

```bash
# Show current resources
terraform show

# List all resources
terraform state list

# Get specific outputs
terraform output public_ip
terraform output s3_backup_bucket
```

### Update Infrastructure

```bash
# After modifying .tf files
terraform plan
terraform apply
```

### Destroy Infrastructure (Warning!)

```bash
# This will delete all resources
terraform destroy

# Use targeted destroy for specific resources
terraform destroy -target=aws_instance.app_server
```

## Cost Management

### Expected Costs

**First Year (Free Tier)**:
- EC2 t4g.micro: $0 (750 hours/month free)
- EBS Storage: $0 (30GB free)
- S3: $0 (5GB free)
- Data Transfer: $0 (100GB free)
- **Total: $0/month**

**After First Year**:
- EC2 t4g.micro: ~$6.05/month
- EBS 20GB: ~$1.60/month
- S3 Backups: ~$0.10/month
- Data Transfer: ~$0.90/month
- **Total: ~$8.65/month**

### Cost Monitoring

- Budget alert set at $10/month
- Check AWS Cost Explorer regularly
- Review CloudWatch metrics for usage patterns

## Security Best Practices

1. **SSH Access**:
   - Only your IP can SSH (configured in security group)
   - Key-based authentication only
   - Keep your private key secure

2. **Regular Updates**:
   ```bash
   # Monthly security updates
   sudo apt update && sudo apt upgrade -y
   ```

3. **Backup Verification**:
   ```bash
   # Check backup job
   sudo -u appuser crontab -l
   
   # List S3 backups
   aws s3 ls s3://$(terraform output -raw s3_backup_bucket)/backups/
   ```

4. **Monitor Logs**:
   ```bash
   # Application logs
   pm2 logs
   
   # System logs
   sudo journalctl -u nginx
   sudo tail -f /var/log/auth.log
   ```

## Troubleshooting

### Cannot Connect via SSH

1. Check your IP hasn't changed:
   ```bash
   curl ifconfig.me
   # Update terraform.tfvars if needed
   terraform apply
   ```

2. Verify security group:
   ```bash
   aws ec2 describe-security-groups --group-ids $(terraform output -raw security_group_id)
   ```

### Application Not Accessible

1. Check nginx:
   ```bash
   sudo systemctl status nginx
   sudo nginx -t
   ```

2. Check PM2:
   ```bash
   sudo -u appuser pm2 status
   sudo -u appuser pm2 logs
   ```

3. Check firewall:
   ```bash
   sudo ufw status
   ```

### High AWS Costs

1. Check running resources:
   ```bash
   aws ec2 describe-instances --filters "Name=instance-state-name,Values=running"
   ```

2. Review S3 usage:
   ```bash
   aws s3 ls s3://$(terraform output -raw s3_backup_bucket)/ --recursive --summarize
   ```

## Support

For issues or questions:
1. Check the main project README
2. Review AWS CloudWatch logs
3. Check PM2 logs: `pm2 logs`
4. Review nginx error logs: `sudo tail -f /var/log/nginx/error.log`