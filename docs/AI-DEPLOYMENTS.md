# AI Agent Deployment & Operations Guide

> **Document Purpose**: This is the operational guide for deploying, configuring, and troubleshooting the production application. For strategic planning, cost analysis, and architecture decisions, see [AI-Architecture-Plan.md](./AI-Architecture-Plan.md).

## Document Scope
- **What This Document Contains**: Deployment procedures, configuration management, troubleshooting guides, operational commands, CI/CD setup
- **What This Document Doesn't Cover**: Cost analysis, architecture decisions, risk assessments (see [AI-Architecture-Plan.md](./AI-Architecture-Plan.md))
- **Primary Audience**: AI agents performing deployments, debugging issues, or configuring the application

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

### Integrated Release and Deployment (Recommended)
Use the `Release and Deploy to Production` workflow for a seamless release + deployment:

```bash
# GitHub Actions → Actions tab → Release and Deploy to Production → Run workflow
```

**Options:**
- **deployment_message**: Description of the deployment
- **skip_release**: Check to deploy without creating a new release
- **release_type**: Leave empty for auto-detect, or force patch/minor/major/alpha

**Process:**
1. **Release Phase** (if not skipped):
   - Checks for unreleased commits
   - Runs standard-version to create release
   - Updates CHANGELOG.md and version numbers
   - Creates git tag and pushes to GitHub

2. **Deploy Phase**:
   - Builds backend and frontend
   - Creates deployment package with new version
   - Uploads to S3 with version in filename
   - Deploys via SSM to EC2
   - Verifies deployment health

### Legacy Deployment (Without Release)
The original `Deploy to Production` workflow still exists for backwards compatibility:

1. **Build Phase**:
   - TypeScript compilation with postbuild script to flatten dist structure
   - Frontend React build with Vite
   - Creation of deployment artifact (tar.gz)

2. **Upload Phase**:
   - Upload artifact to S3 backup bucket with timestamp
   - Store as `deploy-YYYY-MM-DD-HHMMSS.tar.gz`

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

## Release Management

