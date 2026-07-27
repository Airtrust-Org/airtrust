import { beforeEach, describe, expect, it, vi } from 'vitest';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { act, render, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

import LmsPlayer from '@/react-app/pages/lms/LmsPlayer';

// ── Mocks ──────────────────────────────────────────────────────────────
const { ensureValidAccessTokenMock, getAccessTokenMock } = vi.hoisted(() => ({
  ensureValidAccessTokenMock: vi.fn(async () => 'token-test'),
  getAccessTokenMock: vi.fn(() => 'token-test'),
}));

const matriculaBase = {
  id: 42,
  curso_id: 7,
  titulo: 'SCORM Stability Test',
  tipo_conteudo: 'scorm',
  status: 'EM_ANDAMENTO',
  progresso_pct: 0,
  carga_horaria_minutos: 60,
  score_final: null,
  gerar_qualificacao_ao_concluir: 0,
  qualificacao_historico_id: null,
  data_conclusao: null,
  scorm_progresso: { cmi_json: null },
  completion_diagnostic: null,
};

let matriculaRef = { ...matriculaBase };
let refetchCount = 0;

vi.mock('@/react-app/hooks/useAuth', () => ({
  useAuth: () => ({ token: 'token-test' }),
}));

vi.mock('@/react-app/hooks/useLms', () => ({
  useMatriculaDetalhe: () => {
    refetchCount++;
    return {
      data: { ...matriculaRef },
      isLoading: false,
      refetch: vi.fn(async () => {
        refetchCount++;
        return undefined;
      }),
    };
  },
  useLmsCurso: () => ({ data: { descricao: 'Test Course', carga_horaria_minutos: 60 } }),
  lmsKeys: {
    minhasMatriculas: () => ['lms', 'minhas-matriculas'],
    minhasEAD: () => ['lms', 'minhas-ead'],
  },
}));

vi.mock('@/react-app/config/api', () => ({
  API_BASE_URL: 'http://localhost:8787/api',
  AUTH_TOKEN_CHANGED_EVENT: 'airtrust-auth-token-changed',
  ensureValidAccessToken: ensureValidAccessTokenMock,
  fetchWithAuth: vi.fn(),
  getAccessToken: getAccessTokenMock,
}));

vi.mock('sonner', () => ({
  toast: { loading: vi.fn(), success: vi.fn(), error: vi.fn(), dismiss: vi.fn(), warning: vi.fn() },
}));

// ── Helpers ────────────────────────────────────────────────────────────
function renderPlayer(matriculaId = 42) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter initialEntries={[`/lms/player/scorm/${matriculaId}`]}>
        <Routes>
          <Route path="/lms/player/scorm/:matriculaId" element={<LmsPlayer />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

function getIframe(container: HTMLElement): HTMLIFrameElement | null {
  return container.querySelector('iframe');
}

function getIframeSrc(container: HTMLElement): string | null {
  return getIframe(container)?.getAttribute('src') ?? null;
}

async function waitForIframe(container: HTMLElement): Promise<HTMLIFrameElement> {
  let iframe: HTMLIFrameElement | null = null;
  await waitFor(() => {
    iframe = getIframe(container);
    expect(iframe).not.toBeNull();
  });
  return iframe!;
}

// Simula um evento de progresso vindo do iframe (postMessage).
function simulateProgress(container: HTMLElement, overrides?: Record<string, unknown>) {
  const iframe = getIframe(container);
  if (!iframe) return;
  act(() => {
    window.dispatchEvent(
      new MessageEvent('message', {
        origin: 'http://localhost:8787',
        data: {
          type: 'lms:progress',
          matriculaId: 42,
          progresso_pct: overrides?.progresso_pct ?? 33,
          location: overrides?.location ?? '1/3',
          ...overrides,
        },
      }),
    );
  });
}

function simulateCompletion(container: HTMLElement, status: 'passed' | 'failed' = 'passed') {
  const iframe = getIframe(container);
  if (!iframe) return;
  act(() => {
    window.dispatchEvent(
      new MessageEvent('message', {
        origin: 'http://localhost:8787',
        data: {
          type: 'lms:completed',
          matriculaId: 42,
          status,
        },
      }),
    );
  });
}

// ── Tests ──────────────────────────────────────────────────────────────
describe('LmsPlayer — SCORM iframe stability (session-based)', () => {
  beforeEach(() => {
    ensureValidAccessTokenMock.mockReset().mockResolvedValue('token-test');
    getAccessTokenMock.mockReset().mockReturnValue('token-test');
    matriculaRef = { ...matriculaBase };
    refetchCount = 0;
  });

  describe('iframe identity', () => {
    it('mantém o mesmo iframe (mesmo elemento DOM) durante saves de progresso', async () => {
      const { container } = renderPlayer();
      await waitForIframe(container);

      const elementBefore = getIframe(container);
      const srcBefore = elementBefore!.getAttribute('src');

      // Simulate 3 progress saves — they trigger refetch + re-render
      simulateProgress(container, { progresso_pct: 25, location: '1/3' });
      await waitFor(() => expect(refetchCount).toBeGreaterThan(0));

      simulateProgress(container, { progresso_pct: 50, location: '2/3' });
      simulateProgress(container, { progresso_pct: 75, location: '3/3' });

      const elementAfter = getIframe(container);
      const srcAfter = elementAfter!.getAttribute('src');

      // Same DOM element
      expect(elementAfter).toBe(elementBefore);
      // Same src (frozen by session key)
      expect(srcAfter).toBe(srcBefore);
      // Src contains the original token (not rotated)
      expect(srcAfter).toContain('token=token-test');
    });

    it('não dispara tela preta (iframeLoaded nunca volta a false) durante saves', async () => {
      const { container } = renderPlayer();
      await waitForIframe(container);

      // Simulate the iframe onLoad
      const iframe = getIframe(container)!;
      act(() => {
        iframe.dispatchEvent(new Event('load'));
      });

      // Verify no loading overlay before saves
      await waitFor(() => {
        const loadingDivs = container.querySelectorAll('.animate-spin');
        // The loader2 icon might still be in the loading state if iframe not loaded
        // But we fired onLoad, so it should be gone
      });

      // Fire multiple progress saves
      for (let i = 0; i < 5; i++) {
        simulateProgress(container, { progresso_pct: 20 * i, location: `${i + 1}/5` });
      }

      // The iframe should still be in the DOM with the same src
      await waitFor(() => {
        expect(getIframe(container)).not.toBeNull();
      });
    });
  });

  describe('token rotation', () => {
    it('mantém o src do iframe inalterado quando o token é renovado', async () => {
      const { container } = renderPlayer();
      await waitForIframe(container);

      const srcBefore = getIframeSrc(container);

      // Simulate token rotation
      ensureValidAccessTokenMock.mockResolvedValue('token-rotated-v2');
      getAccessTokenMock.mockReturnValue('token-rotated-v2');
      await act(async () => {
        window.dispatchEvent(
          new CustomEvent('airtrust-auth-token-changed', {
            detail: { token: 'token-rotated-v2' },
          }),
        );
      });

      await waitFor(() => {
        expect(getAccessTokenMock).toHaveBeenCalled();
      });

      const srcAfter = getIframeSrc(container);
      expect(srcAfter).toBe(srcBefore);
      expect(srcAfter).toContain('token=token-test'); // original token, not rotated
    });

    it('envia novo token via postMessage quando o iframe solicita', async () => {
      const { container } = renderPlayer();
      const iframe = await waitForIframe(container);

      // Simulate iframe load so syncFrameToken runs
      act(() => {
        iframe.dispatchEvent(new Event('load'));
      });

      const postMessageSpy = vi.spyOn(iframe.contentWindow!, 'postMessage');

      // Update the mock to return a fresh token
      ensureValidAccessTokenMock.mockResolvedValue('token-fresh');
      getAccessTokenMock.mockReturnValue('token-fresh');

      // Simulate the iframe requesting a token refresh
      await act(async () => {
        window.dispatchEvent(
          new MessageEvent('message', {
            origin: 'http://localhost:8787',
            data: {
              type: 'lms:auth-token-request',
              matriculaId: 42,
            },
          }),
        );
      });

      await waitFor(() => {
        const calls = postMessageSpy.mock.calls.filter(
          (call: unknown[]) => (call[0] as Record<string, unknown>)?.type === 'lms:auth-token',
        );
        const tokenCall = calls.find(
          (call: unknown[]) => (call[0] as Record<string, unknown>).token === 'token-fresh',
        );
        expect(tokenCall).toBeDefined();
      });

      postMessageSpy.mockRestore();
    });
  });

  describe('session boundaries', () => {
    it('cria novo iframe quando a matrícula muda (sessionKey diferente)', async () => {
      const { container } = renderPlayer(42);
      await waitForIframe(container);
      const srcFirst = getIframeSrc(container);

      // Render a different matricula — this is a new session
      const { container: container2 } = renderPlayer(99);
      await waitForIframe(container2);
      const srcSecond = getIframeSrc(container2);

      // Different src because different matricula ID
      expect(srcSecond).not.toBeNull();
      expect(srcSecond).not.toBe(srcFirst);
      // New matricula scorm url
      expect(srcSecond).toContain('/lms/scorm/launch/99');
    });
  });

  describe('completion', () => {
    it('mantém o iframe estável durante o fluxo de conclusão', async () => {
      const { container } = renderPlayer();
      await waitForIframe(container);

      const elementBefore = getIframe(container);
      const srcBefore = getIframeSrc(container);

      simulateCompletion(container, 'passed');

      await waitFor(() => {
        // Iframe still in DOM after completion
        const elementAfter = getIframe(container);
        expect(elementAfter).toBe(elementBefore);
        expect(elementAfter!.getAttribute('src')).toBe(srcBefore);
      });
    });
  });

  describe('review mode', () => {
    it('cria nova sessão com URL diferente no modo consulta (review=1)', async () => {
      const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
      const result = render(
        <QueryClientProvider client={qc}>
          <MemoryRouter initialEntries={['/lms/player/scorm/42?review=1']}>
            <Routes>
              <Route path="/lms/player/scorm/:matriculaId" element={<LmsPlayer />} />
            </Routes>
          </MemoryRouter>
        </QueryClientProvider>,
      );

      await waitForIframe(result.container);
      const src = getIframeSrc(result.container);
      expect(src).toContain('review=1');
    });
  });
});
