import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { QueryClientProvider } from '@tanstack/react-query';
import { ReactQueryDevtools } from '@tanstack/react-query-devtools';
import { Notifications } from '@mantine/notifications';
import { ModalsProvider } from '@mantine/modals';
import { ThemeProvider } from './providers/ThemeProvider';
import '@mantine/core/styles.css';
import '@mantine/dates/styles.css';
import '@mantine/charts/styles.css';
import '@mantine/notifications/styles.css';

import { LoginForm } from './components/auth/LoginForm';
import { RegisterForm } from './components/auth/RegisterForm';
import { ResetRequestForm } from './components/auth/ResetRequestForm';
import { ResetPasswordForm } from './components/auth/ResetPasswordForm';
import { ProtectedRoute } from './components/ProtectedRoute';
import { MantineLayout } from './components/MantineLayout';
import { MantineDashboard } from './pages/MantineDashboard';
import { MantineAccounts } from './pages/MantineAccounts';
import { EnhancedTransactions } from './pages/EnhancedTransactions';
import { Categories } from './pages/Categories';
import { Budgets } from './pages/Budgets';
import { Reports } from './pages/Reports';
import { Admin } from './pages/Admin';
import { Trips } from './pages/Trips';
import { Projects } from './pages/Projects';
import { Settings } from './pages/Settings';
import { Tasks } from './pages/Tasks';
import { PlaidLinkProvider } from './providers/PlaidLinkProvider';
import { queryClient } from './lib/queryClient';
import { ErrorBoundary } from './components/ErrorBoundary';
import { RouteErrorBoundary } from './components/RouteErrorBoundary';
import { PWAUpdatePrompt } from './components/pwa/PWAUpdatePrompt';
import { PWAInstallBanner } from './components/pwa/PWAInstallBanner';
import { OfflineIndicator } from './components/pwa/OfflineIndicator';


function App() {
  return (
    <ErrorBoundary level="app">
      <QueryClientProvider client={queryClient}>
        <ThemeProvider>
          <ModalsProvider>
            <Notifications position="top-right" />
            <PWAUpdatePrompt />
            <PWAInstallBanner />
            <OfflineIndicator />
            <PlaidLinkProvider>
            <BrowserRouter>
              <Routes>
                <Route path="/login" element={<LoginForm />} />
                <Route path="/register" element={<RegisterForm />} />
                <Route path="/request-reset" element={<ResetRequestForm />} />
                <Route path="/reset-password" element={<ResetPasswordForm />} />
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
                    <Route path="/trips" element={
                      <RouteErrorBoundary routeName="Trips">
                        <Trips />
                      </RouteErrorBoundary>
                    } />
                    <Route path="/projects" element={
                      <RouteErrorBoundary routeName="Projects">
                        <Projects />
                      </RouteErrorBoundary>
                    } />
                    <Route path="/tasks" element={
                      <RouteErrorBoundary routeName="Tasks">
                        <Tasks />
                      </RouteErrorBoundary>
                    } />
                    <Route path="/admin" element={
                      <RouteErrorBoundary routeName="Admin">
                        <Admin />
                      </RouteErrorBoundary>
                    } />
                    <Route path="/settings" element={
                      <RouteErrorBoundary routeName="Settings">
                        <Settings />
                      </RouteErrorBoundary>
                    } />
                  </Route>
                </Route>
                <Route path="/" element={<Navigate to="/dashboard" replace />} />
              </Routes>
              </BrowserRouter>
            </PlaidLinkProvider>
            <ReactQueryDevtools initialIsOpen={false} />
          </ModalsProvider>
        </ThemeProvider>
      </QueryClientProvider>
    </ErrorBoundary>
  );
}

export default App;