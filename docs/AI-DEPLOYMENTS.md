# AI Agent Deployment Guide

This document provides comprehensive deployment guidance for AI agents working with the household budgeting application. It covers infrastructure, deployment processes, configuration, and troubleshooting.

## Overview

The application uses a GitHub Actions CI/CD pipeline to deploy to AWS infrastructure managed by Terraform. The deployment process involves building both frontend and backend, creating deployment artifacts, and updating the EC2 instance via AWS Systems Manager (SSM).

## Infrastructure Architecture

### AWS Resources
- **EC2 Instance**: Single t3.small instance running the application
  - Access via AWS Systems Manager (SSM) - no SSH keys required
  - PM2 process manager for Node.js application management
  - Nginx reverse proxy for frontend serving
  
- **S3 Buckets**:
  - `budget-app-data-*`: Application data storage (transactions, users, budgets)
  - `budget-app-backups-*`: Deployment artifacts and backups
  
- **Infrastructure as Code**: 
  - Terraform configuration in `terraform/` directory
  - Manages EC2, S3, IAM roles, and security groups

### Application Architecture
```
Internet → Nginx (port 80) → Frontend (static files)
                           ↓
                    Backend API (port 3001)
                           ↓
                    S3 (production data storage)
```

## Deployment Configuration

### GitHub Secrets (Sensitive)
Configure in: Settings → Secrets and variables → Actions → Secrets

- `AWS_ACCESS_KEY_ID` - AWS IAM user access key
- `AWS_SECRET_ACCESS_KEY` - AWS IAM user secret key
- `PRODUCTION_JWT_SECRET` - JWT signing key (generate with `openssl rand -hex 32`)
- `PRODUCTION_PLAID_CLIENT_ID` - Plaid API client ID
- `PRODUCTION_PLAID_SECRET` - Plaid API secret
- `PRODUCTION_ENCRYPTION_KEY` - Data encryption key (32-byte hex string)

### GitHub Variables (Non-Sensitive)
Configure in: Settings → Secrets and variables → Actions → Variables

- `PRODUCTION_NODE_ENV` - Set to `production`
- `PRODUCTION_PORT` - Backend port (default: `3001`)
- `PRODUCTION_API_PREFIX` - API path prefix (default: `/api/v1`)
- `PRODUCTION_PLAID_ENV` - Plaid environment (`sandbox`, `development`, or `production`)
- `PRODUCTION_PLAID_PRODUCTS` - Plaid products (e.g., `transactions`)
- `PRODUCTION_PLAID_COUNTRY_CODES` - Country codes (e.g., `US`)
- `PRODUCTION_STORAGE_TYPE` - Storage backend (`s3` for production)
- `PRODUCTION_S3_BUCKET_NAME` - S3 bucket for data storage
- `PRODUCTION_S3_PREFIX` - S3 key prefix (default: `data/`)
- `AWS_REGION` - AWS region (e.g., `us-east-1`)
- `S3_BACKUP_BUCKET` - S3 bucket for deployment artifacts
- `EC2_INSTANCE_ID` - EC2 instance ID (e.g., `i-0123456789abcdef0`)

## Deployment Process

### Automatic Deployment (GitHub Actions)
The deployment pipeline triggers on push to the `main` branch:

1. **Build Phase**:
   - TypeScript compilation with postbuild script to flatten dist structure
   - Frontend React build with Vite
   - Creation of deployment artifact (tar.gz)

2. **Upload Phase**:
   - Upload artifact to S3 backup bucket with timestamp
   - Store as `backend-YYYY-MM-DD-HHMMSS.tar.gz`

3. **Deploy Phase**:
   - Use AWS SSM to send commands to EC2 instance
   - Download artifact from S3
   - Extract and update application files
   - Restart PM2 process
   - Verify health check

### Manual Deployment

#### Local Deployment Script
```bash
# From project root
./scripts/deploy-server.sh
```

This script:
1. Builds frontend and backend
2. Creates deployment package
3. Uploads to EC2 via SSM
4. Restarts services
5. Performs health check

#### Direct Server Update
```bash
# Update server scripts only (no build)
./scripts/update-server-scripts.sh
```

#### Rollback Deployment
```bash
# Rollback to previous version
./scripts/server-rollback.sh
```

## PM2 Process Management

### Configuration
The application runs under PM2 with the following configuration:
- Process name: `budget-backend`
- Script: `index.js` (in dist directory)
- Environment variables loaded from `.env.production`

