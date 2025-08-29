# Household Budgeting App

A modern personal budgeting application with bank account integration via Plaid, built with React and Node.js.

## 🎯 Features

### Current Features
- **Secure Authentication**: JWT-based auth with bcrypt password hashing
- **Bank Integration**: Connect bank accounts via Plaid (sandbox mode)
- **Account Management**: View and sync connected bank accounts
- **Transaction Tracking**: Automatic transaction import from connected accounts
- **Responsive UI**: Mobile-friendly React interface with Tailwind CSS

### Planned Features
- Transaction categorization and tagging
- Monthly budget creation and tracking
- Spending analytics and trends
- Bill reminders and recurring transactions
- Multi-user household support
- Data export capabilities

## 🛠 Tech Stack

### Backend
- **Runtime**: Node.js with Express
- **Language**: TypeScript (strict mode, zero `any` types)
- **Authentication**: JWT with bcrypt
- **Banking API**: Plaid (sandbox environment)
- **Data Storage**: JSON files (MVP) → PostgreSQL (planned)
- **Testing**: Jest with 47+ integration tests

### Frontend
- **Framework**: React 18 with TypeScript
- **Build Tool**: Vite
- **Styling**: Tailwind CSS
- **State Management**: Zustand with persist middleware
- **Data Fetching**: TanStack Query (React Query)
- **Routing**: React Router v6
- **Banking UI**: react-plaid-link

## 📁 Project Structure

```
household-budgeting/
├── backend/                 # Node.js Express API
│   ├── src/
│   │   ├── __tests__/      # Jest test files
│   │   ├── routes/         # API endpoints
│   │   ├── services/       # Business logic
│   │   ├── middleware/     # Auth, error handling
│   │   └── utils/          # Helper functions
│   └── data/               # JSON data storage
├── frontend/               # React application
│   ├── src/
│   │   ├── components/     # Reusable components
│   │   ├── pages/          # Route pages
│   │   ├── providers/      # Context providers
│   │   ├── stores/         # Zustand stores
│   │   └── lib/            # API client, utilities
│   └── public/
├── shared/                 # Shared TypeScript types
│   └── types/
├── docs/                   # Documentation
└── CLAUDE.md              # AI assistant guide

```

## 🚀 Getting Started

### Prerequisites
- Node.js 20+ and npm
- Plaid sandbox account ([Sign up free](https://dashboard.plaid.com/signup))

### Installation

1. **Clone the repository**
   ```bash
   git clone <repository-url>
   cd household-budgeting
   ```

2. **Backend Setup**
   ```bash
   cd backend
   npm install
   cp .env.example .env
   # Edit .env with your Plaid credentials
   ```

3. **Frontend Setup**
   ```bash
   cd ../frontend
   npm install
   cp .env.example .env.development
   # Frontend env is optional (uses defaults)
   ```

### Environment Variables

Create `backend/.env` with:
```env
# Server
PORT=3001
NODE_ENV=development

# Plaid API (get from dashboard.plaid.com)
PLAID_CLIENT_ID=your_client_id_here
PLAID_SECRET=your_sandbox_secret_here
PLAID_ENV=sandbox

# JWT
JWT_SECRET=your-super-secret-jwt-key-change-this
JWT_EXPIRES_IN=7d

# Data
DATA_DIR=./data
```

### Running the Application

1. **Start the backend** (Terminal 1):
   ```bash
   cd backend
   npm run dev
   ```
   Backend runs on http://localhost:3001

2. **Start the frontend** (Terminal 2):
   ```bash
   cd frontend
   npm run dev
   ```
   Frontend runs on http://localhost:5173

3. **Access the app**:
   - Open http://localhost:5173
   - Register a new account
   - Connect bank accounts using Plaid Link
   - View accounts and transactions

### 🏦 Plaid Sandbox Testing

The app uses Plaid's sandbox environment for testing bank connections. No real bank credentials are needed.

#### Test Credentials
- **Username**: `user_good`
- **Password**: `pass_good`
- **Institutions**: Any sandbox institution (e.g., "Chase", "Bank of America", "Wells Fargo")

#### Phone Verification (MFA)
When prompted for phone verification in sandbox:

**Test Phone Numbers**:
- `415-555-0010` - New User (first-time connection)
- `415-555-0011` - Verified Returning User (recommended for testing)

**OTP Code**: Always use `123456`

#### Complete Testing Flow
1. Click "Connect Account" in the app
2. Select any bank (e.g., "Chase" or "Bank of America")
3. Enter credentials: `user_good` / `pass_good`
4. If prompted for phone: use `415-555-0011`
5. Enter OTP: `123456`
6. Select accounts to connect
7. Confirm connection

**Note**: Real phone numbers won't work in sandbox. You must use Plaid's test phone numbers listed above.

### Testing

**Backend Tests**:
```bash
cd backend
npm test          # Run all tests
npm run test:watch  # Watch mode
npm run test:coverage  # Coverage report
```

**Frontend Tests** (when implemented):
```bash
cd frontend
npm test
```

## 🔐 Security

This application handles sensitive financial data. Security measures include:

- **Authentication**: JWT tokens with expiration
- **Password Security**: bcrypt hashing with salt rounds
- **Rate Limiting**: Prevents brute force attacks
- **Account Lockout**: After failed login attempts
- **Input Validation**: All inputs sanitized
- **CORS**: Configured for frontend origin only
- **Environment Variables**: Sensitive data never in code
- **HTTPS Required**: For production deployment

See [Security Documentation](docs/information-security/) for detailed policies.

## 📝 Development Guide

### For AI Assistants
See [CLAUDE.md](CLAUDE.md) for:
- Development philosophy and principles
- Common issues and solutions
- TypeScript best practices
- Testing strategies
- Troubleshooting guide

### Commit Convention
We follow [Conventional Commits](https://www.conventionalcommits.org/):
```
feat(scope): add new feature
fix(scope): fix bug
docs: update documentation
test: add tests
chore: maintenance tasks
```

### Project Plan
See [PROJECT_PLAN.md](PROJECT_PLAN.md) for development phases and progress.

## 🧪 Testing Philosophy

We follow Risk-Based Testing:
- **Test Critical Paths**: Authentication, money calculations, data integrity
- **Integration > Unit Tests**: Test real behavior with sandbox APIs
- **Test on Demand**: Add tests when bugs are found
- **Manual Testing**: UI flows documented in test plans

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch
3. Follow TypeScript strict mode (no `any` types)
4. Add tests for critical paths
5. Ensure all tests pass
6. Submit a pull request

## 📄 License

[MIT License](LICENSE) - See file for details

## 🙏 Acknowledgments

- [Plaid](https://plaid.com) for banking API
- [React](https://react.dev) and [Vite](https://vitejs.dev) teams
- [TailwindCSS](https://tailwindcss.com) for styling
- All open source contributors

## 📞 Support

For issues and questions:
- Check [CLAUDE.md](CLAUDE.md) troubleshooting guide
- Review [closed issues](../../issues?q=is%3Aissue+is%3Aclosed)
- Open a [new issue](../../issues/new)

---

Built with ❤️ for better personal finance management