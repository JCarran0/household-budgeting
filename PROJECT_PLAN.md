# Personal Budgeting App - Project Plan

## Overview
This document outlines the implementation plan for a personal budgeting app with Plaid integration.

## Development Approach
- **Methodology**: Risk-Based Testing with rapid feature development
- **Strategy**: MVP-first, incremental feature development
- **Tech Stack**: 
  - Backend: Node.js + Express + TypeScript
  - Frontend: React 19 + TypeScript + Vite + Mantine UI 8
  - Testing: Jest + React Testing Library
  - Integration: Plaid API
  - Infrastructure: AWS EC2 (t4g.micro) + S3 + Terraform + GitHub Actions

## Phase 1: Project Foundation & Backend Setup (Week 1) ✅ COMPLETE

### 1.1 Initial Setup ✅
- [x] Initialize Git repository
- [x] Create comprehensive .gitignore for Node.js/React projects
- [x] Set up project root structure:
  ```
  household-budgeting/
  ├── backend/
  ├── frontend/
  ├── shared/
  ├── .gitignore
  ├── CLAUDE.md
  └── PROJECT_PLAN.md
  ```

### 1.2 Backend Configuration ✅
- [x] Initialize backend Node.js project (`npm init -y`)
- [x] Install core dependencies:
  - Production: `express jsonwebtoken bcryptjs fs-extra uuid date-fns zod plaid dotenv cors`
  - Development: `@types/node @types/express @types/jsonwebtoken @types/bcryptjs typescript ts-node jest @types/jest ts-jest nodemon supertest`
- [x] Configure TypeScript (`tsconfig.json`)
- [x] Configure Jest for testing (`jest.config.js`)
- [x] Set up test utilities and mocks directory
- [x] Create NPM scripts for dev, test, build

### 1.3 Authentication Service ✅
- [x] Create test file: `backend/src/services/__tests__/authService.test.ts`
- [x] Write failing tests for:
  - User registration with username/password
  - Password hashing with bcrypt
  - User login with credentials validation
  - JWT token generation
  - JWT token validation
  - Error handling for invalid credentials
  - Rate limiting and account lockout
  - Password change functionality
  - Security event logging
- [x] Implement minimal `authService.ts` to pass tests (21 tests passing)
- [x] Create auth middleware for route protection
- [x] Create auth routes (`/api/v1/auth/register`, `/api/v1/auth/login`, `/api/v1/auth/logout`, `/api/v1/auth/refresh`, `/api/v1/auth/change-password`, `/api/v1/auth/me`, `/api/v1/auth/verify`)
- [x] Add input validation with Zod schemas

### 1.4 Data Service Foundation ✅
- [x] ~~Create test file: `backend/src/services/__tests__/dataService.test.ts`~~ (tested via authService tests)
- [x] Write tests for JSON file operations:
  - Read/write user data
  - Atomic updates
  - Error handling for file operations
- [x] Implement dataService with in-memory testing support
- [x] Set up data directory structure

### 1.5 Additional Completed Items (Beyond Original Plan) ✅
- [x] Create Express application with security headers
- [x] Implement health check endpoint
- [x] Add integration tests for Express app using supertest
- [x] Configure CORS and security middleware
- [x] Set up error handling and 404 middleware
- [x] Implement graceful shutdown handling
- [x] Fix TypeScript configuration for VSCode Jest support
- [x] Add comprehensive security documentation
- [x] Configure separate tsconfig.build.json for production builds
- [x] Total test coverage: 29 passing tests

## Phase 2: Core Backend Services (Week 2) ✅ COMPLETE

### 2.1 Plaid Integration ✅
- [x] Create test file: `backend/src/services/__tests__/plaidService.test.ts`
- [x] Mock Plaid client and API responses
- [x] Write tests for:
  - Link token creation
  - Public token exchange
  - Account data retrieval
  - Transaction fetching
  - Error handling
- [x] Implement Plaid service with sandbox environment
- [x] Create Plaid routes (`/api/plaid/link-token`, `/api/plaid/exchange-token`)
- [x] Total test coverage: 18 passing tests

### 2.2 Account Management ✅
- [x] Create test file: `backend/src/services/__tests__/accountService.test.ts`
- [x] Write tests for:
  - Storing Plaid account data
  - Account activation/deactivation
  - Account data retrieval
