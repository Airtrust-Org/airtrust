import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/react-app/config/api', () => ({
  API_BASE_URL: 'http://localhost:8787/api',
  getAccessToken: () => 'token-teste',
}));

const mockCreateSharedSession = vi.fn();
const mockUpdateSharedSession = vi.fn();
const mockGetSharedSession = vi.fn();

vi.mock('@/react-app/config/sharedSessions', async () => {
  const actual = await vi.importActual('@/react-app/config/sharedSessions');
  return {
    ...actual,
    createSharedSession: (...args: any[]) => mockCreateSharedSession(...args),
    updateSharedSession: (...args: any[]) => mockUpdateSharedSession(...args),
    getSharedSession: (...args: any[]) => mockGetSharedSession(...args),
  };
});

vi.mock('@/react-app/components/simuladores/FuncionarioCombobox', () => ({
  FuncionarioCombobox: (props: any) => (
    <div data-testid="funcionario-combobox">
      <input
        aria-label={props.placeholder}
        placeholder={props.placeholder}
        disabled={props.disabled}
        onChange={(event) => {
          if (event.target.value === 'Ramos') {
            props.onSelect({ id: 3, nome: 'Ramos', matricula: '123', funcao: 'PIC', status: 'ATIVO' });
          } else if (event.target.value === 'Dieter') {
            props.onSelect({ id: 7, nome: 'Dieter', matricula: '456', funcao: 'SIC', status: 'ATIVO' });
          } else if (event.target.value === 'clear') {
            props.onSelect(null);
          }
        }}
      />
      {props.selected && <span>{props.selected.nome}</span>}
    </div>
  ),
}));

vi.mock('sonner', () => ({
  toast: { success: vi.fn(), error: vi.fn(), warning: vi.fn() },
}));

import SharedSessionForm from '../SharedSessionForm';
import { toast } from 'sonner';

const BASE_PROPS = {
  onClose: vi.fn(),
  onSuccess: vi.fn(),
  simuladorId: 16,
  simuladorModelo: 'SK76',
  simuladorNome: 'SIM 01',
  data: '2026-06-20',
  horarioInicio: '08:00',
  horarioFim: '10:00',
  instrutorId: 6,
  instrutorNome: 'Instrutor 6',
  temaSessao: 'TESTE',
  observacoes: '',
  funcionarios: [
    { id: 3, nome: 'Ramos', matricula: '123' },
    { id: 7, nome: 'Dieter', matricula: '456' },
  ],
};

function renderForm(overrides = {}) {
  return render(<SharedSessionForm {...BASE_PROPS} {...overrides} />);
}

async function selectPilot(index: 0 | 1, name: 'Ramos' | 'Dieter') {
  fireEvent.change(screen.getByLabelText(`Buscar tripulante ${index + 1}...`), {
    target: { value: name },
  });
  await waitFor(() => expect(screen.getByText(name)).toBeInTheDocument());
}

async function selectTripulanteModel(index: 0 | 1, value: string) {
  const selects = await screen.findAllByLabelText('Modelo da ficha');
  await waitFor(() => expect((selects[index] as HTMLSelectElement).options.length).toBeGreaterThan(1));
  await userEvent.selectOptions(selects[index], value);
}

async function goToSegments() {
  await userEvent.click(screen.getByRole('button', { name: /Continuar para Segmentos/i }));
  await screen.findByTestId('shared-step-segmentos');
}

