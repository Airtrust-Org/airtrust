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
        onChange={(event) => {
          if (event.target.value === 'Ramos') {
            props.onSelect({ id: 3, nome: 'Ramos', matricula: '123' });
          } else if (event.target.value === 'Dieter') {
            props.onSelect({ id: 7, nome: 'Dieter', matricula: '456' });
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
  data: '2026-06-20',
  horarioInicio: '07:00',
  horarioFim: '09:00',
  instrutorId: 6,
  temaSessao: 'TESTE',
  observacoes: '',
  funcionarios: [],
};

function renderForm(overrides = {}) {
  return render(<SharedSessionForm {...BASE_PROPS} {...overrides} />);
}

async function selectPilot(index: 0 | 1, name: 'Ramos' | 'Dieter') {
  fireEvent.change(screen.getByLabelText(`Buscar piloto ${index + 1}...`), {
    target: { value: name },
  });
  await waitFor(() => expect(screen.getAllByText(name).length).toBeGreaterThan(0));
}

async function completeCurricularPilot(index: 0 | 1, name: 'Ramos' | 'Dieter') {
  await selectPilot(index, name);
  const training = await screen.findByLabelText(`Treinamento planejado do piloto ${index + 1}`);
  await waitFor(() => expect((training as HTMLSelectElement).options.length).toBeGreaterThan(1));
  fireEvent.change(training, { target: { value: '4' } });
  const model = await screen.findByLabelText(`Modelo de sessão do piloto ${index + 1}`);
  await waitFor(() => expect((model as HTMLSelectElement).options.length).toBeGreaterThan(1));
  fireEvent.change(model, { target: { value: '63' } });
}

async function completeCrew() {
  await completeCurricularPilot(0, 'Ramos');
  await completeCurricularPilot(1, 'Dieter');
  await screen.findByLabelText('PF do segmento 1');
}

describe('SharedSessionForm rendered', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
      const url = String(input);
      if (url.includes('/treinamentos/planejados')) {
        return {
          ok: true,
          json: async () => ({
            data: {
              items: [
                {
                  id: 4,
                  titulo: 'SK76-Curriculo-Voo-INICIAL-UI-TEST',
                  qualificacao_tipo_id: 40,
                  status: 'PLANEJADO',
                },
              ],
            },
          }),
        } as Response;
      }
      if (url.includes('/simuladores/modelos-sessao')) {
        return {
          ok: true,
          json: async () => ({
            data: [{ id: 63, codigo: 'SK76-I-01/12', nome: 'Inicial' }],
          }),
        } as Response;
      }
      return { ok: true, json: async () => ({ success: true, data: [] }) } as Response;
    });
    mockCreateSharedSession.mockResolvedValue({ success: true, data: { sessao: { id: 999 } } });
    mockUpdateSharedSession.mockResolvedValue({ success: true, data: { sessao: { id: 999 } } });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('renders the progressive shared-session journey without upfront errors', () => {
    renderForm();
    expect(screen.getByText('Configuração compartilhada')).toBeTruthy();
    expect(screen.getByText('1. Reserva')).toBeTruthy();
    expect(screen.getByText('2. Tripulação')).toBeTruthy();
    expect(screen.getByText('3. Segmentos')).toBeTruthy();
    expect(screen.queryByText(/pendência/)).toBeNull();
    expect(screen.queryByLabelText('Horário de divisão dos segmentos')).toBeNull();
  });

  it('keeps the reservation guidance visible when common fields are incomplete', () => {
    renderForm({ simuladorId: null });
    expect(screen.getByText(/Complete equipamento, simulador, data, horários e instrutor/)).toBeTruthy();
    expect(screen.queryAllByTestId('funcionario-combobox')).toHaveLength(0);
  });

  it('uses Pilot 1/Pilot 2 as primary labels and PIC/SIC as secondary labels', () => {
    renderForm();
    expect(screen.getByText('Piloto 1')).toBeTruthy();
    expect(screen.getByText('PIC na reserva')).toBeTruthy();
    expect(screen.getByText('Piloto 2')).toBeTruthy();
    expect(screen.getByText('SIC na reserva')).toBeTruthy();
  });

  it('loads models only after training and sends qualification, sequence and equipment filters', async () => {
    renderForm();
    await selectPilot(0, 'Ramos');
    expect(globalThis.fetch).not.toHaveBeenCalledWith(
      expect.stringContaining('/simuladores/modelos-sessao'),
      expect.anything(),
    );

    fireEvent.change(await screen.findByLabelText('Treinamento planejado do piloto 1'), {
      target: { value: '4' },
    });

    await waitFor(() => {
      expect(globalThis.fetch).toHaveBeenCalledWith(
        'http://localhost:8787/api/simuladores/modelos-sessao?limit=200&tipo=SIMULADOR&modelo_aeronave=SK76&qualificacao_tipo_id=40&tipo_sessao_codigo=INI',
        expect.objectContaining({ headers: { Authorization: 'Bearer token-teste' } }),
      );
    });
    expect(await screen.findByText('SK76-I-01/12 - Inicial')).toBeTruthy();
  });

  it('supports a curricular pilot plus an operational support pilot', async () => {
    renderForm();
    await completeCurricularPilot(0, 'Ramos');
    await selectPilot(1, 'Dieter');
    const checkboxes = screen.getAllByRole('checkbox');
    await userEvent.click(checkboxes[1]);

    expect(screen.getByText('Apoio: não gera ficha nem progressão.')).toBeTruthy();
    expect(await screen.findByLabelText('Atribuição curricular do segmento 2')).toBeTruthy();
    expect(screen.getAllByRole('option', { name: 'Ramos' }).length).toBeGreaterThan(0);
  });

  it('reveals editable PF, PM and curricular assignment only after crew completion', async () => {
    renderForm();
    await completeCrew();
    expect(screen.getByLabelText('Horário de divisão dos segmentos')).toBeTruthy();
    expect(screen.getByLabelText('PF do segmento 1')).toBeTruthy();
    expect(screen.getByLabelText('PM do segmento 1')).toBeTruthy();
    expect(screen.getByLabelText('Atribuição curricular do segmento 1')).toBeTruthy();
    expect(screen.getByLabelText('PF do segmento 2')).toBeTruthy();
  });

  it('does not silently clamp an invalid split and reports it contextually', async () => {
    renderForm();
    await completeCrew();
    fireEvent.change(screen.getByLabelText('Horário de divisão dos segmentos'), {
      target: { value: '09:00' },
    });
    expect((screen.getByLabelText('Horário de divisão dos segmentos') as HTMLInputElement).value).toBe('09:00');
    expect(screen.getByText(/A divisão deve ficar estritamente entre início e fim/)).toBeTruthy();
  });

  it('submits a complete two-curricular-pilot payload with manual segment roles', async () => {
    renderForm();
    await completeCrew();
    fireEvent.change(screen.getByLabelText('PF do segmento 1'), { target: { value: '7' } });
    fireEvent.change(screen.getByLabelText('PM do segmento 1'), { target: { value: '3' } });
    await userEvent.click(screen.getByRole('button', { name: 'Criar sessão compartilhada' }));

    await waitFor(() => expect(mockCreateSharedSession).toHaveBeenCalledTimes(1));
    expect(mockCreateSharedSession).toHaveBeenCalledWith(
      expect.objectContaining({
        simulador_id: 16,
        participantes: [
          expect.objectContaining({ funcionario_id: 3, gera_ficha: true }),
          expect.objectContaining({ funcionario_id: 7, gera_ficha: true }),
        ],
        segmentos: [
          expect.objectContaining({
            inicio: '07:00',
            fim: '08:00',
            funcoes: [
              { funcionario_id: 7, funcao: 'PF' },
              { funcionario_id: 3, funcao: 'PM' },
            ],
          }),
          expect.objectContaining({ inicio: '08:00', fim: '09:00' }),
        ],
      }),
    );
  });

  it('shows actionable validation after an incomplete submit attempt', async () => {
    renderForm();
    await userEvent.click(screen.getByRole('button', { name: 'Criar sessão compartilhada' }));
    expect(screen.getByText(/pendência\(s\) precisam ser corrigidas/)).toBeTruthy();
    expect(toast.error).toHaveBeenCalledWith('Piloto 1: selecione o tripulante.');
    expect(mockCreateSharedSession).not.toHaveBeenCalled();
  });

  it('surfaces API errors after a valid submit', async () => {
    mockCreateSharedSession.mockResolvedValue({ success: false, error: 'Conflito externo de simulador' });
    renderForm();
    await completeCrew();
    await userEvent.click(screen.getByRole('button', { name: 'Criar sessão compartilhada' }));
    await waitFor(() => expect(toast.error).toHaveBeenCalledWith('Conflito externo de simulador'));
  });

  it('hydrates shared edit data and exposes the edit action', async () => {
    mockGetSharedSession.mockResolvedValue({
      success: true,
      data: {
        participantes: [
          { funcionario_id: 3, funcao: 'PIC', funcionario_nome: 'Ramos' },
          { funcionario_id: 7, funcao: 'SIC', funcionario_nome: 'Dieter' },
        ],
        atribuicoes: [
          { id: 31, funcionario_id: 3, modelo_sessao_id: 63, treinamento_planejado_id: 4, gera_ficha: 1 },
          { id: 32, funcionario_id: 7, modelo_sessao_id: 63, treinamento_planejado_id: 4, gera_ficha: 1 },
        ],
        segmentos: [
          {
            inicio: '07:00',
            fim: '08:00',
            atribuicao_curricular_id: 31,
            funcoes: [
              { funcionario_id: 3, funcao: 'PF' },
              { funcionario_id: 7, funcao: 'PM' },
            ],
          },
          {
            inicio: '08:00',
            fim: '09:00',
            atribuicao_curricular_id: 32,
            funcoes: [
              { funcionario_id: 7, funcao: 'PF' },
              { funcionario_id: 3, funcao: 'PM' },
            ],
          },
        ],
      },
    });

    renderForm({ editSessionId: 100 });
    expect(screen.getByText(/Carregando dados/)).toBeTruthy();
    expect(await screen.findByRole('button', { name: 'Salvar sessão compartilhada' })).toBeTruthy();
    expect(screen.getByLabelText('PF do segmento 1')).toHaveValue('3');
  });

  it('keeps the legacy simple-session label outside this component', () => {
    renderForm();
    expect(screen.queryByText('Sessão simples')).toBeNull();
  });
});