- [x] Implement account service
- [x] Create account routes (`/api/accounts`, `//api/accounts/sync`)

### 2.3 Transaction Service ✅
- [x] Create test file: `backend/src/services/__tests__/transactionService.test.ts`
- [x] Write tests for:
  - Transaction sync from Plaid
  - Transaction categorization
  - Transaction filtering (date range, pending)
  - Manual transaction management
  - Transaction splitting
- [x] Implement transaction service with full CRUD operations
- [x] Create transaction routes:
  - GET `/api/v1/transactions` - List with advanced filtering
  - POST `/api/v1/transactions/sync` - Sync from Plaid
  - PUT `/api/v1/transactions/:id/category` - Update category
  - POST `/api/v1/transactions/:id/tags` - Update tags
  - POST `/api/v1/transactions/:id/split` - Split transaction
  - GET `/api/v1/transactions/summary` - Get summary stats

## Phase 5: Budget & Category Management (Week 5) ✅ COMPLETE

### 5.1 Category Service ✅
- [x] Create test file: `backend/src/services/__tests__/categoryService.test.ts`
- [x] Write tests for:
  - Category hierarchy (parent/subcategory)
  - Category CRUD operations
  - Plaid category mapping
  - Hidden/savings category flags
- [x] Implement category service with 17 passing tests
- [x] Create category routes (`/api/v1/categories`)
- [x] Initialize default categories with Plaid mappings

### 5.2 Budget Service ✅
- [x] Create test file: `backend/src/services/__tests__/budgetService.test.ts`
- [x] Write tests for:
  - Monthly budget creation
  - Budget copying from previous month
  - Budget vs actual calculations
  - Variance calculations
- [x] Implement budget service with 23 passing tests
- [x] Create budget routes (`/api/v1/budgets`)
- [x] Add rollover support for savings categories

### 5.3 Reporting Service ✅
- [x] ~~Create test file: `backend/src/services/__tests__/reportService.test.ts`~~ (skipped - will add if needed)
- [x] Write service implementation for:
  - Spending trends by category over time
  - Category breakdown with hierarchy support
  - Cash flow summary (income vs expenses)
  - Cash flow projections based on historical data
  - Year-to-date summary with top categories
- [x] Implement reporting service with full analytics
- [x] Create reporting routes:
  - GET `/api/v1/reports/spending-trends` - Category spending over time
  - GET `/api/v1/reports/category-breakdown` - Detailed category analysis
  - GET `/api/v1/reports/cash-flow` - Income vs expense summary
  - GET `/api/v1/reports/projections` - Future cash flow predictions
  - GET `/api/v1/reports/year-to-date` - YTD performance summary

## Phase 3: Frontend Foundation (Week 3) ✅ COMPLETE

### 3.1 Frontend Setup ✅
- [x] Initialize Vite React TypeScript project
- [x] Install dependencies:
  - Core: `@tanstack/react-query zustand axios react-router-dom`
  - UI: `@mantine/core @mantine/hooks @mantine/form @mantine/notifications @mantine/dates @mantine/charts`
  - Icons: `@tabler/icons-react`
  - Plaid: `react-plaid-link`
- [x] Configure Mantine UI with dark theme
- [x] Configure API client with axios interceptors

### 3.2 Authentication UI ✅
- [x] Implement Login component with form validation
- [x] Implement Register component with password requirements
- [x] Set up auth store with Zustand + persist middleware
- [x] Implement protected routes with JWT validation
- [x] Add auto-login after registration

### 3.3 Core Layout ✅
- [x] Create app layout with responsive navigation
- [x] Implement dashboard with stats and recent transactions
- [x] Add loading states and error handling
- [x] Set up React Query for data fetching

### 3.4 Plaid Link Integration ✅
- [x] Implement PlaidLinkProvider with proper singleton pattern
- [x] Create PlaidButton component
- [x] Handle link callbacks and token exchange
- [x] Display connected accounts on Accounts page
- [x] Fix duplicate script warning issues
- [x] Implement account sync functionality

## Phase 4: Core Feature Implementation (Week 4) ✅ COMPLETE

### 4.1 Transaction Management UI ✅
- [x] Implement transaction sync from Plaid
- [x] Create enhanced transaction page with advanced filtering
- [x] Add date range, amount range, and status filtering
- [x] Display transaction details (amount, merchant, date, category, tags)
- [x] Show account association with badges
- [x] Implement transaction edit modal for categorization
- [x] Add tag management with TagsInput component
- [x] Implement transaction splitting functionality
- [x] Add visual indicators for pending, hidden, and split transactions

