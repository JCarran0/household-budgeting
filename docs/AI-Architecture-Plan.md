# AI Architecture Plan - Strategic Planning & Cost Analysis

> **Document Purpose**: This document contains strategic planning, cost analysis, architecture decisions, and risk assessments for the production deployment. For operational procedures, troubleshooting, and deployment instructions, see [AI-DEPLOYMENTS.md](./AI-DEPLOYMENTS.md).

## Document Scope
- **What This Document Contains**: Cost projections, architecture decision records (ADRs), risk assessments, strategic planning, Terraform infrastructure code
- **What This Document Doesn't Cover**: Day-to-day operations, troubleshooting guides, deployment procedures (see [AI-DEPLOYMENTS.md](./AI-DEPLOYMENTS.md))
- **Primary Audience**: AI agents planning infrastructure changes or analyzing costs

## 🎉 Deployment Status: LIVE IN PRODUCTION

**Application URL**: https://budget.jaredcarrano.com  
**Infrastructure Status**: ✅ Fully Operational with HTTPS  
**Initial Deployment Date**: September 2, 2025  
**Last Updated**: December 2025

## Executive Summary
This document outlines the strategic architecture and cost optimization for a personal household budgeting application serving 2 users. The focus is on maintaining costs under $10/month while ensuring security and reliability. The application has been successfully deployed and is actively used in production.

### ✅ Completed Milestones (All Core Infrastructure Complete)

- **Milestone 1**: AWS Infrastructure Setup ✅ (September 2025)
  - Terraform configuration created and applied
  - EC2 t4g.micro instance running Ubuntu 22.04
  - S3 data bucket configured (not just backup - primary storage)
  - Security groups and IAM roles established
  - Budget alerts configured at $10/month
  - SSM Session Manager for secure access
  
- **Milestone 2**: Application Deployment & nginx Configuration ✅ (September 2025)
  - Backend and frontend successfully deployed
  - PM2 process management configured with auto-restart
  - nginx reverse proxy configured
  - Application accessible at https://budget.jaredcarrano.com
  - Health monitoring endpoint active

- **Milestone 3**: SSL Setup & Domain Configuration ✅ (September 2025)
  - DNS A record configured for budget.jaredcarrano.com
  - Let's Encrypt SSL certificate obtained and installed
  - HTTPS enabled with automatic HTTP → HTTPS redirect
  - Certificate auto-renewal configured via systemd timer
  - nginx updated with SSL configuration and security headers

- **Milestone 3b**: S3 Data Storage ✅ (September 2025)
  - Created flexible storage adapter system
  - Implemented S3 storage for production data (primary, not backup)
  - Filesystem storage for local development
  - Automatic switching based on environment
  - S3 bucket with versioning and encryption

- **Milestone 4**: CI/CD Pipeline with GitHub Actions ✅ (September-December 2025)
  - PR validation workflow for automated testing
  - Production deployment workflow with zero downtime via SSM
  - Rollback capability for quick recovery
  - Integration with S3 storage configuration  
  - Comprehensive deployment documentation
  - Manual deployment trigger with GitHub workflow_dispatch
  - Automatic deployment on push to main branch

### ✅ Completed Application Features (December 2025)

- **Authentication System**: JWT-based with 15+ character passphrase requirement
- **Plaid Integration**: Full account linking with Bank of America and Capital One
- **Transaction Management**: 
  - Automatic sync with 730-day history
  - Pagination (50 per page) for performance
  - Transaction splitting and categorization
- **Budget System**: 
  - Monthly budget creation and tracking
  - Copy from previous month functionality
  - Category-based spending analysis
- **Categories**: Two-level hierarchy with user-specific categories
- **Reporting**: Income vs expense, category trends, budget performance
- **Security**: AES-256 encryption, rate limiting, secure token storage

### 🚧 Remaining Milestones & Next Priorities

#### Infrastructure Improvements (Based on Deployment Lessons)
- **Milestone 5a**: Docker Containerization (Medium Priority - Q1 2026)
  - Containerize backend and frontend applications
  - Eliminate path and environment configuration issues
  - Enable consistent dev/prod parity
  - Simplify rollback with image tagging
  
