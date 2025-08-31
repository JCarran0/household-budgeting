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
      // Attempt 5 failed logins
      for (let i = 0; i < 5; i++) {
        await request(app)
          .post('/api/v1/auth/login')
          .send({ username: 'testuser', password: 'wrong' });
      }
      
      // 6th attempt should be rate limited
      const response = await request(app)
        .post('/api/v1/auth/login')
        .send({ username: 'testuser', password: 'correct' });
      
      expect(response.status).toBe(429);
      expect(response.body.error).toContain('locked');
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
      const user1 = await createTestUser('category_user1');
      const user2 = await createTestUser('category_user2');
      
      // User1 creates a category
      await request(app)
        .post('/api/v1/categories')
        .set('Authorization', `Bearer ${user1.token}`)
        .send({ name: 'User1 Category' });
      
      // User2 should not see it
      const response = await request(app)
        .get('/api/v1/categories')
        .set('Authorization', `Bearer ${user2.token}`);
      
      expect(response.body.categories).toHaveLength(0);
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

### Phase 1: Critical Path Tests (Week 1)
- [ ] Authentication stories
- [ ] Data isolation stories
- [ ] Financial calculation stories
- [ ] Basic transaction sync

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

## Success Metrics

- **Zero** authentication vulnerabilities in production
- **Zero** data leakage between users
- **Zero** financial calculation errors
- **<2%** transaction sync failures
- **<5min** test execution for critical path
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