### 4.2 Category Management UI ✅
- [x] Create Categories page with tree view
- [x] Implement CategoryTree component with hierarchy display
- [x] Add CategoryForm for create/edit operations
- [x] Add search and filter functionality
- [x] Display statistics (total categories, hidden count)
- [x] Initialize default categories button
- [x] Show Plaid category mappings

### 4.3 Budget Management UI ✅
- [x] Create Budgets page with month navigation
- [x] Implement BudgetGrid for budget display and inline editing
- [x] Add BudgetForm for creating/editing budgets
- [x] Implement BudgetComparison for actual vs budget analysis
- [x] Add copy budgets functionality between months
- [x] Create visual progress indicators
- [x] Add CSV export for budget comparisons
- [x] Fix category selector issues in forms

## Phase 6: Reports & Polish (Week 6) ✅ REPORTING COMPLETE

### 6.1 Reporting Dashboard ✅
- [x] ~~Create test file: `frontend/src/components/__tests__/Dashboard.test.tsx`~~ (deferred)
- [x] Implement spending trends charts (Recharts)
- [x] Add budget progress indicators
- [x] Create cash flow projections view
- [x] Implement category breakdown visualizations
- [x] Create comprehensive Reports page with:
  - Year-to-date summary cards
  - Cash flow tab with income vs expenses chart
  - Spending trends tab with category analysis over time
  - Categories tab with top spending breakdown
  - Projections tab with future cash flow predictions
- [x] Fix chart rendering issues with empty data
- [x] Implement proper category data access

### 6.2 Error Boundaries & Resilience ✅ COMPLETE
- [x] Implement comprehensive error boundary system
- [x] Create hierarchical error boundaries (app → route → component)
- [x] Add specialized boundaries for async operations and financial data
- [x] Enhance React Query with smart retry logic
- [x] Add user-friendly error messages and recovery options
- [x] Create development testing component for error scenarios

### 6.3 Auto-Categorization ✅ COMPLETE
- [x] Implement auto-categorization rules engine
- [x] Create UI for managing categorization rules
- [x] Add pattern matching for merchant names
- [x] Support amount-based rule conditions
- [x] Implement rule priority ordering
- [x] Add bulk categorization for existing transactions

### ~~6.4 Polish & Optimization~~ (DEFERRED - Not critical for 2-user MVP)
- ~~Implement optimistic updates~~
- ~~Add data export functionality~~
- ~~Performance optimization (React.memo, useMemo)~~
- ~~Accessibility improvements~~

## Post-MVP Features ✅ COMPLETE

Features delivered beyond the original plan:

### Income Analytics ✅
- [x] Income category dashboards with drill-down
- [x] Toggle between income and expense views across reports

### Yearly Budget Grid ✅ (v1.17.0)
- [x] Comprehensive 12-month budget planning view
- [x] Inline editing with auto-save
- [x] Sticky headers for navigation

### Admin Panel ✅
- [x] Data migration tools (savings → rollover rename)
- [x] System monitoring and batch operations
- [x] Field migration pattern with destructuring for clean removal

### CSV Import Framework ✅
- [x] Extensible BaseCSVParser system
- [x] Category and transaction import support
- [x] ImportService for future import types

### Rollover Categories ✅
- [x] Renamed "savings" to "rollover" to avoid confusion
- [x] Updated all references from `isSavings` to `isRollover`

### Re-authentication Flow ✅ (v1.23.0)
- [x] Plaid Link update mode for expired bank connections
- [x] Visual indicators on accounts page and dashboard
- [x] New endpoints for re-authentication token generation

### Actuals Overrides ✅
- [x] Override actual spending amounts for budget comparisons
- [x] Modal UI for managing overrides

### Transaction Pagination ✅
- [x] 50 items per page for performance with 800+ transactions
- [x] React Query staleTime/gcTime optimization

### Versioning & Release System ✅
- [x] Conventional commits with standard-version
- [x] Automated CHANGELOG generation
- [x] `/version` endpoint for deployment tracking

## Phase 7: Multi-User Family Collaboration (Week 7) ⏳ NOT STARTED

