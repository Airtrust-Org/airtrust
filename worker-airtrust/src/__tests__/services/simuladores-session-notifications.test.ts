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
  {
    funcionario_id: 21,
    funcao: 'PM',
    funcionario_nome: 'Apoio Teste',
    funcionario_email: 'apoio@example.com',
  },
];

function createDbMock({
  session = baseSession,
  participants = baseParticipants,
  hasNotificationMetadata = true,
}: {
  session?: typeof baseSession | null;
  participants?: typeof baseParticipants;
  hasNotificationMetadata?: boolean;
}) {
  let logIdSeq = 1;
  const notificationLogs: Array<Record<string, any>> = [];
  const db = {
    __notificationLogs: notificationLogs,
    prepare: vi.fn((sql: string) => {
      const makeBound = (...args: unknown[]) => ({
        first: vi.fn(async () => {
          if (sql.includes('FROM simulador_agendamentos')) return session;
          if (sql.includes('FROM notificacoes_log') && hasNotificationMetadata) {
            const empresaId = Number(args[0]);
            const notificationKey = String(args[1]);
            return (
              notificationLogs.find(
                (item) =>
                  Number(item.empresa_id) === empresaId &&
                  String(item.notification_key) === notificationKey,
              ) || null
            );
          }
          return null;
        }),
        all: vi.fn(async () => {
          if (sql === "PRAGMA table_info('notificacoes_log')") {
            return {
              results: hasNotificationMetadata
                ? [
                    { name: 'empresa_id' },
                    { name: 'funcionario_id' },
                    { name: 'sessao_id' },
                    { name: 'notification_key' },
                    { name: 'tentativas_envio' },
                    { name: 'provedor_mensagem_id' },
                    { name: 'provedor_resultado' },
                    { name: 'updated_at' },
                  ]
                : [
                    { name: 'empresa_id' },
                    { name: 'config_id' },
                    { name: 'destinatario' },
                    { name: 'assunto' },
                    { name: 'corpo' },
                    { name: 'status' },
                    { name: 'erro_mensagem' },
                    { name: 'enviado_em' },
                  ],
            };
          }

          return sql.includes('FROM sessoes_participantes') ? { results: participants } : { results: [] };
        }),
        run: vi.fn(async () => {
          if (sql.includes('INSERT INTO notificacoes_log') && hasNotificationMetadata) {
            const duplicate = notificationLogs.find(
              (item) =>
                Number(item.empresa_id) === Number(args[0]) &&
                String(item.notification_key) === String(args[3]),
            );
            if (duplicate) {
              throw new Error('UNIQUE constraint failed: notificacoes_log.empresa_id, notificacoes_log.notification_key');
            }
            notificationLogs.push({
              id: logIdSeq++,
              empresa_id: Number(args[0]),
              funcionario_id: Number(args[1]),
              sessao_id: Number(args[2]),
              notification_key: String(args[3]),
              destinatario: args[4],
              assunto: args[5],
              corpo: args[6],
              status: 'pendente',
              tentativas_envio: 0,
              erro_mensagem: null,
              provedor_mensagem_id: null,
              provedor_resultado: null,
            });
          }

          if (sql.includes('UPDATE notificacoes_log') && hasNotificationMetadata) {
            const logId = Number(args[args.length - 1]);
            const current = notificationLogs.find((item) => Number(item.id) === logId);
            if (current) {
              if (sql.includes("provedor_mensagem_id = ?") && sql.includes("COALESCE(status, 'pendente') <> 'enviada'")) {
                if (
                  current.status === 'enviada' ||
                  (current.provedor_mensagem_id &&
                    String(current.provedor_mensagem_id).startsWith('PROCESSING:') &&
                    String(current.provedor_mensagem_id) !== String(args[0]))
                ) {
                  return { meta: { changes: 0, last_row_id: logId } };
                }
                current.status = 'pendente';
                current.erro_mensagem = null;
                current.provedor_mensagem_id = args[0];
                current.provedor_resultado = null;
                current.tentativas_envio = Number(current.tentativas_envio || 0) + 1;
              } else {
                current.status = args[0];
                current.erro_mensagem = args[1];
                current.provedor_mensagem_id = args[2];
                current.provedor_resultado = args[3];
                if (sql.includes('tentativas_envio = COALESCE(tentativas_envio, 0) + 1')) {
                  current.tentativas_envio = Number(current.tentativas_envio || 0) + 1;
                }
              }
              if (sql.includes("enviado_em = datetime('now')")) {
                current.enviado_em = 'now';
              }
              if (sql.includes("updated_at = datetime('now')")) {
                current.updated_at = 'now';
              }
            }
          }

          return { meta: { changes: 1, last_row_id: logIdSeq - 1 } };
        }),
      });

      return {
        first: vi.fn(async () => makeBound().first()),
        all: vi.fn(async () => makeBound().all()),
        run: vi.fn(async () => makeBound().run()),
        bind: vi.fn((...args: unknown[]) => makeBound(...args)),
      };
    }),
  };

  return db as unknown as D1Database & { __notificationLogs: Array<Record<string, any>> };
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

  it('envia notificacao para instrutor e todos os participantes ativos, inclusive apoio', async () => {
    const fetchMock = vi.fn(async (_input: unknown, _init?: RequestInit) => new Response(JSON.stringify({ messageId: 'ok' }), { status: 201 }));
    vi.stubGlobal('fetch', fetchMock);

    const results = await sendSimulatorSessionEmailNotifications(
      createEnv(),
      createDbMock({}),
      42,
      { reason: 'created', empresaId: 7 },
    );

    expect(results).toHaveLength(3);
    expect(results.map((item) => item.status)).toEqual(['sent', 'sent', 'sent']);
    expect(results.map((item) => item.roles[0])).toEqual(['INSTRUTOR', 'PARTICIPANTE_PIC', 'PARTICIPANTE_PM']);
    expect(fetchMock).toHaveBeenCalledTimes(3);

    const payloads = fetchMock.mock.calls.map((call) =>
      JSON.parse(String((call[1] as RequestInit | undefined)?.body)),
    );
    expect(payloads.map((payload) => payload.to[0].email)).toEqual(
      expect.arrayContaining(['instrutor@example.com', 'tripulante@example.com', 'apoio@example.com']),
    );
    expect(payloads[0].textContent).toContain('Data: 10/06/2026');
    expect(payloads[0].textContent).toContain('Equipe:');
    expect(payloads[0].textContent).toContain('Acesso seguro: https://app.airtrust.test/simuladores');
    const apoioPayload = payloads.find((payload) => payload.to[0].email === 'apoio@example.com');
    expect(apoioPayload?.textContent).toContain('Sua função: Tripulante PM');
    expect(apoioPayload?.textContent).not.toMatch(/realizar[aá] treinamento|avalia[cç][aã]o/i);
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

    expect(results).toHaveLength(3);
    expect(results.every((item) => item.status === 'skipped')).toBe(true);
    expect(results.every((item) => item.reason === 'EMAIL_PROVIDER_NOT_CONFIGURED')).toBe(true);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('nao duplica envio no retry idempotente quando o mesmo aviso ja foi confirmado', async () => {
    const fetchMock = vi.fn(async (_input: unknown, _init?: RequestInit) => new Response(JSON.stringify({ messageId: 'ok' }), { status: 201 }));
    vi.stubGlobal('fetch', fetchMock);
    const db = createDbMock({});

    const firstRun = await sendSimulatorSessionEmailNotifications(createEnv(), db, 42, {
      reason: 'updated',
      empresaId: 7,
    });
    const secondRun = await sendSimulatorSessionEmailNotifications(createEnv(), db, 42, {
      reason: 'updated',
      empresaId: 7,
    });

    expect(firstRun.every((item) => item.status === 'sent')).toBe(true);
    expect(secondRun.every((item) => item.status === 'skipped')).toBe(true);
    expect(secondRun.every((item) => item.reason === 'DUPLICATE')).toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it('nao duplica envio sob concorrencia quando duas rotinas disputam a mesma chave', async () => {
    const releaseGate: { current: null | (() => void) } = { current: null };
    const firstSendBlocked = new Promise<void>((resolve) => {
      releaseGate.current = resolve;
    });
    let sendCount = 0;
    const fetchMock = vi.fn(async (_input: unknown, _init?: RequestInit) => {
      sendCount += 1;
      if (sendCount === 1) {
        await firstSendBlocked;
      }
      return new Response(JSON.stringify({ messageId: 'ok' }), { status: 201 });
    });
    vi.stubGlobal('fetch', fetchMock);
    const db = createDbMock({});

    const firstRunPromise = sendSimulatorSessionEmailNotifications(createEnv(), db, 42, {
      reason: 'updated',
      empresaId: 7,
    });

    for (let attempt = 0; attempt < 20; attempt += 1) {
      if (
        db.__notificationLogs.some(
          (item) =>
            typeof item.provedor_mensagem_id === 'string' &&
            item.provedor_mensagem_id.startsWith('PROCESSING:'),
        )
      ) {
        break;
      }
      await new Promise((resolve) => setTimeout(resolve, 0));
    }

    const secondRunPromise = sendSimulatorSessionEmailNotifications(createEnv(), db, 42, {
      reason: 'updated',
      empresaId: 7,
    });

    const release = releaseGate.current;
    if (release) {
      release();
    }

    const [firstRun, secondRun] = await Promise.all([firstRunPromise, secondRunPromise]);

    const allResults = [...firstRun, ...secondRun];
    expect(allResults.filter((item) => item.status === 'sent')).toHaveLength(3);
    expect(allResults.filter((item) => item.reason === 'DUPLICATE')).toHaveLength(3);
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it('mantem notificacao pendente para retry quando o provedor falha', async () => {
    const fetchMock = vi.fn(async (_input: unknown, _init?: RequestInit) => new Response('provider down', { status: 502 }));
    vi.stubGlobal('fetch', fetchMock);
    const db = createDbMock({});

    const failedRun = await sendSimulatorSessionEmailNotifications(createEnv(), db, 42, {
      reason: 'updated',
      empresaId: 7,
    });
    const retryRun = await sendSimulatorSessionEmailNotifications(createEnv(), db, 42, {
      reason: 'updated',
      empresaId: 7,
    });

    expect(failedRun.every((item) => item.status === 'failed')).toBe(true);
    expect(retryRun.every((item) => item.status === 'failed')).toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(6);
  });

  it('grava apenas preview sanitizado no log e nao o corpo completo do e-mail', async () => {
    const fetchMock = vi.fn(async (_input: unknown, _init?: RequestInit) => new Response(JSON.stringify({ messageId: 'ok' }), { status: 201 }));
    vi.stubGlobal('fetch', fetchMock);
    const db = createDbMock({});

    await sendSimulatorSessionEmailNotifications(createEnv(), db, 42, {
      reason: 'created',
      empresaId: 7,
    });

    const firstLog = db.__notificationLogs[0];
    expect(firstLog).toBeDefined();
    expect(String(firstLog.corpo || '')).toContain('Nova designação de sessão de simulador');
    expect(String(firstLog.corpo || '')).not.toContain('Data: 10/06/2026');
    expect(String(firstLog.corpo || '')).not.toContain('Acesso seguro: https://app.airtrust.test/simuladores');
  });

  it('permanece compatível com schema legado sem a metadata da migration 0436', async () => {
    const fetchMock = vi.fn(async (_input: unknown, _init?: RequestInit) => new Response(JSON.stringify({ messageId: 'ok' }), { status: 201 }));
    vi.stubGlobal('fetch', fetchMock);
    const db = createDbMock({ hasNotificationMetadata: false });

    const firstRun = await sendSimulatorSessionEmailNotifications(createEnv(), db, 42, {
      reason: 'created',
      empresaId: 7,
    });
    const secondRun = await sendSimulatorSessionEmailNotifications(createEnv(), db, 42, {
      reason: 'created',
      empresaId: 7,
    });

    expect(firstRun.every((item) => item.status === 'sent')).toBe(true);
    expect(secondRun.every((item) => item.status === 'sent')).toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(6);
  });

  it('usa o mesmo publico no cancelamento e comunica o evento sem instruir treinamento', async () => {
    const fetchMock = vi.fn(async (_input: unknown, _init?: RequestInit) => new Response(JSON.stringify({ messageId: 'ok' }), { status: 201 }));
    vi.stubGlobal('fetch', fetchMock);

    const results = await sendSimulatorSessionEmailNotifications(createEnv(), createDbMock({}), 42, {
      reason: 'canceled',
      empresaId: 7,
    });

    expect(results).toHaveLength(3);
    expect(results.every((item) => item.status === 'sent')).toBe(true);
    const payloads = fetchMock.mock.calls.map((call) =>
      JSON.parse(String((call[1] as RequestInit | undefined)?.body)),
    );
    const apoioPayload = payloads.find((payload) => payload.to[0].email === 'apoio@example.com');
    expect(apoioPayload?.subject).toContain('cancelada');
    expect(apoioPayload?.textContent).toContain('A sessão abaixo foi cancelada:');
    expect(apoioPayload?.textContent).not.toContain('Acesso seguro');
    expect(apoioPayload?.textContent).not.toMatch(/realizar[aá] treinamento|avalia[cç][aã]o/i);
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
