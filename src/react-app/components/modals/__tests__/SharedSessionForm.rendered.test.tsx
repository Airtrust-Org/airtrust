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
  fireEvent.change(screen.getByLabelText(`Buscar piloto ${index + 1}...`), {
    target: { value: name },
  });
  await waitFor(() => expect(screen.getByText(name)).toBeInTheDocument());
}

async function goToSegments() {
  await userEvent.click(screen.getByRole('button', { name: /Continuar para Segmentos/i }));
  await screen.findByTestId('shared-step-segmentos');
}

async function selectSegmentModel(index: 0 | 1, value: string) {
  const select = await screen.findByLabelText(`Modelo do segmento ${index + 1}`);
  await waitFor(() => expect((select as HTMLSelectElement).options.length).toBeGreaterThan(1));
  await userEvent.selectOptions(select, value);
}

async function setCurricular(index: 0 | 1, participantName: 'Ramos' | 'Dieter', checked = true) {
  const segmentCards = screen.getAllByText(/Currículos atendidos neste segmento/i);
  const card = segmentCards[index].closest('div');
  if (!card) throw new Error('Segment card not found');
  const checkbox = screen.getAllByLabelText(participantName)[index] as HTMLInputElement;
  if (checkbox.checked !== checked) {
    await userEvent.click(checkbox);
  }
}

function expectNoGlobalModelOnParticipants(payload: any) {
  expect(payload.participantes).toEqual([
    { funcionario_id: 3 },
    { funcionario_id: 7 },
  ]);
  for (const participante of payload.participantes) {
    expect(participante).not.toHaveProperty('modelo_sessao_id');
    expect(participante).not.toHaveProperty('cumpre_treinamento');
    expect(participante).not.toHaveProperty('gera_ficha');
  }
}

