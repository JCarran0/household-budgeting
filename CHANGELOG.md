# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added
- Bulk edit capability for transactions
- Interactive drill-down navigation in Category Breakdown pie chart
- Transaction preview with drill-down in reports
- "This Month" and "This Year" date range options in reports
- OR logic for auto-categorization rules with multiple patterns
- Inline category editing for transactions
- Visual improvements for hidden categories
- /review-tests slash command for test strategy compliance
- Comprehensive test coverage for transaction features
- add /debug-issue slash command for systematic debugging
- add /update-docs slash command and relocate commands to root
- implement semantic versioning with rolling changelog
- add /review-tests slash command for test strategy compliance
- **transactions**: add bulk edit capability for transactions
- **reports**: add transaction preview with drill-down navigation
- **reports**: add interactive drill-down to Category Breakdown pie chart
- **reports**: add This Month and This Year date range options
- **categories**: add OR logic for auto-categorization rules with multiple patterns
- **transactions**: add inline category editing
- **categories**: add re-categorization feature with orphaned ID handling
- **scripts**: add S3 support to reset script
- **accounts**: allow users to add custom nicknames to accounts
- add manual sidebar toggle for desktop view
- **categories**: allow hidden categories in transaction UI while excluding from budgets
- **transactions**: add exact amount search with tolerance
- add uncategorized transactions alert to transactions page
- optimize transactions page caching and loading states
- round up financial values and remove decimals on Reports page
- add workflow to update server deployment scripts
- consolidate dataService and prepare for S3 storage migration
- **deploy**: manage environment variables through GitHub Secrets
- Changes login prompt for testing
- **ci/cd**: implement AWS Systems Manager deployment (no SSH required)
- **ui**: implement comprehensive error boundary system
- **ci/cd**: implement GitHub Actions CI/CD pipeline
- **storage**: implement flexible storage system with S3 support
- **ssl**: configure HTTPS with Let's Encrypt for budget.jaredcarrano.com
- **terraform**: add AWS infrastructure configuration for production deployment
- **accounts**: add account disconnect functionality
- implement persistent filter caching for user preferences
- **security**: implement AES-256-GCM encryption for Plaid access tokens
- **budgets**: implement user-scoped budget isolation
- **testing**: implement user story focused testing framework
- **auto-categorization**: add user description support to rules
- **dashboard**: add number formatting with tooltips for financial amounts
- **transactions**: enhance UI/UX with improved filters and display
- add app reset script for development
- **categories**: implement Plaid category fallback in auto-categorization
- **auth**: implement passphrase-based authentication and UX improvements
- complete auto-categorization UI with rule management
- add editable transaction descriptions and auto-categorization foundation
- **frontend**: implement comprehensive reporting dashboard
- **backend**: implement reporting service (Phase 5.3)
- **transactions**: implement transaction splitting functionality
- **transactions**: add enhanced transaction management UI
- **frontend**: implement category and budget management UI
- **budgets**: implement monthly budget management system
- **categories**: implement category management system
- **ui**: complete Mantine UI framework migration
- **ui**: integrate Mantine UI framework for professional dashboard
- add React frontend with Plaid integration
- **accounts**: implement account and transaction management
- **plaid**: implement Plaid service with sandbox integration
- **api**: add Express application with auth routes
- **auth**: add input validation and authentication middleware
- **auth**: implement authentication service with TDD approach

