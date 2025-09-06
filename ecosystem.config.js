// PM2 Configuration for Budget Backend
// This file configures PM2 to properly run the backend application
// It ensures the app runs from the correct directory so dotenv can find .env

module.exports = {
  apps: [{
    name: 'budget-backend',
    script: 'dist/index.js',
    cwd: '/home/appuser/app/backend',  // IMPORTANT: Run from backend dir so dotenv finds .env
    instances: 1,
    exec_mode: 'fork',
    env: {
      NODE_ENV: 'production',
      PORT: 3001
    },
    error_file: '/home/appuser/logs/error.log',
    out_file: '/home/appuser/logs/output.log',
    log_date_format: 'YYYY-MM-DD HH:mm:ss',
    max_memory_restart: '500M',
    watch: false,
    autorestart: true,
    max_restarts: 10,
    min_uptime: '10s',
    // Ensure clean restart
    kill_timeout: 5000,
    wait_ready: true,
    listen_timeout: 10000
  }]
};