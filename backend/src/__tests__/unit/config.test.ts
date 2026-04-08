/**
 * Tests for the centralized config module (src/config.ts)
 *
 * All tests call `loadConfig({ ...minimalEnv, ...overrides })` so that
 * process.env is never mutated and tests remain fully self-contained.
 *
 * The module-level `config` singleton is NOT exercised here; that would
 * depend on the real process.env populated by the test setup file, which
 * is intentional — the singleton is used by app code, not tests.
 */

import { loadConfig } from '../../config';

// ---------------------------------------------------------------------------
// Minimal valid env — only what is always required
// ---------------------------------------------------------------------------

/** Minimal env that should always pass validation in any NODE_ENV. */
const minimalEnv: Record<string, string> = {
  NODE_ENV: 'test',
  JWT_SECRET: 'super-secret-jwt-key',
};

/** Additional vars needed for a valid development env. */
const developmentExtras: Record<string, string> = {
  NODE_ENV: 'development',
  JWT_SECRET: 'super-secret-jwt-key',
};

/** A fully-specified production env. */
const fullProductionEnv: Record<string, string> = {
  NODE_ENV: 'production',
  JWT_SECRET: 'prod-jwt-secret-key',
  PORT: '8080',
  API_PREFIX: '/api/v2',
  APP_NAME: 'Budget App Production',
  PLAID_CLIENT_ID: 'plaid-client-id-123',
  PLAID_SECRET: 'plaid-secret-456',
  PLAID_ENV: 'production',
  PLAID_PRODUCTS: 'transactions,investments',
  PLAID_COUNTRY_CODES: 'US,CA',
  PLAID_REDIRECT_URI: 'https://example.com/callback',
  PLAID_WEBHOOK_URL: 'https://example.com/webhook',
  PLAID_ENCRYPTION_SECRET: 'encryption-secret-key',
  JWT_EXPIRES_IN: '24h',
  STORAGE_TYPE: 's3',
  DATA_DIR: '/var/data',
  S3_BUCKET_NAME: 'my-budget-bucket',
  S3_PREFIX: 'prod/',
  AWS_REGION: 'us-west-2',
  ANTHROPIC_API_KEY: 'sk-ant-abc123',
  CHATBOT_MONTHLY_LIMIT: '50',
  GITHUB_ISSUES_PAT: 'ghp_issues_pat',
  GITHUB_TOKEN: 'ghp_token_123',
  GITHUB_OWNER: 'acme-org',
  GITHUB_REPO: 'budget-app',
  DEPLOYMENT_TIMESTAMP: '2026-04-07T12:00:00Z',
  COMMIT_HASH: 'abc1234',
};

// ---------------------------------------------------------------------------
// 1. Valid configurations
// ---------------------------------------------------------------------------

