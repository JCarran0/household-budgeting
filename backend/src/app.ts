import express, { Express, Request, Response, NextFunction } from 'express';
import helmet from 'helmet';
import { errorHandler } from './middleware/errorHandler';
import { requestScopeMiddleware } from './middleware/requestScope';
import { rateLimitGlobalApi } from './middleware/rateLimit';
import cors from 'cors';
import dotenv from 'dotenv';
import { config } from './config';
import authRoutes from './routes/authRoutes';
import plaidRoutes from './routes/plaid';
import accountRoutes from './routes/accounts';
import transactionRoutes from './routes/transactions';
import categoryRoutes from './routes/categories';
import budgetRoutes from './routes/budgets';
import reportRoutes from './routes/reports';
import autoCategorizeRoutes from './routes/autoCategorize';
import adminRoutes from './routes/admin';
import feedbackRoutes from './routes/feedback';
import actualsOverrideRoutes from './routes/actualsOverrides';
import tripRoutes from './routes/trips';
import projectRoutes from './routes/projects';
import chatbotRoutes from './routes/chatbot';
import themeRoutes from './routes/themes';
import manualAccountRoutes from './routes/manualAccounts';
import amazonReceiptRoutes from './routes/amazonReceipts';
import familyRoutes from './routes/family';
import accountOwnerRoutes from './routes/accountOwners';
import taskRoutes from './routes/tasks';
import taskTemplateRoutes from './routes/taskTemplates';
import notificationRoutes from './routes/notifications';

// Load environment variables (skip in test mode as it's loaded in setup.ts)
if (process.env.NODE_ENV !== 'test') {
  dotenv.config();
}

// Create Express app
const app: Express = express();

// CORS configuration
const corsOptions = {
  origin: (origin: string | undefined, callback: (err: Error | null, allow?: boolean) => void) => {
    // Allowed origins for CORS
    const allowedOrigins = [
      'http://localhost:5173',
      'http://localhost:5174',
      'http://localhost:5183',
      'http://localhost:3000',
      'http://localhost:3001',
      'http://localhost:3021',
      'https://budget.jaredcarrano.com',
      'http://budget.jaredcarrano.com',
    ];
    
    // In development, allow any localhost origin
    if (config.server.nodeEnv === 'development') {
      if (!origin || origin.includes('localhost') || origin.includes('127.0.0.1')) {
        callback(null, true);
      } else {
        callback(new Error('Not allowed by CORS'));
      }
    } else {
      // In production, allow configured origins or same-origin (no origin header = same origin via proxy)
      if (!origin || allowedOrigins.includes(origin)) {
        callback(null, true);
      } else {
        console.error(`CORS rejected origin: ${origin}`);
        callback(new Error('Not allowed by CORS'));
      }
    }
  },
  credentials: true,
  optionsSuccessStatus: 200,
};

// Security headers (TD-004). The backend serves only JSON (never HTML), so the
// CSP is locked all the way down to `default-src 'none'` — there is no
// legitimate reason for a browser to ever execute a script from one of these
// responses. The SPA's CSP is set separately at the static-asset layer.
app.use(
  helmet({
    contentSecurityPolicy: {
      useDefaults: false,
      directives: {
        defaultSrc: ["'none'"],
        frameAncestors: ["'none'"],
        baseUri: ["'none'"],
        formAction: ["'none'"],
      },
    },
    // The browser already ignores X-XSS-Protection on modern engines, but we
    // keep it set to "0" (helmet default) since "1; mode=block" can be abused.
    crossOriginEmbedderPolicy: false,
    crossOriginResourcePolicy: { policy: 'same-site' },
    referrerPolicy: { policy: 'no-referrer' },
    strictTransportSecurity: { maxAge: 31_536_000, includeSubDomains: true },
  }),
);

// Middleware
app.use(cors(corsOptions));
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));
// Opens a per-request async scope so the data layer can memoize reads (TD-011).
app.use(requestScopeMiddleware);

// Request logging in development
if (config.server.nodeEnv === 'development') {
  app.use((req: Request, _res: Response, next: NextFunction) => {
    console.log(`${new Date().toISOString()} - ${req.method} ${req.path}`);
    next();
  });
}

