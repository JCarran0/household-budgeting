import dotenv from 'dotenv';

// Load environment variables FIRST, before importing app
dotenv.config();

import app from './app';
import { config } from './config';

const PORT = config.server.port;

// Start server
const server = app.listen(PORT, () => {
  console.log(`
╔════════════════════════════════════════╗
║   Personal Budgeting App - Backend    ║
╠════════════════════════════════════════╣
║  Environment: ${config.server.nodeEnv}
║  Port: ${PORT}
║  API Prefix: ${config.server.apiPrefix}
║  
║  Security Features:
║  ✓ JWT Authentication
║  ✓ Password Hashing (bcrypt)
║  ✓ Rate Limiting
║  ✓ Input Validation (Zod)
║  ✓ Security Headers
║  
║  Endpoints:
║  POST   /api/v1/auth/register
║  POST   /api/v1/auth/login
║  POST   /api/v1/auth/refresh
║  POST   /api/v1/auth/change-password
║  POST   /api/v1/auth/logout
║  GET    /api/v1/auth/me
║  GET    /api/v1/auth/verify
║  GET    /health
╚════════════════════════════════════════╝
  `);
});

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('SIGTERM signal received: closing HTTP server');
  server.close(() => {
    console.log('HTTP server closed');
    process.exit(0);
  });
});

process.on('SIGINT', () => {
  console.log('SIGINT signal received: closing HTTP server');
  server.close(() => {
    console.log('HTTP server closed');
    process.exit(0);
  });
});

// Handle unhandled promise rejections
process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled Rejection at:', promise, 'reason:', reason);
  // In production, you might want to send this to a logging service
});

export default server;