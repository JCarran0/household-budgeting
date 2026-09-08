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

# Resolve the region before any AWS call that needs one.
#
# The instance has no region in `aws configure` and none in the environment.
# `aws s3 cp` survives that because S3 resolves a region through its global
# endpoint, but `aws ssm` does not — it fails with "You must specify a region",
# which is what broke the first SSM-rendered deploy (2026-09-08). Take the
# region from IMDSv2 rather than hardcoding it, so this still works if the
# instance is ever rebuilt elsewhere.
if [ -z "$AWS_DEFAULT_REGION" ]; then
    IMDS_TOKEN=$(curl -sf -X PUT http://169.254.169.254/latest/api/token \
        -H "X-aws-ec2-metadata-token-ttl-seconds: 300" 2>/dev/null || true)
    AWS_DEFAULT_REGION=$(curl -sf -H "X-aws-ec2-metadata-token: $IMDS_TOKEN" \
        http://169.254.169.254/latest/meta-data/placement/region 2>/dev/null || true)
fi
if [ -z "$AWS_DEFAULT_REGION" ]; then
    echo "❌ Could not determine the AWS region from the environment or IMDSv2."
    echo "   Aborting; the running version is untouched."
    exit 1
fi
export AWS_DEFAULT_REGION
echo "🌎 Region: $AWS_DEFAULT_REGION"

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

# ---------------------------------------------------------------------------
# Render .env  =  non-secret config (from package)  +  secrets (from SSM)
#
# SA-25: deployment tarballs used to carry a complete .env — JWT secret, Plaid
# secret, PLAID_ENCRYPTION_SECRET, Anthropic key, GitHub PATs, VAPID private
# key. Those tarballs are retained in S3 indefinitely for rollback, so every
# historical package was a readable credential bundle at rest, and rotating a
# secret did not invalidate the copies already sitting in the bucket.
#
# Secrets now come from SSM Parameter Store at deploy time and exist only in
# this file on this host. The package carries non-secret config only.
#
# This block runs BEFORE `pm2 stop` on purpose. If SSM is unreachable, the IAM
# grant is missing, or a parameter is absent, the deploy aborts here with the
# old version still serving traffic. Do not move it later in the script.
# ---------------------------------------------------------------------------
SSM_PATH="/budget-app/prod"
ENV_FILE="$DEPLOYMENT_DIR/backend/.env"
CONFIG_FILE="$TEMP_DIR/deployment/backend/.env.config"

# Every secret the backend needs at boot. Keep in sync with the SECRETS list in
# .github/workflows/sync-secrets-to-ssm.yml — that workflow is the only writer.
REQUIRED_SECRETS="JWT_SECRET PLAID_CLIENT_ID PLAID_SECRET PLAID_ENCRYPTION_SECRET ANTHROPIC_API_KEY GITHUB_ISSUES_PAT VAPID_PUBLIC_KEY VAPID_PRIVATE_KEY VAPID_SUBJECT"

echo "📋 Installing non-secret configuration from deployment package..."
if [ ! -f "$CONFIG_FILE" ]; then
    echo "❌ No .env.config in deployment package — cannot build environment"
    exit 1
fi
install -m 600 /dev/null "$ENV_FILE"
cat "$CONFIG_FILE" >> "$ENV_FILE"

echo "🔐 Fetching secrets from SSM ($SSM_PATH)..."
# --with-decryption is required for SecureString. Output is piped straight to
# jq and into the 0600 file; it is never echoed. Note the CLI paginates
# get-parameters-by-path automatically (the API caps at 10 per call).
SSM_JSON=$(aws ssm get-parameters-by-path \
    --path "$SSM_PATH" \
    --with-decryption \
    --recursive \
    --output json 2>&1) || {
    # Print what AWS actually said. This branch used to capture stderr into
    # $SSM_JSON and then discard it in favour of a guess, which sent the first
    # failure investigation after the wrong cause (2026-09-08). The command
    # failed, so $SSM_JSON holds an error message, not parameter values.
    echo "❌ Could not read $SSM_PATH from SSM:"
    echo "$SSM_JSON" | head -5
    echo "   If this is an authorization error, the instance role is probably"
    echo "   missing budget-app-ssm-secrets-read — apply"
    echo "   scripts/aws/ec2-ssm-secrets-read-policy.json (see scripts/aws/README.md)."
    echo "   Aborting; the running version is untouched."
    exit 1
}

# Reject values containing newlines — they would silently corrupt every
# subsequent line of .env and surface as a baffling boot failure.
if echo "$SSM_JSON" | jq -e '.Parameters[] | select(.Value | test("\n"))' > /dev/null 2>&1; then
    echo "❌ An SSM parameter value contains a newline, which .env cannot represent."
    exit 1
fi

echo "$SSM_JSON" | jq -r '.Parameters[] | "\(.Name | split("/") | last)=\(.Value)"' >> "$ENV_FILE"

# Verify every required secret actually landed. Checks key names only — values
# are never printed.
MISSING=""
for NAME in $REQUIRED_SECRETS; do
    grep -q "^${NAME}=." "$ENV_FILE" || MISSING="$MISSING $NAME"
done
if [ -n "$MISSING" ]; then
    echo "❌ Missing or empty secrets in SSM:$MISSING"
    echo "   Run the 'Sync Secrets to SSM Parameter Store' workflow, then redeploy."
    echo "   Aborting; the running version is untouched."
    exit 1
fi

chmod 600 "$ENV_FILE"
echo "✅ Environment configured — $(grep -c '=' "$ENV_FILE") variables, secrets from SSM"

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

# Clean up old data if switching to S3.
# Reads STORAGE_TYPE from the non-secret config only — `source`ing the full
# .env would pull every secret into this shell's environment, where it would be
# inherited by npm, pm2, and everything else the script runs.
if [ -f "$CONFIG_FILE" ]; then
    STORAGE_TYPE=$(grep '^STORAGE_TYPE=' "$CONFIG_FILE" | cut -d= -f2-)
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