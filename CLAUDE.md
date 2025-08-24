# Personal Budgeting App Development Guide

## Project Overview
Building a personal budgeting app for 2 users with Plaid integration. Using Risk-Based Testing with TypeScript strict mode for rapid, type-safe development.

## Architecture
- **Frontend**: React 18 + TypeScript + Vite + Tailwind CSS
- **Backend**: Node.js + Express + TypeScript  
- **Storage**: JSON files (MVP) → S3 → PostgreSQL (future)
- **Testing**: Jest + React Testing Library
- **Integration**: Plaid API for Bank of America (checking/savings) + Capital One (credit card)

## Development Approach: Risk-Based Testing & Type-Safe Development

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

## Project Structure
```
budgeting-app/
├── backend/
│   ├── src/
│   │   ├── __tests__/          # Test files
│   │   ├── routes/
│   │   ├── services/
│   │   ├── models/
│   │   ├── middleware/
│   │   └── utils/
│   ├── data/                   # JSON storage
│   └── jest.config.js
├── frontend/
│   ├── src/
│   │   ├── __tests__/          # Test files
│   │   ├── components/
│   │   ├── hooks/
│   │   ├── services/
│   │   └── utils/
│   └── jest.config.js
├── shared/
│   └── types/
└── CLAUDE.md
```

## Core Data Models

### Key Entities
```typescript
interface User {
  id: string;
  username: string;
  passwordHash: string;
  createdAt: Date;
}

interface Account {
  id: string;
  plaidAccountId: string;
  plaidItemId: string;
  name: string;
  type: 'checking' | 'savings' | 'credit';
  institution: string;
  isActive: boolean;
}

interface Category {
  id: string;
  name: string;
  parentId: string | null;  // Two-level hierarchy: Category → Subcategory
  plaidCategory: string | null;
  isHidden: boolean;
  isSavings: boolean;       // For future savings rollover feature
}

interface Transaction {
  id: string;
  plaidTransactionId: string | null;
  accountId: string;
  amount: number;           // negative = expense, positive = income
  date: Date;
  description: string;
  categoryId: string;
  tags: string[];
  isHidden: boolean;
  isManual: boolean;        // For transaction splits
  isSplit: boolean;
  parentTransactionId: string | null;
  splitTransactionIds: string[];
}

interface MonthlyBudget {
  id: string;
  categoryId: string;
  month: string;           // YYYY-MM format
  amount: number;
}
```

## MVP User Stories & Test Cases

### 1. Authentication System
**User Story**: As a user, I can log in with username/password to access the budgeting app

**Test Cases**:
- ✅ User can register with valid username/password
- ✅ User can login with correct credentials
- ✅ User cannot login with incorrect credentials  
- ✅ JWT token is generated and validated correctly
- ✅ Protected routes require valid JWT token

### 2. Plaid Account Linking
**User Story**: As a user, I can connect my Bank of America and Capital One accounts

**Test Cases**:
- ✅ Can initiate Plaid Link flow and get link token
- ✅ Can exchange public token for access token
- ✅ Can retrieve account information from Plaid
- ✅ Can store account data locally
- ✅ Handle Plaid API errors gracefully

### 3. Transaction Management
**User Story**: As a user, I can sync and view my transactions from connected accounts

**Test Cases**:
- ✅ Can sync transactions from 2025-01-01 onwards
- ✅ Can filter out pending transactions
- ✅ Can categorize transactions using Plaid categories
- ✅ Can manually recategorize transactions
- ✅ Can add tags to transactions
- ✅ Can hide transactions from budget calculations
- ✅ Can split transactions into manual sub-transactions

### 4. Budget Categories
**User Story**: As a user, I can create and manage budget categories with subcategories

**Test Cases**:
- ✅ Can create top-level categories
- ✅ Can create subcategories under parent categories
- ✅ Can mark categories as "hidden"
- ✅ Can mark categories as "savings" (for future use)
- ✅ Can edit category names and properties
- ✅ Can delete categories (with transaction reassignment)

### 5. Monthly Budgeting
**User Story**: As a user, I can set monthly budgets and track spending vs budget

**Test Cases**:
- ✅ Can set budget amounts for subcategories by month
- ✅ Can copy budgets from previous month
- ✅ Can view budget vs actual spending
- ✅ Can see variance (over/under budget) by category
- ✅ Budget calculations exclude hidden transactions

### 6. Reporting & Trends
**User Story**: As a user, I can view spending trends and generate reports

**Test Cases**:
- ✅ Can view spending trends by category over time
- ✅ Can view spending trends by tags
- ✅ Can generate budget vs actual reports by month/quarter/year
- ✅ Can view income vs expense trends
- ✅ Reports can be filtered by category, tags, date range

