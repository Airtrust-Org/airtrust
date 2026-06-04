import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Env } from '../../types';
import {
  sendSimulatorSessionEmailNotifications,
  shouldNotifySimulatorSessionUpdate,
} from '../../services/simuladores-session-notifications';

const baseSession = {
  id: 42,
  data: '2026-06-10',
  hora_inicio: '08:00',
  hora_fim: '10:00',
  tipo_sessao: 'TREINAMENTO',
  tema_sessao: 'LOFT',
  status: 'AGENDADO',
  observacoes: 'Chegar 15 minutos antes.',
  empresa_id: 7,
  tipo_dispositivo: 'SIMULADOR',
  simulador_nome: 'SIM A320',
  simulador_modelo: 'A320',
  simulador_tipo: 'A320',
  instrutor_id: 10,
  instrutor_nome: 'Instrutor Teste',
  instrutor_email: 'instrutor@example.com',
  examinador_id: null,
  examinador_nome: null,
  examinador_email: null,
};

const baseParticipants: Array<{
  funcionario_id: number;
  funcao: string | null;
  funcionario_nome: string | null;
  funcionario_email: string | null;
}> = [
  {
    funcionario_id: 20,
    funcao: 'PIC',
    funcionario_nome: 'Tripulante Teste',
    funcionario_email: 'tripulante@example.com',
  },
];

function createDbMock({
  session = baseSession,
  participants = baseParticipants,
}: {
  session?: typeof baseSession | null;
  participants?: typeof baseParticipants;
}) {
  return {
    prepare: vi.fn((sql: string) => ({
      bind: vi.fn(() => ({
        first: vi.fn(async () => (sql.includes('FROM simulador_agendamentos') ? session : null)),
        all: vi.fn(async () =>
          sql.includes('FROM sessoes_participantes') ? { results: participants } : { results: [] },
        ),
      })),
    })),
  } as unknown as D1Database;
}

function createEnv(overrides: Partial<Env> = {}): Env {
  return {
    BREVO_API_KEY: 'brevo-test-key',
    BREVO_FROM_EMAIL: 'treinamento@example.com',
    BREVO_FROM_NAME: 'AirTrust Test',
    FRONTEND_URL: 'https://app.airtrust.test',
    ...overrides,
  } as Env;
}

describe('simuladores session email notifications', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('envia notificacao para instrutor e tripulante designados', async () => {
    const fetchMock = vi.fn(async (_input: unknown, _init?: RequestInit) => new Response(JSON.stringify({ messageId: 'ok' }), { status: 201 }));
    vi.stubGlobal('fetch', fetchMock);

    const results = await sendSimulatorSessionEmailNotifications(
      createEnv(),
      createDbMock({}),
      42,
      { reason: 'created', empresaId: 7 },
    );

    expect(results).toHaveLength(2);
    expect(results.map((item) => item.status)).toEqual(['sent', 'sent']);
    expect(results.map((item) => item.roles[0])).toEqual(['INSTRUTOR', 'PARTICIPANTE_PIC']);
    expect(fetchMock).toHaveBeenCalledTimes(2);

    const payloads = fetchMock.mock.calls.map((call) =>
      JSON.parse(String((call[1] as RequestInit | undefined)?.body)),
    );
    expect(payloads.map((payload) => payload.to[0].email)).toEqual(
      expect.arrayContaining(['instrutor@example.com', 'tripulante@example.com']),
    );
    expect(payloads[0].textContent).toContain('Data: 10/06/2026');
    expect(payloads[0].textContent).toContain('Equipe:');
    expect(payloads[0].textContent).toContain('Acesso seguro: https://app.airtrust.test/simuladores');
  });

  it('pula destinatario sem e-mail sem quebrar o fluxo', async () => {
    const fetchMock = vi.fn(async (_input: unknown, _init?: RequestInit) => new Response(JSON.stringify({ messageId: 'ok' }), { status: 201 }));
    vi.stubGlobal('fetch', fetchMock);

    const results = await sendSimulatorSessionEmailNotifications(
      createEnv(),
      createDbMock({
        participants: [{ ...baseParticipants[0], funcionario_email: null }],
      }),
      42,
      { reason: 'created', empresaId: 7 },
    );

    expect(results).toHaveLength(2);
    expect(results.find((item) => item.funcionarioId === 20)?.status).toBe('skipped');
    expect(results.find((item) => item.funcionarioId === 20)?.reason).toBe('EMAIL_MISSING');
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('nao executa fetch real quando provider de e-mail esta ausente', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    const results = await sendSimulatorSessionEmailNotifications(
      createEnv({ BREVO_API_KEY: undefined, BREVO_FROM_EMAIL: undefined }),
      createDbMock({}),
      42,
      { reason: 'created', empresaId: 7 },
    );

    expect(results).toHaveLength(2);
    expect(results.every((item) => item.status === 'skipped')).toBe(true);
    expect(results.every((item) => item.reason === 'EMAIL_PROVIDER_NOT_CONFIGURED')).toBe(true);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('detecta apenas mudancas relevantes para evitar duplicidade em re-save sem alteracao', () => {
    const before = {
      data: '2026-06-10',
      hora_inicio: '08:00',
      hora_fim: '10:00',
      simulador_id: 1,
      instrutor_id: 10,
      nome: 'LOFT',
      observacoes: 'Briefing',
      status: 'AGENDADO',
      updated_at: 'old',
    };
    const after = { ...before, updated_at: 'new' };

    expect(shouldNotifySimulatorSessionUpdate(before, after, false)).toBe(false);
    expect(
      shouldNotifySimulatorSessionUpdate(before, { ...after, instrutor_id: 11 }, false),
    ).toBe(true);
    expect(shouldNotifySimulatorSessionUpdate(before, after, true)).toBe(true);
  });
});
