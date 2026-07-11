import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import ModalNovaSessao from '../ModalNovaSessao';
import { _resetCacheForTesting } from '@/react-app/config/sharedSessions';

// Covers section 3-5 of the shared-session brief: editing an existing PLANNED
// simple session must offer converting it to shared (toggle visible,
// enabled), an already-shared session must keep its modality locked (no
// toggle), and a session with ficha evidence must show the toggle disabled
// with an objective reason — mirroring (not replacing) the backend's own
// assertSimpleSessionConvertible authority.

vi.mock('@/react-app/config/api', () => ({
  API_BASE_URL: 'http://localhost:3000/api',
  getAccessToken: () => 'token-teste',
}));

vi.mock('@/react-app/hooks/usePermissions', () => ({
  usePermissions: () => ({
    can: () => true,
    canAll: () => true,
    role: 'ADMINISTRADOR',
    isAdmin: true,
    isGestor: false,
    isInstrutor: false,
    isAluno: false,
    isAuthenticated: true,
    user: { id: 1, role: 'ADMINISTRADOR' },
  }),
}));

vi.mock('@/react-app/lib/moduloBus', () => ({
  emitirEventoModulo: vi.fn(),
  escutarEventosModulo: vi.fn(() => () => {}),
}));

vi.mock('@/react-app/components/TimeInput', () => ({
  default: (props: React.InputHTMLAttributes<HTMLInputElement>) => <input {...props} />,
}));

vi.mock('@/react-app/components/modals/AlertModal', () => ({ default: () => null }));
vi.mock('@/react-app/components/modals/ConfirmDeleteModal', () => ({ default: () => null }));
vi.mock('@/react-app/utils/confirmDialog', () => ({ confirmDialog: vi.fn(async () => true) }));
vi.mock('@/react-app/utils/sessaoNotificacoes', () => ({
  enviarNotificacaoSessao: vi.fn(),
  montarResumoCanal: vi.fn(),
}));
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn(), warning: vi.fn() } }));

const AERONAVES = { success: true, data: [{ id: 6, modelo: 'SK76', fabricante: 'Sikorsky' }] };
const SIMULADORES = { success: true, data: [{ id: 16, nome: 'FFS-SK76-007', modelo: 'SK76', modelo_aeronave: 'SK76' }] };
const TIPOS_SESSAO = { success: true, data: [{ id: 9, codigo: 'PER', nome: 'Periódico' }] };
const FUNCIONARIOS = {
  success: true,
  data: [
    { id: 41, nome: 'Filipe Passaroni Daumas', matricula: '00353', is_instrutor: 1 },
    { id: 68, nome: 'Fernando', matricula: '33333' },
    { id: 69, nome: 'Alexandre', matricula: '32323' },
  ],
};
const MODELOS_PER = {
  success: true,
  data: [
    { id: 45, codigo: 'S76-P-C1/VFR', nome: 'PERIÓDICO C1/VFR', tipo_sessao_id: 9, modelo_aeronave: 'SK76' },
  ],
};
const MODELOS_PER_AND_EXAMINER = {
  success: true,
  data: [
    ...MODELOS_PER.data,
    { id: 501, codigo: 'EXA-V01', nome: 'Treinamento Prático de Examinador — SOP Normal', tipo_sessao_id: 23, modelo_aeronave: null },
    { id: 502, codigo: 'EXA-V02', nome: 'Treinamento Prático de Examinador — SOP Anormal', tipo_sessao_id: 23, modelo_aeronave: null },
    { id: 503, codigo: 'EXA-V03', nome: 'Treinamento Prático de Examinador — Emergência', tipo_sessao_id: 23, modelo_aeronave: null },
    { id: 504, codigo: 'EXA-V04', nome: 'Treinamento Prático de Examinador — Integrada', tipo_sessao_id: 23, modelo_aeronave: null },
  ],
};
const MODELOS_EXAMINER_ONLY = {
  success: true,
  data: MODELOS_PER_AND_EXAMINER.data.filter((m) => m.codigo.startsWith('EXA-V')),
};

function buildDetailFichas(evidence: 'none' | 'protected' | 'signed') {
  if (evidence === 'none') return [];
  if (evidence === 'protected') return [{ id: 1, status: 'CONCLUIDA' }];
  return [{ id: 1, status: 'AGUARDANDO_ASSINATURA_INSTRUTOR', assinatura_aluno_timestamp: '2026-07-19T10:00:00Z' }];
}

