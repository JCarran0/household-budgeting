import { Component } from 'react';
import type { ErrorInfo, ReactNode } from 'react';
import { 
  Container, 
  Paper, 
  Title, 
  Text, 
  Button, 
  Stack, 
  Alert,
  Code,
  Collapse,
  Group
} from '@mantine/core';
import { 
  IconAlertTriangle, 
  IconRefresh, 
  IconHome,
  IconBug,
  IconChevronDown,
  IconChevronUp
} from '@tabler/icons-react';

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
  level?: 'app' | 'page' | 'component';
  resetKeys?: Array<string | number>;
  resetOnPropsChange?: boolean;
  isolate?: boolean;
  onError?: (error: Error, errorInfo: ErrorInfo) => void;
  showDetails?: boolean;
  customMessage?: string;
}

interface State {
  hasError: boolean;
  error: Error | null;
  errorInfo: ErrorInfo | null;
  errorCount: number;
  showDetails: boolean;
}

export class ErrorBoundary extends Component<Props, State> {
  private resetTimeoutId: number | null = null;
  private previousResetKeys: Array<string | number> = [];

  constructor(props: Props) {
    super(props);
    this.state = {
      hasError: false,
      error: null,
      errorInfo: null,
      errorCount: 0,
      showDetails: false,
    };
    this.previousResetKeys = props.resetKeys || [];
  }

  static getDerivedStateFromError(error: Error): Partial<State> {
    return {
      hasError: true,
      error,
    };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo): void {
    const { onError, level = 'component' } = this.props;

    // Log error details
    console.error(`[ErrorBoundary-${level}] Error caught:`, error);
    console.error('Error Info:', errorInfo);
    console.error('Component Stack:', errorInfo.componentStack);

    // Update state with error details
    this.setState(prevState => ({
      errorInfo,
      errorCount: prevState.errorCount + 1,
    }));

    // Call custom error handler if provided
    if (onError) {
      onError(error, errorInfo);
    }

    // Log to external service in production
    if (import.meta.env.PROD) {
      this.logErrorToService(error, errorInfo);
    }
  }

  componentDidUpdate(prevProps: Props): void {
    const { resetKeys, resetOnPropsChange } = this.props;
    const { hasError } = this.state;

    if (hasError && prevProps.children !== this.props.children && resetOnPropsChange) {
      this.resetErrorBoundary();
    }

    if (hasError && resetKeys) {
      const hasResetKeyChanged = resetKeys.some(
        (key, idx) => key !== this.previousResetKeys[idx]
      );
      if (hasResetKeyChanged) {
        this.resetErrorBoundary();
        this.previousResetKeys = resetKeys;
      }
    }
  }

  componentWillUnmount(): void {
    if (this.resetTimeoutId) {
      window.clearTimeout(this.resetTimeoutId);
    }
  }

  logErrorToService = (error: Error, errorInfo: ErrorInfo): void => {
    // In production, this would send to a service like Sentry
    const errorData = {
      message: error.message,
      stack: error.stack,
      componentStack: errorInfo.componentStack,
      timestamp: new Date().toISOString(),
      level: this.props.level,
      url: window.location.href,
      userAgent: navigator.userAgent,
    };

    // For now, just log to console
    console.log('Error logged to service:', errorData);
  };

  resetErrorBoundary = (): void => {
    this.setState({
      hasError: false,
      error: null,
      errorInfo: null,
      showDetails: false,
    });
  };

  handleReset = (): void => {
    this.resetErrorBoundary();
  };

  handleGoHome = (): void => {
    window.location.href = '/dashboard';
  };

  toggleDetails = (): void => {
    this.setState(prev => ({ showDetails: !prev.showDetails }));
  };

