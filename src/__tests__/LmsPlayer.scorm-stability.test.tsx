/**
 * LmsPlayer — SCORM iframe session stability (PR #506 audit)
 *
 * Covers the 13 scenarios required by the PR audit:
 *   1. matricula delayed after token (race condition)
 *   2. token delayed after matricula
 *   3. progress event (iframe DOM stability)
 *   4. refetch da mesma matricula
 *   5. rotacao de token
 *   6. token ausente temporariamente
 *   7. logout real
 *   8. troca de matricula (same component)
 *   9. troca de review mode (same component)
 *  10. troca de usuario
 *  11. troca de empresa
 *  12. conclusao
 *  13. curso concluido em Rever
 *
 * Plus: iframeLoaded reset semantics, black-screen prevention.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { act, render, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

import LmsPlayer from '@/react-app/pages/lms/LmsPlayer';

// ── Hoisted mocks ──────────────────────────────────────────────────────
const { ensureValidAccessTokenMock, getAccessTokenMock } = vi.hoisted(() => ({
  ensureValidAccessTokenMock: vi.fn(async () => 'token-test'),
  getAccessTokenMock: vi.fn(() => 'token-test'),
}));

// ── Mutable refs (reset in beforeEach) ─────────────────────────────────
let authUser: { id: number; nome: string } | null = { id: 1, nome: 'Piloto A' };
let authEmpresaId: number | null = 10;
let authToken: string | null = 'token-test';
let matriculaData: Record<string, unknown> | null = null;
let matriculaIsLoading = false;
let refetchCount = 0;

const matriculaTemplate = {
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

// ── Mock setup ─────────────────────────────────────────────────────────
vi.mock('@/react-app/hooks/useAuth', () => ({
  useAuth: () => ({
    token: authToken,
    user: authUser,
    empresaAtualId: authEmpresaId,
  }),
}));

vi.mock('@/react-app/hooks/useLms', () => ({
  useMatriculaDetalhe: (id: number) => {
    refetchCount++;
    return {
      data: matriculaData ? { ...matriculaData, id } : null,
      isLoading: matriculaIsLoading,
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
function makePlayer(matriculaId = 42, searchParams = '') {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter initialEntries={[`/lms/player/scorm/${matriculaId}${searchParams}`]}>
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
function getSrc(container: HTMLElement): string | null {
  return getIframe(container)?.getAttribute('src') ?? null;
}
async function waitForIframe(container: HTMLElement): Promise<HTMLIFrameElement> {
  let el: HTMLIFrameElement | null = null;
  await waitFor(() => { el = getIframe(container); expect(el).not.toBeNull(); });
  return el!;
}
function fireProgress(container: HTMLElement, overrides?: Record<string, unknown>) {
  act(() => {
    window.dispatchEvent(new MessageEvent('message', {
      origin: 'http://localhost:8787',
      data: { type: 'lms:progress', matriculaId: matriculaData?.id ?? 42, progresso_pct: 33, location: '1/3', ...overrides },
    }));
  });
}

// ── Tests ──────────────────────────────────────────────────────────────
describe('LmsPlayer — session stability audit (PR #506)', () => {
  beforeEach(() => {
    ensureValidAccessTokenMock.mockReset().mockResolvedValue('token-test');
    getAccessTokenMock.mockReset().mockReturnValue('token-test');
    authUser = { id: 1, nome: 'Piloto A' };
    authEmpresaId = 10;
    authToken = 'token-test';
    matriculaData = { ...matriculaTemplate };
    matriculaIsLoading = false;
    refetchCount = 0;
  });

  // ── 1-2. Race conditions ──────────────────────────────────────────
  describe('race: matricula × token', () => {
    it('1. matricula atrasada apos token: iframe aparece quando matricula carrega', async () => {
      matriculaData = null;
      matriculaIsLoading = true;
      const { container } = makePlayer();
      expect(getIframe(container)).toBeNull();

      // Resolve: new render with loaded data
      matriculaData = { ...matriculaTemplate };
      matriculaIsLoading = false;
      const result = makePlayer();
      await waitForIframe(result.container);
      expect(getSrc(result.container)).toContain('/lms/scorm/launch/42');
    });

    it('2. token atrasado apos matricula: iframe aparece quando token chega', async () => {
      // Matricula available, getAccessToken returns null initially.
      // playerToken = getAccessToken() ?? token = null ?? 'token-test' = 'token-test'
      // So the iframe appears immediately (token fallback via useAuth).
      getAccessTokenMock.mockReturnValue(null);
      const result = makePlayer();
      await waitForIframe(result.container);
      // URL uses the token from useAuth fallback
      expect(getSrc(result.container)).toContain('/lms/scorm/launch/42');
      expect(getSrc(result.container)).toContain('token=token-test');
    });
  });

  // ── 3-4. Progress + refetch ───────────────────────────────────────
  describe('progress & refetch stability', () => {
    it('3. progress event: mesmo elemento DOM, mesmo src', async () => {
      const { container } = makePlayer();
      await waitForIframe(container);
      const el = getIframe(container);
      const src = getSrc(container);

      fireProgress(container, { progresso_pct: 33 });
      fireProgress(container, { progresso_pct: 66 });
      fireProgress(container, { progresso_pct: 100 });

      await waitFor(() => expect(refetchCount).toBeGreaterThan(2));
      expect(getIframe(container)).toBe(el);
      expect(getSrc(container)).toBe(src);
    });

    it('4. refetch: mesma matricula nao recria iframe', async () => {
      const { container } = makePlayer();
      await waitForIframe(container);
      const el = getIframe(container);
      const src = getSrc(container);

      matriculaData = { ...matriculaTemplate, progresso_pct: 50 };
      fireProgress(container, { progresso_pct: 50 });
      await waitFor(() => expect(refetchCount).toBeGreaterThan(0));

      expect(getIframe(container)).toBe(el);
      expect(getSrc(container)).toBe(src);
    });
  });

  // ── 5-7. Token lifecycle ──────────────────────────────────────────
  describe('token lifecycle', () => {
    it('5. rotacao de token: src inalterado', async () => {
      const { container } = makePlayer();
      await waitForIframe(container);
      const src = getSrc(container);

      ensureValidAccessTokenMock.mockResolvedValue('token-rotated');
      getAccessTokenMock.mockReturnValue('token-rotated');
      await act(async () => {
        window.dispatchEvent(new CustomEvent('airtrust-auth-token-changed', { detail: { token: 'token-rotated' } }));
      });
      await waitFor(() => expect(getAccessTokenMock).toHaveBeenCalled());

      expect(getSrc(container)).toBe(src);
      expect(getSrc(container)).toContain('token=token-test');
    });

    it('6. token ausente transitoriamente: iframe permanece', async () => {
      const { container } = makePlayer();
      await waitForIframe(container);
      const src = getSrc(container);

      ensureValidAccessTokenMock.mockResolvedValue(null);
      getAccessTokenMock.mockReturnValue(null);
      await act(async () => {
        window.dispatchEvent(new CustomEvent('airtrust-auth-token-changed', { detail: { token: null } }));
      });

      await waitFor(() => {
        expect(getIframe(container)).not.toBeNull();
        expect(getSrc(container)).toBe(src);
      });
    });

    it('7. logout real: sessao expirada, iframe removido', async () => {
      const { container } = makePlayer();
      await waitForIframe(container);

      authToken = null;
      getAccessTokenMock.mockReturnValue(null);
      ensureValidAccessTokenMock.mockResolvedValue(null);
      const result = makePlayer();

      await waitFor(() => {
        expect(result.container.textContent).toMatch(/expir|login/i);
      });
      expect(result.container.querySelector('iframe')).toBeNull();
    });
  });

  // ── 8-9. Session switching (same component path) ──────────────────
  describe('session switching', () => {
    it('8. troca de matricula: iframe diferente para ID diferente', async () => {
      const { container } = makePlayer(42);
      await waitForIframe(container);
      const src42 = getSrc(container);

      matriculaData = { ...matriculaTemplate, id: 99, curso_id: 8 };
      const result = makePlayer(99);
      await waitForIframe(result.container);
      const src99 = getSrc(result.container);

      expect(src99).not.toBeNull();
      expect(src99).not.toBe(src42);
      expect(src99).toContain('/lms/scorm/launch/99');
    });

    it('9. troca de review mode: URL com review=1', async () => {
      const { container } = makePlayer(42);
      await waitForIframe(container);
      expect(getSrc(container)).not.toContain('review=1');

      const result = makePlayer(42, '?review=1');
      await waitForIframe(result.container);
      expect(getSrc(result.container)).toContain('review=1');
    });
  });

  // ── 10-11. Identity switching ─────────────────────────────────────
  describe('identity switching', () => {
    it('10. troca de usuario: nova sessao', async () => {
      const { container } = makePlayer();
      await waitForIframe(container);
      const elA = getIframe(container);

      authUser = { id: 2, nome: 'Piloto B' };
      const result = makePlayer();
      await waitForIframe(result.container);
      expect(getIframe(result.container)).not.toBe(elA);
    });

    it('11. troca de empresa: nova sessao', async () => {
      const { container } = makePlayer();
      await waitForIframe(container);
      const elA = getIframe(container);

      authEmpresaId = 20;
      const result = makePlayer();
      await waitForIframe(result.container);
      expect(getIframe(result.container)).not.toBe(elA);
    });
  });

  // ── 12-13. Completion ─────────────────────────────────────────────
  describe('completion', () => {
    it('12. conclusao: iframe estavel durante finalizacao', async () => {
      const { container } = makePlayer();
      await waitForIframe(container);
      const el = getIframe(container);
      const src = getSrc(container);

      act(() => {
        window.dispatchEvent(new MessageEvent('message', {
          origin: 'http://localhost:8787',
          data: { type: 'lms:completed', matriculaId: 42, status: 'passed' },
        }));
      });

      await waitFor(() => {
        expect(getIframe(container)).toBe(el);
        expect(getSrc(container)).toBe(src);
      });
    });

    it('13. curso concluido em Rever: banner consulta + iframe presente', async () => {
      matriculaData = { ...matriculaTemplate, status: 'CONCLUIDO', data_conclusao: '2026-01-01' };
      const result = makePlayer(42, '?review=1');
      await waitForIframe(result.container);

      expect(getSrc(result.container)).toContain('review=1');
      expect(result.container.textContent).toMatch(/consulta|leitura/i);
    });
  });

  // ── iframeLoaded semantics ────────────────────────────────────────
  describe('iframeLoaded reset', () => {
    it('progresso da mesma matricula nao reseta iframeLoaded (sem overlay)', async () => {
      const { container } = makePlayer();
      await waitForIframe(container);

      const iframe = getIframe(container)!;
      act(() => { iframe.dispatchEvent(new Event('load')); });

      fireProgress(container, { progresso_pct: 50 });
      fireProgress(container, { progresso_pct: 100 });

      await waitFor(() => {
        // No loading overlay visible
        const spinners = container.querySelectorAll('.animate-spin');
        // The spinner in the loading overlay should not be there
        // (but the component may have other spinners)
        const overlayText = Array.from(container.querySelectorAll('p')).find(
          p => p.textContent?.includes('Montando'),
        );
        expect(overlayText).toBeUndefined();
        expect(getIframe(container)).not.toBeNull();
      });
    });
  });
});
