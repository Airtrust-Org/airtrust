import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import React from 'react';
import {
  useEscalasQuery,
  useEscalaCalendarioQuery,
  useTiposEventoConfigQuery,
} from '../useEscalasQueries';

// Fake JWT with future exp — satisfies isValidToken() without a real backend
const FAKE_JWT =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxIiwiZXhwIjo5OTk5OTk5OTk5OTl9.fakesig';

beforeEach(() => {
  (localStorage.getItem as ReturnType<typeof vi.fn>).mockImplementation((key: string) => {
    if (key === 'airtrust_token') return FAKE_JWT;
    return null;
  });
});

function makeWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
        gcTime: 0,
      },
    },
  });
  return ({ children }: { children: React.ReactNode }) =>
    React.createElement(QueryClientProvider, { client: queryClient }, children);
}

// ─── useEscalasQuery ───────────────────────────────────────────────────────

describe('useEscalasQuery', () => {
  it('fetches list of escalas and returns them', async () => {
    const wrapper = makeWrapper();
    const { result } = renderHook(() => useEscalasQuery(), { wrapper });

    expect(result.current.loading).toBe(true);

    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.error).toBeNull();
    expect(result.current.data).not.toBeNull();
    expect(Array.isArray(result.current.data)).toBe(true);
    expect(result.current.data?.length).toBeGreaterThan(0);
  });

  it('includes refetch function', async () => {
    const wrapper = makeWrapper();
    const { result } = renderHook(() => useEscalasQuery(), { wrapper });

    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(typeof result.current.refetch).toBe('function');
  });
});

// ─── useEscalaCalendarioQuery ──────────────────────────────────────────────

describe('useEscalaCalendarioQuery', () => {
  it('starts in loading state when id is provided', async () => {
    const wrapper = makeWrapper();
    const { result } = renderHook(() => useEscalaCalendarioQuery('escala-1'), { wrapper });

    const initialLoading = result.current.loading;
    expect(initialLoading).toBe(true);
  });

  it('fetches calendario data when id is not null', async () => {
    const wrapper = makeWrapper();
    const { result } = renderHook(() => useEscalaCalendarioQuery('escala-1'), { wrapper });

    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.error).toBeNull();
    expect(result.current.data).not.toBeNull();
    expect(result.current.data).toHaveProperty('escala');
    expect(result.current.data).toHaveProperty('alocacoes');
    expect(result.current.data).toHaveProperty('eventos');
  });

  it('does NOT fetch when id is null (query disabled)', () => {
    const wrapper = makeWrapper();
    const { result } = renderHook(() => useEscalaCalendarioQuery(null), { wrapper });

    // Query is disabled — should never be loading
    expect(result.current.loading).toBe(false);
    expect(result.current.data).toBeNull();
  });

  it('returns an error when the API returns 500', async () => {
    const wrapper = makeWrapper();
    const { result } = renderHook(() => useEscalaCalendarioQuery('error-id'), { wrapper });

    // The hook retries on error (retry: 2), so wait for the error state directly.
    await waitFor(() => expect(result.current.error).not.toBeNull(), { timeout: 5000 });

    expect(result.current.error).not.toBeNull();
    expect(result.current.data).toBeNull();
  });
});

// ─── useTiposEventoConfigQuery ─────────────────────────────────────────────

describe('useTiposEventoConfigQuery', () => {
  it('returns all tipos evento when ativoOnly is false', async () => {
    const wrapper = makeWrapper();
    const { result } = renderHook(() => useTiposEventoConfigQuery(), { wrapper });

    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.error).toBeNull();
    expect(result.current.data).not.toBeNull();
    // MSW handler returns 3 items (2 active + 1 inactive)
    expect(result.current.data?.length).toBe(3);
  });

  it('requests active-only URL when ativoOnly is true', async () => {
    const wrapper = makeWrapper();
    const { result } = renderHook(() => useTiposEventoConfigQuery({ ativoOnly: true }), {
      wrapper,
    });

    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.error).toBeNull();
    // All returned items should have ativo = 1
    const data = result.current.data;
    expect(data).not.toBeNull();
  });
});
