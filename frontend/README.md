# Frontend - Household Budgeting App

React TypeScript frontend for the Household Budgeting application with Plaid Link integration.

## 🚀 Quick Start

```bash
# Install dependencies
npm install

# Start development server
npm run dev

# Build for production
npm run build
```

## 🛠 Tech Stack

- **React 18** - UI framework
- **TypeScript** - Type safety with strict mode
- **Vite** - Fast build tool and dev server
- **Tailwind CSS** - Utility-first styling
- **React Router v6** - Client-side routing
- **Zustand** - State management with persist
- **TanStack Query** - Server state management
- **react-plaid-link** - Plaid integration
- **Axios** - HTTP client with interceptors
- **Lucide React** - Icon library

## 📁 Project Structure

```
src/
├── components/         # Reusable UI components
│   ├── auth/          # Login, Register forms
│   ├── Layout.tsx     # App layout with navigation
│   ├── PlaidButton.tsx # Plaid Link trigger
│   └── ProtectedRoute.tsx # Auth route guard
├── pages/             # Route pages
│   ├── Dashboard.tsx  # Main dashboard
│   ├── Accounts.tsx   # Bank accounts
│   └── Transactions.tsx # Transaction list
├── providers/         # Context providers
│   └── PlaidLinkProvider.tsx # Plaid singleton
├── stores/            # Zustand stores
│   └── authStore.ts   # Auth state + persist
├── lib/               # Utilities
│   └── api.ts         # Axios client + interceptors
└── main.tsx          # App entry point
```

## 🔑 Key Features

### Authentication
- JWT token management with auto-refresh
- Persistent login via localStorage
- Protected routes with redirect to login
- Auto-login after registration

### Plaid Integration
- Singleton pattern to prevent duplicate scripts
- Conditional rendering for proper initialization
- Automatic Link opening after token fetch
- Error handling and retry logic

### State Management
- **Zustand** for client state (auth, UI)
- **React Query** for server state (accounts, transactions)
- Persistent auth with localStorage
- Optimistic updates for better UX

### API Integration
- Axios interceptors for auth headers
- Automatic token attachment
- Global error handling
- Request/response logging (dev mode)

## 🎨 Styling

Using Tailwind CSS with:
- Responsive design (mobile-first)
- Dark mode support (planned)
- Custom color palette
- Consistent spacing scale

## 🧩 Components

### Core Components

#### `<PlaidButton />`
Triggers Plaid Link flow
```tsx
<PlaidButton className="custom-styles" />
```

#### `<ProtectedRoute />`
Wraps routes requiring authentication
```tsx
<Route element={<ProtectedRoute />}>
  <Route path="/dashboard" element={<Dashboard />} />
</Route>
```

#### `<Layout />`
App shell with navigation
- Responsive sidebar/header
- User menu with logout
- Active route highlighting

### Pages

#### Dashboard
- Account balances overview
- Recent transactions list
- Quick stats (total balance, monthly spending)

#### Accounts
- Connected accounts list
- Sync accounts functionality
- Add new bank connection
- Remove account option

#### Transactions
- Paginated transaction list
- Date range filtering
- Category filtering (planned)
- Transaction details modal (planned)

## 🔧 Configuration

### Environment Variables

Create `.env.development`:
```env
# API endpoint (optional, defaults to localhost:3001)
VITE_API_URL=http://localhost:3001

# Other settings can be added here
```

### TypeScript Config

Strict mode enabled with:
- `noImplicitAny: true`
- `strictNullChecks: true`
- `noUnusedLocals: true`
- Zero `any` types policy

## 📦 Scripts

```json
{
  "dev": "vite",                  // Start dev server
  "build": "tsc && vite build",   // Production build
  "preview": "vite preview",       // Preview production build
  "lint": "eslint src",           // Lint code
  "type-check": "tsc --noEmit"    // Type checking
}
```

## 🐛 Troubleshooting

### Common Issues

#### Plaid Link Won't Open
- Check backend is running on port 3001
- Verify Plaid credentials in backend `.env`
- Check browser console for errors
- Ensure popups are not blocked

#### Authentication Issues
- Clear localStorage and retry
- Check JWT token expiration
- Verify backend is running
- Check CORS configuration

#### Build Errors
- Run `npm run type-check` to find type errors
- Check for missing dependencies
- Ensure Node version is 20+

### Development Tips

1. **Hot Module Replacement**: Vite provides instant updates
2. **React DevTools**: Install browser extension for debugging
3. **Network Tab**: Monitor API calls in browser DevTools
4. **Console Logs**: Plaid events are logged for debugging

## 🧪 Testing

Testing setup (to be implemented):
```bash
# Run tests
npm test

# Watch mode
npm run test:watch

# Coverage
npm run test:coverage
```

## 🚀 Deployment

### Build for Production

```bash
# Create optimized build
npm run build

# Output in dist/ directory
# Serve with any static host
```

### Environment Variables

For production, create `.env.production`:
```env
VITE_API_URL=https://api.yourdomain.com
```

### Hosting Options

- **Vercel**: Zero-config deployment
- **Netlify**: Drag-and-drop dist folder
- **AWS S3**: Static website hosting
- **nginx**: Serve dist folder

## 📝 Code Style

- Functional components with hooks
- TypeScript for all files
- Named exports for components
- Consistent file naming (PascalCase for components)
- Comprehensive JSDoc comments for complex logic

## 🤝 Contributing

1. Follow TypeScript strict mode
2. No `any` types
3. Test critical paths
4. Update types in `shared/types`
5. Follow existing patterns

## 📚 Resources

- [React Documentation](https://react.dev)
- [Vite Guide](https://vitejs.dev/guide/)
- [Tailwind CSS](https://tailwindcss.com/docs)
- [Plaid Link Docs](https://plaid.com/docs/link/)
- [Zustand](https://github.com/pmndrs/zustand)
- [TanStack Query](https://tanstack.com/query)

---

Part of the [Household Budgeting App](../README.md)