### 7. Cash Flow Forecasting
**User Story**: As a user, I can forecast future cash flow based on budget vs actual

**Test Cases**:
- ✅ Can calculate YTD actual spending vs budget
- ✅ Can project future cash flow based on remaining budget
- ✅ Can see monthly cash flow projections
- ✅ Can identify potential cash flow issues

## Development Phases

### Phase 1: Foundation ✅ COMPLETE
**Goal**: Authentication, project setup, basic Plaid integration

**What We Built**:
1. ✅ Auth service with JWT, rate limiting, account lockout (29 tests)
2. ✅ Plaid service with sandbox integration (18 tests)
3. ✅ Service singleton pattern for consistent state
4. ✅ Direct sandbox testing scripts

**Lessons Learned**:
- Integration tests with real Plaid sandbox > heavily mocked unit tests
- Service singletons prevent auth token inconsistencies
- Manual test scripts catch integration issues faster

### Phase 2: Core Features (Weeks 3-4)
**Goal**: Transaction sync, categorization, basic budgeting

**TDD Focus**:
1. Transaction categorization and tagging logic
2. Category hierarchy management
3. Monthly budget calculations
4. Transaction splitting functionality

**Key Files to Create**:
- `backend/src/services/__tests__/transactionService.test.ts`
- `backend/src/services/__tests__/categoryService.test.ts`
- `backend/src/services/__tests__/budgetService.test.ts`

### Phase 3: Reports & Frontend (Weeks 5-6)
**Goal**: Reporting, charts, complete UI

**TDD Focus**:
1. Report calculation logic
2. React component testing
3. API integration testing
4. User workflow testing

**Key Files to Create**:
- `backend/src/services/__tests__/reportService.test.ts`
- `frontend/src/components/__tests__/Dashboard.test.tsx`
- `frontend/src/components/__tests__/TransactionList.test.tsx`

## Testing Configuration

### Backend Jest Config
```javascript
// backend/jest.config.js
module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  roots: ['<rootDir>/src'],
  testMatch: ['**/__tests__/**/*.test.ts'],
  transform: {
    '^.+\\.ts$': 'ts-jest',
  },
  coverageDirectory: 'coverage',
  collectCoverageFrom: [
    'src/**/*.ts',
    '!src/**/__tests__/**',
    '!src/types/**',
  ],
  setupFilesAfterEnv: ['<rootDir>/src/__tests__/setup.ts'],
};
```

### Frontend Jest Config  
```javascript
// frontend/jest.config.js
module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'jsdom',
  roots: ['<rootDir>/src'],
  testMatch: ['**/__tests__/**/*.test.{ts,tsx}'],
  transform: {
    '^.+\\.(ts|tsx)$': 'ts-jest',
  },
  moduleNameMapping: {
    '\\.(css|less|scss|sass)$': 'identity-obj-proxy',
  },
  setupFilesAfterEnv: ['<rootDir>/src/__tests__/setup.ts'],
};
```

## Environment Setup

### Required Environment Variables
```bash
# .env.development
NODE_ENV=development
PORT=3001

# Plaid (start with sandbox)
PLAID_CLIENT_ID=your_sandbox_client_id
PLAID_SECRET=your_sandbox_secret  
PLAID_ENV=sandbox

# JWT
JWT_SECRET=your_development_jwt_secret
JWT_EXPIRES_IN=7d

# Data
DATA_DIR=./data
```

## Security Best Practices

**CRITICAL: This application handles sensitive financial data. Security must be the top priority in all development decisions.**

### Security Requirements
1. **Data Protection**
   - All financial data must be encrypted at rest (AES-256) and in transit (TLS 1.3+)
   - Never store Plaid credentials, tokens must be encrypted and stored securely
   - Implement secure deletion when data is no longer needed
   - Follow the principle of least privilege for all data access

2. **Authentication & Access Control**
   - Multi-factor authentication (MFA) required for production access
   - JWT tokens must expire and be properly validated
   - Implement account lockout after failed login attempts
   - Regular security key rotation (90 days maximum)

3. **Code Security**
   - Input validation on ALL user inputs to prevent injection attacks
   - Parameterized queries only - no string concatenation for SQL
   - Output encoding to prevent XSS attacks
   - Regular dependency updates and vulnerability scanning
   - No secrets or credentials in code - use environment variables
   - Secure error handling - never expose system details to users

4. **Compliance & Privacy**
   - Follow PCI DSS guidelines even though we don't store card data
   - Implement GDPR/CCPA privacy requirements
   - Maintain audit logs for all data access
   - Data retention policies with automatic deletion
   - Customer data notification within 24 hours of any breach

5. **Incident Response**
   - Security incidents must be documented immediately
   - Follow the Incident Response Plan in docs/information-security/
   - Customer data breaches require notification within 24 hours
   - Maintain evidence chain of custody for forensics

