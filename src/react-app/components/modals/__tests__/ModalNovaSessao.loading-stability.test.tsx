import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import ModalNovaSessao from '../ModalNovaSessao';
import { _resetCacheForTesting } from '@/react-app/config/sharedSessions';

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

vi.mock('@/react-app/components/modals/AlertModal', () => ({
  default: () => null,
}));

vi.mock('@/react-app/components/modals/ConfirmDeleteModal', () => ({
  default: () => null,
}));

vi.mock('@/react-app/utils/confirmDialog', () => ({
  confirmDialog: vi.fn(async () => true),
}));

vi.mock('@/react-app/utils/sessaoNotificacoes', () => ({
  enviarNotificacaoSessao: vi.fn(),
  montarResumoCanal: vi.fn(),
}));

vi.mock('sonner', () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
    warning: vi.fn(),
  },
}));

interface TestOptions {
  capabilityEnabled?: boolean;
  capabilityDelayMs?: number;
  iniDelayMs?: number;
  perDelayMs?: number;
}

function buildFetchMock(options: TestOptions = {}) {
  const modelRequestUrls: string[] = [];
  const capabilityEnabled = options.capabilityEnabled ?? false;
  const capabilityDelayMs = options.capabilityDelayMs ?? 0;
  const iniDelayMs = options.iniDelayMs ?? 0;
  const perDelayMs = options.perDelayMs ?? 0;

  const aeronaves = {
    success: true,
    data: [
      { id: 5, modelo: 'AW139', fabricante: 'Leonardo' },
      { id: 6, modelo: 'SK76', fabricante: 'Sikorsky' },
    ],
  };

  const simuladores = {
    success: true,
    data: [
      { id: 15, nome: 'FFS-AW139-001', modelo: 'AW139', modelo_aeronave: 'AW139' },
      { id: 16, nome: 'FFS-SK76-007', modelo: 'SK76', modelo_aeronave: 'SK76' },
    ],
  };

  const tiposSessao = {
    success: true,
    data: [
      { id: 23, codigo: 'EXA', nome: 'Examinador' },
      { id: 14, codigo: 'INI', nome: 'Inicial' },
      { id: 22, codigo: 'INS', nome: 'Instrutor' },
      { id: 2, codigo: 'OPC', nome: 'Operator Proficiency Check' },
      { id: 9, codigo: 'PER', nome: 'Periódico' },
      { id: 21, codigo: 'SEM', nome: 'Semestral' },
    ],
  };

  const funcionarios = {
    success: true,
    data: [
      { id: 41, nome: 'Filipe Passaroni Daumas', matricula: '00353', is_instrutor: 1 },
      { id: 68, nome: 'Fernando', matricula: '33333' },
      { id: 69, nome: 'Alexandre', matricula: '32323' },
    ],
  };

  const modelosIni = {
    success: true,
    data: [
      {
        id: 63,
        codigo: 'SK76-I-01/12',
        nome: 'SK76 - INICIAL - 01/12 - FAMILIARIZAÇÃO VFR',
        tipo_sessao_id: 14,
        tipo: 'INICIAL',
        modelo_aeronave: 'SK76',
      },
      {
        id: 64,
        codigo: 'SK76-I-02/12',
        nome: 'SK76 - INICIAL - 02/12 - EMERGÊNCIAS DE MOTOR',
        tipo_sessao_id: 14,
        tipo: 'INICIAL',
        modelo_aeronave: 'SK76',
      },
    ],
  };

  const modelosPer = {
    success: true,
    data: [
      {
        id: 45,
        codigo: 'S76-P-C1/VFR',
        nome: 'SK76 - PERIÓDICO - 01/03 - CICLO 1: VFR',
        tipo_sessao_id: 9,
        tipo: 'Treinamento Inicial',
        modelo_aeronave: 'SK76',
      },
      {
        id: 46,
        codigo: 'S76-P-C1/IFR',
        nome: 'SK76 - PERIÓDICO - 02/03 - CICLO 1: IFR',
        tipo_sessao_id: 9,
        tipo: 'Treinamento Inicial',
        modelo_aeronave: 'SK76',
      },
    ],
  };

  const modelosSem = {
    success: true,
    data: [
      {
        id: 75,
        codigo: 'SK76-S-01/02',
        nome: 'SK76 - SEMESTRAL - 01/02: LOFT e OPERAÇÃO NOTURNA',
        tipo_sessao_id: 21,
        tipo_sessao_codigo: 'SEM',
        tipo_sessao_nome: 'Semestral',
        modelo_aeronave: 'SK76',
      },
      {
        id: 76,
        codigo: 'SK76-S-02/02',
        nome: 'SK76 - SEMESTRAL - 02/02: LOFT e CHECK DE IFR',
        tipo_sessao_id: 21,
        tipo_sessao_codigo: 'SEM',
        tipo_sessao_nome: 'Semestral',
        modelo_aeronave: 'SK76',
      },
    ],
  };

  const modelosGlobais = {
    success: true,
    data: [
      {
        id: 54,
        codigo: 'TRE-INST',
        nome: 'TREINAMENTO DE INSTRUTOR DE VOO',
        tipo: 'RECORRENTE',
        tipo_sessao_id: 22,
        tipo_sessao_codigo: 'INS',
        tipo_sessao_nome: 'Instrutor',
        modelo_aeronave: null,
      },
      {
        id: 55,
        codigo: 'CRED-EXA',
        nome: 'CREDENCIAMENTO DE EXAMINADOR',
        tipo: 'RECORRENTE',
        tipo_sessao_id: 23,
        tipo_sessao_codigo: 'EXA',
        tipo_sessao_nome: 'Examinador',
        modelo_aeronave: null,
      },
      ...modelosIni.data,
      ...modelosPer.data,
      ...modelosSem.data,
    ],
  };

  function jsonResponse(body: unknown, delayMs = 0): Promise<Response> {
    return new Promise((resolve) => {
      setTimeout(() => {
        resolve({
          ok: true,
          status: 200,
          json: async () => body,
        } as Response);
      }, delayMs);
    });
  }

  const fetchMock = vi.fn((input: RequestInfo | URL) => {
    const url = String(input);

    if (url.endsWith('/capabilities')) {
      return jsonResponse(
        { success: true, data: { simulador_shared_sessions: capabilityEnabled } },
        capabilityDelayMs,
      );
    }
    if (url.includes('/modelos-aeronave')) return jsonResponse(aeronaves);
    if (url.includes('/aeronaves')) return jsonResponse({ success: true, data: [] });
    if (url.includes('/simuladores/tipos-sessao')) return jsonResponse(tiposSessao);
    if (url.includes('/simuladores/tipos-check')) return jsonResponse({ success: true, data: [] });
    if (url.includes('/funcionarios?examinador=true')) return jsonResponse({ success: true, data: [] });
    if (url.includes('/funcionarios?')) return jsonResponse(funcionarios);
    if (url.endsWith('/funcionarios')) return jsonResponse(funcionarios);
    if (url.includes('/simuladores/modelos-sessao?')) {
      modelRequestUrls.push(url);
      const tipoSessaoId = new URL(url).searchParams.get('tipo_sessao_id');
      if (!tipoSessaoId) return jsonResponse(modelosGlobais);
      if (tipoSessaoId === '14') return jsonResponse(modelosIni, iniDelayMs);
      if (tipoSessaoId === '9') return jsonResponse(modelosPer, perDelayMs);
      if (tipoSessaoId === '21') return jsonResponse(modelosSem);
      if (tipoSessaoId === '22' || tipoSessaoId === '23' || tipoSessaoId === '2') {
        return jsonResponse({ success: true, data: [] });
      }
      throw new Error(`tipo_sessao_id inesperado: ${tipoSessaoId}`);
    }
    if (url.endsWith('/simuladores')) return jsonResponse(simuladores);

    throw new Error(`URL não mockada: ${url}`);
  });

  return { fetchMock, modelRequestUrls };
}

