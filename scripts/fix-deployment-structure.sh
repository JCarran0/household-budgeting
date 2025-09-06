#!/bin/bash
# Fix deployment structure on production server
# This script updates the server to use the correct dist/ directory structure

set -e

echo "🔧 Fixing deployment structure on production server..."

# Check if running as appuser
if [ "$USER" != "appuser" ]; then
    echo "⚠️  Switching to appuser..."
    sudo -u appuser bash "$0"
    exit $?
fi

cd /home/appuser/app

echo "📂 Current structure:"
ls -la backend/ | head -20

# Step 1: Create proper dist directory if needed
if [ ! -d "backend/dist" ]; then
    echo "📁 Creating dist directory..."
    mkdir -p backend/dist
    
    # Move compiled files to dist
    echo "📦 Moving compiled files to dist directory..."
    for file in backend/*.js backend/*.js.map; do
        if [ -f "$file" ]; then
            mv "$file" backend/dist/ 2>/dev/null || true
        fi
    done
fi

# Step 2: Remove the workaround package.json from app root
if [ -f "package.json" ] && [ -f "backend/package.json" ]; then
    echo "🧹 Removing workaround package.json from app root..."
    rm -f package.json
fi

# Step 3: Update ecosystem.config.js
echo "📝 Creating corrected ecosystem.config.js..."
cat > ecosystem.config.js << 'EOF'
// PM2 Configuration for Budget Backend
// Fixed to use proper dist/ directory structure

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
    min_uptime: '10s',
    kill_timeout: 5000,
    wait_ready: true,
    listen_timeout: 10000
  }]
};
EOF

# Step 4: Update the deploy.sh script to maintain dist structure
echo "📝 Updating deploy.sh script..."
cat > /home/appuser/deploy.sh << 'EOF'
#!/bin/bash
# Server-side deployment script - Updated to preserve dist/ structure
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
mkdir -p "/home/appuser/logs"

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

# Deploy new version
echo "🔄 Deploying backend..."
rm -rf "$APP_DIR/backend.old"
[ -d "$APP_DIR/backend" ] && mv "$APP_DIR/backend" "$APP_DIR/backend.old"
mv "$DEPLOYMENT_DIR/backend" "$APP_DIR/backend"

echo "🎨 Deploying frontend..."
rm -rf "$APP_DIR/frontend.old"
[ -d "$APP_DIR/frontend" ] && mv "$APP_DIR/frontend" "$APP_DIR/frontend.old"
mv "$DEPLOYMENT_DIR/frontend" "$APP_DIR/frontend"

# Ensure ecosystem.config.js exists and is correct
if [ ! -f "$APP_DIR/ecosystem.config.js" ] || ! grep -q "script: 'dist/index.js'" "$APP_DIR/ecosystem.config.js"; then
    echo "📝 Creating ecosystem.config.js..."
    cat > "$APP_DIR/ecosystem.config.js" << 'ECOSYSTEM'
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
ECOSYSTEM
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
EOF

chmod +x /home/appuser/deploy.sh

# Step 5: Restart PM2 with correct configuration
echo "🔄 Restarting PM2 with correct configuration..."
pm2 stop budget-backend 2>/dev/null || true
pm2 delete budget-backend 2>/dev/null || true
pm2 start ecosystem.config.js
pm2 save

# Step 6: Show status
echo ""
echo "📊 Current PM2 status:"
pm2 status

# Step 7: Test health endpoint
echo ""
echo "🏥 Testing health endpoint..."
if curl -f -s http://localhost:3001/health | grep -q '"status":"ok"'; then
    echo "✅ Application is healthy with correct structure!"
    echo ""
    echo "📂 New structure:"
    ls -la backend/dist/ | head -10
    echo ""
    echo "🎉 Deployment structure fix complete!"
else
    echo "⚠️  Health check failed. Checking logs..."
    pm2 logs budget-backend --lines 20 --nostream
    echo ""
    echo "❌ Application may not be working correctly."
fi