// Health check endpoint
app.get('/health', (_req: Request, res: Response) => {
  const pkg = require('../../package.json');
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    environment: config.server.nodeEnv,
    version: pkg.version,
  });
});

// API routes
const apiPrefix = config.server.apiPrefix;
// General per-IP rate limit on the API surface (TD-005). Auth and chatbot
// routes layer their own tighter limits on top of this.
app.use(apiPrefix, rateLimitGlobalApi);
app.use(`${apiPrefix}/auth`, authRoutes);
app.use(`${apiPrefix}/plaid`, plaidRoutes);
app.use(`${apiPrefix}/accounts`, accountRoutes);
app.use(`${apiPrefix}/transactions`, transactionRoutes);
app.use(`${apiPrefix}/categories`, categoryRoutes);
app.use(`${apiPrefix}/budgets`, budgetRoutes);
app.use(`${apiPrefix}/reports`, reportRoutes);
app.use(`${apiPrefix}/autocategorize`, autoCategorizeRoutes);
app.use(`${apiPrefix}/admin`, adminRoutes);
app.use(`${apiPrefix}/feedback`, feedbackRoutes);
app.use(`${apiPrefix}/actuals-overrides`, actualsOverrideRoutes);
app.use(`${apiPrefix}/trips`, tripRoutes);
app.use(`${apiPrefix}/projects`, projectRoutes);
app.use(`${apiPrefix}/chatbot`, chatbotRoutes);
app.use(`${apiPrefix}/themes`, themeRoutes);
app.use(`${apiPrefix}/manual-accounts`, manualAccountRoutes);
app.use(`${apiPrefix}/amazon-receipts`, amazonReceiptRoutes);
app.use(`${apiPrefix}/family`, familyRoutes);
app.use(`${apiPrefix}/account-owners`, accountOwnerRoutes);
app.use(`${apiPrefix}/tasks`, taskRoutes);
app.use(`${apiPrefix}/task-templates`, taskTemplateRoutes);
app.use(`${apiPrefix}/notifications`, notificationRoutes);

// Version endpoint under API prefix
app.get(`${apiPrefix}/version`, (_req: Request, res: Response) => {
  const pkg = require('../package.json');
  const fs = require('fs');
  const path = require('path');
  
  // Read changelog to get unreleased changes
  let unreleased = '';
  try {
    const changelogPath = path.join(__dirname, '../../CHANGELOG.md');
    const changelog = fs.readFileSync(changelogPath, 'utf-8');
    const unreleasedMatch = changelog.match(/## \[Unreleased\]([\s\S]*?)## \[[\d.]+/m);
    if (unreleasedMatch) {
      unreleased = unreleasedMatch[1].trim();
    }
  } catch (error) {
    console.error('Error reading changelog:', error);
  }
  
  res.json({
    current: pkg.version,
    environment: config.server.nodeEnv,
    deployedAt: config.deploy.timestamp,
    commitHash: config.deploy.commitHash,
    unreleased: unreleased || 'No unreleased changes',
  });
});

// Changelog endpoint under API prefix
app.get(`${apiPrefix}/changelog`, (_req: Request, res: Response) => {
  const fs = require('fs');
  const path = require('path');

  try {
    const changelogPath = path.join(__dirname, '../../CHANGELOG.md');

    // Check if file exists first
    if (!fs.existsSync(changelogPath)) {
      console.warn('CHANGELOG.md not found at:', changelogPath);
      res.json({
        success: true,
        content: '# Changelog\n\nChangelog is currently unavailable. Please check back after the next deployment.',
      });
      return;
    }

    const changelog = fs.readFileSync(changelogPath, 'utf-8');

    res.json({
      success: true,
      content: changelog,
    });
  } catch (error) {
    console.error('Error reading changelog:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to read changelog',
      content: '# Changelog\n\nChangelog is currently unavailable.',
    });
  }
});

// 404 handler
app.use((req: Request, res: Response) => {
  res.status(404).json({
    success: false,
    error: 'Endpoint not found',
    path: req.path,
  });
});

// Global error handler
app.use(errorHandler);

export default app;