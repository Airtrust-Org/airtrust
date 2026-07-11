import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// Covers section 7-10 of the shared-session brief: the EXA-V01..V04 template
// action must be invisible for ordinary courses, must appear only when the
// canonical examiner models exist for the tenant/equipment, must require an
// exactly-120-minute reservation, and must produce exactly two 60-minute
// segments tagged with the correct EXA-V0X codigo — never fabricated data,
// never leaking into a generic session's payload.

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

const EXAMINER_MODELOS = [
  { id: 501, codigo: 'EXA-V01', nome: 'Examinador V01', tipo_sessao_codigo: 'EXA', modelo_aeronave: null, gera_qualificacao: 0 },
  { id: 502, codigo: 'EXA-V02', nome: 'Examinador V02', tipo_sessao_codigo: 'EXA', modelo_aeronave: null, gera_qualificacao: 0 },
  { id: 503, codigo: 'EXA-V03', nome: 'Examinador V03', tipo_sessao_codigo: 'EXA', modelo_aeronave: null, gera_qualificacao: 0 },
  { id: 504, codigo: 'EXA-V04', nome: 'Examinador V04', tipo_sessao_codigo: 'EXA', modelo_aeronave: null, gera_qualificacao: 0 },
];

const GENERIC_MODELOS = [
  { id: 63, codigo: 'SK76-I-01/12', nome: 'Inicial', tipo_sessao_codigo: 'INI', modelo_aeronave: 'SK76', gera_qualificacao: 0 },
];

function BASE_PROPS(overrides: Record<string, unknown> = {}) {
  return {
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
    ...overrides,
  };
}

function mockModelosResponse(modelos: unknown[]) {
  vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
    const url = String(input);
    if (url.includes('/simuladores/modelos-sessao')) {
      return { ok: true, json: async () => ({ data: modelos }) } as Response;
    }
    return { ok: true, json: async () => ({ success: true, data: [] }) } as Response;
  });
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

