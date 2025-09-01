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