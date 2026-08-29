import { render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ErrorBoundary } from '@/react-app/components/common/ErrorBoundary';

function Boom(): never {
  throw new Error('sensitive-debug-detail');
}

describe('common ErrorBoundary', () => {
  let consoleErrorSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
  });

  afterEach(() => {
    consoleErrorSpy.mockRestore();
  });

  it('does not disclose technical details when showDetails is false', () => {
    render(
      <ErrorBoundary showDetails={false}>
        <Boom />
      </ErrorBoundary>,
    );

    expect(screen.getByText('Algo deu errado')).toBeTruthy();
    expect(screen.queryByText(/sensitive-debug-detail/i)).toBeNull();
    expect(screen.queryByText(/detalhes técnicos/i)).toBeNull();
  });

  it('allows technical details when explicitly enabled for development', () => {
    render(
      <ErrorBoundary showDetails>
        <Boom />
      </ErrorBoundary>,
    );

    expect(screen.getByText(/detalhes técnicos/i)).toBeTruthy();
    expect(screen.getByText(/sensitive-debug-detail/i)).toBeTruthy();
  });
});