function buildFetchMock(options: {
  modoCompartilhado?: boolean;
  fichaEvidence?: 'none' | 'protected' | 'signed';
  status?: string;
  modelos?: typeof MODELOS_PER;
  templateId?: number;
  temaSessao?: string;
} = {}) {
  const modoCompartilhado = options.modoCompartilhado ?? false;
  const fichaEvidence = options.fichaEvidence ?? 'none';
  // Real production sessions store 'AGENDADO' (masculine canonical
  // vocabulary), never 'ATIVA' — see isSameStatus in types/simuladores.ts.
  const status = options.status ?? 'AGENDADO';
  const modelosResponse = options.modelos ?? MODELOS_PER;
  const templateId = options.templateId ?? 45;
  const temaSessao = options.temaSessao ?? 'PERIÓDICO C1/VFR';

  function jsonResponse(body: unknown): Promise<Response> {
    return Promise.resolve({ ok: true, status: 200, json: async () => body } as Response);
  }

  const fetchMock = vi.fn((input: RequestInfo | URL) => {
    const url = String(input);
    if (url.endsWith('/capabilities')) {
      return jsonResponse({ success: true, data: { simulador_shared_sessions: true } });
    }
    if (url.includes('/modelos-aeronave')) return jsonResponse(AERONAVES);
    if (url.includes('/aeronaves')) return jsonResponse({ success: true, data: [] });
    if (url.includes('/simuladores/tipos-sessao')) return jsonResponse(TIPOS_SESSAO);
    if (url.includes('/simuladores/tipos-check')) return jsonResponse({ success: true, data: [] });
    if (url.includes('/simuladores/sessoes/9001/checks')) return jsonResponse({ success: false });
    if (url.includes('/simuladores/sessoes/9001')) {
      return jsonResponse({
        success: true,
        sessao: {
          id: 9001,
          empresa_id: 6,
          simulador_id: 16,
          funcionario_id: 68,
          data: '2026-07-20',
          hora_inicio: '08:00',
          hora_fim: '10:00',
          duracao_minutos: 120,
          instrutor_id: 41,
          tipo_sessao: 'PER',
          tipo_sessao_id: 9,
          tipo_sessao_codigo: 'PER',
          template_id: templateId,
          status,
          observacoes: null,
          nome: temaSessao,
          modo_compartilhado: modoCompartilhado ? 1 : 0,
          simulador_modelo: 'SK76',
          simulador_aeronave_codigo: 'SK76',
          alunos: [{ id: 68, nome: 'Fernando', matricula: '33333', funcao: 'PIC' }],
          participantes: [{ funcionario_id: 68, funcao: 'PIC' }],
          fichas: buildDetailFichas(fichaEvidence),
        },
      });
    }
    if (url.includes('/funcionarios?examinador=true')) return jsonResponse({ success: true, data: [] });
    if (url.includes('/funcionarios?')) return jsonResponse(FUNCIONARIOS);
    if (url.endsWith('/funcionarios')) return jsonResponse(FUNCIONARIOS);
    if (url.includes('/simuladores/modelos-sessao?')) return jsonResponse(modelosResponse);
    if (url.endsWith('/simuladores')) return jsonResponse(SIMULADORES);
    return jsonResponse({ success: true, data: [] });
  });

  return fetchMock;
}

function renderEditModal(overrides: { templateId?: number; temaSessao?: string } = {}) {
  return render(
    <ModalNovaSessao
      isOpen
      onClose={vi.fn()}
      onSuccess={vi.fn()}
      sessao={{
        id: 9001,
        modo_compartilhado: 0,
        template_id: overrides.templateId ?? 45,
        simulador_id: 16,
        data: '2026-07-20',
        horario_inicio: '08:00',
        horario_fim: '10:00',
        instrutor_id: 41,
        tipo_sessao: 'PER',
        tipo_sessao_id: 9,
        tipo_sessao_codigo: 'PER',
        tema_sessao: overrides.temaSessao ?? 'PERIÓDICO C1/VFR',
        participantes: [{ funcionario_id: 68, funcao: 'PIC' }],
        fichas: [],
      }}
    />,
  );
}

