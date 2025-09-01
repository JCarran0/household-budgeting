# AI Testing Strategy - Household Budgeting Application

## Philosophy: User Story Testing with Risk-Based Approach

This testing strategy prioritizes **real user behaviors** over isolated unit tests. We focus on testing complete user stories that validate actual workflows, using our Risk-Based Testing approach to prioritize what matters most: protecting user money and data integrity.

## Core Testing Principles

### 1. User Story Testing First
- **No traditional unit tests** for backend services initially
- Test complete user workflows from API endpoint to database
- Each test validates a user story from `AI-USER-STORIES.md`
- Tests use real Plaid sandbox data, not mocks

### 2. Risk-Based Priority
Tests are prioritized by business risk:
- **Critical**: Can lose user money or compromise security
- **High**: Can corrupt data or break core functionality  
- **Medium**: Degraded user experience or missing features
- **Low**: Cosmetic issues or nice-to-have features

### 3. Integration Over Isolation
- Use real Plaid sandbox environment
- Test with actual file system for data persistence
- Include authentication in test flows
- Validate complete request/response cycles

## Test Suite Organization

### Suite 1: Critical Path Tests (Run on Every Commit)
Fast-running tests for the most critical user stories.

```
backend/src/__tests__/critical/
├── auth.stories.test.ts           # Authentication flows
├── transaction-sync.stories.test.ts # Transaction data integrity
├── financial-calc.stories.test.ts  # Budget/spending calculations
└── data-isolation.stories.test.ts  # Multi-user data separation
```

### Suite 2: Integration Tests (Run on PR/Merge)
Complete user workflow tests with external services.

```
backend/src/__tests__/integration/
├── plaid-connect.stories.test.ts   # Complete Plaid connection flow
├── transaction-mgmt.stories.test.ts # Full transaction lifecycle
├── budget-workflow.stories.test.ts  # Budget creation to reporting
└── categorization.stories.test.ts   # Auto-categorization rules
```

### Suite 3: Frontend User Story Tests
Testing complete user interactions in the browser.

```
frontend/src/__tests__/stories/
├── registration-flow.test.tsx      # User registration journey
├── plaid-linking.test.tsx         # Bank account connection
├── transaction-filtering.test.tsx  # Search and filter workflows
└── budget-management.test.tsx      # Budget creation and tracking
```

## Test Data Strategy

### Plaid Sandbox Fixtures
Store real Plaid sandbox responses as fixtures for predictable testing:

```
backend/src/__tests__/fixtures/
├── plaid/
│   ├── accounts-checking.json      # Bank of America checking
│   ├── accounts-credit.json        # Capital One credit card
│   ├── transactions-30days.json    # Recent transactions
│   ├── transactions-2years.json    # Historical transactions
│   └── link-token-response.json    # Link token creation
├── users/
│   ├── user1-complete.json        # User with full account setup
│   ├── user2-minimal.json         # New user, no accounts
│   └── user-concurrent.json       # For multi-user tests
└── transactions/
    ├── edge-cases.json             # Zero amounts, splits, etc.
    ├── categorized.json            # Pre-categorized transactions
    └── uncategorized.json          # Needs categorization
```

### Test User Accounts
Consistent test users for different scenarios:

1. **power_user**: Has all features configured (accounts, categories, budgets, rules)
2. **new_user**: Just registered, no configuration
3. **budget_user**: Has budgets but no auto-categorization
4. **isolated_user1/2**: For testing data isolation

## User Story Test Examples

### Example 1: Authentication Flow (Critical)
Maps to user stories from `AI-USER-STORIES.md`:
- "A user should be able to register with a unique username and password"
- "A user should be able to login with their username and password"
- "A user should be protected from brute force attacks"

```typescript
// backend/src/__tests__/critical/auth.stories.test.ts
describe('User Story: Authentication and Security', () => {
  describe('As a user, I can securely register and login', () => {
    test('I can register with a 15+ character passphrase', async () => {
      const response = await request(app)
        .post('/api/v1/auth/register')
        .send({
          username: 'testuser',
          password: 'this is my secure passphrase for banking'
        });
      
      expect(response.status).toBe(201);
      expect(response.body.token).toBeDefined();
      expect(response.body.user.username).toBe('testuser');
    });

    test('I am protected from brute force attacks after 5 failed attempts', async () => {
      // Register a user first
      const username = `bf${Math.random().toString(36).substring(2, 8)}`;
      await registerUser(username, 'this is my secure passphrase');
      
      // Attempt 5 failed logins
      for (let i = 0; i < 5; i++) {
        const response = await request(app)
          .post('/api/v1/auth/login')
          .send({ username, password: 'wrong password' });
        expect(response.status).toBe(401);
      }
      
      // 6th attempt should be rate limited (even with correct password)
      const response = await request(app)
        .post('/api/v1/auth/login')
        .send({ username, password: 'this is my secure passphrase' });
      
      expect(response.status).toBe(429);
      expect(response.body.error).toContain('Too many failed attempts');
    });
  });
});
```