### Common PM2 Commands
```bash
# View process status
pm2 status

# View logs
pm2 logs budget-backend

# Restart application
pm2 restart budget-backend

# Stop application
pm2 stop budget-backend

# Delete from PM2
pm2 delete budget-backend

# Save PM2 configuration
pm2 save

# Set PM2 to start on boot
pm2 startup
```

## Troubleshooting Deployment Issues

### Issue: Health check fails after deployment
**Symptoms**: Deployment succeeds but health check times out
**Common Causes**:
1. Backend not starting due to missing environment variables
2. Port conflict (3001 already in use)
3. TypeScript build created wrong directory structure

**Solution**:
```bash
# Check PM2 logs
pm2 logs budget-backend --lines 100

# Verify environment variables
cat /home/appuser/app/.env.production

# Check if port is in use
sudo lsof -i :3001

# Manually restart
cd /home/appuser/app
pm2 restart budget-backend
```

### Issue: TypeScript build creates nested dist structure
**Symptoms**: `dist/backend/src/index.js` instead of `dist/index.js`
**Cause**: Importing files from outside `src/` directory (e.g., `shared/types`)
**Solution**: 
- Remove explicit `rootDir` from tsconfig.json
- Use postbuild script to flatten structure:
```json
"postbuild": "if [ -d dist/backend/src ]; then cp -r dist/backend/src/* dist/ && rm -rf dist/backend; fi"
```

### Issue: Permission denied errors during deployment
**Symptoms**: SSM commands fail with permission errors
**Common Causes**:
1. Using `/tmp` directory (may have noexec flag)
2. Incorrect file ownership

**Solution**:
```bash
# Use home directory for temp files
TEMP_DIR=/home/appuser/tmp

# Fix ownership
sudo chown -R appuser:appuser /home/appuser/app
```

### Issue: Frontend not updating after deployment
**Symptoms**: API works but UI shows old version
**Cause**: Browser cache or Nginx cache

**Solution**:
```bash
# Clear Nginx cache (if configured)
sudo rm -rf /var/cache/nginx/*
sudo systemctl reload nginx

# Force browser refresh
# Users need to: Ctrl+Shift+R (Windows/Linux) or Cmd+Shift+R (Mac)
```

### Issue: S3 storage not working in production
**Symptoms**: Data saves fail or "Access Denied" errors
**Checklist**:
1. Verify IAM role has S3 permissions
2. Check bucket name and region match
3. Verify STORAGE_TYPE=s3 in environment
4. Check S3_PREFIX if using prefix

```bash
# Test S3 access from EC2
aws s3 ls s3://your-bucket-name/data/

# Check IAM role
aws sts get-caller-identity
```

## Environment-Specific Configurations

### Development vs Production

| Setting | Development | Production |
|---------|------------|------------|
| Storage | filesystem | S3 |
| Data Directory | ./data | S3 bucket |
| Plaid Environment | sandbox | sandbox/development/production |
| JWT Expiration | 7d | 7d (consider reducing) |
| CORS Origin | http://localhost:5173 | Your domain |
| Node Environment | development | production |

### Migration Checklist
When moving from development to production:

1. **Environment Variables**
   - [ ] Generate new JWT_SECRET
   - [ ] Generate new ENCRYPTION_KEY
   - [ ] Update Plaid credentials if using production
   - [ ] Set STORAGE_TYPE=s3
   - [ ] Configure S3 bucket settings

2. **Security**
   - [ ] Enable HTTPS (update Nginx config)
   - [ ] Configure firewall rules
   - [ ] Set up monitoring and alerts
   - [ ] Enable AWS CloudWatch logs
   - [ ] Review IAM permissions (least privilege)

3. **Data**
   - [ ] Backup existing data
   - [ ] Test data migration to S3
   - [ ] Verify data encryption works
   - [ ] Test backup/restore procedures

4. **Performance**
   - [ ] Enable PM2 cluster mode if needed
   - [ ] Configure Nginx caching
   - [ ] Set up CDN for static assets
   - [ ] Enable gzip compression

## Monitoring and Logs

### Application Logs
```bash
# PM2 logs (includes stdout and stderr)
pm2 logs budget-backend

# Nginx access logs
sudo tail -f /var/log/nginx/access.log

# Nginx error logs
sudo tail -f /var/log/nginx/error.log
```

