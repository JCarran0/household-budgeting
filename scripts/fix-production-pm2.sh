#!/bin/bash
# Fix PM2 environment issue on production server via AWS SSM
# Run this from your local machine with AWS CLI configured

set -e

# Get the EC2 instance ID from environment or use the one from your GitHub variables
INSTANCE_ID="${EC2_INSTANCE_ID:-i-0d8c3a8f6e7049eb7}"  # Update this with your actual instance ID
REGION="${AWS_REGION:-us-east-1}"

echo "🔧 Fixing PM2 environment on production server..."
echo "Instance: $INSTANCE_ID"
echo "Region: $REGION"

# Create the fix commands
read -r -d '' FIX_COMMANDS << 'EOF' || true
#!/bin/bash
set -e

echo "Starting PM2 fix process..."

# Switch to appuser
su - appuser << 'APPUSER_COMMANDS'
cd /home/appuser/app

# Check if .env exists
if [ ! -f "backend/.env" ]; then
    echo "backend/.env not found, looking for .env.production..."
    if [ -f ".env.production" ]; then
        cp .env.production backend/.env
        chmod 600 backend/.env
        echo "Copied .env.production to backend/.env"
    else
        echo "ERROR: No environment file found!"
        exit 1
    fi
else
    echo "backend/.env exists"
fi

# Create the correct ecosystem.config.js
cat > ecosystem.config.js << 'ECOSYSTEM'
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

echo "Created ecosystem.config.js"

# Stop and restart PM2
pm2 stop budget-backend 2>/dev/null || true
pm2 delete budget-backend 2>/dev/null || true
pm2 start ecosystem.config.js
pm2 save

echo "PM2 restarted with new configuration"

# Show status
pm2 status

# Test health endpoint
sleep 5
if curl -s http://localhost:3001/health | grep -q "ok"; then
    echo "SUCCESS: Application is healthy!"
else
    echo "WARNING: Health check failed"
    pm2 logs budget-backend --lines 20 --nostream
fi
APPUSER_COMMANDS
EOF

# Send the command to the EC2 instance
echo "📤 Sending fix commands to EC2 instance..."

COMMAND_ID=$(aws ssm send-command \
    --instance-ids "$INSTANCE_ID" \
    --document-name "AWS-RunShellScript" \
    --parameters "commands=[\"$FIX_COMMANDS\"]" \
    --region "$REGION" \
    --output text \
    --query "Command.CommandId")

echo "Command ID: $COMMAND_ID"
echo "⏳ Waiting for command to complete..."

# Wait for the command to finish
aws ssm wait command-executed \
    --command-id "$COMMAND_ID" \
    --instance-id "$INSTANCE_ID" \
    --region "$REGION" 2>/dev/null || true

# Get the command output
echo ""
echo "📄 Command Output:"
echo "=================="
aws ssm get-command-invocation \
    --command-id "$COMMAND_ID" \
    --instance-id "$INSTANCE_ID" \
    --region "$REGION" \
    --query "StandardOutputContent" \
    --output text

# Check if there were any errors
ERROR_OUTPUT=$(aws ssm get-command-invocation \
    --command-id "$COMMAND_ID" \
    --instance-id "$INSTANCE_ID" \
    --region "$REGION" \
    --query "StandardErrorContent" \
    --output text)

if [ -n "$ERROR_OUTPUT" ] && [ "$ERROR_OUTPUT" != "None" ]; then
    echo ""
    echo "⚠️ Error Output:"
    echo "==============="
    echo "$ERROR_OUTPUT"
fi

# Get the status
STATUS=$(aws ssm get-command-invocation \
    --command-id "$COMMAND_ID" \
    --instance-id "$INSTANCE_ID" \
    --region "$REGION" \
    --query "Status" \
    --output text)

echo ""
echo "Command Status: $STATUS"

if [ "$STATUS" == "Success" ]; then
    echo "✅ PM2 fix completed successfully!"
    echo ""
    echo "You can now test the application at: https://budget.jaredcarrano.com"
else
    echo "❌ Command failed. Please check the output above for errors."
    exit 1
fi