- **Milestone 5b**: Enhanced CI/CD Pipeline (Medium Priority - Q1 2026)  
  - Add automated smoke tests post-deployment
  - Implement deployment validation checks
  - Add Slack/Discord notifications for deployment status
  - Create staging environment for pre-production testing

- **Milestone 5c**: Enhanced Monitoring (Low Priority - Q2 2026)
  - CloudWatch detailed metrics integration
  - Grafana dashboard setup
  - Alert automation for critical errors
  - Add deployment success/failure metrics

#### Application Feature Priorities (Per CLAUDE.md):
  1. Savings categories with rollover functionality
  2. Bill reminders and recurring transactions
  3. Enhanced reporting and data visualizations
  4. Mobile app development (React Native)

## Key Implementation Changes from Original Plan

### What Changed During Development
1. **S3 as Primary Storage** (Not Just Backup)
   - Original: JSON files on EC2 with S3 backup
   - Actual: S3 as primary data store via StorageService abstraction
   - Benefit: Better reliability, easier backup, no EBS data volume needed

2. **SSM for Deployment** (Not SSH)
   - Original: SSH-based deployment with private keys
   - Actual: AWS Systems Manager for secure, auditable deployments
   - Benefit: No SSH key management, better security, CloudTrail logging

3. **GitHub Actions Variables**
   - Original: All config in GitHub Secrets
   - Actual: Mix of Secrets (sensitive) and Variables (non-sensitive)
   - Benefit: Easier configuration management, better visibility

4. **Sophisticated CI/CD**
   - Original: Simple scp/ssh deployment
   - Actual: Full pipeline with S3 artifacts, zero-downtime deployment, rollback
   - Benefit: Professional deployment process, better reliability

5. **User-Specific Categories from Start**
   - Original: Global categories plan
   - Actual: All categories user-scoped from beginning
   - Benefit: Proper multi-user support, no migration needed

## Architecture Overview

### Core Principles (Validated in Production)
1. **Minimal Cost**: ✅ Currently ~$0.14/month, projected $8.82/month after free tier
2. **Simplicity First**: ✅ Express/Node.js on single EC2 instance working well
3. **Security**: ✅ AES-256 encryption, JWT auth, rate limiting all implemented
4. **Single Environment**: ✅ Production on AWS, local for development
5. **Infrastructure as Code**: ✅ Full Terraform configuration maintained

## Minimal AWS Architecture

### Infrastructure Components

#### Single EC2 Instance Setup
- **EC2 t4g.micro**: ARM-based, 2 vCPUs, 1GB RAM (Free tier eligible first year)
  - Hosts both Express backend and serves React frontend
  - nginx as reverse proxy and static file server
  - PM2 for Node.js process management
  - Automatic restart on failure

#### Storage
- **EBS Volume**: 20GB gp3 SSD for application and data
- **S3 Bucket**: Backup storage only (not primary data)

#### Networking
- **Elastic IP**: Static IP address for consistent access
- **Security Group**: Restrictive firewall rules (80, 443, 22 from your IP only)
- **Route 53**: Optional - use subdomain or dynamic DNS initially

#### Security & Certificates
- **Let's Encrypt**: Free SSL certificates via Certbot
- **Secrets**: Environment variables on EC2, encrypted EBS volume

### Data Storage Strategy

#### Current: Local JSON Files on EC2
```
/home/ubuntu/budget-data/
├── users/
│   ├── user1.json (encrypted with Node.js crypto)
│   └── user2.json
├── accounts.json
├── transactions/
│   └── 2025/
│       └── {month}.json
└── budgets/
    └── 2025/
        └── {month}.json
```

#### Backup Strategy
- Daily cron job to backup data to S3
- 30-day retention in S3 Standard
- Transition to Glacier after 30 days
- Local backups kept for 7 days

#### Future: PostgreSQL on Same EC2 (Optional)
- Install PostgreSQL 15 locally
- Migrate when JSON files become unwieldy
- Still fits within t4g.micro memory constraints

