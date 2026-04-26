import dotenv from 'dotenv';

// Load environment variables FIRST, before importing app
dotenv.config();

import app from './app';
import { config } from './config';
import { logger } from './utils/logger';
import { startWrappedScheduler } from './jobs/wrappedScheduler';
import { userService, wrappedService } from './services';

const PORT = config.server.port;

// Start the Wrapped scheduler only when explicitly enabled.
// Opt-in via WRAPPED_SCHEDULER_ENABLED=true; OFF by default in every
// environment, production included. Stopped by the shutdown handler below.
const wrappedScheduler =
  process.env.WRAPPED_SCHEDULER_ENABLED === 'true'
    ? startWrappedScheduler({ userService, wrappedService })
    : null;

// Start server
const server = app.listen(PORT, () => {
  logger.info(
    {
      port: PORT,
      nodeEnv: config.server.nodeEnv,
      apiPrefix: config.server.apiPrefix,
    },
    'backend started',
  );
});

// Graceful shutdown
process.on('SIGTERM', () => {
  logger.info('SIGTERM received: closing HTTP server');
  wrappedScheduler?.stop();
  server.close(() => {
    logger.info('HTTP server closed');
    process.exit(0);
  });
});

process.on('SIGINT', () => {
  logger.info('SIGINT received: closing HTTP server');
  server.close(() => {
    logger.info('HTTP server closed');
    process.exit(0);
  });
});

// Handle unhandled promise rejections
process.on('unhandledRejection', (reason) => {
  logger.error({ err: reason }, 'unhandled promise rejection');
});

export default server;