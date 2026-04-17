/**
 * Centralized configuration module
 *
 * Validates all environment variables at load time using Zod schemas.
 * All services should consume `config` instead of reading `process.env` directly.
 *
 * Design:
 * - `loadConfig(env)` — parses and validates a given env record (default: process.env)
 * - `config` — singleton loaded once at module import time
 *
 * Validation rules:
 * - JWT_SECRET is always required
 * - PLAID_CLIENT_ID and PLAID_SECRET are required in production only
 * - S3_BUCKET_NAME must be non-empty when STORAGE_TYPE=s3
 * - In test environment, Plaid credentials are not required
 */

import { z } from 'zod';

// ---------------------------------------------------------------------------
// Domain schemas
// ---------------------------------------------------------------------------

const serverSchema = z.object({
  nodeEnv: z
    .enum(['development', 'production', 'test'])
    .default('development'),
  port: z.coerce.number().default(3001),
  apiPrefix: z.string().default('/api/v1'),
  appName: z.string().default('Personal Budgeting App'),
});

const plaidSchema = z.object({
  clientId: z.string().default(''),
  secret: z.string().default(''),
  env: z
    .enum(['sandbox', 'development', 'production'])
    .default('sandbox'),
  products: z.string().default('transactions'),
  countryCodes: z.string().default('US'),
  redirectUri: z.string().optional(),
  webhookUrl: z.string().optional(),
});

const authSchema = z.object({
  jwtSecret: z.string().min(1, 'JWT_SECRET is required'),
  jwtExpiresIn: z.string().default('7d'),
  // encryptionSecret is derived after parsing (falls back to jwtSecret)
  encryptionSecret: z.string().default(''),
});

const storageSchema = z.object({
  type: z.enum(['filesystem', 's3']).default('filesystem'),
  dataDir: z.string().default('./data'),
  s3BucketName: z.string().default('budget-app-data'),
  s3Prefix: z.string().default('data/'),
  awsRegion: z.string().default('us-east-1'),
});

const aiSchema = z.object({
  anthropicApiKey: z.string().default(''),
  chatbotMonthlyLimit: z.coerce.number().default(20),
  githubIssuesPat: z.string().default(''),
});

const vapidSchema = z.object({
  publicKey: z.string().default(''),
  privateKey: z.string().default(''),
  subject: z.string().default(''),
});

const githubSchema = z.object({
  token: z.string().default(''),
  owner: z.string().default('JCarran0'),
  repo: z.string().default('household-budgeting'),
});

const deploySchema = z.object({
  timestamp: z.string().default('unknown'),
  commitHash: z.string().default('unknown'),
});

// ---------------------------------------------------------------------------
// Flat raw schema — reads from a flat env record
// ---------------------------------------------------------------------------

const rawEnvSchema = z.object({
  // Server
  NODE_ENV: serverSchema.shape.nodeEnv,
  PORT: serverSchema.shape.port,
  API_PREFIX: serverSchema.shape.apiPrefix,
  APP_NAME: serverSchema.shape.appName,

  // Plaid
  PLAID_CLIENT_ID: plaidSchema.shape.clientId,
  PLAID_SECRET: plaidSchema.shape.secret,
  PLAID_ENV: plaidSchema.shape.env,
  PLAID_PRODUCTS: plaidSchema.shape.products,
  PLAID_COUNTRY_CODES: plaidSchema.shape.countryCodes,
  PLAID_REDIRECT_URI: plaidSchema.shape.redirectUri,
  PLAID_WEBHOOK_URL: plaidSchema.shape.webhookUrl,

  // Auth
  JWT_SECRET: authSchema.shape.jwtSecret,
  JWT_EXPIRES_IN: authSchema.shape.jwtExpiresIn,
  PLAID_ENCRYPTION_SECRET: z.string().optional(),

  // Storage
  STORAGE_TYPE: z.enum(['filesystem', 's3']).optional(),
  DATA_DIR: storageSchema.shape.dataDir,
  S3_BUCKET_NAME: storageSchema.shape.s3BucketName,
  S3_PREFIX: storageSchema.shape.s3Prefix,
  AWS_REGION: storageSchema.shape.awsRegion,

  // AI
  ANTHROPIC_API_KEY: aiSchema.shape.anthropicApiKey,
  CHATBOT_MONTHLY_LIMIT: aiSchema.shape.chatbotMonthlyLimit,
  GITHUB_ISSUES_PAT: aiSchema.shape.githubIssuesPat,

  // VAPID (Push Notifications)
  VAPID_PUBLIC_KEY: vapidSchema.shape.publicKey,
  VAPID_PRIVATE_KEY: vapidSchema.shape.privateKey,
  VAPID_SUBJECT: vapidSchema.shape.subject,

  // GitHub
  GITHUB_TOKEN: githubSchema.shape.token,
  GITHUB_OWNER: githubSchema.shape.owner,
  GITHUB_REPO: githubSchema.shape.repo,

  // Deploy
  DEPLOYMENT_TIMESTAMP: deploySchema.shape.timestamp,
  COMMIT_HASH: deploySchema.shape.commitHash,
});