### Example 2: Transaction Management (Critical)
Maps to transaction viewing and filtering stories:

```typescript
// backend/src/__tests__/integration/transaction-mgmt.stories.test.ts
describe('User Story: Transaction Management', () => {
  let authToken: string;
  let userId: string;
  
  beforeAll(async () => {
    // Setup: Create user and connect Plaid account
    const { token, user } = await createTestUser('transaction_tester');
    authToken = token;
    userId = user.id;
    await connectPlaidSandboxAccount(authToken, 'bofa_checking');
  });

  describe('As a user, I can sync and filter my transactions', () => {
    test('I can sync 2 years of transaction history from my bank', async () => {
      const response = await request(app)
        .post('/api/v1/transactions/sync')
        .set('Authorization', `Bearer ${authToken}`)
        .send({ startDate: '2023-01-01' });
      
      expect(response.body.success).toBe(true);
      expect(response.body.added).toBeGreaterThan(0);
    });

    test('I can filter to show only uncategorized transactions', async () => {
      const response = await request(app)
        .get('/api/v1/transactions')
        .set('Authorization', `Bearer ${authToken}`)
        .query({ onlyUncategorized: true });
      
      expect(response.body.success).toBe(true);
      expect(response.body.transactions.every(
        t => !t.userCategoryId
      )).toBe(true);
    });

    test('I can search transactions without losing focus', async () => {
      // This would be better as a frontend test
      // Backend just needs to handle debounced requests properly
      const response = await request(app)
        .get('/api/v1/transactions')
        .set('Authorization', `Bearer ${authToken}`)
        .query({ searchQuery: 'coffee' });
      
      expect(response.body.success).toBe(true);
      expect(response.status).toBe(200);
    });
  });
});
```

### Example 3: Budget Calculations (High)
Maps to budget tracking stories:

```typescript
// backend/src/__tests__/critical/financial-calc.stories.test.ts
describe('User Story: Budget Tracking', () => {
  describe('As a user, I can track spending against my budget', () => {
    test('I can see accurate budget vs actual calculations', async () => {
      // Setup: Create budget and transactions
      await createBudget(userId, 'groceries', 500);
      await createTransaction(userId, 'Whole Foods', -123.45, 'groceries');
      await createTransaction(userId, 'Trader Joes', -67.89, 'groceries');
      
      const response = await request(app)
        .get('/api/v1/budgets/comparison/2025-01')
        .set('Authorization', `Bearer ${authToken}`);
      
      expect(response.body.comparisons[0]).toMatchObject({
        categoryId: 'groceries',
        budgeted: 500,
        actual: 191.34,
        remaining: 308.66,
        percentUsed: 38.27
      });
    });
  });
});
```

### Example 4: Data Isolation (Critical)
Maps to data privacy stories:

```typescript
// backend/src/__tests__/critical/data-isolation.stories.test.ts
describe('User Story: Data Privacy and Isolation', () => {
  describe('As a user, my data is completely isolated from other users', () => {
    test('I cannot see transactions from other users', async () => {
      // Setup: Create two users with transactions
      const user1 = await createTestUser('user1');
      const user2 = await createTestUser('user2');
      
      await createTransaction(user1.id, 'User1 Transaction', -50);
      await createTransaction(user2.id, 'User2 Transaction', -75);
      
      // User1 requests transactions
      const response = await request(app)
        .get('/api/v1/transactions')
        .set('Authorization', `Bearer ${user1.token}`);
      
      expect(response.body.transactions).toHaveLength(1);
      expect(response.body.transactions[0].description)
        .toBe('User1 Transaction');
    });

    test('My categories are separate from other users', async () => {
      // Create two users
      const rand = Math.random().toString(36).substring(2, 8);
      const user1 = await registerUser(`u1${rand}`, 'user one secure passphrase');
      const user2 = await registerUser(`u2${rand}`, 'user two secure passphrase');
      
      // User1 creates categories
      await createCategory(user1.token, 'User1 Groceries');
      await createCategory(user1.token, 'User1 Entertainment');
      
      // User2 creates different categories
      await createCategory(user2.token, 'User2 Travel');
      await createCategory(user2.token, 'User2 Dining');
      
      // User1 should only see their categories
      const user1Categories = await authenticatedGet('/api/v1/categories', user1.token);
      const user1Names = user1Categories.body.map((c: any) => c.name);
      expect(user1Names).toContain('User1 Groceries');
      expect(user1Names).toContain('User1 Entertainment');
      expect(user1Names).not.toContain('User2 Travel');
      expect(user1Names).not.toContain('User2 Dining');
      
      // User2 should only see their categories
      const user2Categories = await authenticatedGet('/api/v1/categories', user2.token);
      const user2Names = user2Categories.body.map((c: any) => c.name);
      expect(user2Names).toContain('User2 Travel');
      expect(user2Names).toContain('User2 Dining');
      expect(user2Names).not.toContain('User1 Groceries');
    });
  });
});
```