function renderModal() {
  return render(
    <ModalNovaSessao
      isOpen
      onClose={vi.fn()}
      onSuccess={vi.fn()}
    />,
  );
}

async function selecionarFluxoSk76(user: ReturnType<typeof userEvent.setup>) {
  await waitFor(() => {
    expect(screen.getAllByRole('combobox').length).toBeGreaterThanOrEqual(6);
  });

  await waitFor(() => {
    const equipamentoSelect = screen.getAllByRole('combobox')[0] as HTMLSelectElement;
    expect(Array.from(equipamentoSelect.options).some((option) => option.value === '6')).toBe(true);
  });

  await user.selectOptions(screen.getAllByRole('combobox')[0], '6');
  await user.selectOptions(screen.getAllByRole('combobox')[1], '16');
}

describe('ModalNovaSessao loading stability', () => {
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

  it('renderiza_seletor_compartilhado_apos_capability_true_sem_equipamento', async () => {
    const { fetchMock } = buildFetchMock({ capabilityEnabled: true, capabilityDelayMs: 20 });
    vi.stubGlobal('fetch', fetchMock);

    renderModal();

    expect(screen.getByText(/Tipo de Sessão de Voo/i)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Sessão compartilhada/i })).not.toBeInTheDocument();

    const equipamentoSelect = screen.getAllByRole('combobox')[0] as HTMLSelectElement;
    expect(equipamentoSelect).toHaveValue('');

    expect(await screen.findByRole('button', { name: /Sessão compartilhada/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Sessão simples/i })).toBeInTheDocument();
    expect(equipamentoSelect).toHaveValue('');

    const modalidadeLabel = screen.getByText(/Modalidade da sessão/i);
    const tipoSessaoLabel = screen.getByText(/Tipo de Sessão de Voo/i);
    expect(
      modalidadeLabel.compareDocumentPosition(tipoSessaoLabel) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
  });

  it('nao_refaz_request_ao_focar_tema_quando_a_combinacao_ja_foi_carregada', async () => {
    const { fetchMock, modelRequestUrls } = buildFetchMock();
    vi.stubGlobal('fetch', fetchMock);

    const user = userEvent.setup();
    renderModal();

    await selecionarFluxoSk76(user);
    await user.selectOptions(screen.getAllByRole('combobox')[2], '14');

    await waitFor(() => {
      expect(screen.queryByText(/Carregando modelos disponíveis/i)).not.toBeInTheDocument();
      expect(screen.getAllByRole('combobox')).toHaveLength(8);
    });

    expect(modelRequestUrls.filter((url) => url.includes('tipo_sessao_id=14'))).toHaveLength(1);

    await user.click(screen.getAllByRole('combobox')[3]);

    await waitFor(() => {
      expect(screen.queryByText(/Carregando modelos disponíveis/i)).not.toBeInTheDocument();
    });

    expect(modelRequestUrls.filter((url) => url.includes('tipo_sessao_id=14'))).toHaveLength(1);
  });

  it('mantem_apenas_o_resultado_da_ultima_combinacao_estavel_quando_ini_e_per_disparam_em_sequencia', async () => {
    const { fetchMock, modelRequestUrls } = buildFetchMock({ iniDelayMs: 80, perDelayMs: 10 });
    vi.stubGlobal('fetch', fetchMock);

    const user = userEvent.setup();
    renderModal();

    await selecionarFluxoSk76(user);

    const tipoSelect = screen.getAllByRole('combobox')[2];
    await user.selectOptions(tipoSelect, '14');
    await user.selectOptions(tipoSelect, '9');

    await waitFor(() => {
      expect(screen.queryByText(/Carregando modelos disponíveis/i)).not.toBeInTheDocument();
      expect(screen.getAllByRole('combobox')).toHaveLength(8);
    });

    await waitFor(() => {
      const modeloSelect = screen.getAllByRole('combobox')[3] as HTMLSelectElement;
      const optionLabels = Array.from(modeloSelect.options).map((option) => option.textContent);
      expect(optionLabels).toContain('S76-P-C1/VFR - SK76 - PERIÓDICO - 01/03 - CICLO 1: VFR');
      expect(optionLabels.some((label) => label?.includes('INICIAL'))).toBe(false);
    });

    expect(modelRequestUrls.filter((url) => url.includes('tipo_sessao_id=14'))).toHaveLength(1);
    expect(modelRequestUrls.filter((url) => url.includes('tipo_sessao_id=9'))).toHaveLength(1);
  });

  it('usa_fallback_global_para_exa_e_ins_sem_misturar_sem_e_vazio_opc', async () => {
    const { fetchMock, modelRequestUrls } = buildFetchMock();
    vi.stubGlobal('fetch', fetchMock);

    const user = userEvent.setup();
    renderModal();

    await selecionarFluxoSk76(user);

    const tipoSelect = screen.getAllByRole('combobox')[2];

    await user.selectOptions(tipoSelect, '23');
    await waitFor(() => {
      const modeloSelect = screen.getAllByRole('combobox')[3] as HTMLSelectElement;
      const optionLabels = Array.from(modeloSelect.options).map((option) => option.textContent);
      expect(optionLabels).toContain('CRED-EXA - CREDENCIAMENTO DE EXAMINADOR');
    });

    await user.selectOptions(tipoSelect, '22');
    await waitFor(() => {
      const modeloSelect = screen.getAllByRole('combobox')[3] as HTMLSelectElement;
      const optionLabels = Array.from(modeloSelect.options).map((option) => option.textContent);
      expect(optionLabels).toContain('TRE-INST - TREINAMENTO DE INSTRUTOR DE VOO');
    });

    await user.selectOptions(tipoSelect, '21');
    await waitFor(() => {
      const modeloSelect = screen.getAllByRole('combobox')[3] as HTMLSelectElement;
      const optionLabels = Array.from(modeloSelect.options).map((option) => option.textContent);
      expect(optionLabels).toContain('SK76-S-01/02 - SK76 - SEMESTRAL - 01/02: LOFT e OPERAÇÃO NOTURNA');
      expect(optionLabels.some((label) => label?.includes('TREINAMENTO DE INSTRUTOR'))).toBe(false);
    });

    await user.selectOptions(tipoSelect, '2');
    await waitFor(() => {
      expect(
        screen.getByText(/Nenhum modelo cadastrado para esta combinação/i),
      ).toBeInTheDocument();
    });

    const countByTipoSessaoId = (tipoSessaoId: string) =>
      modelRequestUrls.filter(
        (url) => new URL(url).searchParams.get('tipo_sessao_id') === tipoSessaoId,
      ).length;

    expect(countByTipoSessaoId('23')).toBe(1);
    expect(countByTipoSessaoId('22')).toBe(1);
    expect(countByTipoSessaoId('21')).toBe(1);
    expect(countByTipoSessaoId('2')).toBe(1);
    expect(modelRequestUrls.filter((url) => !url.includes('tipo_sessao_id='))).toHaveLength(3);
  });

  it('nao_mistura_periodico_em_inicial_quando_tipo_legado_vem_ambiguo', async () => {
    const { fetchMock } = buildFetchMock();
    vi.stubGlobal('fetch', fetchMock);

    const user = userEvent.setup();
    renderModal();

    await selecionarFluxoSk76(user);
    await user.selectOptions(screen.getAllByRole('combobox')[2], '14');

    await waitFor(() => {
      const modeloSelect = screen.getAllByRole('combobox')[3] as HTMLSelectElement;
      const optionLabels = Array.from(modeloSelect.options).map((option) => option.textContent);
      expect(optionLabels).toContain(
        'SK76-I-01/12 - SK76 - INICIAL - 01/12 - FAMILIARIZAÇÃO VFR',
      );
      expect(optionLabels).not.toContain('S76-P-C1/VFR - SK76 - PERIÓDICO - 01/03 - CICLO 1: VFR');
      expect(optionLabels).not.toContain('S76-P-C1/IFR - SK76 - PERIÓDICO - 02/03 - CICLO 1: IFR');
    });
  });
});