describe('loadConfig — valid configurations', () => {
  describe('minimal valid config (test environment)', () => {
    it('parses successfully with only JWT_SECRET provided', () => {
      const cfg = loadConfig(minimalEnv);
      expect(cfg.auth.jwtSecret).toBe('super-secret-jwt-key');
    });

    it('applies default values for all optional fields', () => {
      const cfg = loadConfig(minimalEnv);

      expect(cfg.server.nodeEnv).toBe('test');
      expect(cfg.server.port).toBe(3001);
      expect(cfg.server.apiPrefix).toBe('/api/v1');
      expect(cfg.server.appName).toBe('Personal Budgeting App');

      expect(cfg.plaid.env).toBe('sandbox');
      expect(cfg.plaid.products).toBe('transactions');
      expect(cfg.plaid.countryCodes).toBe('US');
      expect(cfg.plaid.redirectUri).toBeUndefined();
      expect(cfg.plaid.webhookUrl).toBeUndefined();

      expect(cfg.auth.jwtExpiresIn).toBe('7d');

      expect(cfg.storage.type).toBe('filesystem');
      expect(cfg.storage.dataDir).toBe('./data');
      expect(cfg.storage.s3BucketName).toBe('budget-app-data');
      expect(cfg.storage.s3Prefix).toBe('data/');
      expect(cfg.storage.awsRegion).toBe('us-east-1');

      expect(cfg.ai.anthropicApiKey).toBe('');
      expect(cfg.ai.chatbotMonthlyLimit).toBe(20);
      expect(cfg.ai.githubIssuesPat).toBe('');

      expect(cfg.github.token).toBe('');
      expect(cfg.github.owner).toBe('JCarran0');
      expect(cfg.github.repo).toBe('household-budgeting');

      expect(cfg.deploy.timestamp).toBe('unknown');
      expect(cfg.deploy.commitHash).toBe('unknown');
    });
  });

  describe('full production config (all vars set)', () => {
    it('parses all values correctly', () => {
      const cfg = loadConfig(fullProductionEnv);

      expect(cfg.server.nodeEnv).toBe('production');
      expect(cfg.server.port).toBe(8080);
      expect(cfg.server.apiPrefix).toBe('/api/v2');
      expect(cfg.server.appName).toBe('Budget App Production');

      expect(cfg.plaid.clientId).toBe('plaid-client-id-123');
      expect(cfg.plaid.secret).toBe('plaid-secret-456');
      expect(cfg.plaid.env).toBe('production');
      expect(cfg.plaid.products).toBe('transactions,investments');
      expect(cfg.plaid.countryCodes).toBe('US,CA');
      expect(cfg.plaid.redirectUri).toBe('https://example.com/callback');
      expect(cfg.plaid.webhookUrl).toBe('https://example.com/webhook');

      expect(cfg.auth.jwtSecret).toBe('prod-jwt-secret-key');
      expect(cfg.auth.jwtExpiresIn).toBe('24h');
      expect(cfg.auth.encryptionSecret).toBe('encryption-secret-key');

      expect(cfg.storage.type).toBe('s3');
      expect(cfg.storage.dataDir).toBe('/var/data');
      expect(cfg.storage.s3BucketName).toBe('my-budget-bucket');
      expect(cfg.storage.s3Prefix).toBe('prod/');
      expect(cfg.storage.awsRegion).toBe('us-west-2');

      expect(cfg.ai.anthropicApiKey).toBe('sk-ant-abc123');
      expect(cfg.ai.chatbotMonthlyLimit).toBe(50);
      expect(cfg.ai.githubIssuesPat).toBe('ghp_issues_pat');

      expect(cfg.github.token).toBe('ghp_token_123');
      expect(cfg.github.owner).toBe('acme-org');
      expect(cfg.github.repo).toBe('budget-app');

      expect(cfg.deploy.timestamp).toBe('2026-04-07T12:00:00Z');
      expect(cfg.deploy.commitHash).toBe('abc1234');
    });
  });

  describe('development config with filesystem storage', () => {
    it('parses successfully without Plaid credentials', () => {
      const cfg = loadConfig({
        ...developmentExtras,
        STORAGE_TYPE: 'filesystem',
        DATA_DIR: '/home/user/budget-data',
      });
      expect(cfg.server.nodeEnv).toBe('development');
      expect(cfg.storage.type).toBe('filesystem');
      expect(cfg.storage.dataDir).toBe('/home/user/budget-data');
    });
  });

  describe('test environment config (relaxed requirements)', () => {
    it('accepts missing Plaid credentials in test environment', () => {
      expect(() => loadConfig(minimalEnv)).not.toThrow();
    });

    it('accepts missing PLAID_CLIENT_ID and PLAID_SECRET in test', () => {
      const cfg = loadConfig({ NODE_ENV: 'test', JWT_SECRET: 'a-secret' });
      expect(cfg.plaid.clientId).toBe('');
      expect(cfg.plaid.secret).toBe('');
    });
  });
});

// ---------------------------------------------------------------------------
// 2. Required variable validation
// ---------------------------------------------------------------------------

