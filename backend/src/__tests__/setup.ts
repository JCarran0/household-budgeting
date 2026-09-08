import dotenv from 'dotenv';
import path from 'path';

// Load test environment variables with quiet mode to suppress tips
dotenv.config({ 
  path: path.join(__dirname, '../../.env.test'),
  quiet: true  // Suppress dotenv tips and warnings
});

// Set test environment
process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = 'test-secret-key-for-testing';
process.env.JWT_EXPIRES_IN = '1h';

// Most suites build their fixtures by registering several users through the
// real route, so they opt in to open registration explicitly (SA-10). This is
// an opt-in, not a bypass: the production default is closed, and the tests in
// `registration-policy.test.ts` delete this variable to exercise the closed
// path for real. Contrast SA-11, where rate limiting is short-circuited
// whenever NODE_ENV=test — a control that can never be tested is a control
// nobody has run.
process.env.ALLOW_OPEN_REGISTRATION = 'true';

// Mock console methods to reduce noise in tests
global.console = {
  ...console,
  error: jest.fn(),
  warn: jest.fn(),
  log: jest.fn(),
};

// Clear all mocks after each test
afterEach(() => {
  jest.clearAllMocks();
});

// Clean up after all tests
afterAll(() => {
  jest.restoreAllMocks();
});