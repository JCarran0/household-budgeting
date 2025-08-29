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

### Phase 2: Frontend Development ✅ COMPLETE
**Goal**: React frontend with authentication and Plaid Link integration

**What We Built**:
1. ✅ React 18 + TypeScript + Vite frontend with Tailwind CSS
2. ✅ JWT authentication with Zustand state management
3. ✅ Plaid Link integration with proper error handling
4. ✅ Dashboard, Accounts, and Transactions pages
5. ✅ Protected routes and API integration

**Critical Lessons Learned**:
- **Environment Variables**: Must load `dotenv.config()` BEFORE importing app to ensure env vars are available
- **Plaid Link Integration**: Use conditional rendering to avoid null config errors
- **React StrictMode**: Causes double-mounting in development, must handle carefully with Plaid
- **API Response Format**: Use snake_case for Plaid responses (link_token not linkToken)
- **Token on Registration**: Return JWT token on registration for auto-login UX

### Phase 3: Core Features (Next)

**TDD Focus**:
1. Transaction categorization and tagging logic
2. Category hierarchy management
3. Monthly budget calculations
4. Transaction splitting functionality

**Key Files to Create**:
- `backend/src/services/__tests__/transactionService.test.ts`
- `backend/src/services/__tests__/categoryService.test.ts`
- `backend/src/services/__tests__/budgetService.test.ts`

### Phase 4: Reports & Analytics (Week 5)
**Goal**: Reporting, charts, data visualization

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

### Prerequisites
- Node.js 20+
- npm or yarn
- Plaid sandbox account (free at https://dashboard.plaid.com/signup)

### Initial Setup
```bash
# Clone the repository
git clone <repository-url>
cd household-budgeting

# Install backend dependencies
cd backend
npm install

# Install frontend dependencies
cd ../frontend
npm install

# Set up environment variables
cp .env.example .env
# Edit .env with your Plaid credentials
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
✅ **Phase 1 & 2 Complete**: Backend + Frontend with Plaid integration
- JWT authentication with rate limiting
- Plaid sandbox integration tested
- React frontend with full authentication flow
- Plaid Link UI working in sandbox mode

### Next Priority: Transaction Management
1. **Sync transactions** - Pull from 2025-01-01
2. **Store & categorize** - Persist with proper types
3. **Build categorization UI** - Allow manual categorization
4. **Implement transaction splits** - For shared expenses

### Type Safety Checklist
- [x] Replace all `any` with proper types
- [x] Enable strict TypeScript config
- [x] Create shared type definitions
- [ ] Add runtime validation with Zod

## Success Metrics
- ✅ **Zero runtime type errors** - TypeScript catches all
- ✅ **Critical paths tested** - Auth, money, data integrity
- ✅ **Fast feedback loops** - Direct testing > mocking
- ✅ **No `any` types** in production code
- ✅ **Sandbox integration working** end-to-end
- ✅ **Manual test procedures documented**
- ✅ **Frontend working with Plaid Link** - No duplicate script warnings
- ✅ **JWT auth flow complete** - Login, register, protected routes

## Troubleshooting Guide for AI Assistants

### Common Issues and Solutions

#### 1. Plaid Link Duplicate Script Warning
**Problem**: "The Plaid link-initialize.js script was embedded more than once"
**Solution**: 
- Use conditional rendering - only mount PlaidLink component when token exists
- Never pass null config to `usePlaidLink` hook
- Avoid multiple instances of components using `usePlaidLink`

#### 2. Environment Variables Not Loading
**Problem**: "PLAID_CLIENT_ID and PLAID_SECRET must be set"
**Solution**:
```typescript
// backend/src/index.ts
import dotenv from 'dotenv';
dotenv.config(); // MUST be before app import
import app from './app';
```

#### 3. Frontend Can't Connect to Backend
**Problem**: "ERR_CONNECTION_REFUSED" on API calls
**Solution**:
- Ensure backend is running: `cd backend && npm run dev`
- Check backend is on port 3001
- Verify CORS is configured for frontend origin

#### 4. JWT Token Not Returned on Registration
**Problem**: User can't auto-login after registration
**Solution**: Return token from authService.register() method

#### 5. React StrictMode Double-Mounting
**Problem**: Components mount twice in development
**Solution**: 
- Use refs and global state for singleton behavior
- Check `process.env.NODE_ENV` to detect development mode
- Design components to be idempotent