describe('ModalNovaSessao — edição com conversão simples -> compartilhada', () => {
  beforeEach(() => {
    _resetCacheForTesting();
    vi.spyOn(console, 'log').mockImplementation(() => {});
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
    _resetCacheForTesting();
  });

  it('oferece o toggle de conversão para uma sessão simples planejada sem evidência', async () => {
    vi.stubGlobal('fetch', buildFetchMock({ modoCompartilhado: false, fichaEvidence: 'none' }));
    renderEditModal();

    const toggle = await screen.findByRole('button', { name: /Sessão compartilhada/i });
    await waitFor(() => expect(toggle).not.toBeDisabled());
  });

  it('bloqueia a conversão com motivo objetivo quando a sessão já tem ficha com evidência', async () => {
    vi.stubGlobal('fetch', buildFetchMock({ modoCompartilhado: false, fichaEvidence: 'protected' }));
    renderEditModal();

    const toggle = await screen.findByRole('button', { name: /Sessão compartilhada/i });
    await waitFor(() => expect(toggle).toBeDisabled());
    expect(
      await screen.findByText(/já possui ficha com evidência de execução/i),
    ).toBeInTheDocument();
  });

  it('bloqueia a conversão quando um ficha só tem assinatura do aluno (evidência parcial)', async () => {
    vi.stubGlobal('fetch', buildFetchMock({ modoCompartilhado: false, fichaEvidence: 'signed' }));
    renderEditModal();

    const toggle = await screen.findByRole('button', { name: /Sessão compartilhada/i });
    await waitFor(() => expect(toggle).toBeDisabled());
  });

  it('não mostra o toggle de modalidade para uma sessão já compartilhada (sem conversão reversa)', async () => {
    vi.stubGlobal('fetch', buildFetchMock({ modoCompartilhado: true, fichaEvidence: 'none' }));
    renderEditModal();

    await screen.findByText(/Editar Sessão de Treinamento/i);
    await waitFor(() => {
      expect(screen.queryByRole('button', { name: /Sessão compartilhada/i })).not.toBeInTheDocument();
      expect(screen.queryByRole('button', { name: /Sessão simples/i })).not.toBeInTheDocument();
    });
  });

  it('ao converter, o primeiro piloto (participante original) fica travado e o modelo original preenche o segmento 1', async () => {
    vi.stubGlobal('fetch', buildFetchMock({ modoCompartilhado: false, fichaEvidence: 'none' }));
    const user = userEvent.setup();
    renderEditModal();

    const toggle = await screen.findByRole('button', { name: /Sessão compartilhada/i });
    await waitFor(() => expect(toggle).not.toBeDisabled());
    await user.click(toggle);

    expect(await screen.findByText(/Converter em sessão compartilhada/i)).toBeInTheDocument();

    // Piloto 1 (o participante original da sessão simples, Fernando) já vem
    // selecionado e travado — o "Remover seleção" fica desabilitado.
    expect(await screen.findByText('Fernando')).toBeInTheDocument();
    const removerSelecao = screen.getByTitle('Remover seleção');
    expect(removerSelecao).toBeDisabled();

    // Piloto 2 ainda não foi definido: continua como campo de busca livre.
    expect(screen.getByPlaceholderText(/Buscar piloto 2/i)).not.toBeDisabled();
  });

  it('convertendo um treinamento comum, o painel de examinador não aparece mesmo com EXA-V01..V04 no catálogo do tenant', async () => {
    vi.stubGlobal(
      'fetch',
      buildFetchMock({ modoCompartilhado: false, fichaEvidence: 'none', modelos: MODELOS_PER_AND_EXAMINER }),
    );
    const user = userEvent.setup();
    renderEditModal();

    const toggle = await screen.findByRole('button', { name: /Sessão compartilhada/i });
    await waitFor(() => expect(toggle).not.toBeDisabled());
    await user.click(toggle);
    await screen.findByText(/Converter em sessão compartilhada/i);

    await user.type(screen.getByPlaceholderText(/Buscar piloto 2/i), 'Alexandre');
    await user.click(await screen.findByText('Alexandre'));

    await user.click(await screen.findByRole('button', { name: /Continuar para Segmentos/i }));
    await screen.findByLabelText('Modelo do segmento 1');

    expect(screen.getByLabelText('Programa desta sessão')).toHaveValue('GENERICO');
    expect(screen.queryByTestId('examiner-template-panel')).not.toBeInTheDocument();
  });

  it('convertendo uma sessão cujo modelo original é EXA-V01, o painel de examinador aparece refletindo o programa já selecionado', async () => {
    vi.stubGlobal(
      'fetch',
      buildFetchMock({
        modoCompartilhado: false,
        fichaEvidence: 'none',
        modelos: MODELOS_EXAMINER_ONLY,
        templateId: 501,
        temaSessao: 'Treinamento Prático de Examinador — SOP Normal',
      }),
    );
    const user = userEvent.setup();
    renderEditModal({ templateId: 501, temaSessao: 'Treinamento Prático de Examinador — SOP Normal' });

    const toggle = await screen.findByRole('button', { name: /Sessão compartilhada/i });
    await waitFor(() => expect(toggle).not.toBeDisabled());
    await user.click(toggle);
    await screen.findByText(/Converter em sessão compartilhada/i);

    const pilotoDois = screen.getByPlaceholderText(/Buscar piloto 2/i);
    await user.type(pilotoDois, 'Alexandre');
    await user.click(await screen.findByText('Alexandre'));

    await user.click(await screen.findByRole('button', { name: /Continuar para Segmentos/i }));
    await screen.findByLabelText('Modelo do segmento 1');

    expect(screen.getByLabelText('Programa desta sessão')).toHaveValue('TREINAMENTO_PRATICO_EXAMINADOR');
    expect(await screen.findByTestId('examiner-template-panel')).toBeInTheDocument();
  });
});
