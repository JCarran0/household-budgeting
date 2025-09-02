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
aws s3 cp "$S3_PACKAGE" /tmp/deployment.tar.gz
cd /tmp
tar -xzf deployment.tar.gz
cp -r deployment/* "$DEPLOYMENT_DIR/"

# Backup current deployment
if [ -d "$APP_DIR/backend" ]; then
    echo "📦 Backing up current deployment..."
    tar -czf "$BACKUP_DIR/backup-$(date +%Y%m%d-%H%M%S).tar.gz" -C "$APP_DIR" .
fi

# Install dependencies
echo "📥 Installing backend dependencies..."
cd "$DEPLOYMENT_DIR/backend"
npm ci --omit=dev

# Preserve environment config
if [ -f "$APP_DIR/backend/.env" ]; then
    echo "🔧 Preserving environment configuration..."
    cp "$APP_DIR/backend/.env" "$DEPLOYMENT_DIR/backend/.env"
fi

# Stop application
echo "⏸️  Stopping application..."
pm2 stop budget-backend || true

# Deploy new version
echo "🔄 Deploying backend..."
rm -rf "$APP_DIR/backend.old"
[ -d "$APP_DIR/backend" ] && mv "$APP_DIR/backend" "$APP_DIR/backend.old"
mv "$DEPLOYMENT_DIR/backend" "$APP_DIR/backend"

echo "🎨 Deploying frontend..."
rm -rf "$APP_DIR/frontend.old"
[ -d "$APP_DIR/frontend" ] && mv "$APP_DIR/frontend" "$APP_DIR/frontend.old"
mv "$DEPLOYMENT_DIR/frontend" "$APP_DIR/frontend"

# Start application
echo "▶️  Starting application..."
cd "$APP_DIR/backend"
pm2 start dist/backend/src/index.js --name budget-backend --time || pm2 restart budget-backend
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
rm -f /tmp/deployment.tar.gz
rm -rf /tmp/deployment
rm -rf "$DEPLOYMENT_DIR"

# Keep only last 5 backups
ls -t "$BACKUP_DIR"/*.tar.gz 2>/dev/null | tail -n +6 | xargs rm -f 2>/dev/null || true

echo "✅ Deployment completed successfully!"