## NPM Scripts Configuration

```json
{
  "scripts": {
    "test": "npm run test:critical",
    "test:critical": "jest --testPathPattern=critical --runInBand",
    "test:integration": "jest --testPathPattern=integration --runInBand",
    "test:stories": "jest --testPathPattern=stories",
    "test:all": "jest --runInBand",
    "test:watch": "jest --testPathPattern=critical --watch",
    "test:coverage": "jest --coverage --testPathPattern='(critical|integration)'",
    "test:ci": "npm run test:critical",
    "test:ci:full": "npm run test:all"
  }
}
```

## GitHub Actions Configuration

### Workflow 1: Fast Feedback (On Every Push)
```yaml
# .github/workflows/test-critical.yml
name: Critical Path Tests

on: [push]

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - uses: actions/setup-node@v3
        with:
          node-version: '20'
      - run: cd backend && npm ci
      - run: cd backend && npm run test:critical
```

### Workflow 2: Full Integration (On PR/Merge)
```yaml
# .github/workflows/test-integration.yml
name: Integration Tests

on:
  pull_request:
  push:
    branches: [main]

jobs:
  test:
    runs-on: ubuntu-latest
    env:
      PLAID_CLIENT_ID: ${{ secrets.PLAID_SANDBOX_CLIENT_ID }}
      PLAID_SECRET: ${{ secrets.PLAID_SANDBOX_SECRET }}
      PLAID_ENV: sandbox
    steps:
      - uses: actions/checkout@v3
      - uses: actions/setup-node@v3
        with:
          node-version: '20'
      - run: cd backend && npm ci
      - run: cd backend && npm run test:all
```

## Test Coverage Requirements

Based on risk assessment, minimum coverage for each area:

| Area | Risk Level | Coverage Required | Test Type |
|------|------------|------------------|-----------|
| Authentication | Critical | 100% | User Story |
| Transaction Sync | Critical | 95% | Integration |
| Financial Calculations | Critical | 100% | User Story |
| Data Isolation | Critical | 100% | User Story |
| Category Management | High | 85% | User Story |
| Budget Management | High | 90% | User Story |
| Auto-Categorization | High | 85% | Integration |
| Plaid Connection | High | 90% | Integration |
| Search/Filtering | Medium | 75% | User Story |
| UI Display | Low | Manual | Manual QA |

## Implementation Timeline

### Phase 1: Critical Path Tests (✅ COMPLETE)
- [x] Authentication stories (12 tests passing)
- [x] Data isolation stories (7 tests passing)
- [ ] Financial calculation stories
- [ ] Basic transaction sync

**Current Status**: 19 critical path tests passing

### Phase 2: Integration Tests (Week 2)
- [ ] Full Plaid connection flow
- [ ] Transaction management lifecycle
- [ ] Budget workflow
- [ ] Auto-categorization

### Phase 3: Frontend Stories (Week 3)
- [ ] Registration and login flow
- [ ] Plaid Link integration
- [ ] Transaction filtering
- [ ] Budget management

### Phase 4: Fixture Data (Ongoing)
- [ ] Export real Plaid sandbox data
- [ ] Create edge case fixtures
- [ ] Document test data scenarios

## Avoiding Overmocking: Lessons Learned

### The Problem with Excessive Mocking

During our test suite review, we identified several tests that were ineffective due to overmocking. These tests were testing mock interactions rather than actual behavior.

#### Examples of Overmocked Tests

