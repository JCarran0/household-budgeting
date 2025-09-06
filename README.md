# Household Budgeting App

![Version](https://img.shields.io/badge/version-1.0.0--alpha.1-blue)
[![Changelog](https://img.shields.io/badge/changelog-Keep%20a%20Changelog-brightgreen)](CHANGELOG.md)

A modern personal budgeting application with bank account integration via Plaid, built with React and Node.js.

## 🚀 Production Deployment Status

**Live Application**: https://budget.jaredcarrano.com  
**Current Version**: v1.0.0-alpha.1  
**Version Info**: https://budget.jaredcarrano.com/version

The application is successfully deployed on AWS infrastructure:
- **EC2 Instance**: t4g.micro (ARM-based, Ubuntu 22.04)
- **Web Server**: nginx with reverse proxy
- **Process Manager**: PM2 with auto-restart
- **SSL**: ✅ HTTPS enabled with Let's Encrypt certificate
- **Backup**: S3 bucket configured for automated backups
- **Cost**: $0/month (AWS Free Tier Year 1), ~$8.65/month after

## 🎯 Features

### ✅ Completed Features
- **Modern Dashboard**: Professional UI with Mantine component library
- **Secure Authentication**: JWT-based auth with bcrypt password hashing
- **Bank Integration**: Connect bank accounts via Plaid (sandbox mode)
- **Account Management**: View and sync connected bank accounts
- **Transaction Management**: 
  - Automatic transaction import from connected accounts
  - Advanced filtering (date range, amount, categories, tags, search)
  - Transaction categorization with hierarchical categories
  - Tag management for better organization
  - Transaction splitting for shared expenses
  - Visual indicators for pending, hidden, and split transactions
- **Category System**:
  - Two-level hierarchy (Parent → Subcategory)
  - Plaid category mapping
  - Default category initialization
  - Hidden categories for exclusion from budgets
- **Budget Management**:
  - Monthly budget creation and tracking
  - Budget vs actual comparison with visual progress bars
  - Copy budgets between months
  - CSV export for budget comparisons
  - Rollover support for savings categories
- **Dark Theme**: Built-in dark mode with professional styling
- **Responsive Design**: Mobile-friendly interface with collapsible sidebar
- **Real-time Updates**: Live data refresh with React Query

### 🚧 In Progress
- Reporting dashboard with spending trends
- Cash flow projections
- Category-based spending charts

### 📅 Planned Features
- Bill reminders and recurring transactions
- Multi-user household support
- Mobile app
- PostgreSQL migration from JSON storage

## 📋 What's New

See [CHANGELOG.md](CHANGELOG.md) for a detailed list of changes in each version.

**Latest Updates (v1.0.0-alpha.1)**:
- Full production deployment with CI/CD pipeline
- Comprehensive transaction management with bulk editing
- Interactive reporting with drill-down navigation
- Auto-categorization with OR logic patterns
- Semantic versioning with automated changelog

Check current version and pending changes: `curl https://budget.jaredcarrano.com/version`

## 🛠 Tech Stack

### Backend
- **Runtime**: Node.js with Express
- **Language**: TypeScript (strict mode, zero `any` types)
- **Authentication**: JWT with bcrypt
- **Banking API**: Plaid (sandbox environment)
- **Data Storage**: JSON files (MVP) → PostgreSQL (planned)
- **Testing**: Jest with 69+ tests (auth, categories, budgets)

### Frontend
- **Framework**: React 18 with TypeScript
- **Build Tool**: Vite
- **UI Library**: Mantine v8 (Component library with dark theme)
- **Icons**: Tabler Icons
- **Styling**: Mantine theme system + CSS modules
- **State Management**: Zustand with persist middleware
- **Data Fetching**: TanStack Query (React Query)
- **Routing**: React Router v6
- **Banking UI**: react-plaid-link
- **Notifications**: Mantine Notifications

## 📁 Project Structure

```
household-budgeting/
├── backend/                 # Node.js Express API
│   ├── src/
│   │   ├── __tests__/      # Jest test files
│   │   ├── routes/         # API endpoints
│   │   ├── services/       # Business logic
│   │   ├── middleware/     # Auth, error handling
│   │   └── utils/          # Helper functions
│   └── data/               # JSON data storage
├── frontend/               # React application
│   ├── src/
│   │   ├── components/     # Reusable components
│   │   ├── pages/          # Route pages
│   │   ├── providers/      # Context providers
│   │   ├── stores/         # Zustand stores
│   │   └── lib/            # API client, utilities
│   └── public/
├── shared/                 # Shared TypeScript types
│   └── types/
├── docs/                   # Documentation
└── CLAUDE.md              # AI assistant guide

```

## 🚀 Getting Started

### Prerequisites
- Node.js 20+ and npm
- Plaid sandbox account ([Sign up free](https://dashboard.plaid.com/signup))

### Installation

1. **Clone the repository**
   ```bash
   git clone <repository-url>
   cd household-budgeting
   ```

2. **Backend Setup**
   ```bash
   cd backend
   npm install
   cp .env.example .env
   # Edit .env with your Plaid credentials
   ```

3. **Frontend Setup**
   ```bash
   cd ../frontend
   npm install
   cp .env.example .env.development
   # Frontend env is optional (uses defaults)
   ```

### Environment Variables

Create `backend/.env` with:
```env
# Server
PORT=3001
NODE_ENV=development

# Plaid API (get from dashboard.plaid.com)
PLAID_CLIENT_ID=your_client_id_here
PLAID_SECRET=your_sandbox_secret_here
PLAID_ENV=sandbox

# JWT
JWT_SECRET=your-super-secret-jwt-key-change-this
JWT_EXPIRES_IN=7d

# Data
DATA_DIR=./data
```

### Running the Application

1. **Start the backend** (Terminal 1):
   ```bash
   cd backend
   npm run dev
   ```
   Backend runs on http://localhost:3001

2. **Start the frontend** (Terminal 2):
   ```bash
   cd frontend
   npm run dev
   ```
   Frontend runs on http://localhost:5173

3. **Access the app**:
   - Open http://localhost:5173
   - Register a new account
   - Connect bank accounts using Plaid Link
   - View accounts and transactions

### 🏦 Plaid Sandbox Testing

The app uses Plaid's sandbox environment for testing bank connections. No real bank credentials are needed.

#### Test Credentials
- **Username**: `user_good`
- **Password**: `pass_good`
- **Institutions**: Any sandbox institution (e.g., "Chase", "Bank of America", "Wells Fargo")

#### Phone Verification (MFA)
When prompted for phone verification in sandbox:

**Test Phone Numbers**:
- `415-555-0010` - New User (first-time connection)
- `415-555-0011` - Verified Returning User (recommended for testing)

**OTP Code**: Always use `123456`

#### Complete Testing Flow
1. Click "Connect Account" in the app
2. Select any bank (e.g., "Chase" or "Bank of America")
3. Enter credentials: `user_good` / `pass_good`
4. If prompted for phone: use `415-555-0011`
5. Enter OTP: `123456`
6. Select accounts to connect
7. Confirm connection

**Note**: Real phone numbers won't work in sandbox. You must use Plaid's test phone numbers listed above.

### Testing

**Backend Tests**:
```bash
cd backend
npm test          # Run all tests
npm run test:watch  # Watch mode
npm run test:coverage  # Coverage report
```

**Frontend Tests** (when implemented):
```bash
cd frontend
npm test
```

## 🏭 Production Management

### Infrastructure Access

```bash
# SSH to production server
ssh -i ~/.ssh/budget-app-key ubuntu@budget.jaredcarrano.com  # or ubuntu@67.202.9.86

# Check application status
sudo -u appuser pm2 status

# View application logs
sudo -u appuser pm2 logs budget-backend --lines 50

# Restart application
sudo -u appuser pm2 restart budget-backend

# Check nginx status
sudo systemctl status nginx

# View nginx error logs
sudo tail -f /var/log/nginx/error.log
```

### Deployment

The application uses GitHub Actions for automated deployment via AWS Systems Manager (SSM):

1. **Via GitHub Actions** (Recommended):
   ```bash
   # Go to GitHub repository
   # Click Actions tab
   # Select "Deploy to Production" workflow
   # Click "Run workflow"
   # Add optional deployment message
   # Click green "Run workflow" button
   ```

2. **Manual Deployment** (if needed):
   ```bash
   # Build locally
   cd backend && npm run build && cd ..
   cd frontend && npm run build && cd ..
   
   # Create deployment package
   tar -czf deployment.tar.gz \
     backend/dist backend/package*.json \
     frontend/dist
   
   # Upload to S3
   aws s3 cp deployment.tar.gz \
     s3://budget-app-backups-f5b52f89/deployments/manual-$(date +%Y%m%d-%H%M%S).tar.gz
   
   # Trigger deployment on server
   aws ssm send-command \
     --instance-ids "i-05cd17258cce207a3" \
     --document-name "AWS-RunShellScript" \
     --parameters "commands=['sudo -u appuser /home/appuser/deploy.sh s3://budget-app-backups-f5b52f89/deployments/manual-TIMESTAMP.tar.gz']" \
     --region us-east-1
   ```

**Note**: The deployment script (`/home/appuser/deploy.sh`) handles:
- Downloading the package from S3
- Creating backups of current deployment
- Installing dependencies
- Preserving environment configuration
- Zero-downtime deployment with PM2
- Health checks
- Automatic cleanup

### Terraform Infrastructure Management

```bash
# Navigate to terraform directory
cd terraform

# View current infrastructure
terraform show

# Update infrastructure
terraform plan
terraform apply

# Get outputs (IP, URLs, etc.)
terraform output

# Destroy infrastructure (WARNING!)
terraform destroy
```

### Monitoring & Health Checks

```bash
# Check application health (includes version)
curl https://budget.jaredcarrano.com/health

# Check version and unreleased changes
curl https://budget.jaredcarrano.com/version

# Check PM2 process details
sudo -u appuser pm2 describe budget-backend

# Monitor real-time logs
sudo -u appuser pm2 monit

# Check server resources
htop  # CPU and memory usage
df -h  # Disk usage
```

### Backup Management

```bash
# Manual backup
sudo -u appuser /home/appuser/backup.sh

# Check backup cron job
sudo -u appuser crontab -l

# List S3 backups
aws s3 ls s3://budget-app-backups-f5b52f89/backups/

# Restore from backup
aws s3 cp s3://budget-app-backups-f5b52f89/backups/data-YYYYMMDD.tar.gz .
tar -xzf data-YYYYMMDD.tar.gz -C /home/appuser/budget-data/
```

### SSL Certificate Management

```bash
# Certificate Status
sudo certbot certificates

# Test auto-renewal (runs twice daily via systemd timer)
sudo certbot renew --dry-run

# Manual renewal if needed
sudo certbot renew

# Check renewal timer
sudo systemctl status snap.certbot.renew.timer
```

## 🔐 Security

This application handles sensitive financial data. Security measures include:

- **Authentication**: JWT tokens with expiration
- **Password Security**: bcrypt hashing with salt rounds
- **Rate Limiting**: Prevents brute force attacks
- **Account Lockout**: After failed login attempts
- **Input Validation**: All inputs sanitized
- **CORS**: Configured for frontend origin only
- **Environment Variables**: Sensitive data never in code
- **HTTPS Required**: For production deployment

See [Security Documentation](docs/information-security/) for detailed policies.

## 📝 Development Guide

### For AI Assistants
See [CLAUDE.md](CLAUDE.md) for:
- Development philosophy and principles
- Common issues and solutions
- TypeScript best practices
- Testing strategies
- Troubleshooting guide

### Commit Convention & Versioning
We follow [Conventional Commits](https://www.conventionalcommits.org/) with Semantic Versioning:
```
feat(scope): add new feature     # Triggers MINOR version bump
fix(scope): fix bug              # Triggers PATCH version bump
feat!: breaking change           # Triggers MAJOR version bump
docs: update documentation       # No version change
test: add tests                  # No version change
chore: maintenance tasks         # No version change
```

The CHANGELOG.md is automatically updated after each push to main. See [CONTRIBUTING.md](CONTRIBUTING.md) for detailed guidelines and release process.

### Project Plan
See [PROJECT_PLAN.md](PROJECT_PLAN.md) for development phases and progress.

## ⚠️ Known Issues

### TypeScript Build Errors (Frontend)
The frontend currently has TypeScript errors that are bypassed during production build:
- **Table.Th width property**: Mantine v7 removed the `width` prop from Table.Th components
- **Tooltip width property**: Similar issue with Tooltip component
- **Date type mismatches**: Some date filters using string instead of Date type
- **Unused variables**: Minor cleanup needed in Reports.tsx

**Workaround**: Production build uses `vite build` directly, skipping TypeScript checks. These issues don't affect runtime functionality but should be fixed for proper type safety.

### Planned Fixes
1. Remove all `width` props from Mantine Table and Tooltip components
2. Fix date type conversions in MantineTransactions.tsx
3. Clean up unused variables
4. Update filterStore.ts type definitions

## 🧪 Testing Philosophy

We follow Risk-Based Testing:
- **Test Critical Paths**: Authentication, money calculations, data integrity
- **Integration > Unit Tests**: Test real behavior with sandbox APIs
- **Test on Demand**: Add tests when bugs are found
- **Manual Testing**: UI flows documented in test plans

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch
3. Follow TypeScript strict mode (no `any` types)
4. Use [Conventional Commits](https://www.conventionalcommits.org/) for version management
5. Add tests for critical paths
6. Ensure all tests pass
7. Submit a pull request

See [CONTRIBUTING.md](CONTRIBUTING.md) for detailed guidelines on:
- Commit message format
- Version bumping rules
- Release process
- Changelog management

## 📄 License

[MIT License](LICENSE) - See file for details

## 🙏 Acknowledgments

- [Plaid](https://plaid.com) for banking API
- [React](https://react.dev) and [Vite](https://vitejs.dev) teams
- [TailwindCSS](https://tailwindcss.com) for styling
- All open source contributors

## 📞 Support

For issues and questions:
- Check [CLAUDE.md](CLAUDE.md) troubleshooting guide
- Review [closed issues](../../issues?q=is%3Aissue+is%3Aclosed)
- Open a [new issue](../../issues/new)

---

Built with ❤️ for better personal finance management