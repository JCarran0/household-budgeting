#!/bin/bash
# Fix PM2 environment loading issue
# Run this on the server to fix the current deployment

set -e

echo "🔧 Fixing PM2 environment configuration..."

# Check if running as appuser
if [ "$USER" != "appuser" ]; then
    echo "⚠️  Switching to appuser..."
    sudo -u appuser bash "$0"
    exit $?
fi

cd /home/appuser/app

# Step 1: Check if .env file exists
if [ ! -f "backend/.env" ]; then
    echo "❌ Error: backend/.env file not found!"
    echo "Looking for .env.production..."
    
    if [ -f ".env.production" ]; then
        echo "✅ Found .env.production, copying to backend/.env"
        cp .env.production backend/.env
        chmod 600 backend/.env
    else
        echo "❌ No environment file found! Deployment may have failed."
        echo "Please check GitHub Actions deployment logs."
        exit 1
    fi
else
    echo "✅ backend/.env exists"
fi

# Step 2: Create proper ecosystem.config.js
echo "📝 Creating fixed ecosystem.config.js..."
cat > ecosystem.config.js << 'EOF'
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

# Step 3: Stop and clean up PM2
echo "🛑 Stopping current PM2 process..."
pm2 stop budget-backend 2>/dev/null || true
pm2 delete budget-backend 2>/dev/null || true

# Step 4: Start with new configuration
echo "🚀 Starting PM2 with fixed configuration..."
pm2 start ecosystem.config.js

# Step 5: Save PM2 configuration
echo "💾 Saving PM2 configuration..."
pm2 save

# Step 6: Show status
echo ""
echo "📊 Current PM2 status:"
pm2 status

# Step 7: Wait and test
echo ""
echo "⏳ Waiting for application to start..."
sleep 5

# Step 8: Test health endpoint
echo "🏥 Testing health endpoint..."
if curl -f -s http://localhost:3001/health | grep -q '"status":"ok"'; then
    echo "✅ Application is healthy!"
    echo ""
    echo "🎉 PM2 environment fix complete!"
    echo ""
    echo "You can check logs with: pm2 logs budget-backend"
else
    echo "⚠️  Health check failed. Checking logs..."
    pm2 logs budget-backend --lines 20 --nostream
    echo ""
    echo "❌ Application may not be working correctly."
    echo "Check the logs above for errors."
fi