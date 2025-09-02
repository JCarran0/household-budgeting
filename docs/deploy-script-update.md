# Deploy Script Update for Environment Variables

## Server-Side Changes Required

The `/home/appuser/deploy.sh` script on the EC2 instance needs to be updated to handle the `.env` file that's now included in the deployment package.

### Current Deploy Script Behavior
The deploy script currently:
1. Downloads the deployment package from S3
2. Extracts it
3. Installs dependencies
4. Restarts the application with PM2

### Required Changes to `/home/appuser/deploy.sh`

Add the following after extracting the deployment package:

```bash
# After extracting deployment package...

# Copy .env file to backend directory
if [ -f "deployment/backend/.env" ]; then
    echo "📋 Installing environment configuration..."
    cp deployment/backend/.env /home/appuser/app/backend/.env
    chmod 600 /home/appuser/app/backend/.env
    echo "✅ Environment variables configured"
else
    echo "⚠️  Warning: No .env file found in deployment package"
fi
```

### Full Updated Section
Replace the deployment extraction section with:

```bash
# Extract deployment
echo "📦 Extracting deployment package..."
tar -xzf /tmp/deployment.tar.gz -C /tmp/

# Copy backend files
echo "📋 Installing backend..."
cp -r /tmp/deployment/backend/* /home/appuser/app/backend/

# Copy .env file specifically (in case it's not in dist)
if [ -f "/tmp/deployment/backend/.env" ]; then
    echo "📋 Installing environment configuration..."
    cp /tmp/deployment/backend/.env /home/appuser/app/backend/.env
    chmod 600 /home/appuser/app/backend/.env
    echo "✅ Environment variables configured"
else
    echo "⚠️  Warning: No .env file found in deployment package"
fi

# Install backend dependencies
cd /home/appuser/app/backend
npm ci --production

# Copy frontend files
echo "📋 Installing frontend..."
cp -r /tmp/deployment/frontend/* /home/appuser/app/frontend/

# Restart application
echo "🔄 Restarting application..."
pm2 restart budget-backend || pm2 start npm --name "budget-backend" -- start
```

## Manual Steps Required

1. **SSH into the EC2 instance**
2. **Edit the deploy script**:
   ```bash
   sudo -u appuser nano /home/appuser/deploy.sh
   ```
3. **Add the .env handling code shown above**
4. **Save and exit**

## Verification After Update

After updating the deploy script and adding GitHub secrets:

1. **Add all secrets to GitHub** (Settings → Secrets → Actions):
   - PRODUCTION_NODE_ENV
   - PRODUCTION_PORT  
   - PRODUCTION_JWT_SECRET
   - PRODUCTION_JWT_EXPIRES_IN
   - PRODUCTION_PLAID_CLIENT_ID
   - PRODUCTION_PLAID_SECRET
   - PRODUCTION_PLAID_ENV
   - PRODUCTION_PLAID_PRODUCTS
   - PRODUCTION_PLAID_COUNTRY_CODES
   - PRODUCTION_DATA_DIR
   - PRODUCTION_ENCRYPTION_KEY
   - PRODUCTION_FRONTEND_URL
   - PRODUCTION_API_PREFIX
   - PRODUCTION_LOG_LEVEL

2. **Test deployment** with GitHub Actions

3. **Verify .env file** on server:
   ```bash
   sudo -u appuser cat /home/appuser/app/backend/.env
   ```

4. **Check application logs**:
   ```bash
   pm2 logs budget-backend
   ```

## Security Considerations

- The `.env` file is included in the deployment package but encrypted in transit (HTTPS/S3)
- File permissions are set to 600 (read/write for owner only)
- Secrets are never logged or exposed in GitHub Actions logs
- The deployment package in S3 should have restricted access

## Rollback Considerations

If using the rollback workflow, ensure it also preserves the `.env` file from the backup.