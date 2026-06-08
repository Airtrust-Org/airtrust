import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import ModalNovaSessao from '../ModalNovaSessao';

vi.mock('@/react-app/config/api', () => ({
  API_BASE_URL: 'http://localhost:3000/api',
  getAccessToken: () => 'token-teste',
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
  iniDelayMs?: number;
  perDelayMs?: number;
}

function buildFetchMock(options: TestOptions = {}) {
  const modelRequestUrls: string[] = [];
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
      { id: 14, codigo: 'INI', nome: 'Inicial' },
      { id: 9, codigo: 'PER', nome: 'Periódico' },
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
        tipo: 'PERIODICO',
        modelo_aeronave: 'SK76',
      },
      {
        id: 46,
        codigo: 'S76-P-C1/IFR',
        nome: 'SK76 - PERIÓDICO - 02/03 - CICLO 1: IFR',
        tipo_sessao_id: 9,
        tipo: 'PERIODICO',
        modelo_aeronave: 'SK76',
      },
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
      if (tipoSessaoId === '14') return jsonResponse(modelosIni, iniDelayMs);
      if (tipoSessaoId === '9') return jsonResponse(modelosPer, perDelayMs);
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
    vi.spyOn(console, 'log').mockImplementation(() => {});
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
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
});
