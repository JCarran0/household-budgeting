import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';

describe('vitest + RTL harness smoke test', () => {
  it('renders a minimal React element and queries it via testing-library', () => {
    render(<p data-testid="smoke">hello</p>);
    expect(screen.getByTestId('smoke')).toHaveTextContent('hello');
  });

  it('has jsdom globals: localStorage and window', () => {
    window.localStorage.setItem('k', 'v');
    expect(window.localStorage.getItem('k')).toBe('v');
  });

  it('clears localStorage between tests (setup hook)', () => {
    expect(window.localStorage.getItem('k')).toBeNull();
  });
});
