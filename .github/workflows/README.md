# GitHub Actions CI/CD Setup

This directory contains the CI/CD pipeline for the Budget Tracker application.

## Workflows

### 1. PR Validation (`pr-validation.yml`)
- **Trigger**: On pull requests to `main` branch
- **Purpose**: Validate code quality before merging
- **Actions**:
  - TypeScript type checking for backend and frontend
  - Run backend tests
  - Build both backend and frontend
  - Security audit for dependencies
  - Bundle size check for frontend

### 2. Production Deployment (`deploy-production.yml`)
- **Trigger**: Manual dispatch only (button in GitHub Actions)
- **Purpose**: Deploy application to production server
- **Actions**:
  - Build and test application
  - Create deployment package
  - Upload package to S3
  - Deploy via AWS Systems Manager (SSM)
  - Zero-downtime deployment with PM2
  - Health checks and verification
- **Method**: Uses SSM for agentless deployment (no SSH required)

### 3. Rollback (`rollback.yml`)
- **Trigger**: Manual workflow dispatch
- **Purpose**: Quickly rollback to previous deployment
- **Actions**:
  - Requires typing "ROLLBACK" to confirm
  - Restores previous backend and frontend versions
  - Saves failed deployment for investigation
  - Health checks after rollback

## Required GitHub Secrets

Configure these secrets in your repository settings:

```bash
# AWS Credentials (for SSM and S3)
AWS_ACCESS_KEY_ID        # IAM user access key
AWS_SECRET_ACCESS_KEY    # IAM user secret key
AWS_REGION              # us-east-1 (or your region)

# Infrastructure
EC2_INSTANCE_ID         # EC2 instance ID (e.g., i-05cd17258cce207a3)
S3_BACKUP_BUCKET        # S3 bucket name (e.g., budget-app-backups-f5b52f89)
```

Note: Environment configuration (.env file) is preserved on the server during deployments.

## Setting Up Secrets

1. Go to your repository on GitHub
2. Navigate to Settings → Secrets and variables → Actions
3. Click "New repository secret"
4. Add each required secret

### Getting Your AWS Credentials

If you haven't created an IAM user yet:

1. Go to AWS Console → IAM → Users
2. Create a new user with programmatic access
3. Attach the policy from `iam-policy-github-actions.json`
4. Save the access key and secret key

## Deployment Process

### How It Works

1. **GitHub Actions** builds and tests the application
2. **Package Upload** to S3 bucket for deployment
3. **SSM Command** triggers the deployment script on EC2
4. **Deployment Script** (`/home/appuser/deploy.sh`) handles:
   - Downloading package from S3
   - Creating backup of current version
   - Installing dependencies
   - Preserving environment configuration
   - Zero-downtime deployment with PM2
   - Health checks
   - Automatic cleanup

### Standard Deployment

1. Create a pull request with your changes
2. PR validation workflow runs automatically
3. After PR is approved and merged to `main`
4. Go to Actions tab → "Deploy to Production"
5. Click "Run workflow"
6. Add optional deployment message
7. Click green "Run workflow" button

### Emergency Rollback

1. Go to Actions tab → "Rollback Production"
2. Click "Run workflow"
3. Type `ROLLBACK` in confirmation field
4. Click "Run workflow" button

## Environment URLs

- **Production**: https://budget.jaredcarrano.com
- **Health Check**: https://budget.jaredcarrano.com/health

## Monitoring Deployments

### Via AWS Systems Manager

```bash
# View deployment logs
aws ssm get-command-invocation \
  --command-id "COMMAND_ID_FROM_GITHUB_ACTIONS" \
  --instance-id "i-05cd17258cce207a3" \
  --region us-east-1 \
  --query "StandardOutputContent" \
  --output text
```

### Direct Server Access (if needed)

```bash
# Connect via SSM Session Manager (no SSH needed)
aws ssm start-session \
  --target i-05cd17258cce207a3 \
  --region us-east-1

# Check PM2 status
sudo -u appuser pm2 status

# View application logs
sudo -u appuser pm2 logs budget-backend --lines 50

# Check deployment info
cat /home/appuser/app/REVISION
cat /home/appuser/app/TIMESTAMP
```

### Health Check

```bash
curl https://budget.jaredcarrano.com/health
```

## Troubleshooting

### Deployment Fails

1. Check GitHub Actions logs for the error
2. Common issues:
   - **S3 Access Denied**: Check IAM permissions
   - **SSM Command Failed**: Verify instance ID and IAM role
   - **Health Check Failed**: Check PM2 logs on server

### Manual Deployment (if GitHub Actions is down)

```bash
# Build locally
cd backend && npm run build && cd ..
cd frontend && npm run build && cd ..

# Create package
mkdir -p deployment/backend deployment/frontend
cp -r backend/dist backend/package*.json deployment/backend/
cp -r frontend/dist/* deployment/frontend/
tar -czf deployment.tar.gz deployment/

# Upload to S3
aws s3 cp deployment.tar.gz \
  s3://budget-app-backups-f5b52f89/deployments/manual-$(date +%Y%m%d-%H%M%S).tar.gz

# Deploy via SSM
aws ssm send-command \
  --instance-ids "i-05cd17258cce207a3" \
  --document-name "AWS-RunShellScript" \
  --parameters "commands=['sudo -u appuser /home/appuser/deploy.sh s3://budget-app-backups-f5b52f89/deployments/manual-TIMESTAMP.tar.gz']" \
  --region us-east-1
```

## Cost Optimization

This CI/CD setup is designed to be cost-effective:
- Uses GitHub Actions free tier (2000 minutes/month)
- Leverages existing S3 bucket (dual-purpose: backups + deployments)
- SSM deployment (no bastion host or VPN needed)
- Single EC2 instance deployment
- Automatic cleanup of old deployment packages

## Security Benefits

- **No SSH Keys**: Uses AWS IAM for authentication
- **No Open Ports**: SSM doesn't require port 22
- **Audit Trail**: All SSM commands logged in CloudTrail
- **Least Privilege**: IAM policies restrict to specific resources
- **Environment Isolation**: Secrets stay on server, not in Git

## Architecture

```
GitHub Actions → AWS S3 → AWS SSM → EC2 Instance
     ↓            ↓         ↓           ↓
   Build      Upload    Command    Deploy.sh
   Test       Package   Trigger    Execute
   Package                          PM2 Restart
```

The deployment is intentionally simple and reliable, using AWS native services for secure, agentless deployment.