type RawEnv = z.infer<typeof rawEnvSchema>;

// ---------------------------------------------------------------------------
// Exported config type
// ---------------------------------------------------------------------------

export interface AppConfig {
  server: {
    nodeEnv: 'development' | 'production' | 'test';
    port: number;
    apiPrefix: string;
    appName: string;
  };
  plaid: {
    clientId: string;
    secret: string;
    env: 'sandbox' | 'development' | 'production';
    products: string;
    countryCodes: string;
    redirectUri: string | undefined;
    webhookUrl: string | undefined;
  };
  auth: {
    jwtSecret: string;
    jwtExpiresIn: string;
    encryptionSecret: string;
  };
  storage: {
    type: 'filesystem' | 's3';
    dataDir: string;
    s3BucketName: string;
    s3Prefix: string;
    awsRegion: string;
  };
  ai: {
    anthropicApiKey: string;
    chatbotMonthlyLimit: number;
    githubIssuesPat: string;
  };
  vapid: {
    publicKey: string;
    privateKey: string;
    subject: string;
  };
  github: {
    token: string;
    owner: string;
    repo: string;
  };
  deploy: {
    timestamp: string;
    commitHash: string;
  };
}

// ---------------------------------------------------------------------------
// Conditional validation helpers
// ---------------------------------------------------------------------------

interface ValidationError {
  message: string;
}

function collectConditionalErrors(raw: RawEnv): ValidationError[] {
  const errors: ValidationError[] = [];

  const nodeEnv = raw.NODE_ENV;

  // PLAID credentials are required in production
  if (nodeEnv === 'production') {
    if (!raw.PLAID_CLIENT_ID) {
      errors.push({ message: 'PLAID_CLIENT_ID is required in production' });
    }
    if (!raw.PLAID_SECRET) {
      errors.push({ message: 'PLAID_SECRET is required in production' });
    }
  }

  // S3_BUCKET_NAME must be non-empty when STORAGE_TYPE=s3
  const storageType =
    raw.STORAGE_TYPE ?? (nodeEnv === 'production' ? 's3' : 'filesystem');
  if (storageType === 's3' && !raw.S3_BUCKET_NAME) {
    errors.push({
      message: 'S3_BUCKET_NAME is required when STORAGE_TYPE=s3',
    });
  }

  return errors;
}

// ---------------------------------------------------------------------------
// loadConfig — main entry point
// ---------------------------------------------------------------------------

/**
 * Parses and validates config from an env record (defaults to process.env).
 *
 * Throws a descriptive error listing ALL validation failures when the env
 * is invalid. Callers (tests included) can pass a custom env object to avoid
 * mutating `process.env`.
 */