### Monitoring (Free Tier)
- **CloudWatch**: Basic metrics only (CPU, Network)
- **Server Logs**: Local log rotation with logrotate
- **Application Logs**: PM2 log management
- **Uptime Monitoring**: UptimeRobot (free external service)
- **Cost Alerts**: AWS Budget alert at $10/month

## Simplified CI/CD Pipeline

### Source Control Strategy
```yaml
Branching Strategy:
  main:           # Production branch (protected)
  develop:        # Development branch
  feature/*:      # Feature branches
```

### GitHub Actions Workflows

#### 1. PR Validation (Free GitHub Actions)
```yaml
# .github/workflows/test.yml
name: Run Tests
on:
  pull_request:
    branches: [main]
  push:
    branches: [develop]

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - uses: actions/setup-node@v3
        with:
          node-version: '20'
          cache: 'npm'
      
      - name: Install and test backend
        working-directory: ./backend
        run: |
          npm ci
          npm run test
          npm run build
      
      - name: Install and test frontend
        working-directory: ./frontend
        run: |
          npm ci
          npm run test
          npm run build
```

#### 2. Production Deployment (Manual)
```yaml
# .github/workflows/deploy.yml
name: Deploy to Production
on:
  workflow_dispatch:  # Manual button in GitHub UI

jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      
      - name: Build application
        run: |
          cd backend && npm ci && npm run build
          cd ../frontend && npm ci && npm run build
      
      - name: Deploy to EC2
        env:
          PRIVATE_KEY: ${{ secrets.EC2_SSH_KEY }}
          HOST: ${{ secrets.EC2_HOST }}
        run: |
          echo "$PRIVATE_KEY" > private_key.pem
          chmod 600 private_key.pem
          
          # Copy built files
          scp -i private_key.pem -r backend/dist/* ubuntu@$HOST:/home/ubuntu/app/backend/
          scp -i private_key.pem -r frontend/dist/* ubuntu@$HOST:/home/ubuntu/app/frontend/
          
          # Restart services
          ssh -i private_key.pem ubuntu@$HOST "cd /home/ubuntu/app && ./deploy.sh"
          
          rm private_key.pem
```

## Minimal Terraform Configuration

### Simple Structure
```
terraform/
├── main.tf
├── variables.tf
├── outputs.tf
└── terraform.tfvars
```

### Complete Infrastructure (main.tf)
```hcl
terraform {
  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.0"
    }
  }
  
  # Store state locally or in S3 (free tier)
  backend "s3" {
    bucket = "my-budget-app-terraform-state"
    key    = "production/terraform.tfstate"
    region = "us-east-1"
  }
}

provider "aws" {
  region = var.aws_region
}

# EC2 Instance
resource "aws_instance" "app_server" {
  ami           = "ami-0c02fb55731490381" # Amazon Linux 2023 ARM
  instance_type = "t4g.micro"             # Free tier eligible
  
  root_block_device {
    volume_type = "gp3"
    volume_size = 20
    encrypted   = true
  }
  
  security_groups = [aws_security_group.app_sg.name]
  key_name       = aws_key_pair.ssh_key.key_name
  
  user_data = <<-EOF
    #!/bin/bash
    # Install Node.js, nginx, and PM2
    yum update -y
    yum install -y nodejs nginx git
    npm install -g pm2
    
    # Setup application directory
    mkdir -p /home/ec2-user/app
    mkdir -p /home/ec2-user/budget-data
    
    # Configure nginx
    systemctl enable nginx
    systemctl start nginx
    
    # Setup PM2 to start on boot
    pm2 startup systemd -u ec2-user --hp /home/ec2-user
  EOF
  
  tags = {
    Name = "budget-app-server"
  }
}

# Elastic IP
resource "aws_eip" "app_ip" {
  instance = aws_instance.app_server.id
  
  tags = {
    Name = "budget-app-ip"
  }
}

# Security Group
resource "aws_security_group" "app_sg" {
  name        = "budget-app-security"
  description = "Security group for budget app"
  
  # HTTP
  ingress {
    from_port   = 80
    to_port     = 80
    protocol    = "tcp"
    cidr_blocks = ["0.0.0.0/0"]
  }
  
  # HTTPS
  ingress {
    from_port   = 443
    to_port     = 443
    protocol    = "tcp"
    cidr_blocks = ["0.0.0.0/0"]
  }
  
  # SSH (restrict to your IP)
  ingress {
    from_port   = 22
    to_port     = 22
    protocol    = "tcp"
    cidr_blocks = [var.admin_ip]
  }
  
  # Outbound
  egress {
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }
}

# S3 Bucket for Backups
resource "aws_s3_bucket" "backups" {
  bucket = "budget-app-backups-${random_id.bucket_suffix.hex}"
  
  lifecycle_rule {
    enabled = true
    
    transition {
      days          = 30
      storage_class = "GLACIER"
    }
    
    expiration {
      days = 365
    }
  }
  
  server_side_encryption_configuration {
    rule {
      apply_server_side_encryption_by_default {
        sse_algorithm = "AES256"
      }
    }
  }
  
  tags = {
    Name = "budget-app-backups"
  }
}

# SSH Key Pair
resource "aws_key_pair" "ssh_key" {
  key_name   = "budget-app-key"
  public_key = var.ssh_public_key
}

resource "random_id" "bucket_suffix" {
  byte_length = 4
}
```

