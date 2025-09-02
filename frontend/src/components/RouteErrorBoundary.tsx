import { useLocation } from 'react-router-dom';
import { ErrorBoundary } from './ErrorBoundary';
import { useEffect, useState } from 'react';
import type { ReactNode } from 'react';

interface RouteErrorBoundaryProps {
  children: ReactNode;
  routeName?: string;
}

export function RouteErrorBoundary({ children, routeName }: RouteErrorBoundaryProps) {
  const location = useLocation();
  const [resetKey, setResetKey] = useState(0);

  // Reset error boundary when route changes
  useEffect(() => {
    setResetKey(prev => prev + 1);
  }, [location.pathname]);

  return (
    <ErrorBoundary
      level="page"
      resetKeys={[resetKey]}
      customMessage={`The ${routeName || 'page'} encountered an error. Please try refreshing or navigate to another page.`}
      onError={(error, errorInfo) => {
        console.error(`[Route Error - ${routeName || location.pathname}]`, error, errorInfo);
      }}
    >
      {children}
    </ErrorBoundary>
  );
}