describe('SharedSessionForm — examiner template (EXA-V01..V04)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockCreateSharedSession.mockResolvedValue({ success: true, data: { sessao: { id: 999 } } });
    mockUpdateSharedSession.mockResolvedValue({ success: true, data: { sessao: { id: 999 } } });
    mockGetSharedSession.mockResolvedValue({ success: true, data: null });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('never shows the examiner template for an ordinary course (no EXA models loaded)', async () => {
    mockModelosResponse(GENERIC_MODELOS);
    render(<SharedSessionForm {...(BASE_PROPS() as any)} />);

    await selectPilot(0, 'Ramos');
    await selectPilot(1, 'Dieter');
    await goToSegments();

    await screen.findByLabelText('Modelo do segmento 1');
    expect(screen.queryByTestId('examiner-template-panel')).not.toBeInTheDocument();
    expect(screen.queryByText(/EXA-V0/i)).not.toBeInTheDocument();
  });

  it('shows the examiner template panel when EXA-V01..V04 exist for the tenant, disabled until the reservation is exactly 120 minutes', async () => {
    mockModelosResponse(EXAMINER_MODELOS);
    // 90-minute reservation: template must be visible (models exist) but disabled.
    render(<SharedSessionForm {...(BASE_PROPS({ horarioInicio: '08:00', horarioFim: '09:30' }) as any)} />);

    await selectPilot(0, 'Ramos');
    await selectPilot(1, 'Dieter');
    await goToSegments();
    await screen.findByTestId('examiner-template-panel');

    expect(screen.getByText(/precisa ter exatamente 120 minutos/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Aplicar Evento 1 de 2/i })).toBeDisabled();
    expect(screen.getByRole('button', { name: /Aplicar Evento 2 de 2/i })).toBeDisabled();
  });

  it('applies Evento 1 de 2 (EXA-V01 + EXA-V02): exactly two 60-minute segments, same trainee, submitted with correct codes', async () => {
    mockModelosResponse(EXAMINER_MODELOS);
    render(<SharedSessionForm {...(BASE_PROPS({ horarioInicio: '08:00', horarioFim: '10:00' }) as any)} />);

    await selectPilot(0, 'Ramos');
    await selectPilot(1, 'Dieter');
    await goToSegments();
    await screen.findByTestId('examiner-template-panel');

    await userEvent.click(screen.getByRole('button', { name: /Aplicar Evento 1 de 2/i }));

    expect(screen.getByLabelText('Horário de divisão dos segmentos')).toHaveValue('09:00');
    expect(screen.getByLabelText('Modelo do segmento 1')).toHaveValue('501');
    expect(screen.getByLabelText('Modelo do segmento 2')).toHaveValue('502');
    expect(screen.getByText(/Evento 1 de 2 aplicado/i)).toBeInTheDocument();

    // Mark Ramos as the curricular trainee in both segments (required before submit).
    const ramosChecks = screen.getAllByLabelText('Ramos');
    for (const checkbox of ramosChecks) {
      if (!(checkbox as HTMLInputElement).checked) await userEvent.click(checkbox);
    }

    await userEvent.click(screen.getByRole('button', { name: /Criar sessão compartilhada/i }));
    await waitFor(() => expect(mockCreateSharedSession).toHaveBeenCalledTimes(1));
    const payload = mockCreateSharedSession.mock.calls[0][0];

    expect(payload.segmentos).toHaveLength(2);
    expect(payload.segmentos[0].inicio).toBe('08:00');
    expect(payload.segmentos[0].fim).toBe('09:00');
    expect(payload.segmentos[0].modelo_sessao_id).toBe(501);
    expect(payload.segmentos[1].inicio).toBe('09:00');
    expect(payload.segmentos[1].fim).toBe('10:00');
    expect(payload.segmentos[1].modelo_sessao_id).toBe(502);
  });

  it('does not offer Evento 2 when only EXA-V01/V02 exist for the tenant (partial catalog)', async () => {
    mockModelosResponse(EXAMINER_MODELOS.filter((m) => m.codigo === 'EXA-V01' || m.codigo === 'EXA-V02'));
    render(<SharedSessionForm {...(BASE_PROPS({ horarioInicio: '08:00', horarioFim: '10:00' }) as any)} />);

    await selectPilot(0, 'Ramos');
    await selectPilot(1, 'Dieter');
    await goToSegments();
    await screen.findByTestId('examiner-template-panel');

    expect(screen.getByRole('button', { name: /Aplicar Evento 1 de 2/i })).not.toBeDisabled();
    expect(screen.getByRole('button', { name: /Aplicar Evento 2 de 2/i })).toBeDisabled();
  });

  it('reopening an already-converted examiner segment (hydrated) shows the applied-event badge without re-triggering the template', async () => {
    mockModelosResponse(EXAMINER_MODELOS);
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
            modelo_sessao_id: 501,
            finalidade_codigo: 'ATUACAO_EXAMINADOR',
            participantes: [
              { funcionario_id: 3, funcao: 'PF', cumpre_treinamento: true },
              { funcionario_id: 7, funcao: 'PM', cumpre_treinamento: false },
            ],
          },
          {
            id: 802,
            inicio: '09:00',
            fim: '10:00',
            modelo_sessao_id: 502,
            finalidade_codigo: 'ATUACAO_EXAMINADOR',
            participantes: [
              { funcionario_id: 7, funcao: 'PF', cumpre_treinamento: false },
              { funcionario_id: 3, funcao: 'PM', cumpre_treinamento: true },
            ],
          },
        ],
      },
    });

    render(<SharedSessionForm {...(BASE_PROPS({ horarioInicio: '08:00', horarioFim: '10:00', editSessionId: 9901 }) as any)} />);

    await waitFor(() => expect(mockGetSharedSession).toHaveBeenCalledWith(9901));
    await goToSegments();

    expect(await screen.findByText(/Evento 1 de 2 aplicado/i)).toBeInTheDocument();
    expect(screen.getByLabelText('Modelo do segmento 1')).toHaveValue('501');
    expect(screen.getByLabelText('Modelo do segmento 2')).toHaveValue('502');
  });
});