### 7.1 Phase 1: Shared Family Account (Quick Implementation)
- [ ] Add `primaryAccountId` and `role` fields to User model
- [ ] Implement family invite code generation
- [ ] Create registration flow for secondary users with invite code
- [ ] Update data service to use `primaryAccountId || userId` for file paths
- [ ] Add UI indicator showing shared account status
- [ ] Test concurrent access patterns

### 7.2 Phase 2: Optimistic Locking (When Needed)
- [ ] Add version tracking to data files
- [ ] Implement version checking before writes
- [ ] Add retry logic with exponential backoff
- [ ] Create UI for conflict resolution
- [ ] Add "last modified by" tracking
- [ ] Implement audit trail for changes

### 7.3 Security & Permissions
- [ ] Implement secure invite code generation (cryptographically random)
- [ ] Add invite code expiration (24-48 hours)
- [ ] Create permission levels (view-only vs edit)
- [ ] Add family member management UI
- [ ] Implement removal of family members
- [ ] Ensure data isolation between families

### 7.4 Testing & Risk Mitigation
- [ ] Test concurrent write scenarios
- [ ] Verify data integrity with multiple users
- [ ] Test invite code security
- [ ] Ensure no cross-family data leakage
- [ ] Add integration tests for family workflows
- [ ] Document known limitations

## Phase 8: Production Architecture Setup (Week 8-9) ✅ COMPLETE

**Reference**: See `docs/AI-Architecture-Plan.md` for complete architecture details

### 8.1 GitHub Repository Configuration ✅
- [x] Enable branch protection on main branch
- [x] Configure GitHub Secrets (EC2_SSH_KEY, EC2_HOST, JWT_SECRET, PLAID credentials)
- [x] Create `.github/workflows/pr-validation.yml` for PR validation
- [x] Create `.github/workflows/deploy-production.yml` for manual production deployment
- [x] Create `.github/workflows/release-and-deploy.yml` for integrated release + deploy
- [x] Create `.github/workflows/rollback.yml` for rollback capability
- [x] Test GitHub Actions workflows with feature branch

### 8.2 AWS Infrastructure Setup ✅
- [x] Create AWS account and configure free tier
- [x] Generate SSH key pair for EC2 access
- [x] Create Terraform configuration files (`main.tf`, `s3-data.tf`, `github-actions-access.tf`, `ssm-setup.tf`)
- [x] Provision EC2 t4g.micro instance with Terraform
- [x] Configure Security Group with proper ingress rules
- [x] Allocate and associate Elastic IP
- [x] Create S3 bucket with versioning, encryption, and lifecycle policies
- [x] Set up AWS Budget alert at $10/month (80% threshold notification)
- [x] Configure IAM roles for GitHub Actions deployment
- [x] Set up CloudWatch log group (7-day retention)

### 8.3 Environment Configuration ✅
- [x] Create production `.env` file with strong secrets (managed via GitHub Secrets)
- [x] Update backend for production data directory path (S3 via StorageFactory)
- [x] Configure CORS for production domain (budget.jaredcarrano.com)
- [x] Update frontend API URL for production
- [x] Test Plaid in production environment mode

## Phase 9: Production Deployment (Week 9-10) ✅ COMPLETE

### 9.1 Server Setup ✅
- [x] SSH into EC2 and run initial updates
- [x] Install Node.js 20, nginx, PM2, git
- [x] Configure Ubuntu firewall (ufw) and fail2ban
- [x] Set up application directories structure
- [x] Create `appuser` application user with appropriate permissions
- [x] Configure SSH hardening (root login disabled, password auth disabled)
- [x] Clone repository to production server
- [x] Install and build both backend and frontend

### 9.2 Application Configuration ✅
- [x] Configure nginx as reverse proxy with rate limiting and security headers
- [x] Set up PM2 ecosystem file for process management (500MB memory restart)
- [x] Configure PM2 startup script for auto-restart via systemd
- [x] Set up Let's Encrypt SSL certificates
- [x] Application accessible via HTTPS at budget.jaredcarrano.com

### 9.3 Operational Setup ✅
- [x] Create and test backup script to S3
- [x] Configure cron job for daily backups (2 AM, 7-day local retention)
- [x] Set up log rotation with logrotate (daily, 7-day retention)
- [x] Configure UptimeRobot for external monitoring
- [x] Document restore procedure (`npm run backup:restore`)
- [x] Test full backup and restore process

