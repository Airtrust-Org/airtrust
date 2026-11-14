import { Suspense } from 'react';
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ErrorBoundary as RouteErrorBoundary } from '@/react-app/components/ErrorBoundary';
import { importWithRetry, lazyWithRetry } from '@/react-app/utils/lazyWithRetry';

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  window.history.replaceState({}, '', '/');
  window.sessionStorage.removeItem('airtrust_lazy_retry_QualificacoesChunkConsent');
  window.sessionStorage.removeItem('airtrust-hard-recover:/qualificacoes');
});

describe('UX-01 — chunk loads do not force a reload during unsaved work', () => {
  it('retries the import twice, then shows a user-controlled recovery without auto refresh', async () => {
    window.history.replaceState({}, '', '/qualificacoes');
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true }));
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const importer = vi.fn().mockRejectedValue(new Error('Failed to fetch dynamically imported module'));
    const LazyComponent = lazyWithRetry(importer, 'QualificacoesChunkConsent');
    render(
      <RouteErrorBoundary showDetails={false}>
        <Suspense fallback={<div>Carregando...</div>}><LazyComponent /></Suspense>
      </RouteErrorBoundary>,
    );
    expect(await screen.findByText('Algo deu errado')).toBeTruthy();
    expect(importer).toHaveBeenCalledTimes(2);
    expect(window.sessionStorage.getItem('airtrust_lazy_retry_QualificacoesChunkConsent')).toBeNull();
    expect(window.sessionStorage.getItem('airtrust-hard-recover:/qualificacoes')).toBeNull();
    expect(screen.getByRole('button', { name: 'Recarregar Página' })).toBeTruthy();
    expect(screen.getByText(/dados não salvos podem ser perdidos/i)).toBeTruthy();
  });

  it('resolves a transient chunk error in place without setting a reload marker', async () => {
    window.history.replaceState({}, '', '/simuladores');
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true }));
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const module = { default: () => null };
    const importer = vi.fn()
      .mockRejectedValueOnce(new Error('ChunkLoadError'))
      .mockResolvedValueOnce(module);
    const resolved = await importWithRetry(importer, 'TransientChunk', { maxAttempts: 2 });
    expect(resolved).toBe(module);
    expect(importer).toHaveBeenCalledTimes(2);
    expect(window.sessionStorage.getItem('airtrust_lazy_retry_TransientChunk')).toBeNull();
  });
});
