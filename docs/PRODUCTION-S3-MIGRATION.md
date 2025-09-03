# Production S3 Storage Migration Plan

## Overview
Migrate production from filesystem storage to S3 storage. Since this is pre-prod testing with a single user, we can blow away existing data and start fresh.

## Prerequisites
Update the following GitHub Variables (Settings → Secrets and variables → Actions → Variables):
- Rename `AWS_REGION` → `PRODUCTION_AWS_REGION` (set to `us-east-1`)
- Rename `EC2_INSTANCE_ID` → `PRODUCTION_EC2_INSTANCE_ID`
- Rename `S3_BACKUP_BUCKET` → `PRODUCTION_S3_BACKUP_BUCKET`
- Ensure `PRODUCTION_STORAGE_TYPE` is set to `s3`
- Ensure `PRODUCTION_S3_BUCKET_NAME` is set to `budget-app-data-f5b52f89`
- Ensure `PRODUCTION_S3_PREFIX` is set to `data/`

## Deployment Steps

### Step 1: Clean Production Data (Optional)
Since we're starting fresh, SSH into the server and remove old filesystem data:
```bash
ssh ec2-user@your-instance
sudo su - appuser
rm -rf /home/appuser/app/backend/data/*.json
```

### Step 2: Deploy Updated Code
1. Commit all changes:
```bash
git add .
git commit -m "feat: migrate to S3 storage and consolidate dataService"
git push origin main
```

2. Run the GitHub Actions deployment workflow:
   - Go to Actions → "Deploy to Production" 
   - Click "Run workflow"
   - Add message: "Migrating to S3 storage"

### Step 3: Verify S3 Storage
After deployment, the application will:
- Automatically use S3 storage (via STORAGE_TYPE=s3)
- Create new user files in S3 instead of filesystem
- Use the consolidated UnifiedDataService with StorageFactory

To verify:
```bash
# Check S3 bucket for new files
aws s3 ls s3://budget-app-data-f5b52f89/data/

# Monitor application logs
ssh ec2-user@your-instance
sudo su - appuser
pm2 logs budget-backend
```

## What Changed

### Code Changes
1. **Consolidated dataService**: Removed duplicate dataServiceV2, now using single UnifiedDataService
2. **StorageFactory refactor**: Single source of truth for configuration via environment variables
3. **GitHub workflow**: Added AWS_REGION to .env generation, consistent PRODUCTION_ prefix

### Configuration Changes
- Added `AWS_REGION` environment variable (required for S3 SDK)
- All production variables now use `PRODUCTION_` prefix for consistency
- Storage type explicitly set to `s3` for production

## Rollback Plan
If issues occur:
1. Set `PRODUCTION_STORAGE_TYPE` back to `filesystem` in GitHub Variables
2. Redeploy via GitHub Actions
3. Application will revert to using local filesystem storage

## Notes
- No data migration needed since this is pre-prod with single user
- User-scoped data (categories_userId.json) will be created fresh in S3
- Legacy global files (categories.json, budgets.json) are no longer created