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

# Deploy CHANGELOG.md to app root (for changelog endpoint)
if [ -f "$DEPLOYMENT_DIR/CHANGELOG.md" ]; then
    echo "📄 Deploying CHANGELOG.md..."
    [ -f "$APP_DIR/CHANGELOG.md" ] && mv "$APP_DIR/CHANGELOG.md" "$APP_DIR/CHANGELOG.md.old"
    cp "$DEPLOYMENT_DIR/CHANGELOG.md" "$APP_DIR/CHANGELOG.md"
fi

# Note: Shared utilities are now bundled within the backend dist directory

# Validate CHANGELOG.md deployment
if [ -f "$APP_DIR/CHANGELOG.md" ]; then
    echo "✅ CHANGELOG.md deployed successfully"
else
    echo "⚠️  Warning: CHANGELOG.md not found - changelog endpoint may not work"
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

# Health check with more detailed logging and longer timeout
echo "🏥 Running health check..."
sleep 5

# First check if PM2 process is running
echo "📊 Checking PM2 status..."
pm2 status budget-backend

# Check logs for startup errors
echo "📋 Recent PM2 logs:"
pm2 logs budget-backend --lines 5 --nostream

# Health check with longer timeout
echo "🩺 Testing health endpoint..."
for i in {1..15}; do
    if curl -f http://localhost:3001/health 2>/dev/null; then
        echo "✅ Health check passed!"
        echo "📋 Application details:"
        curl -s http://localhost:3001/health | jq '.' 2>/dev/null || curl -s http://localhost:3001/health
        break
    fi
    if [ $i -eq 15 ]; then
        echo "❌ Health check failed after 15 attempts"
        echo "📋 Final PM2 status:"
        pm2 status budget-backend
        echo "📋 Final logs:"
        pm2 logs budget-backend --lines 20 --nostream
        exit 1
    fi
    echo "Retry $i/15..."
    sleep 3
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