## Security Implementation (Budget-Conscious)

### Data Protection
- **At Rest**: Node.js crypto module for local encryption
- **In Transit**: Let's Encrypt SSL certificates (free)
- **Backups**: Encrypted before S3 upload
- **Secrets**: Environment variables in `.env` file (not in repo)

### Access Control
```yaml
Simple Security:
  - SSH key authentication only (no passwords)
  - Fail2ban for brute force protection
  - UFW firewall on Ubuntu
  - nginx rate limiting
  - JWT tokens for API authentication
```

### Server Hardening
```bash
# Basic Ubuntu hardening
sudo apt update && sudo apt upgrade -y
sudo apt install -y fail2ban ufw
sudo ufw allow 22/tcp
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp
sudo ufw enable

# Disable root login
sudo sed -i 's/PermitRootLogin yes/PermitRootLogin no/' /etc/ssh/sshd_config
sudo systemctl restart ssh
```

## Deployed Infrastructure Details

### Current Production Environment
- **Instance ID**: i-05cd17258cce207a3
- **Public IP**: 67.202.9.86
- **Public DNS**: ec2-67-202-9-86.compute-1.amazonaws.com
- **S3 Backup Bucket**: budget-app-backups-f5b52f89
- **AWS Account**: 903733335979
- **Region**: us-east-1

### Services Running
- **Node.js**: v20.19.4
- **PM2**: v6.0.10 (budget-backend process)
- **nginx**: v1.18.0 (Ubuntu)
- **UFW Firewall**: Active (ports 22, 80, 443)

## Actual Monthly Costs (Production Reality)

### Current AWS Services Usage (December 2025 - In Free Tier)
```
Service              | Usage                    | Monthly Cost
---------------------|--------------------------|-------------
EC2 t4g.micro        | 24/7 usage              | $0.00 (free tier)
EBS 20GB gp3         | Root volume             | $0.00 (free tier)
Elastic IP           | Static IP when running  | $0.00
S3 Data Storage      | ~5GB for app data       | $0.12
S3 Backup            | Deployment artifacts    | $0.02
Data Transfer        | <10GB out               | $0.00 (free tier)
SSM Session Manager  | Secure access           | $0.00
CloudWatch           | Basic metrics           | $0.00
---------------------|--------------------------|-------------
Total Current        |                          | ~$0.14/month
```

### Projected After Free Tier (Year 2+)
```
Service              | Usage                    | Monthly Cost
---------------------|--------------------------|-------------
EC2 t4g.micro        | 24/7 usage              | $6.05
EBS 20GB gp3         | Root volume             | $1.60
Elastic IP           | Static IP when running  | $0.00
S3 Data Storage      | ~10GB Standard          | $0.23
S3 Backup            | 10GB artifacts          | $0.04
Data Transfer        | 10GB out                | $0.90
---------------------|--------------------------|-------------
Total Year 2+        |                          | $8.82/month
```

