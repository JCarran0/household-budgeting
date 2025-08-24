import dotenv from 'dotenv';
import app from './app';

// Load environment variables
dotenv.config();

const PORT = process.env.PORT || 3001;

// Start server
const server = app.listen(PORT, () => {
  console.log(`
╔════════════════════════════════════════╗
║   Personal Budgeting App - Backend    ║
╠════════════════════════════════════════╣
║  Environment: ${process.env.NODE_ENV || 'development'}
║  Port: ${PORT}
║  API Prefix: ${process.env.API_PREFIX || '/api/v1'}
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