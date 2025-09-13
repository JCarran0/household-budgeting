// Mock for @octokit/rest to avoid ES module issues in Jest
export class Octokit {
  rest: {
    issues: {
      create: jest.Mock;
    };
    repos: {
      get: jest.Mock;
    };
  };

  constructor(_options?: unknown) {
    this.rest = {
      issues: {
        create: jest.fn(),
      },
      repos: {
        get: jest.fn(),
      },
    };
  }
}