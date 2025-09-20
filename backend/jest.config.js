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
    '!src/**/*.d.ts',
  ],
  setupFilesAfterEnv: ['<rootDir>/src/__tests__/setup.ts'],
  clearMocks: true,
  verbose: true,
  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/src/$1',
    '^@shared/(.*)$': '<rootDir>/../shared/$1',
    // Map all possible relative shared paths to the actual shared directory
    '^\\.\\./shared/(.*)$': '<rootDir>/../shared/$1',
    '^\\.\\./\\.\\./shared/(.*)$': '<rootDir>/../shared/$1',
    '^\\.\\./\\.\\./\\.\\./shared/(.*)$': '<rootDir>/../shared/$1',
    // Also handle absolute shared paths that might appear
    '^shared/(.*)$': '<rootDir>/../shared/$1',
    '@octokit/rest': '<rootDir>/src/__tests__/__mocks__/@octokit/rest.ts',
  },
};