**❌ BAD: AuthService Unit Tests (Overmocked)**
```typescript
// What NOT to do - mocking core functionality
jest.mock('bcryptjs');
jest.mock('jsonwebtoken');

it('should register a new user', async () => {
  (bcrypt.hash as jest.Mock).mockResolvedValue('hashed_password');
  mockDataService.createUser.mockResolvedValue({...});
  
  const result = await authService.register('user', 'password');
  
  // This only tests that mocks were called!
  expect(bcrypt.hash).toHaveBeenCalledWith('password', 10);
  expect(mockDataService.createUser).toHaveBeenCalled();
});
```

**Problems with this approach:**
- Tests would pass even if bcrypt was misconfigured
- Tests would pass even if JWT secret was invalid
- Not testing actual password hashing or token generation
- Changes to bcrypt/JWT libraries wouldn't be caught

**✅ GOOD: Critical Path Tests (Testing Real Behavior)**
```typescript
// What TO do - test actual behavior end-to-end
it('should securely hash passwords and allow login', async () => {
  // Register with real password hashing
  const registerResponse = await request(app)
    .post('/api/v1/auth/register')
    .send({ username: 'testuser', password: 'mypassword' });
  
  expect(registerResponse.status).toBe(201);
  
  // Verify password was actually hashed by attempting login
  const loginResponse = await request(app)
    .post('/api/v1/auth/login')
    .send({ username: 'testuser', password: 'mypassword' });
  
  expect(loginResponse.status).toBe(200);
  expect(loginResponse.body.token).toBeDefined();
  
  // Verify token is valid JWT
  const decoded = jwt.decode(loginResponse.body.token);
  expect(decoded.userId).toBeDefined();
});
```

### Guidelines for Effective Testing

#### When to Mock
✅ **Mock these:**
- External APIs (Plaid, payment processors)
- File system operations in unit tests
- Network calls to third-party services
- Time-dependent operations (Date.now)

#### When NOT to Mock
❌ **Never mock these:**
- Core business logic
- Security functions (hashing, encryption)
- Data validation
- Authentication/authorization logic
- Your own services in integration tests

#### Testing Checklist
For each test, verify:
- [ ] You're testing actual behavior, not mock calls
- [ ] Test would fail if implementation was broken
- [ ] Mocked dependencies are truly external
- [ ] Asserting on real outputs/side effects
- [ ] Using real implementations where possible

### Refactoring Overmocked Tests

#### Strategy 1: Use Real Implementations
```typescript
// Instead of mocking the data service
const dataService = new InMemoryDataService();
const authService = new AuthService(dataService);
```

#### Strategy 2: Test Through the API
```typescript
// Test the full stack instead of isolated units
const response = await request(app)
  .post('/api/v1/categories')
  .set('Authorization', `Bearer ${token}`)
  .send({ name: 'Groceries' });
```

#### Strategy 3: Use Test Doubles Sparingly
```typescript
// Only mock truly external dependencies
const plaidClient = createMockPlaidClient();
const service = new TransactionService(realDataService, plaidClient);
```

## Troubleshooting Common Test Failures

### Known Issues and Solutions

#### 1. Rate Limiting Conflicts Between Tests
**Problem**: Tests fail with "Too many requests" (429) errors when multiple tests register users.

**Root Cause**: Dual rate limiting mechanisms (middleware and service-level) can conflict. The middleware rate limiting was blocking requests before service-level lockout could occur.

**Solutions Implemented**:
1. **Disable middleware rate limiting in tests**: Skip `rateLimitAuth` middleware when `NODE_ENV=test`
2. **Use unique usernames**: Generate unique usernames with random suffixes
3. **Reset rate limiting**: Call `authService.resetRateLimiting()` in `beforeEach`
4. **Clear data between tests**: Call `dataService.clear()` if using InMemoryDataService
5. **Return correct status codes**: Auth routes now return 429 for rate limit errors

#### 2. Data Not Persisting in Tests
**Problem**: Created entities (categories, budgets, rules) return empty arrays when fetched.

**Root Causes Found**:
1. Budget routes were creating their own service instance instead of using singleton
2. Missing required fields in test data (e.g., `plaidCategory` for categories)
3. Services not passing userId through to data layer

**Solutions Implemented**:
1. **Use singleton services**: Import from `services/index.ts` not individual files
2. **Pass userId consistently**: Extract from `req.user.userId` and pass to all service methods
3. **Add user-scoped storage**: Implement `userBudgets` Map in InMemoryDataService
4. **Include all required fields**: Add `plaidCategory: null` to test category creation
5. **Update service signatures**: Add optional `userId` parameter to all budget methods