### Cost Optimization Achieved
- ✅ Using S3 for data storage instead of EBS volumes
- ✅ SSM Session Manager eliminates bastion host needs
- ✅ GitHub Actions for CI/CD (free for public repos)
- ✅ Let's Encrypt for SSL (free certificates)
- ✅ Successfully staying under $10/month target

## Deployment Steps

### Phase 1: AWS Setup (Day 1)
1. Create AWS account (use free tier)
2. Generate SSH key pair locally
3. Run Terraform to create EC2 instance
4. Note down Elastic IP address
5. Configure DNS (optional) or use IP directly

### Phase 2: Server Configuration (Day 2)
```bash
# SSH into server
ssh -i budget-app-key.pem ubuntu@<elastic-ip>

# Install dependencies
curl -fsSL https://rpm.nodesource.com/setup_20.x | sudo bash -
sudo yum install -y nodejs nginx git
sudo npm install -g pm2

# Setup directories
mkdir -p ~/app/{backend,frontend}
mkdir -p ~/budget-data
mkdir -p ~/backups

# Clone repository
cd ~/app
git clone https://github.com/yourusername/household-budgeting.git .

# Install and build
cd backend && npm install && npm run build
cd ../frontend && npm install && npm run build

# Configure nginx
sudo nano /etc/nginx/sites-available/budget-app
# Add nginx configuration (see below)

# Setup PM2
pm2 start backend/dist/index.js --name budget-backend
pm2 save
pm2 startup

# Setup SSL with Let's Encrypt
sudo snap install certbot --classic
sudo certbot --nginx -d yourdomain.com
```

### Phase 3: Configure Backups (Day 3)
```bash
# Create backup script
cat > ~/backup.sh << 'EOF'
#!/bin/bash
DATE=$(date +%Y%m%d)
tar -czf ~/backups/data-$DATE.tar.gz ~/budget-data/
aws s3 cp ~/backups/data-$DATE.tar.gz s3://budget-app-backups/
find ~/backups -name "*.tar.gz" -mtime +7 -delete
EOF

chmod +x ~/backup.sh

# Add to crontab (daily at 2 AM)
crontab -e
# Add: 0 2 * * * /home/ubuntu/backup.sh
```

## nginx Configuration

```nginx
server {
    listen 80;
    server_name _;
    
    # Frontend
    location / {
        root /home/ubuntu/app/frontend/dist;
        try_files $uri $uri/ /index.html;
    }
    
    # Backend API
    location /api {
        proxy_pass http://localhost:3001;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
        
        # Rate limiting
        limit_req zone=api burst=10 nodelay;
    }
    
    # Security headers
    add_header X-Frame-Options "SAMEORIGIN" always;
    add_header X-Content-Type-Options "nosniff" always;
    add_header X-XSS-Protection "1; mode=block" always;
}

# Rate limiting configuration
limit_req_zone $binary_remote_addr zone=api:10m rate=10r/s;
```

## PM2 Ecosystem File

```javascript
// ecosystem.config.js
module.exports = {
  apps: [{
    name: 'budget-backend',
    script: './backend/dist/index.js',
    instances: 1,
    exec_mode: 'fork',
    env: {
      NODE_ENV: 'production',
      PORT: 3001,
      JWT_SECRET: process.env.JWT_SECRET,
      PLAID_CLIENT_ID: process.env.PLAID_CLIENT_ID,
      PLAID_SECRET: process.env.PLAID_SECRET,
      DATA_DIR: '/home/ubuntu/budget-data'
    },
    error_file: '/home/ubuntu/logs/err.log',
    out_file: '/home/ubuntu/logs/out.log',
    log_date_format: 'YYYY-MM-DD HH:mm:ss',
    max_memory_restart: '500M'
  }]
};
```

## Monitoring Strategy