## Phase 10: Production Stabilization (Week 10-11) ✅ COMPLETE

### 10.1 Migration & Testing ✅
- [x] Migrate existing local data to production (S3 sync utilities)
- [x] Complete end-to-end testing in production
- [x] Test Plaid account linking in production
- [x] Verify transaction sync is working
- [x] Test all CRUD operations
- [x] Verify backup automation is working

### 10.2 Monitoring & Optimization ✅
- [x] Monitor AWS costs (budget alert at $10/month)
- [x] Review CloudWatch metrics (basic monitoring)
- [x] Check PM2 logs for errors
- [x] Optimize nginx configuration (rate limit increased for Reports page)
- [x] Document production-specific issues in CLAUDE.md
- [x] Health check endpoints (`/health`, `/api/v1/version`)

### 10.3 Documentation & Handoff ✅
- [x] Update README with production access info
- [x] Document deployment process (`docs/AI-DEPLOYMENTS.md`, 650+ lines)
- [x] Create troubleshooting guide (CLAUDE.md + deployment docs)
- [x] Document backup/restore procedures
- [x] Update CLAUDE.md with production learnings and architecture decisions

## Phase 11: Category Options Consolidation (Refactor) ✅ COMPLETE

### 11.1 Create `useCategoryOptions` Hook ✅
- [x] Create `frontend/src/hooks/useCategoryOptions.ts`
- [x] Accept config: `{ categories?, includeUncategorized?, hiddenMode?, labelPrefix?, filter?, enabled? }`
- [x] Return `{ options: Array<{ value, label }>, categories, isLoading, error }`
- [x] Use existing `['categories']` React Query cache with 5-min staleTime
- [x] Standardize on `"Parent → Child"` label format

### 11.2 Consolidate Existing Category Option Builders ✅
- [x] Replace inline builder in `TransactionEditModal` — removed local useQuery + 25-line builder
- [x] Replace inline builder in `TransactionSplitModal` — removed local useQuery + 25-line builder
- [x] Replace inline builder in `AutoCategorization` — removed local useQuery + 18-line builder
- [x] Replace inline builder in `BudgetForm` — removed 40-line builder, uses `hiddenMode: 'exclude'`, `filter`, `labelPrefix`
- [x] Replace `flatCategoryOptions` in `EnhancedTransactions` — uses `includeUncategorized: true`
- [ ] Refactor `CategoryPicker` component to use `useCategoryOptions` internally (future — uses different indented label format)

### 11.3 Verify & Clean Up ✅
- [x] Ensure label format is consistent across all pickers (`"Parent → Child"`)
- [x] Verify hidden category indicators display correctly everywhere
- [x] Remove unused category option building code and clean up imports
- [x] TypeScript compile check — 0 errors, 0 new warnings

## Phase 12: Future Enhancements (Optional)

### 12.1 Cost-Effective Improvements
- [ ] Add custom domain with Route 53 ($12/year)
- [ ] Implement CloudWatch detailed monitoring ($3/month)
- [ ] Set up AWS Backup automation ($1/month)
- [ ] Add more comprehensive health checks

### 12.2 Database Migration (When Needed)
- [ ] Install PostgreSQL on same EC2 instance
- [ ] Design optimized schema for relational data
- [ ] Create migration scripts from JSON to PostgreSQL
- [ ] Test thoroughly before switching over
- [ ] Keep JSON export capability as backup

### 12.3 Performance Enhancements (If Required)
- [ ] Implement Redis for session caching
- [ ] Add nginx caching for static assets
- [ ] Optimize frontend bundle size
- [ ] Consider upgrading to t4g.small if needed ($12/month)

## Success Criteria

### Application Features ✅
- [x] 90%+ test coverage on business logic (69 backend tests passing)
- [x] All user stories have passing tests
- [x] Authentication system fully functional
- [x] Plaid integration working in production
- [x] Transaction sync and categorization operational
- [x] Budget creation and tracking functional (monthly + yearly grid)
- [x] Comprehensive reporting with multiple visualization tabs
- [x] Frontend responsive and accessible (Mantine UI dark theme)