  render(): ReactNode {
    const { hasError, error, errorCount, showDetails } = this.state;
    const { children, fallback, level = 'component', isolate = true, customMessage, showDetails: showDetailsProp = true } = this.props;

    if (hasError && error) {
      // Use custom fallback if provided
      if (fallback) {
        return fallback;
      }

      // App-level error
      if (level === 'app') {
        return (
          <Container size="sm" py="xl">
            <Paper p="xl" shadow="lg" radius="md" style={{ backgroundColor: 'var(--mantine-color-red-light)' }}>
              <Stack gap="md" align="center">
                <IconAlertTriangle size={64} color="var(--mantine-color-red-6)" />
                <Title order={2} ta="center">Application Error</Title>
                <Text ta="center" size="lg" c="dimmed">
                  {customMessage || 'The application encountered an unexpected error and needs to restart.'}
                </Text>
                <Group>
                  <Button 
                    leftSection={<IconRefresh size={20} />}
                    onClick={() => window.location.reload()}
                    size="lg"
                  >
                    Reload Application
                  </Button>
                </Group>
                {showDetailsProp && (
                  <>
                    <Button
                      variant="subtle"
                      onClick={this.toggleDetails}
                      rightSection={showDetails ? <IconChevronUp size={16} /> : <IconChevronDown size={16} />}
                    >
                      {showDetails ? 'Hide' : 'Show'} Technical Details
                    </Button>
                    <Collapse in={showDetails} style={{ width: '100%' }}>
                      <Alert color="red" title="Error Details" icon={<IconBug />}>
                        <Stack gap="xs">
                          <Text fw={600}>{error.message}</Text>
                          <Code block style={{ maxHeight: 200, overflow: 'auto' }}>
                            {error.stack}
                          </Code>
                        </Stack>
                      </Alert>
                    </Collapse>
                  </>
                )}
              </Stack>
            </Paper>
          </Container>
        );
      }

      // Page-level error
      if (level === 'page') {
        return (
          <Container size="sm" py="xl">
            <Paper p="lg" shadow="md" radius="md">
              <Stack gap="md" align="center">
                <IconAlertTriangle size={48} color="var(--mantine-color-yellow-6)" />
                <Title order={3} ta="center">Page Error</Title>
                <Text ta="center" c="dimmed">
                  {customMessage || 'This page encountered an error and cannot be displayed.'}
                </Text>
                <Group>
                  <Button 
                    leftSection={<IconRefresh size={18} />}
                    onClick={this.handleReset}
                    variant="filled"
                  >
                    Try Again
                  </Button>
                  <Button 
                    leftSection={<IconHome size={18} />}
                    onClick={this.handleGoHome}
                    variant="light"
                  >
                    Go to Dashboard
                  </Button>
                </Group>
                {errorCount > 2 && (
                  <Alert color="yellow" ta="center">
                    This error has occurred {errorCount} times. Consider refreshing the page or contacting support.
                  </Alert>
                )}
                {showDetailsProp && import.meta.env.DEV && (
                  <>
                    <Button
                      size="xs"
                      variant="subtle"
                      onClick={this.toggleDetails}
                      rightSection={showDetails ? <IconChevronUp size={14} /> : <IconChevronDown size={14} />}
                    >
                      {showDetails ? 'Hide' : 'Show'} Details
                    </Button>
                    <Collapse in={showDetails} style={{ width: '100%' }}>
                      <Code block style={{ maxHeight: 150, overflow: 'auto', fontSize: '0.75rem' }}>
                        {error.stack}
                      </Code>
                    </Collapse>
                  </>
                )}
              </Stack>
            </Paper>
          </Container>
        );
      }

      // Component-level error (default)
      if (isolate) {
        return (
          <Alert 
            icon={<IconAlertTriangle size={16} />}
            title="Component Error"
            color="red"
            withCloseButton
            onClose={this.handleReset}
          >
            <Stack gap="xs">
              <Text size="sm">
                {customMessage || 'This component encountered an error and cannot be displayed.'}
              </Text>
              <Button size="xs" onClick={this.handleReset} variant="light">
                Retry
              </Button>
            </Stack>
          </Alert>
        );
      }

      // Non-isolated component error propagates up
      throw error;
    }

    return children;
  }
}

// Specialized error boundary for async operations
export function AsyncErrorBoundary({ children, ...props }: Omit<Props, 'level'>) {
  return (
    <ErrorBoundary 
      level="component" 
      customMessage="Failed to load data. Please check your connection and try again."
      {...props}
    >
      {children}
    </ErrorBoundary>
  );
}

// Specialized error boundary for forms
export function FormErrorBoundary({ children, ...props }: Omit<Props, 'level'>) {
  return (
    <ErrorBoundary 
      level="component" 
      customMessage="The form encountered an error. Please refresh and try again."
      resetOnPropsChange
      {...props}
    >
      {children}
    </ErrorBoundary>
  );
}

// Specialized error boundary for financial data
export function FinancialErrorBoundary({ children, ...props }: Omit<Props, 'level'>) {
  return (
    <ErrorBoundary 
      level="page" 
      customMessage="Error loading financial data. Your data is safe. Please try refreshing the page."
      onError={(error, info) => {
        // Extra logging for financial errors
        console.error('[FINANCIAL ERROR]', { error, info, timestamp: new Date().toISOString() });
      }}
      {...props}
    >
      {children}
    </ErrorBoundary>
  );
}