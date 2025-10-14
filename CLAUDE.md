# Personal Budgeting App Development Guide

## Project Overview
Building a personal budgeting app for 2 users with Plaid integration. Using Risk-Based Testing with TypeScript strict mode for rapid, type-safe development.

## 📚 Documentation Index for AI Agents

### Quick Navigation Map
| Document | Purpose | When to Use |
|----------|---------|-------------|
| **[AI-APPLICATION-ARCHITECTURE.md](docs/AI-APPLICATION-ARCHITECTURE.md)** | Technical implementation guide | Adding features, understanding service patterns, modifying APIs |
| **[AI-DEPLOYMENTS.md](docs/AI-DEPLOYMENTS.md)** | Operational procedures | Deploying code, troubleshooting production, configuring CI/CD |
| **[AI-Architecture-Plan.md](docs/AI-Architecture-Plan.md)** | Strategic planning & costs | Analyzing infrastructure costs, reviewing architecture decisions |
| **[AI-TESTING-STRATEGY.md](docs/AI-TESTING-STRATEGY.md)** | Test philosophy & examples | Writing tests, understanding test patterns, debugging test failures |
| **[AI-USER-STORIES.md](docs/AI-USER-STORIES.md)** | Product requirements | Understanding features, acceptance criteria, user scenarios |
| **[TECHNICAL_DEBT.md](TECHNICAL_DEBT.md)** | Technical debt tracking | Reviewing known issues, planning improvements, understanding workarounds |

### Document Contents Overview

#### Technical Architecture
**[docs/AI-APPLICATION-ARCHITECTURE.md](docs/AI-APPLICATION-ARCHITECTURE.md)** - Core technical guide
- Service architecture (singleton patterns, JWT handling)
- API structure and patterns
- Data flow and storage patterns
- Frontend component organization
- Common modification tasks with examples

#### Deployment and Operations
**[docs/AI-DEPLOYMENTS.md](docs/AI-DEPLOYMENTS.md)** - Operational playbook
- GitHub Actions CI/CD configuration
- AWS infrastructure management via SSM
- Environment variable setup
- Troubleshooting production issues
- Monitoring and logging

**[docs/AWS-LOCAL-SETUP.md](docs/AWS-LOCAL-SETUP.md)** - Local development with production data
- AWS credentials setup for developers
- Production data sync utilities
- Security best practices for handling production data
- Troubleshooting AWS authentication issues

**[docs/AI-Architecture-Plan.md](docs/AI-Architecture-Plan.md)** - Strategic planning
- Cost analysis and projections ($10/month target)
- Architecture Decision Records (ADRs)
- Risk assessment framework
- Terraform infrastructure code
- Deployment milestones and timeline

#### Testing Strategy
**[docs/AI-TESTING-STRATEGY.md](docs/AI-TESTING-STRATEGY.md)** - Test guidance
- Risk-based testing philosophy
- Integration > unit test approach
- Real code examples from the codebase
- Anti-patterns and lessons learned
- Test troubleshooting guide

**[docs/AI-USER-STORIES.md](docs/AI-USER-STORIES.md)** - Product requirements
- Complete user story specifications
- Acceptance criteria for each feature
- UI/UX requirements
- Test scenarios and edge cases

## 🔧 Common AI Agent Tasks - Quick Reference

