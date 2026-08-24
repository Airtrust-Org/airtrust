/**
 * AIRTRUST_COMPLETION_DIAGNOSTICS_V1 no LmsPlayer.
 *
 * Cobre a superfície de segurança do postMessage (origin/source/payload) e o
 * painel "Pendências para concluir", incluindo o fallback para pacotes legados
 * e a garantia de que o modo de revisão não persiste nada.
 */
import React from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { act, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

import LmsPlayer from '@/react-app/pages/lms/LmsPlayer';

const { refetchMatriculaMock, fetchWithAuthMock } = vi.hoisted(() => ({
  refetchMatriculaMock: vi.fn(),
  fetchWithAuthMock: vi.fn(),
}));

const REJECTED_DIAGNOSTIC = {
  status: 'rejected',
  code: 'SCORM_COMPLETION_REJECTED',
  can_finalize: false,
  explicit_completion: false,
  explicit_failure: false,
  mastery_score: 70,
  score_pct: null,
  progresso_pct: 60,
  location: '6/10',
};

let matriculaMock: Record<string, unknown> = {};
let reviewMode = false;

function baseMatricula(): Record<string, unknown> {
  return {
    id: 42,
    curso_id: 7,
    titulo: 'AW139 - Manutenção',
    tipo_conteudo: 'scorm',
    status: 'EM_ANDAMENTO',
    progresso_pct: 60,
    carga_horaria_minutos: 90,
    score_final: null,
    gerar_qualificacao_ao_concluir: 1,
    qualificacao_historico_id: null,
    data_conclusao: null,
    scorm_progresso: { cmi_json: JSON.stringify({ 'cmi.location': '6/10' }) },
    completion_diagnostic: { ...REJECTED_DIAGNOSTIC },
  };
}

vi.mock('@/react-app/hooks/useAuth', () => ({
  useAuth: () => ({ token: 'token', user: { id: 1, nome: 'Test' }, empresaAtualId: 10 }),
}));

vi.mock('@/react-app/hooks/useLms', () => ({
  useMatriculaDetalhe: () => ({
    data: matriculaMock,
    isLoading: false,
    refetch: refetchMatriculaMock,
  }),
  useLmsCurso: () => ({
    data: { descricao: 'Curso', conteudo_programatico: 'M1', carga_horaria_minutos: 90 },
  }),
  lmsKeys: {
    minhasMatriculas: () => ['lms', 'minhas-matriculas'],
    minhasEAD: () => ['lms', 'minhas-ead'],
  },
}));

vi.mock('@/react-app/config/api', () => ({
  API_BASE_URL: 'http://localhost:8787/api',
  AUTH_TOKEN_CHANGED_EVENT: 'airtrust-auth-token-changed',
  ensureValidAccessToken: vi.fn(async () => 'token'),
  fetchWithAuth: fetchWithAuthMock,
  getAccessToken: () => 'token',
}));

vi.mock('sonner', () => ({
  toast: {
    loading: vi.fn(),
    success: vi.fn(),
    error: vi.fn(),
    warning: vi.fn(),
    dismiss: vi.fn(),
  },
}));

const LAUNCH_ORIGIN = 'http://localhost:8787';

const GRANULAR_PAYLOAD = {
  version: 1,
  courseId: 'curso-7',
  currentSlide: { id: 's6', index: 6, title: 'Combustível' },
  slides: {
    totalRequired: 10,
    completedRequired: 7,
    missing: [
      { id: 's3', index: 3, title: 'Motores' },
      { id: 's8', index: 8, title: 'Hidráulico' },
      { id: 's9', index: 9, title: 'Elétrico' },
    ],
  },
  assessment: {
    required: false,
    completed: false,
    scoreRaw: null,
    masteryScore: null,
    passed: null,
    unanswered: [],
    incomplete: [],
  },
  packageStatus: { lessonStatus: 'incomplete', finishRequested: true },
  updatedAt: '2026-08-24T12:00:00Z',
};

function renderPlayer() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter initialEntries={[`/lms/player/scorm/42${reviewMode ? '?review=1' : ''}`]}>
        <Routes>
          <Route path="/lms/player/scorm/:matriculaId" element={<LmsPlayer />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

async function frameWindow(): Promise<Window | undefined> {
  await waitFor(() => expect(document.querySelector('iframe')).not.toBeNull());
  return document.querySelector('iframe')?.contentWindow ?? undefined;
}

async function dispatchDiagnostics(
  diagnostics: unknown,
  overrides: { origin?: string; source?: Window | undefined | null } = {},
) {
  const defaultSource = await frameWindow();
  await act(async () => {
    window.dispatchEvent(
      new MessageEvent('message', {
        origin: overrides.origin ?? LAUNCH_ORIGIN,
        source: 'source' in overrides ? (overrides.source ?? undefined) : defaultSource,
        data: { type: 'lms:completion-diagnostics', diagnostics },
      }),
    );
  });
}

function persistCalls() {
  return fetchWithAuthMock.mock.calls.filter(
    ([, init]) => (init as RequestInit | undefined)?.method === 'PUT',
  );
}

describe('LmsPlayer — diagnóstico granular de conclusão', () => {
  beforeEach(() => {
    matriculaMock = baseMatricula();
    reviewMode = false;
    refetchMatriculaMock.mockReset().mockResolvedValue(undefined);
    fetchWithAuthMock.mockReset().mockResolvedValue({
      ok: true,
      json: async () => ({ success: true, data: { diagnostics: null } }),
    });
  });

  it('mostra as pendências informadas pelo pacote (test 1 e 4)', async () => {
    renderPlayer();
    await dispatchDiagnostics(GRANULAR_PAYLOAD);

    // O painel abre e lista exatamente os 3 slides pendentes.
    await act(async () => {
      screen.getByRole('button', { name: /Pendências para concluir/i }).click();
    });

    const items = await screen.findAllByTestId('lms-pending-item');
    expect(items).toHaveLength(3);
    expect(items[0]).toHaveTextContent('Slide 3 — Motores');

    // LMSFinish com incomplete não conclui o curso.
    expect(screen.queryByText('Curso concluído')).not.toBeInTheDocument();
  });

  it('rejeita mensagem de origem diferente da origem de lançamento (test 7)', async () => {
    renderPlayer();
    await dispatchDiagnostics(GRANULAR_PAYLOAD, { origin: 'https://evil.example.com' });

    await act(async () => {
      screen.getByRole('button', { name: /Pendências para concluir/i }).click();
    });

    // Nada foi absorvido: cai no fallback genérico.
    expect(screen.queryAllByTestId('lms-pending-item')).toHaveLength(0);
    expect(
      screen.getByText(
        'O curso informou que ainda há pendências, mas não identificou quais itens.',
      ),
    ).toBeInTheDocument();
    expect(persistCalls()).toHaveLength(0);
  });

  it('rejeita mensagem cujo source não é o iframe do curso (test 8)', async () => {
    renderPlayer();
    // Simula outra janela na mesma origem tentando forjar o diagnóstico.
    await dispatchDiagnostics(GRANULAR_PAYLOAD, { source: window });

    await act(async () => {
      screen.getByRole('button', { name: /Pendências para concluir/i }).click();
    });

    expect(screen.queryAllByTestId('lms-pending-item')).toHaveLength(0);
    expect(persistCalls()).toHaveLength(0);
  });

  it('ignora payloads malformados sem quebrar o curso (test 6)', async () => {
    renderPlayer();
    for (const bad of [null, 'texto', 42, [], { version: 99 }, { nope: true }]) {
      await dispatchDiagnostics(bad);
    }

    // O player continua vivo e o iframe permanece montado.
    expect(document.querySelector('iframe')).not.toBeNull();
    expect(persistCalls()).toHaveLength(0);
  });

  it('fallback genérico para pacote legado, sem inventar itens (test 5)', async () => {
    renderPlayer();
    await waitFor(() => expect(document.querySelector('iframe')).not.toBeNull());

    await act(async () => {
      screen.getByRole('button', { name: /Pendências para concluir/i }).click();
    });

    expect(screen.queryAllByTestId('lms-pending-item')).toHaveLength(0);
    expect(
      screen.getByText(
        'O curso informou que ainda há pendências, mas não identificou quais itens.',
      ),
    ).toBeInTheDocument();
  });

  it('não persiste nem finaliza nada no modo de revisão (test 17)', async () => {
    reviewMode = true;
    renderPlayer();
    await dispatchDiagnostics(GRANULAR_PAYLOAD);

    expect(persistCalls()).toHaveLength(0);
    // Em revisão o painel de pendências não é exibido.
    expect(screen.queryByTestId('lms-pending-panel')).not.toBeInTheDocument();
  });

  it('persiste o snapshot quando o pacote emite um payload válido', async () => {
    renderPlayer();
    await dispatchDiagnostics(GRANULAR_PAYLOAD);

    await waitFor(() => expect(persistCalls()).toHaveLength(1));
    const [url, init] = persistCalls()[0] as [string, RequestInit];
    expect(String(url)).toContain('/lms/matriculas/42/completion-diagnostics');
    const body = JSON.parse(String(init.body)) as { diagnostics: { slides: { missing: unknown[] } } };
    expect(body.diagnostics.slides.missing).toHaveLength(3);
  });

  it('recupera o snapshot persistido no reload (test 12)', async () => {
    fetchWithAuthMock.mockReset().mockResolvedValue({
      ok: true,
      json: async () => ({ success: true, data: { diagnostics: GRANULAR_PAYLOAD } }),
    });

    renderPlayer();

    await act(async () => {
      (await screen.findByRole('button', { name: /Pendências para concluir/i })).click();
    });

    const items = await screen.findAllByTestId('lms-pending-item');
    expect(items).toHaveLength(3);
  });

  it('não conclui quando o pacote diz completo mas o canônico rejeita (test 10)', async () => {
    renderPlayer();
    await dispatchDiagnostics({
      ...GRANULAR_PAYLOAD,
      slides: { totalRequired: 10, completedRequired: 10, missing: [] },
      assessment: { ...GRANULAR_PAYLOAD.assessment, completed: true, passed: true },
      packageStatus: { lessonStatus: 'completed', finishRequested: true },
    });

    // O diagnóstico canônico segue rejeitando: nenhuma conclusão acontece.
    expect(screen.queryByText('Curso concluído')).not.toBeInTheDocument();
    expect(screen.getByTestId('lms-pending-panel')).toBeInTheDocument();
  });
});