### Fixed
- Transaction menu action bugs and split description handling
- Plaid Items properly removed on disconnect for full transaction history
- Duplicate option error in bulk edit feature
- Category filter not working for uncategorized transactions
- React hooks ESLint warnings in frontend
- resolve PM2 environment loading issue in production
- update slash commands to use @ prefix for file references
- **transactions**: resolve menu action bugs and improve split descriptions
- **plaid**: ensure Items are properly removed on disconnect for full transaction history
- **bulk-edit**: resolve duplicate option error and simplify description modes
- **frontend**: resolve React hooks ESLint warnings
- **transactions**: fix category filter not working for uncategorized transactions
- adjust script paths for flattened production deployment
- update deploy workflow comment for clarity
- update reset script for production use
- resolve transaction page performance issues with pagination
- critical bug - prevent removing transactions from other accounts during sync
- remove automatic transaction sync on account connection
- use appuser home directory for deployment temp files
- update PM2 start paths in deployment scripts to match new build output
- resolve TypeScript build duplicating backend directory in dist output
- properly copy dist contents to avoid duplicated backend directory
- correct PM2 start path for TypeScript compiled output
- correct deploy script PM2 path and env handling
- **backend**: add production domain to CORS allowed origins
- **deploy**: use appuser home directory instead of /tmp
- **frontend**: use relative API URL in production
- **deploy**: correct PM2 startup path for nested dist structure
- **ci**: resolve SSM variable scope issue with script approach
- **ci**: avoid GitHub secret masking for S3 deployment path
- **ci**: resolve S3 path substitution in SSM deployment
- **ci**: resolve SSM deployment issues
- **ci/cd**: improve SSH connection handling in workflows
- **ui**: resolve TypeScript and Mantine compatibility issues in error boundaries
- **ci/cd**: fix production build by installing all dependencies during build phase
- **reset**: update reset script to handle user-scoped data files
- resolve all TypeScript build errors in frontend
- resolve all ESLint and TypeScript linting errors
- **budgets**: resolve invalid HTML structure in BudgetGrid table
- **budgets**: resolve infinite loop when creating budgets
- **transactions**: implement smart default date filtering
- handle decryption errors gracefully during sync
- handle plain text tokens from pre-encryption era
- **auth**: resolve rate limiting conflicts in test environment
- **testing**: resolve test failures with username validation and troubleshooting docs
- **transactions**: correct transaction count display to show proper totals
- **transactions**: remove pending filter and fix account filtering
- **dashboard**: correct budget status calculation to use actual budgets
- **categories**: resolve initialization button error and improve error handling
- **transactions**: implement pagination and extend history to 2 years
- **auth**: clear React Query cache when switching users
- **categories**: implement proper user-specific data isolation
- remove unused imports in AutoCategorization component
- prevent infinite loop in CategoryForm useEffect
- resolve React Fast Refresh warning and TypeScript errors
- resolve TypeScript strict mode errors
- **reports**: correct category data access and chart rendering issues
- **transactions**: implement working transaction edit with tags
- **transactions**: resolve icon import and API parameter issues
- **frontend**: resolve category selector issues in forms
- **transactions**: resolve hooks error when filtering by date
- **plaid**: resolve 400 error when connecting bank accounts
- **typescript**: resolve VSCode Jest type recognition issues
- **deploy**: preserve dist directory structure in deployments
- **deploy**: update server scripts workflow to use dist/index.js

### Changed
- Optimized AI agent documentation structure and navigation
- Improved TypeScript types and code organization in reports
- Cleaned up category ID architecture
- Enhanced visual presentation of hidden categories
- **categories**: clean up category ID architecture
- **reports**: improve TypeScript types and code organization
- **categories**: improve visual presentation of hidden categories
- simplify category system to use regular user categories
- **categories**: replace plaidCategory mapping with system categories
- make userId required for category methods
- remove legacy categories.json and budgets.json files
- **deploy**: migrate non-sensitive configs to GitHub Variables
- **ci**: simplify deployment with server-side script
- **ci/cd**: change deployment to manual trigger only
- streamline CLAUDE.md and remove redundancy with architecture doc
- **budgets**: enforce user isolation and remove legacy budget methods
- **typescript**: enforce strict mode with zero any types

