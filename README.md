# Household Budgeting App

A personal budgeting application with Plaid integration for automatic transaction syncing and budget tracking.

## Features

- 🔐 Secure authentication with JWT
- 🏦 Bank account integration via Plaid API (Bank of America, Capital One)
- 💰 Automatic transaction syncing and categorization
- 📊 Monthly budget creation and tracking
- 📈 Spending trends and financial reports
- 💸 Cash flow forecasting
- 🏷️ Transaction tagging and splitting

## Tech Stack

- **Backend**: Node.js, Express, TypeScript
- **Frontend**: React 18, TypeScript, Vite, Tailwind CSS
- **Testing**: Jest, React Testing Library
- **Integration**: Plaid API
- **Storage**: JSON files (MVP) → S3/PostgreSQL (future)

## Development Approach

This project follows Test-Driven Development (TDD) principles with an MVP-first strategy.

## Project Structure

```
household-budgeting/
├── backend/          # Express API server
├── frontend/         # React application
├── shared/           # Shared TypeScript types
├── CLAUDE.md         # Development guide
└── PROJECT_PLAN.md   # Implementation roadmap
```

## Getting Started

### Prerequisites

- Node.js 18+
- npm or yarn
- Plaid API credentials (sandbox for development)

### Installation

1. Clone the repository:
```bash
git clone https://github.com/jaredcarrano/household-budgeting.git
cd household-budgeting
```

2. Install backend dependencies:
```bash
cd backend
npm install
```

3. Install frontend dependencies:
```bash
cd ../frontend
npm install
```

4. Set up environment variables:
```bash
# Create .env file in backend directory
cp .env.example .env
# Add your Plaid credentials and JWT secret
```

### Development

Run backend:
```bash
cd backend
npm run dev
```

Run frontend:
```bash
cd frontend
npm run dev
```

Run tests:
```bash
npm run test
```

## Documentation

- [Development Guide](./CLAUDE.md) - Detailed development instructions and conventions
- [Project Plan](./PROJECT_PLAN.md) - Implementation phases and progress tracking

## License

Private project - All rights reserved