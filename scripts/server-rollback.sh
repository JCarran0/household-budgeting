#!/bin/bash
# Server-side rollback script
# Usage: ./rollback.sh

set -e

echo "🔄 Starting rollback process..."

APP_DIR="/home/appuser/app"

# Check if previous version exists
if [ ! -d "$APP_DIR/backend.old" ] || [ ! -d "$APP_DIR/frontend.old" ]; then
    echo "❌ No previous version found to rollback to"
    echo "Available directories:"
    ls -la "$APP_DIR"
    exit 1
fi

# Save current (failed) deployment for investigation
echo "📦 Saving current deployment for investigation..."
mkdir -p "$APP_DIR/failed-deployments"
TIMESTAMP=$(date +%Y%m%d-%H%M%S)
[ -d "$APP_DIR/backend" ] && mv "$APP_DIR/backend" "$APP_DIR/failed-deployments/backend-$TIMESTAMP"
[ -d "$APP_DIR/frontend" ] && mv "$APP_DIR/frontend" "$APP_DIR/failed-deployments/frontend-$TIMESTAMP"

# Stop application
echo "⏸️  Stopping application..."
pm2 stop budget-backend || true

# Restore previous versions
echo "📂 Restoring previous backend..."
mv "$APP_DIR/backend.old" "$APP_DIR/backend"

echo "📂 Restoring previous frontend..."
mv "$APP_DIR/frontend.old" "$APP_DIR/frontend"

# Start application
echo "▶️  Starting application..."
cd "$APP_DIR/backend"
pm2 start dist/index.js --name budget-backend --time || pm2 restart budget-backend
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

echo "✅ Rollback completed successfully!"
echo "Failed deployment saved to: $APP_DIR/failed-deployments/"
ls -la "$APP_DIR/failed-deployments/" | tail -3