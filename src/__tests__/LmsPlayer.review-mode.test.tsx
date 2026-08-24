import React from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { act, render, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

import LmsPlayer from '@/react-app/pages/lms/LmsPlayer';

const { refetchMatriculaMock, toastSuccessMock } = vi.hoisted(() => ({
  refetchMatriculaMock: vi.fn(),
  toastSuccessMock: vi.fn(),
}));

function buildMatricula(status: string) {
  return {
    id: 42,
    curso_id: 7,
    titulo: 'AW139 - Manutenção',
    tipo_conteudo: 'scorm',
    status,
    progresso_pct: 100,
    carga_horaria_minutos: 90,
    score_final: 98,
    gerar_qualificacao_ao_concluir: 1,
    qualificacao_historico_id: 55,
    data_conclusao: '2026-05-01',
    scorm_progresso: { cmi_json: JSON.stringify({ 'cmi.core.lesson_location': '10/30' }) },
    completion_diagnostic: null,
  };
}

let matriculaMock = buildMatricula('CONCLUIDO');

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
    data: { descricao: 'Curso AW139', conteudo_programatico: 'Modulo 1', carga_horaria_minutos: 90 },
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
  fetchWithAuth: vi.fn(async () => ({ ok: true })),
  getAccessToken: () => 'token',
}));

vi.mock('sonner', () => ({
  toast: { loading: vi.fn(), success: toastSuccessMock, error: vi.fn(), dismiss: vi.fn() },
}));

function renderPlayer(initialPath: string) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter initialEntries={[initialPath]}>
        <Routes>
          <Route path="/lms/player/:matriculaId" element={<LmsPlayer />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

/**
 * O LmsPlayer só aceita mensagens vindas do contentWindow do próprio iframe
 * do curso (defesa contra forja de sinais de conclusão). Os testes precisam,
 * portanto, despachar a partir dessa janela.
 */
async function frameWindow(): Promise<Window | undefined> {
  await waitFor(() => expect(document.querySelector('iframe')).not.toBeNull());
  return document.querySelector('iframe')?.contentWindow ?? undefined;
}

async function dispatchPlayerMessage(data: Record<string, unknown>) {
  const source = await frameWindow();
  await act(async () => {
    window.dispatchEvent(
      new MessageEvent('message', {
        origin: 'http://localhost:8787',
        source,
        data,
      }),
    );
  });
}

describe('LmsPlayer — modo de revisão (matrícula concluída, botão "Rever")', () => {
  beforeEach(() => {
    refetchMatriculaMock.mockReset().mockResolvedValue(undefined);
    toastSuccessMock.mockReset();
    matriculaMock = buildMatricula('CONCLUIDO');
  });

  it('matrícula concluída acessada direto pela URL (sem ?review=1) também entra em modo de revisão e não reabre a tela de conclusão', async () => {
    // effectiveReviewMode já cai para true pelo status da matrícula mesmo sem o
    // parâmetro explícito — o guard de revisão precisa cobrir esse caso também.
    const { container } = renderPlayer('/lms/player/42');

    await waitFor(() => {
      expect(container.querySelector('iframe')).not.toBeNull();
    });

    await dispatchPlayerMessage({
      type: 'lms:progress',
      matriculaId: 42,
      novo_status: 'CONCLUIDO',
    });

    expect(container.textContent).not.toContain('Ver detalhes do curso');
  });

  it('matrícula concluída + "Rever" (?review=1): abre o iframe do player, não a tela de conclusão', async () => {
    const { container } = renderPlayer('/lms/player/42?review=1');

    let iframe: HTMLIFrameElement | null = null;
    await waitFor(() => {
      iframe = container.querySelector('iframe');
      expect(iframe).not.toBeNull();
    });
    expect(iframe!.getAttribute('src')).toContain('review=1');
    expect(container.textContent).not.toContain('Ver detalhes do curso');
  });

  it('modo revisão: um novo novo_status=CONCLUIDO vindo do wrapper não reabre a tela de conclusão nem re-notifica', async () => {
    const { container } = renderPlayer('/lms/player/42?review=1');

    await waitFor(() => {
      expect(container.querySelector('iframe')).not.toBeNull();
    });

    toastSuccessMock.mockClear();
    await dispatchPlayerMessage({
      type: 'lms:progress',
      matriculaId: 42,
      novo_status: 'CONCLUIDO',
      progresso_pct: 100,
    });

    expect(container.textContent).not.toContain('Ver detalhes do curso');
    expect(toastSuccessMock).not.toHaveBeenCalled();
  });

  it('modo revisão: mensagem lms:completed do wrapper é ignorada (não reabre tela de conclusão nem marca qualificação)', async () => {
    const { container } = renderPlayer('/lms/player/42?review=1');

    await waitFor(() => {
      expect(container.querySelector('iframe')).not.toBeNull();
    });

    toastSuccessMock.mockClear();
    await dispatchPlayerMessage({
      type: 'lms:completed',
      matriculaId: 42,
      qualificacao_gerada: { qualificacao_historico_id: 999 },
    });

    expect(container.textContent).not.toContain('Ver detalhes do curso');
    expect(toastSuccessMock).not.toHaveBeenCalled();
  });

  it('modo revisão permite navegar (avançar slide) e mantém o iframe montado', async () => {
    const { container } = renderPlayer('/lms/player/42?review=1');

    let iframe: HTMLIFrameElement | null = null;
    await waitFor(() => {
      iframe = container.querySelector('iframe');
      expect(iframe).not.toBeNull();
    });

    await dispatchPlayerMessage({
      type: 'lms:progress',
      matriculaId: 42,
      location: '11/30',
      slide_current: 11,
    });

    expect(container.querySelector('iframe')).toBe(iframe);
  });

  it('curso NÃO concluído (EM_ANDAMENTO) mantém o comportamento normal: abre direto, sem precisar de ?review=1', async () => {
    matriculaMock = buildMatricula('EM_ANDAMENTO');
    const { container } = renderPlayer('/lms/player/42');

    let iframe: HTMLIFrameElement | null = null;
    await waitFor(() => {
      iframe = container.querySelector('iframe');
      expect(iframe).not.toBeNull();
    });
    expect(iframe!.getAttribute('src')).not.toContain('review=1');

    await dispatchPlayerMessage({
      type: 'lms:progress',
      matriculaId: 42,
      novo_status: 'CONCLUIDO',
    });

    await waitFor(() => {
      expect(container.textContent).toContain('Curso concluído');
    });
  });

  it('matrícula concluída em modo revisão: o toast de conclusão do mount não dispara (evita reafirmar "gerada automaticamente" numa revisão)', async () => {
    const { container } = renderPlayer('/lms/player/42?review=1');

    await waitFor(() => {
      expect(container.querySelector('iframe')).not.toBeNull();
    });

    expect(toastSuccessMock).not.toHaveBeenCalled();
  });
});