### Health Checks
The application exposes a health endpoint:
```bash
curl http://your-domain/api/v1/health
```

Expected response:
```json
{
  "status": "ok",
  "timestamp": "2024-01-20T12:00:00.000Z"
}
```

### Monitoring Checklist
- [ ] Set up uptime monitoring (e.g., UptimeRobot)
- [ ] Configure CloudWatch alarms for EC2
- [ ] Monitor S3 bucket size and requests
- [ ] Set up error tracking (e.g., Sentry)
- [ ] Configure backup verification alerts

## Backup and Recovery

### Automated Backups
Deployment artifacts are automatically saved to S3 with timestamps, allowing rollback to any previous version.

### Manual Backup
```bash
# Backup current application
cd /home/appuser
tar -czf backup-$(date +%Y%m%d-%H%M%S).tar.gz app/

# Backup data from S3
aws s3 sync s3://budget-app-data-prod/ ./backup-data/
```

### Recovery Procedures
1. **Application Rollback**: Use `server-rollback.sh` script
2. **Data Recovery**: Restore from S3 versioning or backups
3. **Full Disaster Recovery**:
   - Launch new EC2 from Terraform
   - Restore application from S3 backup
   - Restore data from S3 backups
   - Update DNS if needed

## Security Best Practices

### Secrets Management
- Never commit secrets to Git
- Use GitHub Secrets for CI/CD
- Rotate keys regularly
- Use AWS Secrets Manager for production (future enhancement)

### Network Security
- EC2 security group limits inbound to ports 80/443
- No direct SSH access (use SSM)
- API rate limiting enabled
- CORS configured for specific origins

### Data Security
- AES-256 encryption for sensitive data
- Encrypted S3 buckets
- TLS for all external communications
- JWT tokens with expiration

## Common Deployment Tasks

### Update Environment Variables
```bash
# Edit production environment
sudo nano /home/appuser/app/.env.production

# Restart application
pm2 restart budget-backend
```

### View Recent Deployments
```bash
# List deployment artifacts in S3
aws s3 ls s3://budget-app-backups-prod/ --recursive | tail -20
```

### Emergency Stop
```bash
# Stop application immediately
pm2 stop budget-backend

# Disable PM2 auto-restart
pm2 delete budget-backend
```

### Check Disk Space
```bash
# View disk usage
df -h

# Find large files
du -h /home/appuser | sort -rh | head -20

# Clean PM2 logs if needed
pm2 flush
```

## Future Improvements

### Recommended Enhancements
1. **Blue-Green Deployment**: Zero-downtime deployments
2. **Container Deployment**: Docker/ECS for better isolation
3. **Auto-Scaling**: Handle traffic spikes
4. **CDN Integration**: CloudFront for static assets
5. **Database Migration**: Move from JSON to RDS
6. **Secrets Manager**: AWS Secrets Manager integration
7. **Monitoring**: DataDog or New Relic integration
8. **CI/CD Enhancement**: Add staging environment
9. **Load Balancing**: Multiple EC2 instances with ALB
10. **Backup Automation**: Daily automated backups with retention policy

## Useful Commands Reference

```bash
# SSH via Systems Manager
aws ssm start-session --target $EC2_INSTANCE_ID

# Check application status
pm2 status

# View application logs
pm2 logs budget-backend --lines 100

# Restart application
pm2 restart budget-backend

# Check system resources
htop

# View Nginx status
sudo systemctl status nginx

# Test S3 access
aws s3 ls s3://$PRODUCTION_S3_BUCKET_NAME/

# Check environment variables
pm2 env budget-backend

# Manual health check
curl -f http://localhost:3001/api/v1/health
```

## Contact and Resources

### Documentation
- Main README: `/README.md`
- Architecture Guide: `/docs/AI-APPLICATION-ARCHITECTURE.md`
- Testing Strategy: `/docs/AI-TESTING-STRATEGY.md`
- User Stories: `/docs/AI-USER-STORIES.md`

### Infrastructure
- Terraform Configuration: `/terraform/`
- Deployment Scripts: `/scripts/`
- GitHub Actions: `/.github/workflows/`

### Troubleshooting
If deployment issues persist:
1. Check PM2 logs for error details
2. Verify all environment variables are set
3. Ensure S3 buckets are accessible
4. Confirm EC2 instance has proper IAM role
5. Review GitHub Actions logs for build errors