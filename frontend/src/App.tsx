import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { QueryClientProvider } from '@tanstack/react-query';
import { ReactQueryDevtools } from '@tanstack/react-query-devtools';
import { MantineProvider, createTheme } from '@mantine/core';
import { Notifications } from '@mantine/notifications';
import { ModalsProvider } from '@mantine/modals';
import '@mantine/core/styles.css';
import '@mantine/dates/styles.css';
import '@mantine/charts/styles.css';
import '@mantine/notifications/styles.css';

import { LoginForm } from './components/auth/LoginForm';
import { RegisterForm } from './components/auth/RegisterForm';
import { ProtectedRoute } from './components/ProtectedRoute';
import { MantineLayout } from './components/MantineLayout';
import { MantineDashboard } from './pages/MantineDashboard';
import { MantineAccounts } from './pages/MantineAccounts';
import { EnhancedTransactions } from './pages/EnhancedTransactions';
import { Categories } from './pages/Categories';
import { Budgets } from './pages/Budgets';
import { Reports } from './pages/Reports';
import { Admin } from './pages/Admin';
import { PlaidLinkProvider } from './providers/PlaidLinkProvider';
import { queryClient } from './lib/queryClient';
import { ErrorBoundary } from './components/ErrorBoundary';
import { RouteErrorBoundary } from './components/RouteErrorBoundary';

// Mantine theme configuration
const theme = createTheme({
  primaryColor: 'yellow',
  defaultRadius: 'md',
  cursorType: 'pointer',
});

function App() {
  return (
    <ErrorBoundary level="app">
      <MantineProvider theme={theme} defaultColorScheme="dark">
        <ModalsProvider>
          <Notifications position="top-right" />
          <QueryClientProvider client={queryClient}>
          <PlaidLinkProvider>
            <BrowserRouter>
              <Routes>
                <Route path="/login" element={<LoginForm />} />
                <Route path="/register" element={<RegisterForm />} />
                <Route element={<ProtectedRoute />}>
                  <Route element={<MantineLayout />}>
                    <Route path="/dashboard" element={
                      <RouteErrorBoundary routeName="Dashboard">
                        <MantineDashboard />
                      </RouteErrorBoundary>
                    } />
                    <Route path="/accounts" element={
                      <RouteErrorBoundary routeName="Accounts">
                        <MantineAccounts />
                      </RouteErrorBoundary>
                    } />
                    <Route path="/transactions" element={
                      <RouteErrorBoundary routeName="Transactions">
                        <EnhancedTransactions />
                      </RouteErrorBoundary>
                    } />
                    <Route path="/categories" element={
                      <RouteErrorBoundary routeName="Categories">
                        <Categories />
                      </RouteErrorBoundary>
                    } />
                    <Route path="/budgets" element={
                      <RouteErrorBoundary routeName="Budgets">
                        <Budgets />
                      </RouteErrorBoundary>
                    } />
                    <Route path="/reports" element={
                      <RouteErrorBoundary routeName="Reports">
                        <Reports />
                      </RouteErrorBoundary>
                    } />
                    <Route path="/admin" element={
                      <RouteErrorBoundary routeName="Admin">
                        <Admin />
                      </RouteErrorBoundary>
                    } />
                  </Route>
                </Route>
                <Route path="/" element={<Navigate to="/dashboard" replace />} />
              </Routes>
            </BrowserRouter>
          </PlaidLinkProvider>
          <ReactQueryDevtools initialIsOpen={false} />
        </QueryClientProvider>
        </ModalsProvider>
      </MantineProvider>
    </ErrorBoundary>
  );
}

export default App;