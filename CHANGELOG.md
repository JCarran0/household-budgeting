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

### Fixed
- Transaction menu action bugs and split description handling
- Plaid Items properly removed on disconnect for full transaction history
- Duplicate option error in bulk edit feature
- Category filter not working for uncategorized transactions
- React hooks ESLint warnings in frontend

### Changed
- Optimized AI agent documentation structure and navigation
- Improved TypeScript types and code organization in reports
- Cleaned up category ID architecture
- Enhanced visual presentation of hidden categories

### Documentation
- Updated architecture plan to reflect production reality
- Updated architecture guide with recent feature implementations
- Updated test counts and added category filter bug fix lesson
- Updated user stories with new features from recent development

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