### Adding New Features
| Task | Instructions | Reference |
|------|-------------|-----------|
| **Add API endpoint** | 1. Create route in `backend/src/routes/`<br>2. Add service method in `backend/src/services/`<br>3. Update API client in `frontend/src/lib/api.ts` | [Architecture Guide](docs/AI-APPLICATION-ARCHITECTURE.md#to-add-a-new-api-endpoint) |
| **Add React page** | 1. Create component in `frontend/src/pages/`<br>2. Add route in `frontend/src/App.tsx`<br>3. Update navigation if needed | [Architecture Guide](docs/AI-APPLICATION-ARCHITECTURE.md#to-add-a-new-page) |
| **Add database model** | 1. Create interface in `backend/src/types/`<br>2. Add service in `backend/src/services/`<br>3. Use StorageService for persistence | [Architecture Guide](docs/AI-APPLICATION-ARCHITECTURE.md#service-architecture) |

### Deployment Tasks
| Task | Command/Action | Reference |
|------|---------------|-----------|
| **Release and deploy** | GitHub Actions → "Release and Deploy to Production" workflow | [Deployment Guide](docs/AI-DEPLOYMENTS.md#integrated-release-and-deployment-recommended) |
| **Deploy only (no release)** | GitHub Actions → "Deploy to Production" workflow | [Deployment Guide](docs/AI-DEPLOYMENTS.md#legacy-deployment-without-release) |
| **Manual deployment** | Run `./scripts/deploy-server.sh` from project root | [Deployment Guide](docs/AI-DEPLOYMENTS.md#manual-deployment) |
| **Check deployment logs** | AWS SSM Session Manager or CloudWatch | [Deployment Guide](docs/AI-DEPLOYMENTS.md#monitoring-and-logs) |
| **Update environment vars** | GitHub Settings → Secrets/Variables → Actions | [Deployment Guide](docs/AI-DEPLOYMENTS.md#deployment-configuration) |

### Testing Tasks
| Task | Command | Reference |
|------|---------|-----------|
| **Run all tests** | `npm test` in backend or frontend directory | [Testing Guide](docs/AI-TESTING-STRATEGY.md#running-tests) |
| **Run specific test** | `npm test -- path/to/test.spec.ts` | [Testing Guide](docs/AI-TESTING-STRATEGY.md#running-tests) |
| **Add integration test** | Create in `backend/src/__tests__/integration/` | [Testing Guide](docs/AI-TESTING-STRATEGY.md#integration-test-examples) |
| **Debug test failures** | Check for auth tokens, async issues, mock problems | [Testing Guide](docs/AI-TESTING-STRATEGY.md#troubleshooting-test-failures) |

### Common Debugging
| Issue | Solution | Reference |
|-------|----------|-----------|
| **Plaid connection errors** | Check PLAID_PRODUCTS doesn't include "accounts" | [Architecture Guide](docs/AI-APPLICATION-ARCHITECTURE.md#common-plaid-issues) |
| **Auth failures** | Verify JWT_SECRET is set, check token expiration | [Architecture Guide](docs/AI-APPLICATION-ARCHITECTURE.md#authentication-flow) |
| **S3 storage issues** | Verify STORAGE_TYPE=s3 and bucket permissions | [Deployment Guide](docs/AI-DEPLOYMENTS.md#storage-configuration) |
| **Budget calculation inconsistencies** | Use shared utilities from `shared/utils/budgetCalculations.ts` instead of duplicate logic | [Architecture Guide](docs/AI-APPLICATION-ARCHITECTURE.md#budget-calculation-utilities) |
| **TypeScript errors** | Never use `any`, use `unknown` with type guards | See TypeScript section below |

### File Locations Quick Reference
```
backend/
├── src/
│   ├── routes/        # API endpoints
│   ├── services/      # Business logic (singletons)
│   ├── middleware/    # Auth, error handling
│   ├── types/         # TypeScript interfaces
│   └── __tests__/     # Backend tests
frontend/
├── src/
│   ├── pages/         # Route components
│   ├── components/    # Reusable UI components
│   ├── lib/api.ts     # API client
│   └── hooks/         # React hooks
docs/
├── AI-*.md            # AI agent documentation
terraform/             # Infrastructure as code
scripts/               # Deployment scripts
```

## Development Philosophy

### Core Principles
1. **Risk-Based Testing** - Test what could break the business or lose user money
2. **TypeScript Strict Mode** - Zero `any` types, full type safety
3. **Integration > Unit Tests** - Test real behavior with sandbox environments
4. **Spike and Stabilize** - Build features fast, add tests for bugs/complexity

### Testing Strategy
- **Critical Path Testing**: Authentication, financial calculations, data integrity
- **Sandbox Integration Tests**: Real Plaid API, not mocks
- **Manual Test Checklists**: UI flows, exploratory testing
- **Test on Demand**: Add tests when you find bugs or complex logic

### TypeScript Configuration
```json
{
  "compilerOptions": {
    "strict": true,
    "noImplicitAny": true,
    "strictNullChecks": true,
    "strictFunctionTypes": true,
    "strictBindCallApply": true,
    "strictPropertyInitialization": true,
    "noImplicitThis": true,
    "alwaysStrict": true,
    "noUnusedLocals": true,
    "noUnusedParameters": true,
    "noImplicitReturns": true,
    "noFallthroughCasesInSwitch": true
  }
}
```

## MVP User Stories

### 1. Authentication System
**User Story**: As a user, I can log in with username/password to access the budgeting app
- ✅ User can register with 15+ character passphrase
- ✅ JWT authentication with rate limiting
- ✅ Account lockout after failed attempts
- ✅ Password reset flow with secure token delivery via server logs

### 2. Plaid Account Linking  
**User Story**: As a user, I can connect my Bank of America and Capital One accounts
- ✅ Plaid Link integration
- ✅ Account connection and disconnection
- ✅ Encrypted token storage

### 3. Transaction Management
**User Story**: As a user, I can sync and view my transactions from connected accounts
- ✅ Automatic transaction sync with pagination
- ✅ Transaction categorization and tagging
- ✅ Transaction splitting support

### 4. Budget Categories
**User Story**: As a user, I can create and manage budget categories
- ✅ Two-level hierarchy (Category → Subcategory)
- ✅ Plaid PFC integration with 121 default categories
- ✅ Automatic transaction categorization using Plaid taxonomy
- ✅ Custom categories with SNAKE_CASE ID generation
- ✅ Category descriptions for better understanding
- ✅ Rollover categories for budget carryover

### 5. Monthly Budgeting
**User Story**: As a user, I can set monthly budgets and track spending
- ✅ Budget vs actual comparison
- ✅ Copy budgets from previous month
- ✅ Variance tracking

### 6. Reporting & Trends
**User Story**: As a user, I can view spending trends and reports
- ✅ Category spending trends
- ✅ Income vs expense analysis
- ✅ Budget performance reports
- ✅ Income category dashboards with drill-down
- ✅ Toggle between income and expense views

## Development Status

### ✅ Completed Features (September 2025)
1. **Backend Infrastructure**: JWT auth, Plaid integration, service architecture
2. **Frontend Foundation**: React + Mantine UI, responsive design
3. **Account Management**: Connect, sync, and disconnect bank accounts
4. **Transaction Sync**: Full pagination, 730-day history request
5. **Budget Tracking**: Monthly budgets with comparison views and yearly grid view
6. **Security**: AES-256 encryption, rate limiting, passphrase auth
7. **Income Analytics**: Category dashboards with income/expense toggle views
8. **Admin Panel**: Data migration tools, system monitoring, batch operations
9. **Yearly Budget Grid**: Comprehensive yearly budget planning with inline editing and auto-save

### 🚧 Next Priorities
1. **Rollover categories for budget carryover**
2. **Bill reminders and recurring transactions**
3. **Enhanced reporting and visualizations**
4. **Mobile app development**

## Security Best Practices

**CRITICAL: This application handles sensitive financial data. Security must be the top priority.**

### Core Security Requirements
1. **Data Protection**: AES-256 encryption at rest, TLS 1.3+ in transit
2. **Authentication**: JWT with expiration, rate limiting, account lockout
3. **Input Validation**: Zod schemas, parameterized queries, XSS prevention
4. **Compliance**: PCI DSS guidelines, GDPR/CCPA privacy requirements
5. **Incident Response**: 24-hour breach notification, audit logging

### Security Documentation
- **Information Security Policy:** docs/information-security/info_security_policy.md
- **Incident Response Plan:** docs/information-security/incident_response_plan.md
- **Risk Assessment:** docs/information-security/risk_assessment_template.md
- **Security Review Log:** docs/information-security/security_review_log.md

## Key Implementation Guidelines

### TypeScript Best Practices
- **NO `any` TYPES** - Use `unknown`, generics, or proper types
- **Strict null checks** - Handle `undefined` and `null` explicitly
- **Type all function parameters and returns**
- **Create domain types** for business entities
- **Use discriminated unions** for complex state
- **Use shared calculation utilities** - Always use functions from `shared/utils/` instead of duplicating logic

### Type-Safe Error Handling
```typescript
// Good: Type-safe result pattern
type Result<T, E = Error> = 
  | { success: true; data: T }
  | { success: false; error: E };

// Bad: Using any
function processData(data: any) { } // ❌ Never do this

// Good: Using unknown with guards
function processData(data: unknown) {
  if (isValidData(data)) { /* ... */ }
}
```

## Git Commit Conventions

### Conventional Commits Format
```
<type>[optional scope]: <description>

[optional body]

[optional footer(s)]
```

### Commit Types
- **feat**: New feature or functionality (triggers MINOR version bump)
- **fix**: Bug fix (triggers PATCH version bump)
- **docs**: Documentation changes only
- **style**: Code style changes
- **refactor**: Code refactoring
- **test**: Adding or updating tests
- **chore**: Maintenance tasks
- **perf**: Performance improvements
- **build**: Build system or dependency changes
- **ci**: CI/CD configuration changes

### Breaking Changes
To indicate a breaking change (triggers MAJOR version bump):
- Add `!` after type: `feat!: replace auth system`
- OR add `BREAKING CHANGE:` in the footer

### Examples
```bash
feat(auth): add JWT token generation for user login
fix(transaction): correct date parsing for Plaid transactions
feat!: migrate from REST to GraphQL API
test(auth): add tests for password validation
docs: update README with setup instructions
refactor(budget): simplify monthly calculation logic
```

📚 **For detailed commit guidelines and examples, see [CONTRIBUTING.md](CONTRIBUTING.md)**

## Getting Started

### Prerequisites
- Node.js 20+
- npm or yarn
- Plaid sandbox account (free at https://dashboard.plaid.com/signup)

### Initial Setup
```bash
# Clone the repository
git clone <repository-url>
cd household-budgeting

# Install dependencies
cd backend && npm install
cd ../frontend && npm install

# Set up environment variables
cp .env.example .env
# Edit .env with your Plaid credentials
```

### Development Commands
```bash
# Start backend in watch mode
cd backend && npm run dev

# Start frontend in development mode  
cd frontend && npm run dev

# Run tests
npm run test

# Build for production
npm run build
```

### Development Server Management

**IMPORTANT**: Development servers are often already running. Before starting servers:
1. Check if they're running: `npm run dev:check`
2. If running, skip startup commands
3. If needed to restart: `npm run dev:restart` (stops then starts)

Frontend runs on: http://localhost:3000
Backend runs on: http://localhost:3001

### Required Environment Variables
```bash
# Backend (.env)
NODE_ENV=development
PORT=3001

# Plaid Configuration
PLAID_CLIENT_ID=your_sandbox_client_id
PLAID_SECRET=your_sandbox_secret  
PLAID_ENV=sandbox
PLAID_PRODUCTS=transactions  # Note: Don't include "accounts" - it's automatic
PLAID_COUNTRY_CODES=US

# Security
JWT_SECRET=your_development_jwt_secret
JWT_EXPIRES_IN=7d
ENCRYPTION_KEY=32_byte_hex_string

# Storage
DATA_DIR=./data
STORAGE_TYPE=filesystem  # Use 's3' for production (see docs/AI-DEPLOYMENTS.md)
# S3_BUCKET_NAME=your-bucket  # Required if STORAGE_TYPE=s3
# S3_PREFIX=data/  # Optional S3 prefix
# AWS_REGION=us-east-1  # Required for S3
```

### Common Plaid Issues
- **"invalid product names: [accounts]"**: Remove "accounts" from PLAID_PRODUCTS - it's included automatically with "transactions"
- **Phone validation in Plaid Link**: Always enter with country code: `+15551234567` (no spaces/dashes)
- **"client_id must be properly formatted"**: Ensure you have actual Plaid credentials, not placeholder values

## Success Metrics
- ✅ **Zero runtime type errors** - TypeScript catches all
- ✅ **Critical paths tested** - Auth, money, data integrity
- ✅ **Fast feedback loops** - Direct testing > mocking
- ✅ **No `any` types** in production code
- ✅ **Sandbox integration working** end-to-end
- ✅ **Professional UI** - Mantine component library with dark theme
- ✅ **Responsive design** - Mobile-friendly with collapsible sidebar

## Development Workflow Recommendations

### For AI Agents
1. **Start Here**: Review this file for project philosophy and guidelines
2. **Technical Details**: Consult `docs/AI-APPLICATION-ARCHITECTURE.md` for implementation
3. **Security First**: Always consider security implications
4. **Type Safety**: Never use `any` types
5. **Test Critical Paths**: Focus on auth, money, and data integrity

### Versioning & Release Workflow
1. **Daily Development**: Use conventional commits on main branch
2. **Automatic Changelog**: Push to GitHub triggers changelog updates
3. **Check Pending Changes**: Visit `/version` endpoint or review CHANGELOG.md
4. **Create Release**: Run `npm run release:prepare` when ready for new version
5. **Deploy with Version**: GitHub Actions includes version in deployments

Current Version: **1.0.0-alpha.1** (Check `/health` or `/version` endpoints for latest)

### Risk-Based Development
- **Spike features quickly** with minimal tests
- **Add tests when you find bugs**
- **Refactor with confidence** when types guide you
- **Integration test** critical financial flows
- **Skip trivial tests** like getters/setters

## 🤖 AI Agent Directives

### CRITICAL RULES - Never Violate These
1. **NEVER use `any` types** - Use `unknown`, generics, or proper types instead
2. **NEVER commit secrets** - All sensitive data must use environment variables
3. **NEVER skip security validation** - Always validate inputs, sanitize outputs
4. **NEVER modify production directly** - All changes go through GitHub → CI/CD
5. **NEVER ignore TypeScript errors** - Fix them properly, don't suppress

### Standard Operating Procedures

#### When Starting a Task
1. **Review relevant documentation** - Check the documentation index above
2. **Understand existing patterns** - Look at similar code before implementing
3. **Check for existing utilities** - Don't reinvent what already exists
4. **Verify dependencies** - Ensure libraries are installed before using them

#### When Modifying Code
1. **Preserve existing patterns** - Match the style of surrounding code
2. **Update types first** - Change TypeScript interfaces before implementation
3. **Test critical paths** - Ensure auth, money, and data operations work
4. **Handle errors properly** - Use Result pattern or proper try/catch blocks

#### When Debugging Issues
1. **Check the obvious first** - Environment variables, configuration, permissions
2. **Read error messages carefully** - They often contain the solution
3. **Consult troubleshooting guides** - See deployment and architecture docs
4. **Test in isolation** - Narrow down the problem to specific components

#### When Deploying
1. **Test locally first** - Ensure `npm run build` succeeds
2. **Check GitHub Actions** - Verify CI/CD pipeline configuration
3. **Monitor deployment** - Watch logs during and after deployment
4. **Verify health checks** - Ensure application is responding correctly

#### When Working with Development Servers
1. **Check first** - Always verify if servers are running with `npm run dev:check`
2. **Don't duplicate** - Never start servers that are already running
3. **Use existing** - Connect to running servers instead of starting new ones
4. **Restart if needed** - Only restart if explicitly asked or if debugging server issues

### Decision Tree for Common Scenarios

```
Need to add a feature?
├─ Is it a new API endpoint?
│  └─ See AI-APPLICATION-ARCHITECTURE.md → "To Add a New API Endpoint"
├─ Is it a new UI page?
│  └─ See AI-APPLICATION-ARCHITECTURE.md → "To Add a New Page"
├─ Is it a data model change?
│  └─ Update types/ → services/ → ensure backward compatibility
└─ Is it a third-party integration?
   └─ Check existing patterns (e.g., Plaid integration)

Having issues?
├─ TypeScript errors?
│  └─ Never use `any` - fix types properly
├─ Test failures?
│  └─ See AI-TESTING-STRATEGY.md → "Troubleshooting Test Failures"
├─ Deployment problems?
│  └─ See AI-DEPLOYMENTS.md → "Troubleshooting"
└─ Plaid/API issues?
   └─ See AI-APPLICATION-ARCHITECTURE.md → "Common Issues"
```

## Quick References

### Critical Files
- **Architecture Guide**: `docs/AI-APPLICATION-ARCHITECTURE.md`
- **Deployment Guide**: `docs/AI-DEPLOYMENTS.md`
- **Auth Service**: `backend/src/services/authService.ts`
- **Account Management**: `backend/src/services/accountService.ts`
- **Frontend Entry**: `frontend/src/App.tsx`
- **API Client**: `frontend/src/lib/api.ts`

### Testing
- **Backend Tests**: `backend/src/__tests__/`
- **Run Tests**: `npm test`
- **Coverage**: `npm run test:coverage`

### Common Tasks
- **Add new API endpoint**: See architecture guide section "To Add a New API Endpoint"
- **Create new page**: See architecture guide section "To Add a New Page"
- **Debug Plaid issues**: Check troubleshooting in architecture guide
- **Handle auth errors**: Review JWT middleware patterns
- **Financial calculations**: Always use shared utilities from `shared/utils/transactionCalculations.ts` to exclude transfers and `shared/utils/budgetCalculations.ts` for budget calculations
- **Create a release**: Run `npm run release:prepare` and follow prompts
- **Check version**: Visit `/version` endpoint or run `curl localhost:3001/version`
- **Password reset recovery**: If locked out, request reset and check server logs: `pm2 logs budget-backend | grep "RESET TOKEN"`
- **⚠️ Category Migration**: Before deploying Plaid PFC changes, delete existing category data: `rm backend/data/categories_*.json`
- **Production data debugging**: Sync production data locally: `npm run sync:production:dry-run` (preview) or `npm run sync:production` (actual sync)
- **Local data backup**: Create backup before sync: `npm run backup:local`, restore with: `npm run backup:restore`

## Deployment

For comprehensive deployment guidance including infrastructure, CI/CD configuration, troubleshooting, and production operations, see **[docs/AI-DEPLOYMENTS.md](docs/AI-DEPLOYMENTS.md)**.

### Production Server Access
For direct investigation and debugging, SSH access is available:
```bash
# Connect to server
ssh -i ~/.ssh/budget-app-key ubuntu@budget.jaredcarrano.com

# Switch to application user
sudo -u appuser bash

# Key locations
# App directory: /home/appuser/app
# Backend: /home/appuser/app/backend
# Frontend: /home/appuser/app/frontend
# PM2 logs: pm2 logs budget-backend
# PM2 status: pm2 status
```

#### Quick Deployment Validation
After deployment, run these checks to verify everything is correct:
```bash
# One-line validation (run as appuser)
cd /home/appuser/app && \
test -d backend/dist && echo "✅ dist/" || echo "❌ dist/" && \
test -f backend/dist/index.js && echo "✅ index.js" || echo "❌ index.js" && \
test -f backend/.env && echo "✅ .env" || echo "❌ .env" && \
test -f ecosystem.config.js && echo "✅ PM2 config" || echo "❌ PM2 config" && \
pm2 status | grep -q budget-backend && echo "✅ PM2 running" || echo "❌ PM2 not running" && \
curl -s http://localhost:3001/health | grep -q "ok" && echo "✅ Health OK" || echo "❌ Health FAIL"
```

#### Common Troubleshooting Commands
```bash
# Check PM2 logs for errors
pm2 logs budget-backend --lines 50

# Restart application
pm2 restart budget-backend

# Check environment variables are loaded
pm2 env budget-backend | grep -E "(JWT|PLAID|NODE_ENV)"

# Test API directly
curl -s http://localhost:3001/health | jq '.'

# Check disk space
df -h /home/appuser

# Clean up old PM2 logs
pm2 flush
```

**Note**: Use this for debugging production issues when AWS SSM is not sufficient. The application runs as `appuser` and is managed by PM2.

## Notes for Future Development

### Lessons Learned
- Integration tests with real Plaid sandbox > heavily mocked unit tests
- Service singletons prevent auth token inconsistencies
- Mantine provides better out-of-box experience than Tailwind for dashboards
- Conditional rendering prevents Plaid Link duplicate script errors
- Return JWT token on registration for auto-login UX
- Method binding in API client prevents context loss
- Use GitHub Variables for non-sensitive config to improve maintainability
- StorageFactory should have single source of truth for config (ENV vars)
- Categories must be user-specific from the start - no global categories
- Transaction removal logic must only check accounts being synced
- Performance issues with 800+ items require pagination (50 per page works well)
- React Query staleTime vs gcTime: staleTime keeps data fresh, gcTime keeps in cache
- TypeScript rootDir issues when importing from outside src/ - use postbuild script to flatten dist

## 📋 Living Documentation

### 🚨 Current Known Issues
Track active problems that AI agents should be aware of when working on the codebase.

| Issue | Impact | Workaround | Priority |
|-------|--------|------------|----------|
| Frontend TypeScript errors | Build warnings | Fix types as encountered | Medium |
| Some components use `any` type | Type safety compromised | Replace with proper types | High |
| Expired Plaid token recovery | User must manually reconnect | Implement refresh mechanism | Medium |
| Performance with 800+ transactions | Slow page load | Pagination implemented (50/page) | Resolved ✅ |

### 📝 Recent Architecture Decisions
Track important decisions that affect how the codebase should be modified.

| Date | Decision | Rationale | Impact |
|------|----------|-----------|--------|
| 2025-09 | Shared transaction calculation utilities | Consistent transfer exclusion across app | Created shared/utils/transactionCalculations.ts for all financial calculations |
| 2025-09 | Field migration pattern with Admin UI | Safe data migrations with user control | Direct dataService access with destructuring for clean field removal |
| 2025-09 | Rename "savings" to "rollover" | Avoid confusion with future savings features | Updated all references from isSavings to isRollover across codebase |
| 2025-09 | Generalized CSV import framework | Support multiple CSV import types beyond categories | Created extensible BaseCSVParser system with ImportService for future transaction/mapping imports |
| 2025-01 | SNAKE_CASE category IDs with Plaid PFC | Direct mapping eliminates complexity | **BREAKING**: Must delete existing category data before deployment |
| 2024-12 | User-specific categories | Multi-user support requirement | All categories now have userId field |
| 2024-11 | Pagination for transactions | Performance issues with large datasets | 50 items per page default |
| 2024-10 | Service singletons | Prevent auth token inconsistencies | All services use getInstance() pattern |
| 2024-09 | S3 for production storage | Filesystem not reliable on EC2 | StorageService abstracts storage backend |
| 2024-09 | Mantine UI over Tailwind | Faster development with pre-built components | Consistent dark theme UI |

### 🔄 Pending Architectural Changes
Planned changes that haven't been implemented yet.

| Change | Reason | Target Date | Notes |
|--------|--------|-------------|-------|
| Add transaction caching | Reduce API calls | TBD | Use React Query or similar |
| Implement webhook support | Real-time transaction updates | TBD | Plaid webhooks for sync |
| Add data export feature | User data portability | TBD | CSV/JSON export options |
| Mobile app development | Better user experience | TBD | React Native likely choice |

### Technical Debt
**For comprehensive technical debt tracking, see [TECHNICAL_DEBT.md](TECHNICAL_DEBT.md)**

Quick summary of high-priority items:
- Reports page makes excessive parallel API requests (mitigated with nginx rate limit increase)
- Frontend has TypeScript `any` types that need proper typing
- Some components use `any` type that need proper typing
- Test coverage could be improved for UI components
- Need better error recovery for expired Plaid tokens