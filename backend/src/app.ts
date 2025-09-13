import express, { Express, Request, Response, NextFunction } from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
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
      'http://localhost:3000',
      'http://localhost:3001',
      'https://budget.jaredcarrano.com',
      'http://budget.jaredcarrano.com',
    ];
    
    // In development, allow any localhost origin
    if (process.env.NODE_ENV === 'development') {
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

// Middleware
app.use(cors(corsOptions));
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Security headers
app.use((_req: Request, res: Response, next: NextFunction) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('X-XSS-Protection', '1; mode=block');
  res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
  next();
});

// Request logging in development
if (process.env.NODE_ENV === 'development') {
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
    environment: process.env.NODE_ENV || 'development',
    version: pkg.version,
  });
});

// API routes
const apiPrefix = process.env.API_PREFIX || '/api/v1';
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
    environment: process.env.NODE_ENV || 'development',
    deployedAt: process.env.DEPLOYMENT_TIMESTAMP || 'unknown',
    commitHash: process.env.COMMIT_HASH || 'unknown',
    unreleased: unreleased || 'No unreleased changes',
  });
});

// Changelog endpoint under API prefix
app.get(`${apiPrefix}/changelog`, (_req: Request, res: Response) => {
  const fs = require('fs');
  const path = require('path');
  
  try {
    const changelogPath = path.join(__dirname, '../../CHANGELOG.md');
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
app.use((err: Error, _req: Request, res: Response, _next: NextFunction) => {
  console.error('Global error handler:', err);
  
  // Don't leak error details in production
  const isDevelopment = process.env.NODE_ENV === 'development';
  
  res.status(500).json({
    success: false,
    error: isDevelopment ? err.message : 'Internal server error',
    ...(isDevelopment && { stack: err.stack }),
  });
});

export default app;