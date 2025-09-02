# Personal Budgeting App Development Guide

## Project Overview
Building a personal budgeting app for 2 users with Plaid integration. Using Risk-Based Testing with TypeScript strict mode for rapid, type-safe development.

## Technical Architecture
For detailed technical architecture, service descriptions, data flows, and implementation details, see **[docs/AI-APPLICATION-ARCHITECTURE.md](docs/AI-APPLICATION-ARCHITECTURE.md)**. This document provides comprehensive guidance for AI agents on the codebase structure, API patterns, common tasks, and troubleshooting.

## Testing Strategy
For comprehensive testing guidance, see **[docs/AI-TESTING-STRATEGY.md](docs/AI-TESTING-STRATEGY.md)**. This document covers user story testing, risk-based prioritization, test examples with real code, lessons learned from overmocking, and troubleshooting common test failures. The test strategy references **[docs/AI-USER-STORIES.md](docs/AI-USER-STORIES.md)** which contains the complete product requirements as user stories.

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
- ✅ Default category initialization
- ✅ Savings categories for future rollover

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

## Development Status

### ✅ Completed Features (December 2025)
1. **Backend Infrastructure**: JWT auth, Plaid integration, service architecture
2. **Frontend Foundation**: React + Mantine UI, responsive design
3. **Account Management**: Connect, sync, and disconnect bank accounts
4. **Transaction Sync**: Full pagination, 730-day history request
5. **Budget Tracking**: Monthly budgets with comparison views
6. **Security**: AES-256 encryption, rate limiting, passphrase auth

### 🚧 Next Priorities
1. **Savings categories with rollover**
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
- **feat**: New feature or functionality
- **fix**: Bug fix
- **docs**: Documentation changes only
- **style**: Code style changes
- **refactor**: Code refactoring
- **test**: Adding or updating tests
- **chore**: Maintenance tasks
- **perf**: Performance improvements

### Examples
```bash
feat(auth): add JWT token generation for user login
fix(transaction): correct date parsing for Plaid transactions
test(auth): add tests for password validation
docs: update README with setup instructions
refactor(budget): simplify monthly calculation logic
```

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

### Required Environment Variables
```bash
# Backend (.env)
NODE_ENV=development
PORT=3001
PLAID_CLIENT_ID=your_sandbox_client_id
PLAID_SECRET=your_sandbox_secret  
PLAID_ENV=sandbox
JWT_SECRET=your_development_jwt_secret
JWT_EXPIRES_IN=7d
DATA_DIR=./data
ENCRYPTION_KEY=32_byte_hex_string
```

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

### Risk-Based Development
- **Spike features quickly** with minimal tests
- **Add tests when you find bugs**
- **Refactor with confidence** when types guide you
- **Integration test** critical financial flows
- **Skip trivial tests** like getters/setters

## Quick References

### Critical Files
- **Architecture Guide**: `docs/AI-APPLICATION-ARCHITECTURE.md`
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

## Notes for Future Development

### Lessons Learned
- Integration tests with real Plaid sandbox > heavily mocked unit tests
- Service singletons prevent auth token inconsistencies
- Mantine provides better out-of-box experience than Tailwind for dashboards
- Conditional rendering prevents Plaid Link duplicate script errors
- Return JWT token on registration for auto-login UX
- Method binding in API client prevents context loss

### Technical Debt
- Frontend has some TypeScript errors to clean up
- Some components use `any` type that need proper typing
- Test coverage could be improved for UI components
- Need better error recovery for expired Plaid tokens