describe('SharedSessionForm rendered', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
      const url = String(input);
      if (url.includes('/simuladores/modelos-sessao')) {
        return {
          ok: true,
          json: async () => ({
            data: [
              {
                id: 63,
                codigo: 'SK76-I-01/12@M2026.07-V2',
                codigo_canonico: 'SK76-I-01/12',
                nome: 'Inicial',
                tipo_sessao_codigo: 'INI',
                modelo_aeronave: 'SK76',
                duracao_estimada: 120,
              },
              {
                id: 64,
                codigo: 'SK76-P-02/03',
                nome: 'Periódico',
                tipo_sessao_codigo: 'PER',
                modelo_aeronave: 'SK76',
                duracao_estimada: 120,
              },
            ],
          }),
        } as Response;
      }
      return { ok: true, json: async () => ({ success: true, data: [] }) } as Response;
    });
    mockCreateSharedSession.mockResolvedValue({ success: true, data: { sessao: { id: 999 } } });
    mockUpdateSharedSession.mockResolvedValue({ success: true, data: { sessao: { id: 999 } } });
    mockGetSharedSession.mockResolvedValue({ success: true, data: null });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('exibe o código canônico limpo no seletor de modelo da ficha', async () => {
    renderForm();
    await selectPilot(0, 'Ramos');

    const selects = await screen.findAllByLabelText('Modelo da ficha');
    await waitFor(() => expect((selects[0] as HTMLSelectElement).options.length).toBeGreaterThan(1));

    const option = Array.from((selects[0] as HTMLSelectElement).options).find(
      (item) => item.value === '63',
    );
    expect(option?.textContent).toContain('SK76-I-01/12 - Inicial');
    expect(option?.textContent).not.toContain('@M2026.07-V2');
  });

  it('mantém o código canônico limpo no resumo final', async () => {
    renderForm();
    await selectPilot(0, 'Ramos');
    await selectPilot(1, 'Dieter');
    await selectTripulanteModel(0, '63');
    await selectTripulanteModel(1, '64');
    await goToSegments();

    expect(screen.getByText('SK76-I-01/12')).toBeInTheDocument();
    expect(screen.queryByText('SK76-I-01/12@M2026.07-V2')).not.toBeInTheDocument();
  });

  it('bloqueia a etapa de segmentos até a tripulação ser definida', async () => {
    renderForm();

    await userEvent.click(screen.getByRole('button', { name: /2\. Distribuição PF\/PM/i }));

    expect(
      screen.getByText('Defina a tripulação e seus currículos antes de configurar a distribuição operacional.'),
    ).toBeInTheDocument();
    expect(screen.getByText('Tripulante 1: selecione o tripulante.')).toBeInTheDocument();
    expect(screen.getByTestId('shared-step-tripulacao')).toBeInTheDocument();
  });

  it('submete o mesmo participante físico com modelos por tripulante e segmentos sem modelo', async () => {
    renderForm();

    await selectPilot(0, 'Ramos');
    await selectPilot(1, 'Dieter');
    
    await selectTripulanteModel(0, '63');
    await selectTripulanteModel(1, '64');
    
    await goToSegments();

    await userEvent.click(screen.getByRole('button', { name: /Criar sessão compartilhada/i }));
    await waitFor(() => expect(mockCreateSharedSession).toHaveBeenCalledTimes(1));
    const payload = mockCreateSharedSession.mock.calls[0][0];

    expect(payload.participantes).toHaveLength(2);
    expect(payload.participantes[0]).toMatchObject({
      funcionario_id: 3,
      cumpre_treinamento: true,
      modelo_sessao_id: 63,
      gera_ficha: true,
    });
    expect(payload.participantes[1]).toMatchObject({
      funcionario_id: 7,
      cumpre_treinamento: true,
      modelo_sessao_id: 64,
      gera_ficha: true,
    });

    expect(payload.segmentos).toHaveLength(2);
    expect(payload.segmentos[0]).toMatchObject({
      inicio: '08:00',
      fim: '09:00',
      funcoes: [
        { funcionario_id: 3, funcao: 'PF' },
        { funcionario_id: 7, funcao: 'PM' },
      ],
      atribuicao_funcionario_ids: [3, 7],
    });
    expect(payload.segmentos[0]).not.toHaveProperty('modelo_sessao_id');
  });

  it('hidrata edição histórica com modelos extraídos dos segmentos', async () => {
    mockGetSharedSession.mockResolvedValueOnce({
      success: true,
      data: {
        participantes: [
          { funcionario_id: 3, funcionario_nome: 'Ramos', funcao: 'PIC' },
          { funcionario_id: 7, funcionario_nome: 'Dieter', funcao: 'SIC' },
        ],
        segmentos: [
          {
            id: 801,
            inicio: '08:00',
            fim: '09:00',
            modelo_sessao_id: 63,
            participantes: [
              { funcionario_id: 3, funcao: 'PF', cumpre_treinamento: true, modelo_sessao_id: 63 },
              { funcionario_id: 7, funcao: 'PM', cumpre_treinamento: false, modelo_sessao_id: null },
            ],
          },
          {
            id: 802,
            inicio: '09:00',
            fim: '10:00',
            modelo_sessao_id: 64,
            participantes: [
              { funcionario_id: 7, funcao: 'PF', cumpre_treinamento: true, modelo_sessao_id: 64 },
              { funcionario_id: 3, funcao: 'PM', cumpre_treinamento: false, modelo_sessao_id: null },
            ],
          },
        ],
      },
    });

    renderForm({ editSessionId: 9901 });

    await waitFor(() => expect(mockGetSharedSession).toHaveBeenCalledWith(9901));
    expect(await screen.findAllByText('Ramos')).not.toHaveLength(0);
    expect(await screen.findAllByText('Dieter')).not.toHaveLength(0);

    const selects = await screen.findAllByLabelText('Modelo da ficha');
    expect(selects[0]).toHaveValue('63');
    expect(selects[1]).toHaveValue('64');
  });

  it('fecha o modal pelo botão cancelar sem enviar payload', async () => {
    renderForm();

    await userEvent.click(screen.getByRole('button', { name: 'Cancelar' }));

    expect(BASE_PROPS.onClose).toHaveBeenCalledTimes(1);
    expect(mockCreateSharedSession).not.toHaveBeenCalled();
    expect(mockUpdateSharedSession).not.toHaveBeenCalled();
  });

  it('hidrata modelos por participante quando segmento tem 2 modelos distintos (regressão)', async () => {
    // Regression: when a segment has 2 different modelos (one per participant),
    // seg.modelo_sessao_id is null but seg.participantes[].modelo_sessao_id has the value.
    // The old code used seg.modelo_sessao_id → modelos appeared empty.
    mockGetSharedSession.mockResolvedValueOnce({
      success: true,
      data: {
        participantes: [
          { funcionario_id: 3, funcionario_nome: 'Ramos', funcao: 'PIC' },
          { funcionario_id: 7, funcionario_nome: 'Dieter', funcao: 'SIC' },
        ],
        segmentos: [
          {
            id: 11,
            inicio: '09:00',
            fim: '10:00',
            modelo_sessao_id: null, // 2 modelos → null (regression trigger)
            participantes: [
              { funcionario_id: 3, funcao: 'PF', cumpre_treinamento: true, modelo_sessao_id: 63 },
              { funcionario_id: 7, funcao: 'PM', cumpre_treinamento: true, modelo_sessao_id: 64 },
            ],
          },
          {
            id: 12,
            inicio: '10:00',
            fim: '11:00',
            modelo_sessao_id: null,
            participantes: [
              { funcionario_id: 7, funcao: 'PF', cumpre_treinamento: true, modelo_sessao_id: 64 },
              { funcionario_id: 3, funcao: 'PM', cumpre_treinamento: true, modelo_sessao_id: 63 },
            ],
          },
        ],
      },
    });

    renderForm({ editSessionId: 9902 });

    await waitFor(() => expect(mockGetSharedSession).toHaveBeenCalledWith(9902));

    const selects = await screen.findAllByLabelText('Modelo da ficha');
    // Ramos (func 3, PIC) → modelo 63
    expect(selects[0]).toHaveValue('63');
    // Dieter (func 7, SIC) → modelo 64
    expect(selects[1]).toHaveValue('64');
  });

  it('resolve modelo via fallback detail.atribuicoes quando segmentos não tem participantes.modelo_sessao_id', async () => {
    mockGetSharedSession.mockResolvedValueOnce({
      success: true,
      data: {
        participantes: [
          { funcionario_id: 3, funcionario_nome: 'Ramos', funcao: 'PIC' },
          { funcionario_id: 7, funcionario_nome: 'Dieter', funcao: 'SIC' },
        ],
        atribuicoes: [
          { funcionario_id: 3, modelo_sessao_id: 63, gera_ficha: 1 },
          { funcionario_id: 7, modelo_sessao_id: 64, gera_ficha: 1 },
        ],
        segmentos: [
          {
            id: 11,
            inicio: '09:00',
            fim: '10:00',
            modelo_sessao_id: null,
            participantes: [
              { funcionario_id: 3, funcao: 'PF', cumpre_treinamento: true },
              { funcionario_id: 7, funcao: 'PM', cumpre_treinamento: true },
            ],
          },
        ],
      },
    });

    renderForm({ editSessionId: 9903 });

    await waitFor(() => expect(mockGetSharedSession).toHaveBeenCalledWith(9903));

    const selects = await screen.findAllByLabelText('Modelo da ficha');
    expect(selects[0]).toHaveValue('63');
    expect(selects[1]).toHaveValue('64');
  });

  it('exibe estado de erro quando hidratação falha para sessão existente', async () => {
    mockGetSharedSession.mockRejectedValueOnce(new Error('Falha de rede'));

    renderForm({ editSessionId: 9904 });

    await waitFor(() => {
      expect(screen.getByText('Erro ao carregar a sessão')).toBeInTheDocument();
    });
    expect(screen.getByText('Tentar novamente')).toBeInTheDocument();
    expect(screen.getByText('Fechar')).toBeInTheDocument();
  });
});