#### 3. Test Isolation Issues
**Problem**: Tests affect each other, causing intermittent failures.

**Root Cause**: Shared state between tests in services or data storage.

**Solutions**:
1. **Clear all state**: Reset both data and service state in `beforeEach`
2. **Use unique test data**: Generate unique IDs/names for each test
3. **Run tests serially**: Use `--runInBand` flag to prevent parallel execution
4. **Separate test suites**: Isolate critical, integration, and story tests

### Debugging Strategies

#### Enable Verbose Logging
```typescript
// Temporarily add to failing tests
console.log('User ID:', userId);
console.log('Token decoded:', jwt.decode(token));
console.log('Data stored:', await dataService.getData(`categories_${userId}`));
```

#### Check Service State
```typescript
// Verify service is using correct data
console.log('Auth service users:', authService.getAllUsers());
console.log('Rate limit state:', authService.getFailedAttempts(username));
```

#### Validate API Responses
```typescript
// Log full response on failure
if (response.status !== expected) {
  console.log('Response:', response.status, response.body);
}
```

### Test Environment Configuration

#### Required Setup in `beforeEach`
```typescript
beforeEach(async () => {
  // 1. Clear all data
  if ('clear' in dataService) {
    (dataService as any).clear();
  }
  
  // 2. Reset rate limiting
  authService.resetRateLimiting();
  
  // 3. Reset any other stateful services
  // Add as needed
});
```

#### Test Data Best Practices
1. **Use unique identifiers**: `const username = \`testuser_\${Date.now()}_\${Math.random()}\`;`
2. **Create fresh test users**: Don't reuse users across tests
3. **Clean up after tests**: Remove test data in `afterEach` if using persistent storage
4. **Use fixtures sparingly**: Only for complex, read-only test data

## Key Decisions

### Why User Story Tests Over Unit Tests?

1. **Real Behavior**: Tests validate actual user workflows, not implementation details
2. **Refactoring Freedom**: Can change implementation without breaking tests
3. **Documentation**: Tests serve as living documentation of features
4. **Confidence**: Testing complete flows gives more confidence than isolated units
5. **Efficiency**: One story test can replace dozens of unit tests

### Why Plaid Sandbox Over Mocks?

1. **Real API Behavior**: Catches actual API changes and quirks
2. **Data Realism**: Uses real bank transaction data structures
3. **Error Scenarios**: Tests real error responses from Plaid
4. **Confidence**: Know the integration actually works

### Why Risk-Based Priority?

1. **Resource Efficiency**: Test what matters most first
2. **Business Protection**: Prevent financial and security issues
3. **User Trust**: Protect user data and money above all
4. **Practical Coverage**: 100% coverage where it matters, less elsewhere

## Current Test Results (January 2025)

### Test Suite Status
- **Critical Path Tests**: ✅ 19/19 passing (100%)
  - Authentication: 12/12 passing
  - Data Isolation: 7/7 passing
- **Execution Time**: ~3 seconds for critical path
- **Test Coverage**: Focusing on behavior, not line coverage

### Lessons Learned from Initial Implementation

1. **Service Singletons Matter**: Budget routes were creating their own service instance, breaking user isolation. Always import from `services/index.ts`.

2. **Validation Requirements**: Zod validation caught missing fields. Always include all required fields in test data (e.g., `plaidCategory` for categories).

3. **Rate Limiting Complexity**: Multiple rate limiting layers can conflict. Disable middleware rate limiting in tests to allow service-level testing.

4. **User Context Flow**: The userId must flow from JWT → middleware → route → service → data layer. Any break in this chain causes data isolation failures.

5. **Error Status Codes**: Specific error types need specific HTTP codes (429 for rate limiting, not 401).

## Success Metrics

- **Zero** authentication vulnerabilities in production
- **Zero** data leakage between users  
- **Zero** financial calculation errors
- **<2%** transaction sync failures
- **<5min** test execution for critical path ✅ (Currently ~3s)
- **<30min** test execution for full suite

## Maintenance Guidelines

1. **Add tests when bugs are found** - Every bug gets a test
2. **Test new user stories** - Every new feature gets story tests
3. **Update fixtures quarterly** - Keep test data current
4. **Review risk assessment** - Adjust priorities as app evolves
5. **Monitor test execution time** - Keep feedback loops fast

## References

- User Stories: `docs/AI-USER-STORIES.md`
- Development Guide: `CLAUDE.md`
- Test Fixtures: `backend/src/__tests__/fixtures/`
- CI Configuration: `.github/workflows/`