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
  await selectPilot(0, 'Ramos');
  await selectModel(0, '63');
  await selectPilot(1, 'Dieter');
  await selectModel(1, '64');
}

async function completeCurricularWithSupportCrew() {
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

  // === STEPPER TESTS ===

  it('1. stepper has two steps: Tripulação and Segmentos', () => {
    renderForm();
    expect(screen.getByRole('button', { name: /1\. Tripulação/ })).toBeTruthy();
    expect(screen.getByRole('button', { name: /2\. Segmentos/ })).toBeTruthy();
    expect(screen.queryByRole('button', { name: /Reserva/ })).toBeNull();
  });

  it('2. Tripulação starts active and Segmentos content hidden', () => {
    renderForm();
    expect(screen.getByRole('button', { name: /1\. Tripulação/ })).toHaveAttribute('aria-current', 'step');
    expect(screen.getByTestId('shared-step-tripulacao')).toBeTruthy();
    expect(screen.queryByTestId('shared-step-segmentos')).toBeNull();
  });

  it('3. reservation data is always visible at top', () => {
    renderForm();
    expect(screen.getByTestId('shared-reservation-summary')).toBeTruthy();
    expect(screen.getByText('SK76')).toBeTruthy();
    expect(screen.getByText('2026-06-20')).toBeTruthy();
  });

  it('4. reservation fields accept data from props', () => {
    renderForm({ simuladorModelo: 'AW139', data: '2026-07-15' });
    expect(screen.getByText('AW139')).toBeTruthy();
    expect(screen.getByText('2026-07-15')).toBeTruthy();
  });

  it('5. clicking Segmentos with incomplete crew shows blocking message', async () => {
    renderForm();
    await userEvent.click(screen.getByRole('button', { name: /2\. Segmentos/ }));
    expect(screen.getByText('Defina a tripulação e os modelos de sessão antes de configurar os segmentos.')).toBeTruthy();
    expect(screen.getByText('Piloto 1: selecione o piloto.')).toBeTruthy();
  });

  it('6. Continue moves from Tripulação to Segmentos', async () => {
    renderForm();
    await completeTwoCurricularCrew();
    await goToSegments();
    expect(screen.getByRole('button', { name: /2\. Segmentos/ })).toHaveAttribute('aria-current', 'step');
  });

  it('7. Voltar para Tripulação returns from Segmentos to Tripulação', async () => {
    renderForm();
    await completeTwoCurricularCrew();
    await goToSegments();
    await userEvent.click(screen.getByRole('button', { name: 'Voltar para Tripulação' }));
    expect(screen.getByTestId('shared-step-tripulacao')).toBeTruthy();
  });

  it('8. preserves crew state when navigating to Segmentos and back', async () => {
    renderForm();
    await completeTwoCurricularCrew();
    await goToSegments();
    await userEvent.click(screen.getByRole('button', { name: 'Voltar para Tripulação' }));
    expect(screen.getByText('Ramos')).toBeTruthy();
    expect(screen.getByLabelText('Modelo de sessão do piloto 1')).toHaveValue('63');
    expect(screen.getByLabelText('Modelo de sessão do piloto 2')).toHaveValue('64');
  });

  it('9. keyboard Enter activates the Segmentos step button', async () => {
    renderForm();
    await completeTwoCurricularCrew();
    const segStep = screen.getByRole('button', { name: /2\. Segmentos/ });
    segStep.focus();
    await userEvent.keyboard('{Enter}');
    expect(screen.getByTestId('shared-step-segmentos')).toBeTruthy();
  });

  it('10. aria-current moves to the active step', async () => {
    renderForm();
    await completeTwoCurricularCrew();
    await goToSegments();
    expect(screen.getByRole('button', { name: /1\. Tripulação/ })).not.toHaveAttribute('aria-current');
    expect(screen.getByRole('button', { name: /2\. Segmentos/ })).toHaveAttribute('aria-current', 'step');
  });

  it('11. no step is decorative-only — both are buttons', () => {
    renderForm();
    const stepper = screen.getByRole('list', { name: 'Etapas da sessão compartilhada' });
    const steps = within(stepper).getAllByRole('button');
    expect(steps).toHaveLength(2);
    for (const step of steps) {
      expect(step.tagName).toBe('BUTTON');
    }
  });

  // === CREW & ROLE TESTS ===

  it('12. support pilot does not require model and reaches Segmentos', async () => {
    renderForm();
    await completeCurricularWithSupportCrew();
    await goToSegments();
    expect(screen.getAllByText('Dieter').length).toBeGreaterThan(0);
    expect(screen.getAllByText('—').length).toBeGreaterThanOrEqual(2);
  });

  it('13. curricular pilot requires model', async () => {
    renderForm();
    await selectPilot(0, 'Ramos');
    await selectPilot(1, 'Dieter');
    await userEvent.click(screen.getByRole('button', { name: /Continuar para Segmentos/i }));
    expect(screen.getByText('Piloto 1: selecione o modelo de sessão.')).toBeTruthy();
  });

  it('14. unchecking curricular turns pilot to apoio and hides model', async () => {
    renderForm();
    await selectPilot(0, 'Ramos');
    await waitFor(() => expect(screen.getByLabelText('Modelo de sessão do piloto 1')).toBeTruthy());
    await selectModel(0, '63');
    // Uncheck the curricular checkbox
    const checkboxes = screen.getAllByRole('checkbox');
    await userEvent.click(checkboxes[0]);
    // Model select should disappear
    expect(screen.queryByLabelText('Modelo de sessão do piloto 1')).toBeNull();
    // Should show "Apoio" badge
    expect(screen.getByText('Apoio')).toBeTruthy();
  });

  it('15. checking apoio turns pilot to curricular and requires model', async () => {
    renderForm();
    await selectPilot(0, 'Ramos');
    const checkboxes = screen.getAllByRole('checkbox');
    await userEvent.click(checkboxes[0]); // uncheck
    expect(screen.queryByLabelText('Modelo de sessão do piloto 1')).toBeNull();
    await userEvent.click(checkboxes[0]); // recheck
    await waitFor(() => expect(screen.getByLabelText('Modelo de sessão do piloto 1')).toBeTruthy());
    expect(screen.getAllByText('Curricular').length).toBeGreaterThanOrEqual(1);
  });

  it('16. curricular pilot shows qualification message based on model', async () => {
    renderForm();
    await selectPilot(0, 'Ramos');
    await waitFor(() => expect(screen.getByLabelText('Modelo de sessão do piloto 1')).toBeTruthy());
    // Model 63 has gera_qualificacao=0
    await selectModel(0, '63');
    expect(screen.getByText('Gera ficha. Este modelo não gera qualificação.')).toBeTruthy();
  });

  it('17. curricular pilot with check model shows qualification message', async () => {
    // Override mock for this test to return a check model
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
      const url = String(input);
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
                gera_qualificacao: 1,
              },
              {
                id: 64,
                codigo: 'SK76-P-02/03',
                nome: 'Periódico',
                tipo_sessao_codigo: 'PER',
                modelo_aeronave: 'SK76',
                duracao_estimada: 120,
                gera_qualificacao: 1,
              },
            ],
          }),
        } as Response;
      }
      return { ok: true, json: async () => ({ success: true, data: [] }) } as Response;
    });

    renderForm();
    await selectPilot(0, 'Ramos');
    await waitFor(() => expect(screen.getByLabelText('Modelo de sessão do piloto 1')).toBeTruthy());
    await selectModel(0, '63');
    expect(screen.getByText('Gera ficha e qualificação.')).toBeTruthy();
  });

  it('18. fichaConcluida disables checkbox with explanatory message', async () => {
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
        fichas: [
          { id: 50, status: 'APROVADO', colaborador_id_aluno: 3 },
          { id: 51, status: 'AVALIACAO_PENDENTE', colaborador_id_aluno: 7 },
        ],
        segmentos: [
          {
            inicio: '07:00', fim: '08:00', atribuicao_curricular_id: 31,
            funcoes: [{ funcionario_id: 3, funcao: 'PF' }, { funcionario_id: 7, funcao: 'PM' }],
          },
          {
            inicio: '08:00', fim: '09:00', atribuicao_curricular_id: 32,
            funcoes: [{ funcionario_id: 7, funcao: 'PF' }, { funcionario_id: 3, funcao: 'PM' }],
          },
        ],
      },
    });

    renderForm({ editSessionId: 100, funcionarios: [{ id: 3, nome: 'Ramos', matricula: '123' }, { id: 7, nome: 'Dieter', matricula: '456' }] });
    await waitFor(() => expect(screen.queryByText(/Carregando dados/)).toBeNull());

    // Piloto 1 (Ramos) has concluded ficha → checkbox disabled
    const checkboxes = screen.getAllByRole('checkbox');
    expect(checkboxes[0]).toBeDisabled();
    expect(screen.getByText(/A ficha deste piloto já foi concluída/)).toBeTruthy();
    // Piloto 2 (Dieter) ficha is pending → checkbox enabled
    expect(checkboxes[1]).not.toBeDisabled();
  });

  // === SUMMARY & PAYLOAD TESTS ===

  it('19. summary shows Modelo de Sessão, Ficha, Qualificação columns', async () => {
    renderForm();
    await completeCurricularWithSupportCrew();
    await goToSegments();
    expect(screen.getByText('Modelo de Sessão')).toBeTruthy();
    expect(screen.getByText('Ficha')).toBeTruthy();
    expect(screen.getByText('Qualificação')).toBeTruthy();
    expect(screen.queryByText(/Treinamento planejado/i)).toBeNull();
  });

  it('20. submits two curricular pilots with distinct models', async () => {
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

  it('21. submits curricular plus support with support having no model', async () => {
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

  // === EDIT MODE TESTS ===

  it('22. hydrates edit data and reaches Segmentos by step click', async () => {
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
            inicio: '07:00', fim: '08:00', atribuicao_curricular_id: 31,
            funcoes: [{ funcionario_id: 3, funcao: 'PF' }, { funcionario_id: 7, funcao: 'PM' }],
          },
          {
            inicio: '08:00', fim: '09:00', atribuicao_curricular_id: 32,
            funcoes: [{ funcionario_id: 7, funcao: 'PF' }, { funcionario_id: 3, funcao: 'PM' }],
          },
        ],
      },
    });

    renderForm({ editSessionId: 100 });
    expect(screen.getByText(/Carregando dados/)).toBeTruthy();
    await waitFor(() => expect(screen.queryByText(/Carregando dados/)).toBeNull());
    await userEvent.click(screen.getByRole('button', { name: /2\. Segmentos/ }));
    expect(screen.getByLabelText('PF do segmento 1')).toHaveValue('3');
    expect(screen.queryByLabelText(/Treinamento planejado/i)).toBeNull();
  });

  it('23. edit mode shows Salvar button instead of Criar', async () => {
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
            inicio: '07:00', fim: '08:00', atribuicao_curricular_id: 31,
            funcoes: [{ funcionario_id: 3, funcao: 'PF' }, { funcionario_id: 7, funcao: 'PM' }],
          },
          {
            inicio: '08:00', fim: '09:00', atribuicao_curricular_id: 32,
            funcoes: [{ funcionario_id: 7, funcao: 'PF' }, { funcionario_id: 3, funcao: 'PM' }],
          },
        ],
      },
    });

    renderForm({ editSessionId: 100 });
    await waitFor(() => expect(screen.queryByText(/Carregando dados/)).toBeNull());
    await completeTwoCurricularCrew();
    await goToSegments();
    expect(screen.getByRole('button', { name: 'Salvar sessão compartilhada' })).toBeTruthy();
  });

  it('24. simple-session label is not rendered in shared form', () => {
    renderForm();
    expect(screen.queryByText('Sessão simples')).toBeNull();
  });
});
