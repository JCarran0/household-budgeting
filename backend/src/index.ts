import dotenv from 'dotenv';

// Load environment variables FIRST, before importing app
dotenv.config();

import app from './app';
import { config } from './config';
import { logger } from './utils/logger';

const PORT = config.server.port;

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