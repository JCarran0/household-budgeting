# Personal Budgeting App Development Guide

## Project Overview
Building a personal budgeting app for 2 users with Plaid integration. Using Test-Driven Development (TDD) approach with MVP-first strategy.

## Architecture
- **Frontend**: React 18 + TypeScript + Vite + Tailwind CSS
- **Backend**: Node.js + Express + TypeScript  
- **Storage**: JSON files (MVP) → S3 → PostgreSQL (future)
- **Testing**: Jest + React Testing Library
- **Integration**: Plaid API for Bank of America (checking/savings) + Capital One (credit card)

## Development Approach: Test-Driven Development (TDD)

### TDD Workflow
1. **Write failing test** - Define expected behavior first
2. **Write minimal code** - Make the test pass
3. **Refactor** - Improve code while keeping tests green
4. **Repeat** - Build functionality incrementally

### Testing Strategy
- **Unit Tests**: Business logic, utilities, data services
- **Integration Tests**: API endpoints, Plaid service integration  
- **Component Tests**: React components with React Testing Library
- **E2E Tests**: Critical user flows (login, transaction sync, budget creation)

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

### Phase 1: Foundation (Weeks 1-2)
**Goal**: Authentication, project setup, basic Plaid integration

**TDD Focus**:
1. Start with auth service tests (JWT creation, validation)
2. Test Plaid service integration (mock Plaid API responses)
3. Test basic data service (JSON file CRUD operations)

**Key Files to Create**:
- `backend/src/services/__tests__/authService.test.ts`
- `backend/src/services/__tests__/plaidService.test.ts`
- `backend/src/services/__tests__/dataService.test.ts`

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

## Key Implementation Guidelines

### 1. Always Write Tests First
- Define expected behavior in tests before writing implementation
- Use descriptive test names: `should return error when invalid credentials provided`
- Mock external dependencies (Plaid API, file system) in unit tests

### 2. Keep Tests Fast and Isolated
- Use in-memory data for tests (don't write to actual JSON files)
- Mock network calls to Plaid API
- Each test should be independent and not rely on other tests

### 3. Focus on Business Logic Testing
- Test calculations (budget vs actual, cash flow projections)
- Test data transformations (Plaid transactions → internal format)
- Test validation logic (budget amounts, category constraints)

### 4. Component Testing Strategy
- Test component behavior, not implementation details
- Focus on user interactions and state changes
- Use React Testing Library's user-centric approach

### 5. Error Handling
- Test error scenarios thoroughly (network failures, invalid data)
- Ensure graceful degradation when Plaid API is unavailable
- Validate all user inputs and API responses

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

## First Development Task

**Start with the most critical foundation: Authentication Service**

1. Create `backend/src/services/__tests__/authService.test.ts`
2. Write failing tests for user registration, login, JWT creation
3. Implement minimal `backend/src/services/authService.ts` to make tests pass
4. Add validation and error handling
5. Create auth routes and middleware

This TDD approach will ensure solid, tested foundation for the entire application.

## Success Metrics
- ✅ 90%+ test coverage on business logic
- ✅ All user stories have corresponding test cases
- ✅ Zero failing tests in CI/CD pipeline
- ✅ Fast test suite (< 30 seconds total run time)
- ✅ Comprehensive error handling and edge case coverage