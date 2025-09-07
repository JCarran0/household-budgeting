#!/bin/bash
# Server-side deployment script
# Usage: ./deploy.sh <s3-package-url>

set -e

S3_PACKAGE="$1"

if [ -z "$S3_PACKAGE" ]; then
    echo "❌ Error: S3 package URL required"
    echo "Usage: $0 s3://bucket/path/to/package.tar.gz"
    exit 1
fi

echo "🚀 Starting deployment from: $S3_PACKAGE"

# Configuration
DEPLOYMENT_DIR="/home/appuser/deployments/$(date +%Y%m%d-%H%M%S)"
APP_DIR="/home/appuser/app"
BACKUP_DIR="/home/appuser/backups"

# Create directories
echo "📁 Creating deployment directories..."
mkdir -p "$DEPLOYMENT_DIR"
mkdir -p "$BACKUP_DIR"

# Download and extract package
echo "📥 Downloading deployment package..."
TEMP_DIR="/home/appuser/temp-deploy"
mkdir -p "$TEMP_DIR"
aws s3 cp "$S3_PACKAGE" "$TEMP_DIR/deployment.tar.gz"
cd "$TEMP_DIR"
tar -xzf deployment.tar.gz
cp -r deployment/* "$DEPLOYMENT_DIR/"

# Copy .env file from deployment package (contains GitHub Secrets)
if [ -f "$TEMP_DIR/deployment/backend/.env" ]; then
    echo "📋 Installing environment configuration from deployment..."
    cp "$TEMP_DIR/deployment/backend/.env" "$DEPLOYMENT_DIR/backend/.env"
    chmod 600 "$DEPLOYMENT_DIR/backend/.env"
    echo "✅ Environment variables configured from GitHub Secrets"
else
    echo "⚠️  Warning: No .env file found in deployment package"
fi

# Backup current deployment (excluding data directory)
if [ -d "$APP_DIR/backend" ]; then
    echo "📦 Backing up current deployment..."
    tar -czf "$BACKUP_DIR/backup-$(date +%Y%m%d-%H%M%S).tar.gz" \
        -C "$APP_DIR" \
        --exclude="backend/data" \
        --exclude="backend/node_modules" \
        --exclude="backend/.env" \
        .
fi

# Install dependencies
echo "📥 Installing backend dependencies..."
cd "$DEPLOYMENT_DIR/backend"
npm ci --omit=dev

# Stop application
echo "⏸️  Stopping application..."
pm2 stop budget-backend || true

# Clean up old data if switching to S3
if [ -f "$DEPLOYMENT_DIR/backend/.env" ]; then
    source "$DEPLOYMENT_DIR/backend/.env"
    if [ "$STORAGE_TYPE" = "s3" ] && [ -d "$APP_DIR/backend/data" ]; then
        echo "🧹 Cleaning up local data directory (using S3 storage now)..."
        rm -rf "$APP_DIR/backend/data"
    fi
fi

# Deploy new version
echo "🔄 Deploying backend..."
rm -rf "$APP_DIR/backend.old"
[ -d "$APP_DIR/backend" ] && mv "$APP_DIR/backend" "$APP_DIR/backend.old"
mv "$DEPLOYMENT_DIR/backend" "$APP_DIR/backend"

echo "🎨 Deploying frontend..."
rm -rf "$APP_DIR/frontend.old"
[ -d "$APP_DIR/frontend" ] && mv "$APP_DIR/frontend" "$APP_DIR/frontend.old"
mv "$DEPLOYMENT_DIR/frontend" "$APP_DIR/frontend"

# Deploy shared utilities to /home/appuser/app/shared (for backend imports)
if [ -d "$DEPLOYMENT_DIR/shared" ]; then
    echo "📚 Deploying shared utilities..."
    rm -rf "$APP_DIR/shared.old"
    [ -d "$APP_DIR/shared" ] && mv "$APP_DIR/shared" "$APP_DIR/shared.old"
    mv "$DEPLOYMENT_DIR/shared" "$APP_DIR/shared"
    
    # Validate shared utilities deployment
    echo "🔍 Validating shared utilities deployment..."
    test -d "$APP_DIR/shared/utils" || (echo "❌ Shared utils directory missing after deployment" && exit 1)
    test -f "$APP_DIR/shared/utils/categoryHelpers.js" || (echo "❌ CategoryHelpers missing after deployment" && exit 1)
    grep -q "createCategoryLookup" "$APP_DIR/shared/utils/categoryHelpers.js" || (echo "❌ createCategoryLookup function missing after deployment" && exit 1)
    echo "✅ Shared utilities validation passed"
else
    echo "⚠️  Warning: No shared utilities found in deployment package"
fi

# Ensure ecosystem.config.js exists
if [ ! -f "$APP_DIR/ecosystem.config.js" ]; then
    echo "📝 Creating ecosystem.config.js..."
    cat > "$APP_DIR/ecosystem.config.js" << 'EOF'
module.exports = {
  apps: [{
    name: 'budget-backend',
    script: 'dist/index.js',
    cwd: '/home/appuser/app/backend',
    instances: 1,
    exec_mode: 'fork',
    env: {
      NODE_ENV: 'production',
      PORT: 3001
    },
    error_file: '/home/appuser/logs/error.log',
    out_file: '/home/appuser/logs/output.log',
    log_date_format: 'YYYY-MM-DD HH:mm:ss',
    max_memory_restart: '500M',
    watch: false,
    autorestart: true,
    max_restarts: 10,
    min_uptime: '10s'
  }]
};
EOF
fi

# Start application using ecosystem config
echo "▶️  Starting application..."
cd "$APP_DIR"
pm2 delete budget-backend 2>/dev/null || true
pm2 start ecosystem.config.js
pm2 save

# Health check
echo "🏥 Running health check..."
sleep 5
for i in {1..10}; do
    if curl -f http://localhost:3001/health 2>/dev/null; then
        echo "✅ Health check passed!"
        break
    fi
    echo "Waiting for application... ($i/10)"
    sleep 2
done

# Cleanup
echo "🧹 Cleaning up..."
rm -rf "$TEMP_DIR"
rm -rf "$DEPLOYMENT_DIR"
rm -rf "$APP_DIR/backend.old"  # Remove old backend after successful deployment
rm -rf "$APP_DIR/frontend.old"  # Remove old frontend after successful deployment

# Keep only last 5 backups
ls -t "$BACKUP_DIR"/*.tar.gz 2>/dev/null | tail -n +6 | xargs rm -f 2>/dev/null || true

echo "🎉 Deployment complete!"