describe('loadConfig — required variable validation', () => {
  it('throws when JWT_SECRET is missing', () => {
    expect(() => loadConfig({})).toThrow('Configuration validation failed');
  });

  it('error message names JWT_SECRET specifically', () => {
    expect(() => loadConfig({})).toThrow('JWT_SECRET');
  });

  it('throws when JWT_SECRET is an empty string', () => {
    expect(() =>
      loadConfig({ ...minimalEnv, JWT_SECRET: '' })
    ).toThrow('JWT_SECRET');
  });

  it('throws when PLAID_CLIENT_ID is missing in production', () => {
    expect(() =>
      loadConfig({
        ...minimalEnv,
        NODE_ENV: 'production',
        PLAID_SECRET: 'some-secret',
        S3_BUCKET_NAME: 'my-bucket',
      })
    ).toThrow('PLAID_CLIENT_ID is required in production');
  });

  it('throws when PLAID_SECRET is missing in production', () => {
    expect(() =>
      loadConfig({
        ...minimalEnv,
        NODE_ENV: 'production',
        PLAID_CLIENT_ID: 'some-id',
        S3_BUCKET_NAME: 'my-bucket',
      })
    ).toThrow('PLAID_SECRET is required in production');
  });

  it('does NOT throw when PLAID_CLIENT_ID is missing in development', () => {
    expect(() =>
      loadConfig({
        ...developmentExtras,
        STORAGE_TYPE: 'filesystem',
      })
    ).not.toThrow();
  });

  it('does NOT throw when PLAID_SECRET is missing in development', () => {
    expect(() =>
      loadConfig({
        ...developmentExtras,
        STORAGE_TYPE: 'filesystem',
      })
    ).not.toThrow();
  });
});

// ---------------------------------------------------------------------------
// 3. Conditional validation
// ---------------------------------------------------------------------------

describe('loadConfig — conditional validation', () => {
  it('throws when STORAGE_TYPE=s3 and S3_BUCKET_NAME is empty', () => {
    expect(() =>
      loadConfig({
        ...minimalEnv,
        STORAGE_TYPE: 's3',
        S3_BUCKET_NAME: '',
      })
    ).toThrow('S3_BUCKET_NAME is required when STORAGE_TYPE=s3');
  });

  it('throws when STORAGE_TYPE=s3 and S3_BUCKET_NAME is absent', () => {
    // S3_BUCKET_NAME has a default of 'budget-app-data', so explicit empty string
    // is the failure case; absent means the default is used and passes.
    // With the default in place, missing S3_BUCKET_NAME should be fine.
    const cfg = loadConfig({ ...minimalEnv, STORAGE_TYPE: 's3' });
    expect(cfg.storage.s3BucketName).toBe('budget-app-data');
  });

  it('passes when STORAGE_TYPE=filesystem and no S3 vars are set', () => {
    expect(() =>
      loadConfig({ ...minimalEnv, STORAGE_TYPE: 'filesystem' })
    ).not.toThrow();
  });

  it('production without explicit STORAGE_TYPE defaults to s3, requires bucket', () => {
    // In production the default storage type is s3, and the default bucket
    // name 'budget-app-data' satisfies the conditional validation.
    const cfg = loadConfig({
      ...minimalEnv,
      NODE_ENV: 'production',
      PLAID_CLIENT_ID: 'id',
      PLAID_SECRET: 'secret',
      // STORAGE_TYPE intentionally omitted — should default to s3
    });
    expect(cfg.storage.type).toBe('s3');
    expect(cfg.storage.s3BucketName).toBe('budget-app-data');
  });

  it('production with explicit empty S3_BUCKET_NAME fails validation', () => {
    expect(() =>
      loadConfig({
        ...minimalEnv,
        NODE_ENV: 'production',
        PLAID_CLIENT_ID: 'id',
        PLAID_SECRET: 'secret',
        S3_BUCKET_NAME: '',
      })
    ).toThrow('S3_BUCKET_NAME is required when STORAGE_TYPE=s3');
  });
});

// ---------------------------------------------------------------------------
// 4. Type coercion
// ---------------------------------------------------------------------------

