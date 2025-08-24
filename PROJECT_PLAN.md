# Personal Budgeting App - Project Plan

## Overview
This document outlines the implementation plan for a personal budgeting app with Plaid integration, following Test-Driven Development (TDD) principles.

## Development Approach
- **Methodology**: Test-Driven Development (TDD)
- **Strategy**: MVP-first, incremental feature development
- **Tech Stack**: 
  - Backend: Node.js + Express + TypeScript
  - Frontend: React 18 + TypeScript + Vite + Tailwind CSS
  - Testing: Jest + React Testing Library
  - Integration: Plaid API

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

### 1.3 Authentication Service (TDD) ✅
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

## Phase 2: Core Backend Services (Week 2)

### 2.1 Plaid Integration
- [ ] Create test file: `backend/src/services/__tests__/plaidService.test.ts`
- [ ] Mock Plaid client and API responses
- [ ] Write tests for:
  - Link token creation
  - Public token exchange
  - Account data retrieval
  - Transaction fetching
  - Error handling
- [ ] Implement Plaid service with sandbox environment
- [ ] Create Plaid routes (`/api/plaid/link-token`, `/api/plaid/exchange-token`)

### 2.2 Account Management
- [ ] Create test file: `backend/src/services/__tests__/accountService.test.ts`
- [ ] Write tests for:
  - Storing Plaid account data
  - Account activation/deactivation
  - Account data retrieval
- [ ] Implement account service
- [ ] Create account routes

### 2.3 Transaction Service
- [ ] Create test file: `backend/src/services/__tests__/transactionService.test.ts`
- [ ] Write tests for:
  - Transaction sync from Plaid
  - Transaction categorization
  - Transaction filtering (date range, pending)
  - Manual transaction management
  - Transaction splitting
- [ ] Implement transaction service
- [ ] Create transaction routes

## Phase 3: Budget & Category Management (Week 3)

### 3.1 Category Service
- [ ] Create test file: `backend/src/services/__tests__/categoryService.test.ts`
- [ ] Write tests for:
  - Category hierarchy (parent/subcategory)
  - Category CRUD operations
  - Plaid category mapping
  - Hidden/savings category flags
- [ ] Implement category service
- [ ] Create category routes

### 3.2 Budget Service
- [ ] Create test file: `backend/src/services/__tests__/budgetService.test.ts`
- [ ] Write tests for:
  - Monthly budget creation
  - Budget copying from previous month
  - Budget vs actual calculations
  - Variance calculations
- [ ] Implement budget service
- [ ] Create budget routes

### 3.3 Reporting Service
- [ ] Create test file: `backend/src/services/__tests__/reportService.test.ts`
- [ ] Write tests for:
  - Spending trends by category
  - Budget vs actual reports
  - Cash flow projections
  - Income vs expense analysis
- [ ] Implement reporting service
- [ ] Create reporting routes

## Phase 4: Frontend Foundation (Week 4)

### 4.1 Frontend Setup
- [ ] Initialize Vite React TypeScript project
- [ ] Install dependencies:
  - `@tanstack/react-query zustand @headlessui/react @heroicons/react recharts axios`
  - Dev: `@testing-library/react @testing-library/jest-dom @testing-library/user-event`
- [ ] Configure Tailwind CSS
- [ ] Set up Jest and React Testing Library
- [ ] Configure API client with axios

### 4.2 Authentication UI
- [ ] Create test file: `frontend/src/components/__tests__/Login.test.tsx`
- [ ] Write tests for login component
- [ ] Implement Login component
- [ ] Create test file: `frontend/src/components/__tests__/Register.test.tsx`
- [ ] Write tests for register component
- [ ] Implement Register component
- [ ] Set up auth context/store with Zustand
- [ ] Implement protected routes

### 4.3 Core Layout
- [ ] Create app layout with navigation
- [ ] Implement dashboard skeleton
- [ ] Add loading states and error boundaries
- [ ] Set up React Query for data fetching

## Phase 5: Feature Implementation (Week 5)

### 5.1 Plaid Link Integration
- [ ] Create test file: `frontend/src/components/__tests__/PlaidLink.test.tsx`
- [ ] Implement Plaid Link component
- [ ] Handle link callbacks and token exchange
- [ ] Display connected accounts

### 5.2 Transaction Management UI
- [ ] Create test file: `frontend/src/components/__tests__/TransactionList.test.tsx`
- [ ] Implement transaction list with filtering
- [ ] Add transaction categorization UI
- [ ] Implement transaction splitting interface
- [ ] Add tag management

### 5.3 Budget Management UI
- [ ] Create test file: `frontend/src/components/__tests__/BudgetManager.test.tsx`
- [ ] Implement budget creation/editing
- [ ] Create budget vs actual visualization
- [ ] Add month navigation and copying

## Phase 6: Reports & Polish (Week 6)

### 6.1 Reporting Dashboard
- [ ] Create test file: `frontend/src/components/__tests__/Dashboard.test.tsx`
- [ ] Implement spending trends charts (Recharts)
- [ ] Add budget progress indicators
- [ ] Create cash flow projections view
- [ ] Implement category breakdown visualizations

### 6.2 Polish & Optimization
- [ ] Add comprehensive error handling
- [ ] Implement optimistic updates
- [ ] Add data export functionality
- [ ] Performance optimization (React.memo, useMemo)
- [ ] Accessibility improvements

### 6.3 Deployment Preparation
- [ ] Environment configuration
- [ ] Build optimization
- [ ] Security review
- [ ] Documentation updates

## Success Criteria
- [ ] 90%+ test coverage on business logic
- [ ] All user stories have passing tests
- [ ] Authentication system fully functional
- [ ] Plaid integration working in sandbox mode
- [ ] Transaction sync and categorization operational
- [ ] Budget creation and tracking functional
- [ ] Basic reporting available
- [ ] Frontend responsive and accessible

## Risk Mitigation
- **Plaid API Limits**: Use sandbox mode initially, implement caching
- **Data Storage**: Start with JSON files, plan migration path to database
- **Security**: Never store Plaid credentials, use environment variables
- **Performance**: Implement pagination for transactions early

## Next Immediate Actions
1. Initialize git repository
2. Create backend directory and initialize npm
3. Set up TypeScript and Jest configuration
4. Write first auth service test
5. Implement minimal auth service to pass test

## Notes
- Maintain TDD discipline throughout - no code without tests
- Commit after each passing test
- Keep PRs small and focused
- Document API endpoints as they're created
- Regular security reviews for auth and data handling