### Documentation
- Updated architecture plan to reflect production reality
- Updated architecture guide with recent feature implementations
- Updated test counts and added category filter bug fix lesson
- Updated user stories with new features from recent development
- fix incorrect deployment trigger documentation
- add versioning information to README
- update AI documentation with versioning and release workflows
- update architecture plan to reflect production reality
- optimize AI agent documentation structure and navigation
- update architecture guide with recent feature implementations
- **testing**: update test counts and add category filter bug fix lesson
- update user stories with new features from recent development
- add account nickname feature to user stories
- update user stories to reflect system categories approach
- update user stories with exact amount search capabilities
- extract deployment documentation to dedicated guide
- update architecture and lessons learned
- add comment clarifying backend dist structure is pre-flattened
- add deployment config and Plaid troubleshooting to CLAUDE.md
- update deployment documentation for SSM workflow
- update PROJECT_PLAN.md with multi-user collaboration and recent completions
- clarify dual-purpose S3 bucket usage and fix IAM policy
- **terraform**: add GitHub Actions SSH access documentation
- update architecture plan with completed CI/CD milestone
- update documentation with production deployment details
- add comprehensive linting documentation
- add reference to AI-USER-STORIES.md as product requirements baseline
- add reference to AI-TESTING-STRATEGY.md in CLAUDE.md
- add comprehensive AI application architecture guide
- update test coverage for search/filtering completion
- update test coverage status to reflect actual implementation
- update testing strategy with budget service implementation
- update testing strategy with encryption implementation
- update testing strategy with overmocking lessons learned
- add production architecture plan and update project roadmap
- update PROJECT_PLAN.md to reflect completed reporting features
- update project documentation to reflect completed features
- update PROJECT_PLAN.md with completed phases
- remove TDD references from documentation
- update documentation with lessons learned and project status
- update project plan to reflect completed Phase 1
- **security**: add comprehensive security documentation and policies

### Testing
- **transactions**: add comprehensive tests for inline category editing
- **backend**: add critical tests for hidden category functionality
- **auto-categorization**: add comprehensive integration tests
- **search**: add comprehensive search and filtering tests
- **categories**: add comprehensive category management tests
- add critical path tests for transaction synchronization
- **financial**: add comprehensive financial calculation story tests
- **budgets**: update tests for user isolation requirements
- fix category and budget creation in tests
- **api**: add integration tests for Express app

### Build
- add TypeScript type checking to pre-commit hook
- add pre-commit hook for automatic linting

### Maintenance
- ignore TypeScript build artifacts in shared/types
- silence dotenv warnings in test environment
- remove debug logging from auto-categorization
- remove console.log statements from frontend
- remove temporary manual test scripts and update docs
- ignore test-data directory
- **vscode**: configure TypeScript and Jest settings
- **backend**: configure TypeScript, Jest, and development environment


## [1.0.0-alpha.1] - 2024-09-02

### Added
- **Core Infrastructure**
  - Production deployment at https://budget.jaredcarrano.com
  - AWS infrastructure with Terraform (EC2, S3, IAM)
  - CI/CD pipeline with GitHub Actions and SSM deployments
  - SSL/TLS with Let's Encrypt certificates
  - Zero-downtime deployments with rollback capability

- **Authentication & Security**
  - JWT-based authentication with 15+ character passphrase requirement
  - Rate limiting and account lockout protection
  - AES-256 encryption for sensitive data
  - Secure token storage with httpOnly cookies

- **Account Management**
  - Plaid integration for Bank of America and Capital One
  - Account linking and disconnection
  - Automatic transaction sync with 730-day history
  - Pagination support (50 transactions per page)

- **Transaction Features**
  - Transaction splitting for shared expenses
  - Manual categorization with two-level hierarchy
  - Auto-categorization rules
  - Transaction search and filtering
  - Month-to-month transaction management

- **Budget Management**
  - Monthly budget creation and tracking
  - Copy budget from previous month
  - Budget vs actual comparison
  - Category-based spending analysis
  - User-specific category hierarchies

- **Reporting & Analytics**
  - Income vs expense analysis
  - Category spending trends
  - Budget performance reports
  - Monthly and yearly summaries
  - Visual charts with Recharts

- **User Interface**
  - Professional dark theme with Mantine UI
  - Responsive design for mobile and desktop
  - Collapsible sidebar navigation
  - Real-time updates with React Query
  - Accessible form controls and navigation

### Security
- Implemented comprehensive security measures per Information Security Policy
- Established incident response procedures
- Created security review processes
- Documented risk assessments

### Technical
- TypeScript strict mode with zero `any` types policy
- Risk-based testing strategy
- Integration tests with Plaid sandbox
- Singleton service architecture
- S3 storage abstraction for production data

[Unreleased]: https://github.com/yourusername/household-budgeting/compare/v1.0.0-alpha.1...HEAD
[1.0.0-alpha.1]: https://github.com/yourusername/household-budgeting/releases/tag/v1.0.0-alpha.1