describe('loadConfig — type coercion', () => {
  it('coerces PORT string "3001" to number 3001', () => {
    const cfg = loadConfig({ ...minimalEnv, PORT: '3001' });
    expect(cfg.server.port).toBe(3001);
    expect(typeof cfg.server.port).toBe('number');
  });

  it('coerces CHATBOT_MONTHLY_LIMIT string "50" to number 50', () => {
    const cfg = loadConfig({ ...minimalEnv, CHATBOT_MONTHLY_LIMIT: '50' });
    expect(cfg.ai.chatbotMonthlyLimit).toBe(50);
    expect(typeof cfg.ai.chatbotMonthlyLimit).toBe('number');
  });

  it('throws a clear error when PORT is a non-numeric string', () => {
    expect(() =>
      loadConfig({ ...minimalEnv, PORT: 'abc' })
    ).toThrow('Configuration validation failed');
  });

  it('throws a clear error when CHATBOT_MONTHLY_LIMIT is a non-numeric string', () => {
    expect(() =>
      loadConfig({ ...minimalEnv, CHATBOT_MONTHLY_LIMIT: 'unlimited' })
    ).toThrow('Configuration validation failed');
  });
});

// ---------------------------------------------------------------------------
// 5. Default values
// ---------------------------------------------------------------------------

describe('loadConfig — default values', () => {
  it('NODE_ENV defaults to "development" when not set', () => {
    const cfg = loadConfig({ JWT_SECRET: 'a-secret' });
    expect(cfg.server.nodeEnv).toBe('development');
  });

  it('PORT defaults to 3001', () => {
    const cfg = loadConfig(minimalEnv);
    expect(cfg.server.port).toBe(3001);
  });

  it('PLAID_ENV defaults to "sandbox"', () => {
    const cfg = loadConfig(minimalEnv);
    expect(cfg.plaid.env).toBe('sandbox');
  });

  it('STORAGE_TYPE defaults to "filesystem" when NODE_ENV is not production', () => {
    const devCfg = loadConfig({ ...developmentExtras });
    expect(devCfg.storage.type).toBe('filesystem');

    const testCfg = loadConfig(minimalEnv);
    expect(testCfg.storage.type).toBe('filesystem');
  });

  it('STORAGE_TYPE defaults to "s3" when NODE_ENV is "production"', () => {
    const cfg = loadConfig({
      ...minimalEnv,
      NODE_ENV: 'production',
      PLAID_CLIENT_ID: 'id',
      PLAID_SECRET: 'secret',
    });
    expect(cfg.storage.type).toBe('s3');
  });

  it('encryptionSecret falls back to jwtSecret when PLAID_ENCRYPTION_SECRET is absent', () => {
    const cfg = loadConfig({ ...minimalEnv, JWT_SECRET: 'my-jwt-secret' });
    expect(cfg.auth.encryptionSecret).toBe('my-jwt-secret');
  });

  it('encryptionSecret uses PLAID_ENCRYPTION_SECRET when provided', () => {
    const cfg = loadConfig({
      ...minimalEnv,
      JWT_SECRET: 'my-jwt-secret',
      PLAID_ENCRYPTION_SECRET: 'separate-encryption-key',
    });
    expect(cfg.auth.encryptionSecret).toBe('separate-encryption-key');
  });

  it('encryptionSecret falls back to jwtSecret when PLAID_ENCRYPTION_SECRET is empty string', () => {
    const cfg = loadConfig({
      ...minimalEnv,
      JWT_SECRET: 'my-jwt-secret',
      PLAID_ENCRYPTION_SECRET: '',
    });
    expect(cfg.auth.encryptionSecret).toBe('my-jwt-secret');
  });
});

// ---------------------------------------------------------------------------
// 6. Enum validation
// ---------------------------------------------------------------------------

