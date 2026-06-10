import React from 'react';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
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

async function goToCrew() {
  await userEvent.click(screen.getByRole('button', { name: /Continuar para Tripulação/i }));
  expect(screen.getByTestId('shared-step-tripulacao')).toBeTruthy();
}

async function goToSegments() {
  await userEvent.click(screen.getByRole('button', { name: /Continuar para Segmentos/i }));
  expect(screen.getByTestId('shared-step-segmentos')).toBeTruthy();
}

async function selectPilot(index: 0 | 1, name: 'Ramos' | 'Dieter') {
  fireEvent.change(screen.getByLabelText(`Buscar piloto ${index + 1}...`), {
    target: { value: name },
  });
  await waitFor(() => expect(screen.getAllByText(name).length).toBeGreaterThan(0));
}

async function selectModel(index: 0 | 1, value: '63' | '64' = '63') {
  const model = await screen.findByLabelText(`Modelo de sessão do piloto ${index + 1}`);
  await waitFor(() => expect((model as HTMLSelectElement).options.length).toBeGreaterThan(1));
  fireEvent.change(model, { target: { value } });
}

async function completeTwoCurricularCrew() {
  await goToCrew();
  await selectPilot(0, 'Ramos');
  await selectModel(0, '63');
  await selectPilot(1, 'Dieter');
  await selectModel(1, '64');
}

