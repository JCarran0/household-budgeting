# Deployment Script Synchronization

## Problem
The EC2 instance has its own deployment scripts (`/home/appuser/deploy.sh`) that are separate from the scripts in this repository. When we update the build output structure, the server scripts must also be updated.

## Current Issue (Fixed)
After fixing the TypeScript build to output directly to `dist/` instead of `dist/backend/src/`, the server's deploy.sh still referenced the old path:
- **Old**: `pm2 start backend/src/index.js`
- **New**: `pm2 start index.js`

## Solution
Use the GitHub Actions workflow to update the server scripts:

1. **Manual Update via GitHub Actions**:
   ```bash
   # Go to GitHub Actions > Update Server Deployment Scripts
   # Run workflow and select "deploy.sh" or "all"
   ```

2. **What the workflow does**:
   - Creates an updated script with the correct paths
   - Uses AWS SSM to upload and replace the script on the EC2 instance
   - Sets proper permissions (executable, owned by appuser)

## Important Notes
- The scripts in `scripts/` directory are templates/examples
- The actual scripts on the EC2 instance (`/home/appuser/*.sh`) are separate
- Always update server scripts after changing the build output structure
- The server scripts are not part of the regular deployment package

## Verification
After updating the server scripts:
1. Trigger a deployment
2. Check the deployment logs for:
   - "Starting application with new path..."
   - "pm2 start index.js"
3. Verify health check passes

## Files Involved
- **Local templates**: `scripts/*.sh`
- **Server scripts**: `/home/appuser/deploy.sh` (on EC2)
- **Update workflow**: `.github/workflows/update-server-scripts.yml`
- **Deployment workflow**: `.github/workflows/deploy-production.yml`