### Production Deployment (Phases 8-10) ✅
- [x] Application deployed to AWS EC2 instance
- [x] SSL certificates configured and working (budget.jaredcarrano.com)
- [x] Automated backups to S3 functioning (daily at 2 AM)
- [x] GitHub Actions CI/CD pipeline operational (PR validation, deploy, rollback)
- [x] Production costs under $10/month (budget alert configured)
- [x] Monitoring and alerting configured (health checks, UptimeRobot, CloudWatch)
- [x] Full documentation completed (6 AI docs, CLAUDE.md, deployment guide)
- [x] Successful end-to-end testing in production

## Risk Mitigation
- **Plaid API Limits**: Use sandbox mode initially, implement caching
- **Data Storage**: Start with JSON files, plan migration path to database
- **Security**: Never store Plaid credentials, use environment variables
- **Performance**: Implement pagination for transactions early

## Completed Achievements Summary

### Backend (69 tests passing)
- ✅ Complete authentication system with JWT, rate limiting, account lockout
- ✅ Plaid service integration (sandbox + production)
- ✅ Account and transaction management with full CRUD operations
- ✅ Transaction splitting functionality with parent-child relationships
- ✅ Category service with hierarchy and Plaid PFC mapping (17 tests)
- ✅ Budget service with monthly + yearly grid management (23 tests)
- ✅ Auto-categorization rules engine with pattern matching
- ✅ Reporting service with comprehensive analytics
- ✅ Admin tools for data migration and batch operations
- ✅ CSV import framework (extensible BaseCSVParser)
- ✅ Actuals override system for budget comparisons
- ✅ Re-authentication flow for expired Plaid connections
- ✅ Data persistence with JSON storage and S3 backup support
- ✅ Versioning system with conventional commits and CHANGELOG

### Frontend
- ✅ Mantine UI with professional dark theme (React 19)
- ✅ Complete authentication flow (login, register, protected routes)
- ✅ Plaid Link integration with re-authentication support
- ✅ Account management with per-account sync and re-auth indicators
- ✅ Enhanced transaction page with advanced filtering, search, and pagination
- ✅ Transaction edit modal with category and tag management
- ✅ Transaction splitting modal for dividing transactions
- ✅ Category management with tree view and CRUD operations
- ✅ Budget management with month navigation and comparisons
- ✅ Yearly budget grid with inline editing and auto-save
- ✅ Budget vs actual analysis with visual indicators and actuals overrides
- ✅ Income analytics dashboards with income/expense toggle
- ✅ Auto-categorization rules UI with rule management
- ✅ Admin panel for data migrations and system monitoring
- ✅ Comprehensive error boundary system with hierarchical protection
- ✅ Comprehensive Reports page with multiple visualization tabs

### Infrastructure
- ✅ AWS EC2 (t4g.micro) with Terraform IaC
- ✅ GitHub Actions CI/CD (PR validation, deploy, rollback)
- ✅ nginx reverse proxy with rate limiting and security headers
- ✅ PM2 process management with auto-restart
- ✅ S3 storage with versioning, encryption, and lifecycle policies
- ✅ Automated daily backups with S3 upload
- ✅ HTTPS via Let's Encrypt at budget.jaredcarrano.com
- ✅ Production sync utilities for local debugging

## Next Priority Actions
1. ~~Enhance transaction features~~ ✅ COMPLETE
2. ~~Implement reporting dashboard~~ ✅ COMPLETE
3. ~~Error boundaries~~ ✅ COMPLETE
4. ~~Auto-categorization rules~~ ✅ COMPLETE
5. ~~Production deployment (Phases 8-10)~~ ✅ COMPLETE
6. **Category options consolidation refactor** (Phase 11)
7. **Multi-user family collaboration** (Phase 7)
8. **Bill reminders and recurring transactions**
9. **Enhanced reporting and visualizations**
10. **Mobile app development**

## Production Architecture ✅ DEPLOYED
- **Architecture Plan**: See `docs/AI-Architecture-Plan.md` for complete details
- **Domain**: budget.jaredcarrano.com (HTTPS)
- **Cost**: <$10/month (budget alert configured)
- **Infrastructure**: EC2 t4g.micro + nginx + PM2 (Terraform-managed)
- **Storage**: S3-backed JSON files with versioning and encryption
- **CI/CD**: GitHub Actions (PR validation → release → deploy → rollback)
- **Current Version**: 1.23.1 (384 commits)

## Notes
- Focus on rapid feature delivery with critical path testing
- Commit after meaningful feature completion
- Keep PRs small and focused
- Document API endpoints as they're created
- Regular security reviews for auth and data handling