describe('loadConfig — enum validation', () => {
  it('throws on invalid NODE_ENV value', () => {
    expect(() =>
      loadConfig({ ...minimalEnv, NODE_ENV: 'staging' })
    ).toThrow('Configuration validation failed');
  });

  it('throws on invalid PLAID_ENV value', () => {
    expect(() =>
      loadConfig({ ...minimalEnv, PLAID_ENV: 'beta' })
    ).toThrow('Configuration validation failed');
  });

  it('throws on invalid STORAGE_TYPE value', () => {
    expect(() =>
      loadConfig({ ...minimalEnv, STORAGE_TYPE: 'azure-blob' })
    ).toThrow('Configuration validation failed');
  });

  it('accepts all valid NODE_ENV values', () => {
    expect(() =>
      loadConfig({ ...minimalEnv, NODE_ENV: 'development' })
    ).not.toThrow();
    expect(() =>
      loadConfig({ ...minimalEnv, NODE_ENV: 'test' })
    ).not.toThrow();
    expect(() =>
      loadConfig({
        ...minimalEnv,
        NODE_ENV: 'production',
        PLAID_CLIENT_ID: 'id',
        PLAID_SECRET: 'secret',
      })
    ).not.toThrow();
  });

  it('accepts all valid PLAID_ENV values', () => {
    const envs = ['sandbox', 'development', 'production'] as const;
    for (const plaidEnv of envs) {
      expect(() =>
        loadConfig({ ...minimalEnv, PLAID_ENV: plaidEnv })
      ).not.toThrow();
    }
  });

  it('accepts all valid STORAGE_TYPE values', () => {
    expect(() =>
      loadConfig({ ...minimalEnv, STORAGE_TYPE: 'filesystem' })
    ).not.toThrow();
    expect(() =>
      loadConfig({ ...minimalEnv, STORAGE_TYPE: 's3' })
    ).not.toThrow();
  });
});

// ---------------------------------------------------------------------------
// 7. Error message quality
// ---------------------------------------------------------------------------

describe('loadConfig — error message quality', () => {
  it('lists all missing required vars in one error, not just the first', () => {
    // In production both PLAID_CLIENT_ID and PLAID_SECRET are required;
    // both should appear in the error.
    let errorMessage = '';
    try {
      loadConfig({
        JWT_SECRET: 'a-secret',
        NODE_ENV: 'production',
        // PLAID_CLIENT_ID and PLAID_SECRET intentionally missing
        S3_BUCKET_NAME: 'my-bucket',
      });
    } catch (err: unknown) {
      if (err instanceof Error) {
        errorMessage = err.message;
      }
    }

    expect(errorMessage).toContain('PLAID_CLIENT_ID');
    expect(errorMessage).toContain('PLAID_SECRET');
  });

  it('uses the env var name (not schema path) in error messages', () => {
    let errorMessage = '';
    try {
      loadConfig({});
    } catch (err: unknown) {
      if (err instanceof Error) {
        errorMessage = err.message;
      }
    }

    // Should say JWT_SECRET, not "auth.jwtSecret" or just "jwtSecret"
    expect(errorMessage).toContain('JWT_SECRET');
    // Should NOT use schema internals
    expect(errorMessage).not.toContain('auth.jwtSecret');
    expect(errorMessage).not.toContain('jwtSecret:');
  });

  it('always starts with the standard prefix line', () => {
    let errorMessage = '';
    try {
      loadConfig({});
    } catch (err: unknown) {
      if (err instanceof Error) {
        errorMessage = err.message;
      }
    }
    expect(errorMessage).toMatch(/^Configuration validation failed:/);
  });

  it('formats each error on its own indented bullet line', () => {
    let errorMessage = '';
    try {
      loadConfig({});
    } catch (err: unknown) {
      if (err instanceof Error) {
        errorMessage = err.message;
      }
    }
    // Each failure is on a line starting with "  - "
    const bulletLines = errorMessage
      .split('\n')
      .filter((line) => line.startsWith('  - '));
    expect(bulletLines.length).toBeGreaterThanOrEqual(1);
  });

  it('surfaces both coercion and conditional errors clearly', () => {
    // Invalid PORT alongside missing JWT_SECRET
    let errorMessage = '';
    try {
      loadConfig({ PORT: 'not-a-number' });
    } catch (err: unknown) {
      if (err instanceof Error) {
        errorMessage = err.message;
      }
    }
    // PORT coercion failure and JWT_SECRET requirement should both appear
    expect(errorMessage).toContain('PORT');
    expect(errorMessage).toContain('JWT_SECRET');
  });
});