### Free Monitoring Tools
1. **UptimeRobot**: Free uptime monitoring (50 monitors)
2. **PM2 Monitoring**: Built-in process monitoring
3. **CloudWatch Free Tier**: Basic EC2 metrics
4. **GitHub Actions**: Build status notifications

### Simple Health Check
```javascript
// backend/src/routes/health.ts
app.get('/health', (req, res) => {
  res.json({
    status: 'healthy',
    uptime: process.uptime(),
    memory: process.memoryUsage(),
    timestamp: new Date().toISOString()
  });
});
```

## Development Workflow

### Local Development
```bash
# Start local backend
cd backend
npm run dev

# Start local frontend  
cd frontend
npm run dev

# Test with production-like data
cp ~/budget-data-backup/* ./backend/data/
```

### Deployment Process
1. Work on feature branch
2. Test locally thoroughly
3. Open PR to main branch
4. GitHub Actions runs tests
5. Merge to main after review
6. Manually trigger deployment workflow
7. Monitor application logs via PM2

## Simple Security Checklist

### Before Going Live
- [x] Change default JWT secret
- [x] Configure firewall (ufw)
- [x] Disable SSH password login
- [x] Install fail2ban
- [x] Setup SSL certificates
- [x] Enable nginx rate limiting
- [x] Backup script configured
- [x] Environment variables secured
- [x] GitHub secrets configured
- [x] Branch protection enabled

## GitHub Repository Setup

### Required Secrets
```yaml
EC2_SSH_KEY: Your private SSH key
EC2_HOST: Elastic IP address
PLAID_CLIENT_ID: Plaid credentials
PLAID_SECRET: Plaid secret key
JWT_SECRET: Strong random string
```

### Branch Protection Rules
- Require PR reviews before merging to main
- Require status checks to pass
- Dismiss stale PR approvals
- No force pushes allowed

## Recommended Next Steps

### Week 1: Infrastructure
1. Create AWS account (free tier)
2. Generate SSH keys
3. Run Terraform to provision EC2
4. Configure GitHub repository
5. Setup GitHub Actions workflows

### Week 2: Deployment
1. Deploy application to EC2
2. Configure nginx and PM2
3. Setup SSL with Let's Encrypt
4. Test Plaid integration
5. Configure backups

### Month 1: Stabilization
1. Monitor costs (should be $0 in free tier)
2. Test backup restoration
3. Document any issues
4. Optimize performance if needed
5. Consider custom domain

### Future Enhancements (Optional)
1. Add CloudWatch detailed monitoring ($3/month)
2. Implement AWS Backup ($1/month)
3. Use Route 53 for DNS ($0.50/month)
4. Add WAF basic rules ($5/month)
5. Migrate to RDS PostgreSQL ($15/month)

## Deployment Architecture Lessons Learned

### Critical Success Factors Discovered
1. **Directory Structure Preservation** - Deployment scripts must maintain exact build output structure
2. **PM2 Working Directory** - Explicit `cwd` configuration required for environment variable loading
3. **Direct SSH Access** - Valuable for rapid debugging despite SSM being primary deployment method
4. **Validation Automation** - Post-deployment checks prevent silent failures

### Architectural Decisions Based on Experience
1. **Prefer Explicit Configuration** - Never rely on implicit behavior (PM2, paths, environment)
2. **Maintain Structure Consistency** - Source → Build → Deploy should preserve hierarchies
3. **Centralize Configuration** - Single source of truth for PM2 (ecosystem.config.js)
4. **Automate Validation** - Every deployment should self-verify

### Recommended Architecture Evolution
**Phase 1 (Current)**: EC2 + PM2 + Manual Validation
**Phase 2 (Q1 2026)**: Docker + Automated Validation + Smoke Tests  
**Phase 3 (Q2 2026)**: Container Orchestration + Blue-Green Deployment
**Phase 4 (Future)**: Kubernetes/ECS if scaling beyond 2 users

## Architecture Decision Records

### ADR-001: EC2 vs Serverless
**Decision**: Use EC2 t4g.micro for simplicity
**Rationale**: Familiar Express setup, easy local/prod parity, minimal cost