### Versioning Strategy
The application uses [Semantic Versioning](https://semver.org/) with automated changelog management:
- **MAJOR.MINOR.PATCH** format (e.g., 1.2.3)
- **Conventional Commits** determine version bumps
- **Rolling changelog** tracks unreleased changes

### Release Process

#### 1. Automatic Changelog Updates
After each push to main:
```yaml
# .github/workflows/update-changelog.yml
- Parses conventional commits
- Updates CHANGELOG.md Unreleased section
- Commits changes back with [skip ci]
```

#### 2. Creating a Release
```bash
# Check pending changes
cat CHANGELOG.md | head -50
curl https://budget.jaredcarrano.com/version

# Prepare release (auto-detects version bump)
npm run release:prepare

# Or specify version type
npm run release:prepare -- major
npm run release:prepare -- minor
npm run release:prepare -- patch

# Commit and push
git add -A
git commit -m "chore: release v1.1.0"
git push && git push --tags
```

#### 3. Version Information in Deployment
The deployment process includes version metadata:
- Version injected into deployment package
- Available at `/health` and `/version` endpoints
- Stored in deployment artifacts on S3

### GitHub Workflows

#### update-changelog.yml
- **Trigger**: Push to main branch
- **Purpose**: Parse commits and update CHANGELOG.md
- **Frequency**: Every commit to main

#### deploy-production.yml (with versioning)
- **Includes**: Version from package.json
- **Deploys**: Tagged releases to production
- **Metadata**: Commit hash, timestamp, version

### Version Endpoints

```bash
# Health check with version
curl https://budget.jaredcarrano.com/health
# Response: {"status":"ok","version":"1.0.0-alpha.1",...}

# Detailed version info
curl https://budget.jaredcarrano.com/version
# Response: {
#   "current": "1.0.0-alpha.1",
#   "unreleased": "...",
#   "deployedAt": "2025-01-15T10:00:00Z",
#   "commitHash": "abc123"
# }
```

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
Deployment artifacts are saved to S3 with timestamps during each deployment, allowing rollback to any previous version.

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

## Secrets Management Roadmap

### Current State
- Secrets stored in GitHub Secrets
- Deployed as .env file in artifacts
- PM2 loads from .env via dotenv in application

### Phase 1: Immediate Fix (30 minutes)
**Status**: Ready to implement
**Goal**: Fix PM2 environment loading issue

1. Run fix script on server:
```bash
# Download and run the fix
curl -o /tmp/fix-pm2.sh https://raw.githubusercontent.com/YOUR_REPO/main/scripts/fix-pm2-env.sh
chmod +x /tmp/fix-pm2.sh
/tmp/fix-pm2.sh
```

2. Or manually:
```bash
sudo -u appuser bash
cd /home/appuser/app
# Check .env exists
ls -la backend/.env
# Update ecosystem.config.js to set cwd
pm2 delete budget-backend
pm2 start ecosystem.config.js
```

### Phase 2: Deployment Script Updates (This Week)
**Goal**: Ensure reliable deployments

- Update deploy-server.sh to use ecosystem.config.js
- Ensure .env is in backend directory
- Add verification step for environment variables

### Phase 3: AWS SSM Parameter Store (Next Month)
**Goal**: Remove secrets from deployment artifacts

1. Create parameters in SSM:
```bash
aws ssm put-parameter --name "/budget-app/production/jwt-secret" \
  --value "your-secret" --type "SecureString"
```

2. Update application to load from SSM at startup
3. Remove .env generation from GitHub Actions
4. Add SSM permissions to EC2 IAM role

### Phase 4: GitHub OIDC (Future)
**Goal**: Remove AWS credentials from GitHub

- Setup OIDC provider
- Create IAM role for GitHub Actions  
- Remove long-lived AWS keys

## Future Improvements

### Recommended Enhancements
1. **Blue-Green Deployment**: Zero-downtime deployments
2. **Container Deployment**: Docker/ECS for better isolation
3. **Auto-Scaling**: Handle traffic spikes
4. **CDN Integration**: CloudFront for static assets
5. **Database Migration**: Move from JSON to RDS
6. **Monitoring**: DataDog or New Relic integration
7. **CI/CD Enhancement**: Add staging environment
8. **Load Balancing**: Multiple EC2 instances with ALB
9. **Backup Automation**: Daily automated backups with retention policy

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

## Lessons Learned & Technical Debt

### Common Deployment Pitfalls

#### 0. Shared Utilities Import Resolution Issue
**Problem**: Backend imports shared utilities using relative path `../../../shared/utils/categoryHelpers` but deployment process only copies them to `backend/dist/shared/`
```bash
# ❌ Wrong - shared utils only in backend/dist
# Backend imports: ../../../shared/utils/categoryHelpers
# Resolves to: /home/appuser/app/shared/utils/ (missing)
# Actual location: /home/appuser/app/backend/dist/shared/utils/ (not found)

# ✅ Fixed - shared utils copied to root level
cp -r backend/dist/shared/* deployment/shared/
# Now resolves correctly to /home/appuser/app/shared/utils/
```
**Impact**: Runtime errors like "createCategoryLookup is not a function" in production
**Root Cause**: TypeScript compilation includes shared files in backend/dist/shared/, but import paths expect them at project root level
**Solution**: Deploy shared utilities to both locations and add validation
**Prevention**: Added deployment validation checks to catch this in CI/CD pipeline

#### 1. Directory Structure Flattening Issue
**Problem**: Copying `dist/*` instead of `dist` flattens the compiled TypeScript output
```bash
# ❌ Wrong - flattens structure
cp -r backend/dist/* deployment/backend/

# ✅ Correct - preserves structure  
cp -r backend/dist deployment/backend/
```
**Impact**: Breaks module resolution, PM2 can't find entry point
**Solution**: Always preserve directory structure in deployment scripts

#### 2. PM2 Working Directory Configuration
**Problem**: PM2 not loading environment variables from `.env` file
```javascript
// ❌ Wrong - PM2 runs from wrong directory
{ script: 'dist/index.js' }

// ✅ Correct - specify working directory
{ 
  script: 'dist/index.js',
  cwd: '/home/appuser/app/backend'
}
```
**Impact**: Application fails with missing environment variables
**Solution**: Always set `cwd` in ecosystem.config.js to the backend directory

#### 3. Multiple Package.json Resolution
**Problem**: Node.js looking for `../package.json` relative to compiled files
**Workaround Used**: Copied package.json to parent directory (anti-pattern)
**Proper Solution**: Fix deployment to maintain proper dist/ structure

### PM2 Configuration Best Practices

1. **Always use ecosystem.config.js** - Don't rely on PM2 CLI arguments
2. **Set explicit working directory** - Use `cwd` to ensure correct context
3. **Configure logging paths** - Specify error_file and out_file
4. **Enable graceful shutdown** - Set kill_timeout and wait_ready
5. **Clean up old processes** - Delete before starting to avoid duplicates

### Deployment Structure Validation Checklist

Run these checks after deployment to verify correct structure:
```bash
# SSH to server
ssh -i ~/.ssh/budget-app-key ubuntu@budget.jaredcarrano.com

# Switch to app user
sudo -u appuser bash

# Validation checks
test -d /home/appuser/app/backend/dist && echo "✅ dist directory exists" || echo "❌ dist directory missing"
test -f /home/appuser/app/backend/dist/index.js && echo "✅ Entry point exists" || echo "❌ Entry point missing"
test -f /home/appuser/app/backend/.env && echo "✅ Environment file exists" || echo "❌ Environment file missing"
test -f /home/appuser/app/ecosystem.config.js && echo "✅ PM2 config exists" || echo "❌ PM2 config missing"

# Check PM2 process
pm2 status | grep budget-backend && echo "✅ PM2 process running" || echo "❌ PM2 process not found"

# Test health endpoint
curl -s http://localhost:3001/health | grep -q "ok" && echo "✅ Health check passing" || echo "❌ Health check failing"
```

### Technical Debt Tracker

| Issue | Priority | Effort | Impact | Solution |
|-------|----------|--------|--------|----------|
| Shared utilities import resolution | High | Low | Production runtime errors | ✅ **Fixed**: Deploy shared utilities to root level with validation |
| Manual deployment structure fixes | High | Low | Deployment failures | Fixed in GitHub Actions |
| No automated deployment validation | Medium | Low | Silent failures | Add post-deploy checks |
| PM2 configuration scattered | Medium | Low | Confusion | Centralize in ecosystem.config.js |
| No smoke tests after deployment | Medium | Medium | Undetected issues | Add API endpoint tests |
| Using filesystem on EC2 for temp files | Low | Medium | Disk space issues | Use S3 or clean up regularly |
| No deployment rollback automation | Medium | High | Slow recovery | Implement blue-green deployment |

### Anti-patterns to Avoid

1. **Don't flatten compiled output** - Always preserve directory structure
2. **Don't use relative paths in production** - Use absolute paths in configs
3. **Don't mix source and compiled files** - Keep clear separation
4. **Don't rely on implicit PM2 behavior** - Be explicit in configuration
5. **Don't skip validation** - Always verify deployment success
6. **Don't use `cp -r dir/*`** - Use `cp -r dir` to preserve structure

### Recommended Future Improvements

#### Short-term (Quick Wins)
1. **Add deployment validation script** - Run checks automatically after deploy
2. **Create PM2 template** - Standardize ecosystem.config.js generation
3. **Add deployment notifications** - Slack/Discord webhook for status
4. **Document rollback procedure** - Clear steps for emergency recovery

#### Medium-term (1-3 months)
1. **Docker containerization** - Eliminate path and environment issues
2. **Enhanced CI/CD pipeline** - Add staging environment and smoke tests
3. **Automated backups** - Daily S3 snapshots with retention policy
4. **Monitoring dashboard** - Grafana or CloudWatch dashboard

#### Long-term (3-6 months)
1. **Blue-green deployment** - Zero-downtime deployments
2. **Infrastructure as Code** - Terraform manages all configs
3. **Multi-region failover** - Disaster recovery capability
4. **Kubernetes migration** - For true scalability (if needed)