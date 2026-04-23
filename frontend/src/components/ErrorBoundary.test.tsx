import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { useState } from 'react';
import { ErrorBoundary } from './ErrorBoundary';

// React intentionally logs a big error + componentStack when a boundary catches.
// Silence it so test output stays readable — but restore after each test so a
// real failure elsewhere still surfaces.
let consoleErrorSpy: ReturnType<typeof vi.spyOn>;
let consoleLogSpy: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
  consoleLogSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
});

afterEach(() => {
  consoleErrorSpy.mockRestore();
  consoleLogSpy.mockRestore();
});

function Bomb({ message = 'kaboom' }: { message?: string }): never {
  throw new Error(message);
}

describe('ErrorBoundary', () => {
  describe('catching errors', () => {
    it('renders children when no error is thrown', () => {
      render(
        <ErrorBoundary fallback={<span>fallback</span>}>
          <span>happy path</span>
        </ErrorBoundary>,
      );
      expect(screen.getByText('happy path')).toBeInTheDocument();
      expect(screen.queryByText('fallback')).not.toBeInTheDocument();
    });

    it('renders the custom fallback when a child throws during render', () => {
      render(
        <ErrorBoundary fallback={<span data-testid="fallback">caught</span>}>
          <Bomb />
        </ErrorBoundary>,
      );
      expect(screen.getByTestId('fallback')).toHaveTextContent('caught');
    });

    it('calls the onError prop with the error and errorInfo', () => {
      const onError = vi.fn();
      render(
        <ErrorBoundary fallback={<span>fb</span>} onError={onError}>
          <Bomb message="specific-error" />
        </ErrorBoundary>,
      );
      expect(onError).toHaveBeenCalledTimes(1);
      const [err, info] = onError.mock.calls[0];
      expect(err).toBeInstanceOf(Error);
      expect((err as Error).message).toBe('specific-error');
      // componentStack is populated by React on errorInfo
      expect(info).toHaveProperty('componentStack');
    });

    it('does not swallow the error: onError receives the actual Error instance', () => {
      const seen: Error[] = [];
      render(
        <ErrorBoundary
          fallback={<span>fb</span>}
          onError={(err) => seen.push(err)}
        >
          <Bomb message="hello" />
        </ErrorBoundary>,
      );
      expect(seen).toHaveLength(1);
      expect(seen[0].message).toBe('hello');
    });
  });

  describe('reset behaviour', () => {
    /**
     * Drives the reset via the `resetKeys` prop — a clean imperative API that
     * doesn't require poking through the Mantine Retry button (which needs a
     * MantineProvider to render). The reset logic is the same codepath
     * regardless of what triggers it (ErrorBoundary.tsx:100–108).
     */
    function Harness({ initialKey, healOnReset }: { initialKey: number; healOnReset: boolean }) {
      const [resetKey, setResetKey] = useState(initialKey);
      const [healed, setHealed] = useState(false);

      function Child() {
        if (!healed) throw new Error('first render blows up');
        return <span data-testid="healed">child recovered</span>;
      }

      return (
        <>
          <button
            type="button"
            data-testid="reset"
            onClick={() => {
              if (healOnReset) setHealed(true);
              setResetKey(k => k + 1);
            }}
          >
            reset
          </button>
          <ErrorBoundary fallback={<span data-testid="fallback">caught</span>} resetKeys={[resetKey]}>
            <Child />
          </ErrorBoundary>
        </>
      );
    }

    it('clears error state when resetKeys change and re-renders children', () => {
      render(<Harness initialKey={0} healOnReset />);
      expect(screen.getByTestId('fallback')).toBeInTheDocument();

      fireEvent.click(screen.getByTestId('reset'));

      expect(screen.queryByTestId('fallback')).not.toBeInTheDocument();
      expect(screen.getByTestId('healed')).toHaveTextContent('child recovered');
    });

    it('does not swallow re-thrown errors in children mounted after reset', () => {
      // Reset fires, but the child still throws → boundary catches again and
      // fallback reappears. (This is the "didn't silently stay cleared" case.)
      render(<Harness initialKey={0} healOnReset={false} />);
      expect(screen.getByTestId('fallback')).toBeInTheDocument();

      fireEvent.click(screen.getByTestId('reset'));

      expect(screen.getByTestId('fallback')).toBeInTheDocument();
    });
  });

  describe('isolate=false re-throws', () => {
    it('re-throws when isolate is false and no fallback is provided', () => {
      // Outer boundary catches what the inner (isolate=false, no fallback)
      // re-throws — verifies the "propagates up" branch on line 289.
      const outerOnError = vi.fn();
      render(
        <ErrorBoundary fallback={<span data-testid="outer">outer</span>} onError={outerOnError}>
          <ErrorBoundary isolate={false}>
            <Bomb />
          </ErrorBoundary>
        </ErrorBoundary>,
      );
      expect(screen.getByTestId('outer')).toHaveTextContent('outer');
      expect(outerOnError).toHaveBeenCalledTimes(1);
    });
  });
});
