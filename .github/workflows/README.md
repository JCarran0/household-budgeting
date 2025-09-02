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
- **Trigger**: On push to `main` branch or manual dispatch
- **Purpose**: Deploy application to production server
- **Actions**:
  - Build and package application
  - Deploy to EC2 instance via SSH
  - Update S3 storage configuration
  - Zero-downtime deployment with PM2
  - Health checks and verification
- **Environment**: Requires manual approval for production

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
# Server Access
PRODUCTION_HOST         # EC2 Elastic IP or domain (e.g., 67.202.9.86)
SSH_PRIVATE_KEY        # Private SSH key for EC2 access
SSH_USER               # SSH username (default: ubuntu)

# Optional (if not using default values)
NODE_ENV              # production
PORT                  # 3001
```

Note: Other configuration like Plaid keys and JWT secrets are already on the server and will be preserved during deployments.

## Setting Up Secrets

1. Go to your repository on GitHub
2. Navigate to Settings → Secrets and variables → Actions
3. Click "New repository secret"
4. Add each required secret

### Getting Your SSH Private Key

```bash
# If your key is at ~/.ssh/budget-app-key
cat ~/.ssh/budget-app-key
```

Copy the entire output (including `-----BEGIN` and `-----END` lines) and paste as `SSH_PRIVATE_KEY` secret.

## Deployment Process

### Automatic Deployment
1. Create a pull request with your changes
2. PR validation workflow runs automatically
3. After PR is approved and merged to `main`
4. Deployment workflow triggers automatically
5. Review the deployment in the Actions tab
6. Application deploys with zero downtime

### Manual Deployment
1. Go to Actions tab in GitHub
2. Select "Deploy to Production" workflow
3. Click "Run workflow"
4. Select `main` branch
5. Click "Run workflow" button

### Rollback Process
1. Go to Actions tab in GitHub
2. Select "Rollback Production" workflow
3. Click "Run workflow"
4. Type `ROLLBACK` in the confirmation field
5. Click "Run workflow" button

## Environment URLs

- **Production**: https://budget.jaredcarrano.com
- **Health Check**: https://budget.jaredcarrano.com/health

## Monitoring Deployments

### Check Deployment Status
```bash
# SSH to server
ssh -i ~/.ssh/budget-app-key ubuntu@67.202.9.86

# Check PM2 status
sudo -u appuser pm2 status

# View logs
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
1. Check the GitHub Actions logs
2. SSH to server and check PM2 logs
3. Verify environment variables are set
4. Check nginx configuration

### Rollback Fails
1. SSH to server manually
2. Check if `.old` directories exist:
   ```bash
   ls -la /home/appuser/app/
   ```
3. Manually restore if needed:
   ```bash
   sudo -u appuser pm2 stop budget-backend
   sudo -u appuser mv /home/appuser/app/backend.old /home/appuser/app/backend
   sudo -u appuser mv /home/appuser/app/frontend.old /home/appuser/app/frontend
   sudo -u appuser pm2 start /home/appuser/app/backend/dist/index.js --name budget-backend
   ```

### Health Check Fails
1. Check if backend is running:
   ```bash
   sudo -u appuser pm2 status
   ```
2. Check backend logs:
   ```bash
   sudo -u appuser pm2 logs budget-backend --err
   ```
3. Test locally:
   ```bash
   curl http://localhost:3001/health
   ```

## Cost Optimization

This CI/CD setup is designed to be cost-effective:
- Uses GitHub Actions free tier (2000 minutes/month for private repos)
- Minimal artifact storage (7-30 day retention)
- Direct SSH deployment (no additional services)
- Single EC2 instance deployment

## Security Notes

- SSH keys are stored encrypted in GitHub Secrets
- Deployments require environment approval for production
- Server access is restricted to GitHub Actions IPs
- Environment variables with secrets remain on server (not in git)