6. **Development Security**
   - Code reviews required for all changes touching authentication or financial data
   - No production data in development/test environments
   - Secure development environment with encrypted drives
   - Regular security training and awareness
   - Follow the security policies in docs/information-security/

### Security Documentation
- **Information Security Policy:** docs/information-security/info_security_policy.md
- **Incident Response Plan:** docs/information-security/incident_response_plan.md
- **Risk Assessment:** docs/information-security/risk_assessment_template.md
- **Security Review Log:** docs/information-security/security_review_log.md

## Key Implementation Guidelines

### 1. TypeScript Best Practices
- **NO `any` TYPES** - Use `unknown`, generics, or proper types
- **Strict null checks** - Handle `undefined` and `null` explicitly
- **Type all function parameters and returns**
- **Create domain types** for business entities
- **Use discriminated unions** for complex state

### 2. Risk-Based Testing Focus
- **Test financial calculations** - Any bug here costs money
- **Test authentication flows** - Security is critical
- **Test data integrity** - Transaction sync, categorization
- **Skip trivial tests** - Don't test getters/setters

### 3. Integration Testing Strategy
- **Use real sandbox environments** (Plaid, databases)
- **Create test scripts** for manual verification
- **Test the full stack** when it matters
- **Mock only at boundaries** (network, filesystem)

### 4. Development Workflow
- **Spike features quickly** with minimal tests
- **Add tests when you find bugs**
- **Refactor with confidence** when types guide you
- **Document manual test procedures**

### 5. Type-Safe Error Handling
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
We follow the [Conventional Commits](https://www.conventionalcommits.org/) specification for all commit messages:

```
<type>[optional scope]: <description>

[optional body]

[optional footer(s)]
```

### Commit Types
- **feat**: New feature or functionality
- **fix**: Bug fix
- **docs**: Documentation changes only
- **style**: Code style changes (formatting, missing semicolons, etc.)
- **refactor**: Code refactoring without changing functionality
- **test**: Adding or updating tests
- **chore**: Maintenance tasks, dependency updates, build changes
- **perf**: Performance improvements
- **ci**: CI/CD configuration changes
- **build**: Build system or external dependency changes

### Examples
```bash
feat(auth): add JWT token generation for user login
fix(transaction): correct date parsing for Plaid transactions
test(auth): add tests for password validation
docs: update README with setup instructions
chore: update dependencies to latest versions
refactor(budget): simplify monthly calculation logic
```

### Commit Guidelines
- Keep the subject line under 50 characters
- Use imperative mood ("add" not "added" or "adds")
- Don't capitalize the first letter
- No period at the end of subject line
- Separate subject from body with blank line
- Body should explain what and why, not how
- Reference issues and PRs in the footer when applicable

## Getting Started Commands

### Initial Setup
```bash
# Create project structure
mkdir budgeting-app
cd budgeting-app
mkdir -p backend/src frontend/src shared/types

# Backend setup
cd backend
npm init -y
npm install express jsonwebtoken bcryptjs fs-extra uuid date-fns zod plaid
npm install -D @types/node @types/express @types/jsonwebtoken @types/bcryptjs typescript ts-node jest @types/jest ts-jest nodemon

# Frontend setup  
cd ../frontend
npm create vite@latest . -- --template react-ts
npm install @tanstack/react-query zustand @headlessui/react @heroicons/react recharts
npm install -D @testing-library/react @testing-library/jest-dom @testing-library/user-event jsdom
```

### Development Workflow
```bash
# Start backend in watch mode
cd backend && npm run dev

# Start frontend in development mode  
cd frontend && npm run dev

# Run tests in watch mode
cd backend && npm run test:watch
cd frontend && npm run test:watch

# Run all tests
npm run test
```

## Development Priorities

### Current Status
✅ **Phase 1 Complete**: Auth + Plaid integration working
- JWT authentication with rate limiting
- Plaid sandbox integration tested
- Service singleton pattern implemented

### Next Priority: Transaction Management
1. **Build Plaid Link UI** - Connect bank accounts
2. **Sync transactions** - Pull from 2025-01-01
3. **Store & categorize** - Persist with proper types
4. **Test with real data** - Use sandbox credentials

### Type Safety Checklist
- [ ] Replace all `any` with proper types
- [ ] Enable strict TypeScript config
- [ ] Create shared type definitions
- [ ] Add runtime validation with Zod

## Success Metrics
- ✅ **Zero runtime type errors** - TypeScript catches all
- ✅ **Critical paths tested** - Auth, money, data integrity
- ✅ **Fast feedback loops** - Direct testing > mocking
- ✅ **No `any` types** in production code
- ✅ **Sandbox integration working** end-to-end
- ✅ **Manual test procedures documented**