### ADR-002: Database Choice
**Decision**: Start with JSON files, migrate to PostgreSQL if needed
**Rationale**: Simple for 2 users, easy backup, no additional cost

### ADR-003: Monitoring Strategy
**Decision**: Use free tools (UptimeRobot, PM2, CloudWatch basic)
**Rationale**: Sufficient for 2 users, zero additional cost

### ADR-004: CI/CD Approach
**Decision**: GitHub Actions with manual deploy trigger
**Rationale**: Free, simple, sufficient control for personal project

## Risk Assessment

### Low Risk Areas
- **User Load**: Only 2 users, minimal traffic
- **Data Volume**: ~200 transactions/month easily handled
- **Complexity**: Simple architecture, easy to troubleshoot

### Areas to Watch
- **Security**: Keep server updated, monitor SSH logs
- **Backups**: Test restoration monthly
- **Costs**: Monitor AWS billing, set $10 budget alert
- **Plaid API**: Stay within free tier limits

## Cost Breakdown Summary

### Year 1 (Free Tier)
- **Total Cost**: $0/month

### Year 2+ 
- **Total Cost**: ~$8.61/month
  - EC2 t4g.micro: $6.05
  - 20GB EBS: $1.60
  - S3 backups: $0.06
  - Data transfer: $0.90

### Optional Add-ons
- Custom domain: $12/year
- Better monitoring: $3-5/month
- PostgreSQL RDS: $15/month
- Additional backup: $1-2/month

## Next Steps & Recommendations (December 2025)

### Immediate Priorities (Application Features)
Based on current implementation status and user value:

1. **Savings Categories with Rollover** (High Priority)
   - Implement special category type for savings goals
   - Carry forward unused budget to next month
   - Track progress toward savings targets
   - Estimated effort: 2-3 days

2. **Bill Reminders & Recurring Transactions** (High Priority)
   - Add recurring transaction templates
   - Email/notification system for upcoming bills
   - Auto-categorization for recurring items
   - Estimated effort: 3-4 days

3. **Enhanced Reporting** (Medium Priority)
   - Year-over-year comparisons
   - Custom date range reports
   - Export to CSV/PDF functionality
   - More visualization options
   - Estimated effort: 2-3 days

### Infrastructure Optimizations (Low Priority - System is Stable)

1. **Monitoring Enhancements**
   - Add UptimeRobot for external monitoring (free)
   - Configure CloudWatch alarms for critical metrics
   - Set up log aggregation with CloudWatch Logs

2. **Backup Improvements**
   - Implement point-in-time recovery capability
   - Add cross-region backup replication
   - Create restore testing automation

3. **Performance Optimizations**
   - Consider Redis for session management
   - Implement API response caching
   - Add CDN for static assets (CloudFront)

### Technical Debt (Address As Needed)

1. **TypeScript Cleanup**
   - Remove remaining `any` types in frontend
   - Add stricter type checking for API responses
   - Improve error type definitions

2. **Test Coverage**
   - Add more integration tests for critical paths
   - Implement E2E testing with Playwright
   - Add performance benchmarks

3. **Documentation**
   - Create user guide for the application
   - Document API endpoints with OpenAPI/Swagger
   - Add inline code documentation

## Conclusion

This architecture has proven successful in production since September 2025. The implementation exceeded the original plan in several ways:

### Achievements
- **Cost**: Currently ~$0.14/month (well under $10 target)
- **Reliability**: Zero downtime deployments via SSM and GitHub Actions
- **Security**: Comprehensive security with S3 encryption, JWT auth, rate limiting
- **Performance**: Handles 800+ transactions smoothly with pagination
- **User Experience**: Professional UI with dark theme, responsive design

### Key Learnings
- S3 as primary storage was the right choice over EC2 filesystem
- SSM deployment is superior to SSH for security and auditability
- GitHub Actions Variables improve configuration management
- User-specific data models from the start prevent migration issues
- Integration tests with real Plaid sandbox are more valuable than mocks

The architecture successfully balances simplicity, cost-effectiveness, and professional features, making it an excellent foundation for continued development of this personal budgeting application.