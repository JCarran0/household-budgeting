#!/bin/bash
set -e

# Log all output
exec > >(tee -a /var/log/user-data.log)
exec 2>&1

echo "Starting user data script at $(date)"

# Update system
apt-get update
apt-get upgrade -y

# Install essential packages
apt-get install -y \
    curl \
    wget \
    git \
    build-essential \
    nginx \
    ufw \
    fail2ban \
    unzip \
    awscli

# Install Node.js ${node_version}
curl -fsSL https://deb.nodesource.com/setup_${node_version}.x | bash -
apt-get install -y nodejs

# Install PM2 globally
npm install -g pm2

# Create application user and directories
useradd -m -s /bin/bash appuser || true
mkdir -p /home/appuser/app/{backend,frontend}
mkdir -p /home/appuser/budget-data
mkdir -p /home/appuser/backups
mkdir -p /home/appuser/logs

# Set up application directory permissions
chown -R appuser:appuser /home/appuser

# Configure UFW firewall
ufw --force enable
ufw allow 22/tcp
ufw allow 80/tcp
ufw allow 443/tcp
ufw reload

# Configure fail2ban
systemctl enable fail2ban
systemctl start fail2ban

# Basic SSH hardening
sed -i 's/^#*PermitRootLogin.*/PermitRootLogin no/' /etc/ssh/sshd_config
sed -i 's/^#*PasswordAuthentication.*/PasswordAuthentication no/' /etc/ssh/sshd_config
systemctl restart ssh

# Configure nginx
cat > /etc/nginx/sites-available/budget-app <<'EOF'
# Rate limiting configuration
limit_req_zone $binary_remote_addr zone=api:10m rate=10r/s;

server {
    listen 80;
    server_name _;
    
    # Frontend
    location / {
        root /home/appuser/app/frontend/dist;
        try_files $uri $uri/ /index.html;
    }
    
    # Backend API
    location /api {
        proxy_pass http://localhost:3001;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_set_header Authorization $http_authorization;
        proxy_cache_bypass $http_upgrade;
        
        # Rate limiting
        limit_req zone=api burst=10 nodelay;
    }
    
    # Health check endpoint
    location /health {
        proxy_pass http://localhost:3001/health;
        access_log off;
    }
    
    # Security headers
    add_header X-Frame-Options "SAMEORIGIN" always;
    add_header X-Content-Type-Options "nosniff" always;
    add_header X-XSS-Protection "1; mode=block" always;
    add_header Referrer-Policy "no-referrer-when-downgrade" always;
}
EOF

# Enable the site
ln -sf /etc/nginx/sites-available/budget-app /etc/nginx/sites-enabled/
rm -f /etc/nginx/sites-enabled/default

# Test nginx configuration
nginx -t

# Restart nginx
systemctl restart nginx
systemctl enable nginx

# Setup PM2 to start on boot for appuser
su - appuser -c "pm2 startup systemd -u appuser --hp /home/appuser" || true
systemctl enable pm2-appuser || true

# Create backup script
cat > /home/appuser/backup.sh <<'EOF'
#!/bin/bash
# Daily backup script for budget app data

DATE=$(date +%Y%m%d_%H%M%S)
BACKUP_DIR="/home/appuser/backups"
DATA_DIR="/home/appuser/budget-data"
S3_BUCKET="$(aws s3api list-buckets --query 'Buckets[?contains(Name, `budget-app-backups`)].Name' --output text)"

# Create backup
tar -czf "$BACKUP_DIR/data-$DATE.tar.gz" -C "$DATA_DIR" .

# Upload to S3 if bucket exists
if [ -n "$S3_BUCKET" ]; then
    aws s3 cp "$BACKUP_DIR/data-$DATE.tar.gz" "s3://$S3_BUCKET/backups/"
fi

# Keep only last 7 days of local backups
find "$BACKUP_DIR" -name "*.tar.gz" -mtime +7 -delete
EOF

chmod +x /home/appuser/backup.sh
chown appuser:appuser /home/appuser/backup.sh

# Add backup cron job
(crontab -u appuser -l 2>/dev/null; echo "0 2 * * * /home/appuser/backup.sh >> /home/appuser/logs/backup.log 2>&1") | crontab -u appuser -

# Create deployment script
cat > /home/appuser/deploy.sh <<'EOF'
#!/bin/bash
# Deployment script for budget app

set -e

echo "Starting deployment at $(date)"

# Stop the application
pm2 stop budget-backend || true

# Pull latest code (when repository is set up)
# cd /home/appuser/app
# git pull origin main

# Install dependencies and build
cd /home/appuser/app/backend
npm ci --production
npm run build || true

cd /home/appuser/app/frontend
npm ci
npm run build

# Start the application
cd /home/appuser/app
pm2 start ecosystem.config.js

# Save PM2 configuration
pm2 save

echo "Deployment completed at $(date)"
EOF

chmod +x /home/appuser/deploy.sh
chown appuser:appuser /home/appuser/deploy.sh

# Create ecosystem config for PM2
cat > /home/appuser/app/ecosystem.config.js <<'EOF'
module.exports = {
  apps: [{
    name: 'budget-backend',
    script: './backend/dist/index.js',
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

chown appuser:appuser /home/appuser/app/ecosystem.config.js

# Set up log rotation
cat > /etc/logrotate.d/budget-app <<'EOF'
/home/appuser/logs/*.log {
    daily
    rotate 7
    compress
    delaycompress
    missingok
    notifempty
    create 0640 appuser appuser
    sharedscripts
    postrotate
        su - appuser -c "pm2 reloadLogs" > /dev/null 2>&1 || true
    endscript
}
EOF

echo "User data script completed at $(date)"