describe('SharedSessionForm rendered', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
      const url = String(input);
      if (url.includes('/treinamentos/planejados')) {
        throw new Error('Shared session form must not fetch planned trainings');
      }
      if (url.includes('/simuladores/modelos-sessao')) {
        return {
          ok: true,
          json: async () => ({
            data: [
              {
                id: 63,
                codigo: 'SK76-I-01/12',
                nome: 'Inicial',
                tipo_sessao_codigo: 'INI',
                modelo_aeronave: 'SK76',
                duracao_estimada: 120,
                gera_qualificacao: 0,
              },
              {
                id: 64,
                codigo: 'SK76-P-02/03',
                nome: 'Periódico',
                tipo_sessao_codigo: 'PER',
                modelo_aeronave: 'SK76',
                duracao_estimada: 120,
                gera_qualificacao: 0,
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

  it('bloqueia a etapa de segmentos até a tripulação ser definida', async () => {
    renderForm();

    await userEvent.click(screen.getByRole('button', { name: /2\. Segmentos/i }));

    expect(
      screen.getByText('Defina a tripulação antes de configurar os segmentos.'),
    ).toBeInTheDocument();
    expect(screen.getByText('Piloto 1: selecione o piloto.')).toBeInTheDocument();
    expect(screen.getByTestId('shared-step-tripulacao')).toBeInTheDocument();
  });

  it('submete o mesmo participante físico em dois segmentos com modelos distintos e sem modelo global', async () => {
    renderForm();

    await selectPilot(0, 'Ramos');
    await selectPilot(1, 'Dieter');
    await goToSegments();
    await selectSegmentModel(0, '63');
    await selectSegmentModel(1, '64');
    await setCurricular(0, 'Ramos', true);
    await setCurricular(1, 'Ramos', true);

    await userEvent.click(screen.getByRole('button', { name: /Criar sessão compartilhada/i }));
    await waitFor(() => expect(mockCreateSharedSession).toHaveBeenCalledTimes(1));
    const payload = mockCreateSharedSession.mock.calls[0][0];

    expectNoGlobalModelOnParticipants(payload);
    expect(payload.segmentos).toHaveLength(2);
    expect(payload.segmentos[0]).toMatchObject({
      inicio: '08:00',
      fim: '09:00',
      modelo_sessao_id: 63,
      participantes: [
        { funcionario_id: 3, funcao: 'PF', cumpre_treinamento: true, gera_ficha: true },
        { funcionario_id: 7, funcao: 'PM', cumpre_treinamento: false, gera_ficha: false },
      ],
    });
    expect(payload.segmentos[1]).toMatchObject({
      inicio: '09:00',
      fim: '10:00',
      modelo_sessao_id: 64,
      participantes: [
        { funcionario_id: 7, funcao: 'PF', cumpre_treinamento: false, gera_ficha: false },
        { funcionario_id: 3, funcao: 'PM', cumpre_treinamento: true, gera_ficha: true },
      ],
    });
    expect(BASE_PROPS.onSuccess).toHaveBeenCalledTimes(1);
    expect(BASE_PROPS.onClose).toHaveBeenCalledTimes(1);
    expect(toast.success).toHaveBeenCalled();
  });

  it('hidrata edição histórica com participantes e modelos por segmento', async () => {
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
            finalidade_codigo: 'SOP_NORMAL',
            participantes: [
              { funcionario_id: 3, funcao: 'PF', cumpre_treinamento: true },
              { funcionario_id: 7, funcao: 'PM', cumpre_treinamento: false },
            ],
          },
          {
            id: 802,
            inicio: '09:00',
            fim: '10:00',
            modelo_sessao_id: 64,
            finalidade_codigo: 'OUTRO',
            participantes: [
              { funcionario_id: 7, funcao: 'PF', cumpre_treinamento: false },
              { funcionario_id: 3, funcao: 'PM', cumpre_treinamento: true },
            ],
          },
        ],
      },
    });

    renderForm({ editSessionId: 9901 });

    await waitFor(() => expect(mockGetSharedSession).toHaveBeenCalledWith(9901));
    expect(await screen.findAllByText('Ramos')).not.toHaveLength(0);
    expect(await screen.findAllByText('Dieter')).not.toHaveLength(0);

    await goToSegments();

    expect(screen.getByLabelText('Horário de divisão dos segmentos')).toHaveValue('09:00');
    expect(screen.getByLabelText('Modelo do segmento 1')).toHaveValue('63');
    expect(screen.getByLabelText('Modelo do segmento 2')).toHaveValue('64');
    expect(screen.getAllByLabelText('Ramos')[0]).toBeChecked();
    expect(screen.getAllByLabelText('Ramos')[1]).toBeChecked();
  });

  it('altera o modelo de apenas um segmento na edição e preserva o outro', async () => {
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
            finalidade_codigo: 'SOP_NORMAL',
            participantes: [
              { funcionario_id: 3, funcao: 'PF', cumpre_treinamento: true },
              { funcionario_id: 7, funcao: 'PM', cumpre_treinamento: false },
            ],
          },
          {
            id: 802,
            inicio: '09:00',
            fim: '10:00',
            modelo_sessao_id: 63,
            finalidade_codigo: 'OUTRO',
            participantes: [
              { funcionario_id: 7, funcao: 'PF', cumpre_treinamento: false },
              { funcionario_id: 3, funcao: 'PM', cumpre_treinamento: true },
            ],
          },
        ],
      },
    });

    renderForm({ editSessionId: 9901 });

    await waitFor(() => expect(mockGetSharedSession).toHaveBeenCalledWith(9901));
    await goToSegments();
    await selectSegmentModel(1, '64');

    await userEvent.click(screen.getByRole('button', { name: /Salvar sessão compartilhada/i }));

    await waitFor(() => expect(mockUpdateSharedSession).toHaveBeenCalledTimes(1));
    const [id, payload] = mockUpdateSharedSession.mock.calls[0];

    expect(id).toBe(9901);
    expectNoGlobalModelOnParticipants(payload);
    expect(payload.segmentos).toEqual([
      expect.objectContaining({ id: 801, modelo_sessao_id: 63 }),
      expect.objectContaining({ id: 802, modelo_sessao_id: 64 }),
    ]);
  });

  it('fecha o modal pelo botão cancelar sem enviar payload', async () => {
    renderForm();

    await userEvent.click(screen.getByRole('button', { name: 'Cancelar' }));

    expect(BASE_PROPS.onClose).toHaveBeenCalledTimes(1);
    expect(mockCreateSharedSession).not.toHaveBeenCalled();
    expect(mockUpdateSharedSession).not.toHaveBeenCalled();
  });
});