async function completeCurricularWithSupportCrew() {
  await goToCrew();
  await selectPilot(0, 'Ramos');
  await selectModel(0, '63');
  await selectPilot(1, 'Dieter');
  await userEvent.click(screen.getAllByRole('checkbox')[1]);
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
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('1. renders three real step buttons', () => {
    renderForm();
    expect(screen.getByRole('button', { name: /1\. Reserva/ })).toBeTruthy();
    expect(screen.getByRole('button', { name: /2\. Tripulação/ })).toBeTruthy();
    expect(screen.getByRole('button', { name: /3\. Segmentos/ })).toBeTruthy();
  });

  it('2. starts with Reserva active and Tripulação content hidden', () => {
    renderForm();
    expect(screen.getByRole('button', { name: /1\. Reserva/ })).toHaveAttribute('aria-current', 'step');
    expect(screen.getByTestId('shared-step-reserva')).toBeTruthy();
    expect(screen.queryByTestId('shared-step-tripulacao')).toBeNull();
  });

  it('3. clicking Tripulação with incomplete reservation shows a blocking message', async () => {
    renderForm({ simuladorId: null });
    await userEvent.click(screen.getByRole('button', { name: /2\. Tripulação/ }));
    expect(screen.getAllByText('Complete os dados da reserva para configurar a tripulação.').length).toBeGreaterThan(0);
    expect(screen.getByText('Selecione o simulador.')).toBeTruthy();
  });

  it('4. a valid reservation allows Tripulação by click', async () => {
    renderForm();
    await userEvent.click(screen.getByRole('button', { name: /2\. Tripulação/ }));
    expect(screen.getByTestId('shared-step-tripulacao')).toBeTruthy();
  });

  it('5. Continue button moves from Reserva to Tripulação', async () => {
    renderForm();
    await goToCrew();
    expect(screen.getByRole('button', { name: /2\. Tripulação/ })).toHaveAttribute('aria-current', 'step');
  });

  it('6. Voltar returns from Tripulação to Reserva', async () => {
    renderForm();
    await goToCrew();
    await userEvent.click(screen.getByRole('button', { name: 'Voltar' }));
    expect(screen.getByTestId('shared-step-reserva')).toBeTruthy();
  });

  it('7. preserves crew state when navigating back and forward', async () => {
    renderForm();
    await goToCrew();
    await selectPilot(0, 'Ramos');
    await selectModel(0, '63');
    await userEvent.click(screen.getByRole('button', { name: 'Voltar' }));
    await goToCrew();
    expect(screen.getByText('Ramos')).toBeTruthy();
    expect(screen.getByLabelText('Modelo de sessão do piloto 1')).toHaveValue('63');
  });

  it('8. Segmentos is blocked without pilots', async () => {
    renderForm();
    await userEvent.click(screen.getByRole('button', { name: /3\. Segmentos/ }));
    expect(screen.getByText('Defina a tripulação e os modelos de sessão antes de configurar os segmentos.')).toBeTruthy();
    expect(screen.getByText('Piloto 1: selecione o piloto.')).toBeTruthy();
  });

  it('9. Segmentos is blocked without Modelo de Sessão', async () => {
    renderForm();
    await goToCrew();
    await selectPilot(0, 'Ramos');
    await selectPilot(1, 'Dieter');
    await userEvent.click(screen.getByRole('button', { name: /Continuar para Segmentos/i }));
    expect(screen.getByText('Piloto 1: selecione o modelo de sessão.')).toBeTruthy();
  });

  it('10. after valid crew, Segmentos is reachable by step click', async () => {
    renderForm();
    await completeTwoCurricularCrew();
    await userEvent.click(screen.getByRole('button', { name: /3\. Segmentos/ }));
    expect(screen.getByLabelText('Horário de divisão dos segmentos')).toBeTruthy();
  });

  it('11. Continue button moves from Tripulação to Segmentos', async () => {
    renderForm();
    await completeTwoCurricularCrew();
    await goToSegments();
    expect(screen.getByRole('button', { name: /3\. Segmentos/ })).toHaveAttribute('aria-current', 'step');
  });

  it('12. Voltar from Segmentos preserves participants and models', async () => {
    renderForm();
    await completeTwoCurricularCrew();
    await goToSegments();
    await userEvent.click(screen.getByRole('button', { name: 'Voltar' }));
    expect(screen.getByText('Ramos')).toBeTruthy();
    expect(screen.getByLabelText('Modelo de sessão do piloto 2')).toHaveValue('64');
  });

  it('13. keyboard Enter activates a step button', async () => {
    renderForm();
    const tripStep = screen.getByRole('button', { name: /2\. Tripulação/ });
    tripStep.focus();
    await userEvent.keyboard('{Enter}');
    expect(screen.getByTestId('shared-step-tripulacao')).toBeTruthy();
  });

  it('14. aria-current moves to the active step', async () => {
    renderForm();
    await goToCrew();
    expect(screen.getByRole('button', { name: /1\. Reserva/ })).not.toHaveAttribute('aria-current');
    expect(screen.getByRole('button', { name: /2\. Tripulação/ })).toHaveAttribute('aria-current', 'step');
  });

  it('15. support pilot does not require model and reaches Segmentos', async () => {
    renderForm();
    await completeCurricularWithSupportCrew();
    await goToSegments();
    expect(screen.getAllByText('Dieter').length).toBeGreaterThan(0);
    // Support pilot shows "—" for Modelo de Sessão and Qualificação columns
    expect(screen.getAllByText('—').length).toBeGreaterThanOrEqual(2);
  });

  it('16. curricular pilot requires model', async () => {
    renderForm();
    await goToCrew();
    await selectPilot(0, 'Ramos');
    await selectPilot(1, 'Dieter');
    await userEvent.click(screen.getByRole('button', { name: /Continuar para Segmentos/i }));
    expect(toast.error).not.toHaveBeenCalled();
    expect(screen.getByText('Piloto 1: selecione o modelo de sessão.')).toBeTruthy();
  });

  it('17. submits two curricular pilots with distinct models and no planned training field', async () => {
    renderForm();
    await completeTwoCurricularCrew();
    await goToSegments();
    fireEvent.change(screen.getByLabelText('PF do segmento 1'), { target: { value: '7' } });
    fireEvent.change(screen.getByLabelText('PM do segmento 1'), { target: { value: '3' } });
    await userEvent.click(screen.getByRole('button', { name: 'Criar sessão compartilhada' }));

    await waitFor(() => expect(mockCreateSharedSession).toHaveBeenCalledTimes(1));
    const payload = mockCreateSharedSession.mock.calls[0][0];
    expect(payload.participantes).toEqual([
      expect.objectContaining({ funcionario_id: 3, modelo_sessao_id: 63, gera_ficha: true }),
      expect.objectContaining({ funcionario_id: 7, modelo_sessao_id: 64, gera_ficha: true }),
    ]);
    expect(payload.participantes[0]).not.toHaveProperty('treinamento_planejado_id');
  });

  it('18. submits curricular plus support with support model null and no ficha', async () => {
    renderForm();
    await completeCurricularWithSupportCrew();
    await goToSegments();
    await userEvent.click(screen.getByRole('button', { name: 'Criar sessão compartilhada' }));

    await waitFor(() => expect(mockCreateSharedSession).toHaveBeenCalledTimes(1));
    const payload = mockCreateSharedSession.mock.calls[0][0];
    expect(payload.participantes[1]).toEqual(
      expect.objectContaining({
        funcionario_id: 7,
        cumpre_treinamento: false,
        modelo_sessao_id: null,
        gera_ficha: false,
      }),
    );
  });

  it('19. summary shows Modelo de Sessão, Ficha, Qualificação, and no Treinamento planejado', async () => {
    renderForm();
    await completeCurricularWithSupportCrew();
    await goToSegments();
    expect(screen.getByText('Modelo de Sessão')).toBeTruthy();
    expect(screen.getByText('Ficha')).toBeTruthy();
    expect(screen.getByText('Qualificação')).toBeTruthy();
    expect(screen.queryByText(/Treinamento planejado/i)).toBeNull();
  });

  it('20. hydrates edit data and exposes segment controls without training dropdown', async () => {
    mockGetSharedSession.mockResolvedValue({
      success: true,
      data: {
        participantes: [
          { funcionario_id: 3, funcao: 'PIC', funcionario_nome: 'Ramos' },
          { funcionario_id: 7, funcao: 'SIC', funcionario_nome: 'Dieter' },
        ],
        atribuicoes: [
          { id: 31, funcionario_id: 3, modelo_sessao_id: 63, modelo_codigo: 'SK76-I-01/12', modelo_nome: 'Inicial', gera_ficha: 1 },
          { id: 32, funcionario_id: 7, modelo_sessao_id: 64, modelo_codigo: 'SK76-P-02/03', modelo_nome: 'Periódico', gera_ficha: 1 },
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
    await waitFor(() => expect(screen.queryByText(/Carregando dados/)).toBeNull());
    await userEvent.click(screen.getByRole('button', { name: /3\. Segmentos/ }));
    expect(screen.getByLabelText('PF do segmento 1')).toHaveValue('3');
    expect(screen.queryByLabelText(/Treinamento planejado/i)).toBeNull();
  });

  it('21. no step is decorative-only', () => {
    renderForm();
    const stepper = screen.getByRole('list', { name: 'Etapas da sessão compartilhada' });
    const steps = within(stepper).getAllByRole('button');
    expect(steps).toHaveLength(3);
    for (const step of steps) {
      expect(step.tagName).toBe('BUTTON');
    }
  });

  it('22. legacy simple-session label remains outside this component', () => {
    renderForm();
    expect(screen.queryByText('Sessão simples')).toBeNull();
  });
});