export function loadConfig(
  env: Record<string, string | undefined> = process.env
): AppConfig {
  // Parse the flat env record; collect Zod errors first.
  const result = rawEnvSchema.safeParse(env);

  const zodErrors: string[] = [];
  if (!result.success) {
    for (const issue of result.error.issues) {
      // Map the schema field name (e.g. "JWT_SECRET") to the env var name.
      // Because our schema keys match the env var names exactly, path[0] is
      // the env var. Provide the Zod message directly — it already names the
      // field at path level.
      const envVar = issue.path.length > 0 ? String(issue.path[0]) : 'unknown';
      zodErrors.push(`${envVar}: ${issue.message}`);
    }
  }

  // If Zod parsing failed we can't run conditional checks safely, so throw now.
  if (zodErrors.length > 0 || !result.success) {
    const lines = zodErrors.map((m) => `  - ${m}`).join('\n');
    throw new Error(`Configuration validation failed:\n${lines}`);
  }

  const raw: RawEnv = result.data;

  // Run conditional cross-field validations.
  const conditionalErrors = collectConditionalErrors(raw);
  if (conditionalErrors.length > 0) {
    const lines = conditionalErrors.map((e) => `  - ${e.message}`).join('\n');
    throw new Error(`Configuration validation failed:\n${lines}`);
  }

  // ---------------------------------------------------------------------------
  // Assemble the typed config object
  // ---------------------------------------------------------------------------

  const nodeEnv = raw.NODE_ENV;

  // STORAGE_TYPE defaults to 's3' in production, 'filesystem' otherwise.
  const storageType: 'filesystem' | 's3' =
    raw.STORAGE_TYPE ?? (nodeEnv === 'production' ? 's3' : 'filesystem');

  // PLAID_ENCRYPTION_SECRET falls back to JWT_SECRET in development only.
  // In production, a dedicated encryption secret is required.
  if (nodeEnv === 'production' && (!raw.PLAID_ENCRYPTION_SECRET || raw.PLAID_ENCRYPTION_SECRET.length === 0)) {
    throw new Error('PLAID_ENCRYPTION_SECRET is required in production (must be separate from JWT_SECRET)');
  }
  const encryptionSecret =
    raw.PLAID_ENCRYPTION_SECRET && raw.PLAID_ENCRYPTION_SECRET.length > 0
      ? raw.PLAID_ENCRYPTION_SECRET
      : raw.JWT_SECRET;

  return {
    server: {
      nodeEnv,
      port: raw.PORT,
      apiPrefix: raw.API_PREFIX,
      appName: raw.APP_NAME,
    },
    plaid: {
      clientId: raw.PLAID_CLIENT_ID,
      secret: raw.PLAID_SECRET,
      env: raw.PLAID_ENV,
      products: raw.PLAID_PRODUCTS,
      countryCodes: raw.PLAID_COUNTRY_CODES,
      redirectUri: raw.PLAID_REDIRECT_URI,
      webhookUrl: raw.PLAID_WEBHOOK_URL,
    },
    auth: {
      jwtSecret: raw.JWT_SECRET,
      jwtExpiresIn: raw.JWT_EXPIRES_IN,
      encryptionSecret,
    },
    storage: {
      type: storageType,
      dataDir: raw.DATA_DIR,
      s3BucketName: raw.S3_BUCKET_NAME,
      s3Prefix: raw.S3_PREFIX,
      awsRegion: raw.AWS_REGION,
    },
    ai: {
      anthropicApiKey: raw.ANTHROPIC_API_KEY,
      chatbotMonthlyLimit: raw.CHATBOT_MONTHLY_LIMIT,
      githubIssuesPat: raw.GITHUB_ISSUES_PAT,
    },
    vapid: {
      publicKey: raw.VAPID_PUBLIC_KEY,
      privateKey: raw.VAPID_PRIVATE_KEY,
      subject: raw.VAPID_SUBJECT,
    },
    github: {
      token: raw.GITHUB_TOKEN,
      owner: raw.GITHUB_OWNER,
      repo: raw.GITHUB_REPO,
    },
    deploy: {
      timestamp: raw.DEPLOYMENT_TIMESTAMP,
      commitHash: raw.COMMIT_HASH,
    },
  };
}

// ---------------------------------------------------------------------------
// Singleton — loaded once at module import time
// ---------------------------------------------------------------------------

/**
 * The validated application config.
 *
 * Throws at startup if required environment variables are missing or invalid,
 * preventing the application from running with a broken configuration.
 */
export const config = loadConfig();
