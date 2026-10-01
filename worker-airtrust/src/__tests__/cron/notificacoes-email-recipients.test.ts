import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Env } from '../../types';

vi.mock('../../services/setores-gestores', () => ({
  getSetorGestoresBySetor: vi.fn(),
}));

import { processarNotificacoes } from '../../cron/notificacoes';
import { getSetorGestoresBySetor } from '../../services/setores-gestores';
import { TRAINING_ALERT_DELIVERY_PAUSED } from '../../services/training-alert-policy';

type Config = {
  id: number;
  tipo: string;
  ativo: number;
  dias_antes: number;
  urgencia: string | null;
  destinatarios: string | null;
  template: string;
  empresa_id: number | null;
  codigo: string | null;
  assunto_template: string | null;
  frequencia: string | null;
  intervalo_dias: number | null;
};

type PreviousLog = { qualificacao_historico_id: number; destinatario: string | null };

type QualificationOptions = {
  isCheck?: number;
  qualificationType?: string | null;
  category?: string;
  employeeEmail?: string;
  sectorId?: number | null;
};

function isoDateIn(days: number): string {
  const date = new Date();
  date.setUTCHours(0, 0, 0, 0);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function emailConfig(id: number, days: number, urgency: string): Config {
  return {
    id,
    tipo: 'EMAIL',
    ativo: 1,
    dias_antes: days,
    urgencia: urgency,
    destinatarios: '["compliance@airtrust.com"]',
    template: 'Qualificacao {{qualificacao}} de {{funcionario}} vence em {{dias}} dias.',
    empresa_id: null,
    codigo: `QUALIFICACAO_${days}D`,
    assunto_template: null,
    frequencia: 'ONCE',
    intervalo_dias: null,
  };
}

function expiredEmailConfig(id: number = 99): Config {
  return {
    id,
    tipo: 'EMAIL',
    ativo: 1,
    dias_antes: 0,
    urgencia: 'expired',
    destinatarios: null,
    template:
      'URGENTE: Qualificação {{qualificacao}} de {{funcionario}} está vencida há {{dias_vencida}} {{unidade_dias_vencida}}. Data de vencimento: {{data_vencimento}}. Regularize imediatamente.',
    empresa_id: null,
    codigo: 'QUALIFICACAO_VENCIDA',
    assunto_template:
      '🚨 Qualificação vencida: {{qualificacao}} — há {{dias_vencida}} {{unidade_dias_vencida}}',
    frequencia: 'DAILY',
    intervalo_dias: 1,
  };
}

function createDb(options?: {
  daysToExpiry?: number;
  configs?: Config[];
  previousLogs?: PreviousLog[];
  qualification?: QualificationOptions;
}) {
  const insertedLogs: Array<{ query: string; args: unknown[] }> = [];
  const queries: string[] = [];
  const configs = options?.configs ?? [emailConfig(1, 7, 'critical')];
  const daysToExpiry = options?.daysToExpiry ?? 2;
  const previousLogs = options?.previousLogs ?? [];
  const qualification = options?.qualification ?? {};

  const db = {
    prepare: vi.fn((query: string) => {
      queries.push(query);
      const executeAll = async (args: unknown[]) => {
        if (query.includes('FROM notificacoes_config')) return { results: configs };
        if (query.includes('FROM empresas')) {
          return { results: [{ id: 6, codigo: 'CDS', nome: 'Costa do Sol' }] };
        }
        if (query.includes('FROM qualificacoes_historico qh')) {
          return {
            results: [
              {
                id: 901,
                funcionario_id: 77,
                funcionario_cpf: '00000000000',
                funcionario_nome: 'Funcionario Teste',
                funcionario_email: qualification.employeeEmail ?? 'funcionario@example.com',
                funcionario_telefone: '',
                funcionario_setor_id: qualification.sectorId === undefined ? 12 : qualification.sectorId,
                qualificacao_codigo: 'QUAL-OPERACIONAL',
                qualificacao_nome: 'Qualificacao Operacional',
                qualificacao_tipo: qualification.qualificationType ?? 'TREINAMENTO',
                categoria: qualification.category ?? 'OPERACIONAL',
                is_check: qualification.isCheck ?? 0,
                data_vencimento: isoDateIn(daysToExpiry),
              },
            ],
          };
        }
        if (query.includes('SELECT qualificacao_historico_id, destinatario')) {
          return { results: previousLogs, args };
        }
        return { results: [], args };
      };
      const executeRun = async (args: unknown[]) => {
        if (query.includes('INSERT INTO notificacoes_log')) insertedLogs.push({ query, args });
        return { meta: { changes: 1 } };
      };
      return {
        all: async () => executeAll([]),
        first: async () => null,
        run: async () => executeRun([]),
        bind: (...args: unknown[]) => ({
          all: async () => executeAll(args),
          first: async () => null,
          run: async () => executeRun(args),
        }),
      };
    }),
  } as unknown as D1Database;
  return { db, insertedLogs, queries };
}

function createEnv(db: D1Database): Env {
  return {
    DB: db,
    BUCKET: {} as R2Bucket,
    JWT_SECRET: 'test',
    ENVIRONMENT: 'development',
    API_URL: 'http://localhost:8787',
    FRONTEND_URL: 'http://localhost:3000',
    DEBUG: 'false',
    LOG_LEVEL: 'info',
    BREVO_API_KEY: 'test-key',
  } as Env;
}

function mockBrevoSuccess() {
  const fetchMock = vi.fn().mockResolvedValue({ ok: true, status: 201, text: async () => '' });
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

function requestBodyFrom(fetchMock: ReturnType<typeof vi.fn>) {
  const request = fetchMock.mock.calls[0]?.[1] as RequestInit;
  return JSON.parse(String(request.body)) as {
    to: Array<{ email: string }>;
    subject: string;
    textContent: string;
  };
}

function recipientsFrom(fetchMock: ReturnType<typeof vi.fn>) {
  return requestBodyFrom(fetchMock).to;
}

function expectNoDeliveryWhilePaused(
  summary: { enviadas: number },
  fetchMock: ReturnType<typeof vi.fn>,
): boolean {
  if (!TRAINING_ALERT_DELIVERY_PAUSED) return false;
  expect(summary.enviadas).toBe(0);
  expect(fetchMock).not.toHaveBeenCalled();
  return true;
}

describe('cron notificacoes — destinatarios e marcos de vencimento', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('aos 45 dias envia CHECK somente aos gestores do setor', async () => {
    const { db, insertedLogs } = createDb({
      daysToExpiry: 45,
      configs: [emailConfig(45, 45, 'low')],
      qualification: { isCheck: 1 },
    });
    vi.mocked(getSetorGestoresBySetor).mockResolvedValue([
      { gestor_email: 'GESTOR.OPERACOES@example.com' },
    ] as never);
    const fetchMock = mockBrevoSuccess();

    const summary = await processarNotificacoes(createEnv(db));

    if (expectNoDeliveryWhilePaused(summary, fetchMock)) return;
    expect(summary.enviadas).toBe(1);
    expect(recipientsFrom(fetchMock)).toEqual([{ email: 'gestor.operacoes@example.com' }]);
    expect(insertedLogs[0]?.args[5]).toBe('gestor.operacoes@example.com');
    expect(getSetorGestoresBySetor).toHaveBeenCalledWith(db, 6, 12, true);
  });

  it('aos 45 dias não envia qualificação não-CHECK nem ao funcionário nem ao gestor', async () => {
    const { db } = createDb({ daysToExpiry: 45, configs: [emailConfig(45, 45, 'low')] });
    vi.mocked(getSetorGestoresBySetor).mockResolvedValue([
      { gestor_email: 'gestor.operacoes@example.com' },
    ] as never);
    const fetchMock = mockBrevoSuccess();

    const summary = await processarNotificacoes(createEnv(db));

    expect(summary.enviadas).toBe(0);
    expect(fetchMock).not.toHaveBeenCalled();
    expect(getSetorGestoresBySetor).not.toHaveBeenCalled();
  });

  it.each([
    [30, 'medium'],
    [15, 'high'],
    [7, 'critical'],
  ])('aos %i dias envia qualquer categoria somente ao próprio funcionário', async (days, urgency) => {
    const { db, insertedLogs } = createDb({
      daysToExpiry: days,
      configs: [emailConfig(days, days, urgency)],
    });
    vi.mocked(getSetorGestoresBySetor).mockResolvedValue([
      { gestor_email: 'gestor.operacoes@example.com' },
    ] as never);
    const fetchMock = mockBrevoSuccess();

    const summary = await processarNotificacoes(createEnv(db));

    if (expectNoDeliveryWhilePaused(summary, fetchMock)) return;
    expect(summary.enviadas).toBe(1);
    expect(recipientsFrom(fetchMock)).toEqual([{ email: 'funcionario@example.com' }]);
    expect(insertedLogs[0]?.args[5]).toBe('funcionario@example.com');
    expect(getSetorGestoresBySetor).not.toHaveBeenCalled();
  });

  it.each([
    [30, 'medium'],
    [15, 'high'],
    [7, 'critical'],
  ])('aos %i dias envia CHECK ao funcionário e aos gestores do setor', async (days, urgency) => {
    const { db } = createDb({
      daysToExpiry: days,
      configs: [emailConfig(days, days, urgency)],
      qualification: { isCheck: 1 },
    });
    vi.mocked(getSetorGestoresBySetor).mockResolvedValue([
      { gestor_email: 'GESTOR.OPERACOES@example.com' },
      { gestor_email: 'gestor.operacoes@example.com' },
    ] as never);
    const fetchMock = mockBrevoSuccess();

    const summary = await processarNotificacoes(createEnv(db));

    if (expectNoDeliveryWhilePaused(summary, fetchMock)) return;
    expect(summary.enviadas).toBe(1);
    expect(recipientsFrom(fetchMock)).toEqual([
      { email: 'funcionario@example.com' },
      { email: 'gestor.operacoes@example.com' },
    ]);
    expect(getSetorGestoresBySetor).toHaveBeenCalledWith(db, 6, 12, true);
  });

  it('reconhece CHECK também pelo tipo legado', async () => {
    const { db } = createDb({
      daysToExpiry: 45,
      configs: [emailConfig(45, 45, 'low')],
      qualification: { isCheck: 0, qualificationType: 'check' },
    });
    vi.mocked(getSetorGestoresBySetor).mockResolvedValue([
      { gestor_email: 'gestor.operacoes@example.com' },
    ] as never);
    const fetchMock = mockBrevoSuccess();

    const summary = await processarNotificacoes(createEnv(db));

    if (expectNoDeliveryWhilePaused(summary, fetchMock)) return;
    expect(recipientsFrom(fetchMock)).toEqual([{ email: 'gestor.operacoes@example.com' }]);
  });

  it('reconhece CHECK também pela categoria legada', async () => {
    const { db } = createDb({
      daysToExpiry: 45,
      configs: [emailConfig(45, 45, 'low')],
      qualification: { isCheck: 0, qualificationType: 'TREINAMENTO', category: ' CHECK ' },
    });
    vi.mocked(getSetorGestoresBySetor).mockResolvedValue([
      { gestor_email: 'gestor.operacoes@example.com' },
    ] as never);
    const fetchMock = mockBrevoSuccess();

    const summary = await processarNotificacoes(createEnv(db));

    if (expectNoDeliveryWhilePaused(summary, fetchMock)) return;
    expect(recipientsFrom(fetchMock)).toEqual([{ email: 'gestor.operacoes@example.com' }]);
  });

  it('não envia estágio fora da régua 45/30/15/7, mesmo se estiver configurado', async () => {
    const { db } = createDb({
      daysToExpiry: 10,
      configs: [emailConfig(10, 10, 'custom')],
      qualification: { isCheck: 1 },
    });
    vi.mocked(getSetorGestoresBySetor).mockResolvedValue([
      { gestor_email: 'gestor.operacoes@example.com' },
    ] as never);
    const fetchMock = mockBrevoSuccess();

    const summary = await processarNotificacoes(createEnv(db));

    expect(summary.enviadas).toBe(0);
    expect(fetchMock).not.toHaveBeenCalled();
    expect(getSetorGestoresBySetor).not.toHaveBeenCalled();
  });

  it('destinatário fixo legado não recebe qualificação fora da política', async () => {
    const { db } = createDb({ daysToExpiry: 45, configs: [emailConfig(45, 45, 'low')] });
    const fetchMock = mockBrevoSuccess();

    const summary = await processarNotificacoes(createEnv(db));

    expect(summary.enviadas).toBe(0);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('não repete etapa quando o destinatário previsto já recebeu', async () => {
    const { db } = createDb({
      daysToExpiry: 30,
      configs: [emailConfig(30, 30, 'medium')],
      previousLogs: [
        {
          qualificacao_historico_id: 901,
          destinatario: 'funcionario@example.com',
        },
      ],
    });
    const fetchMock = mockBrevoSuccess();

    const summary = await processarNotificacoes(createEnv(db));

    expect(summary.enviadas).toBe(0);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('em CHECK reenvia somente ao gestor que ainda não recebeu a etapa', async () => {
    const { db, insertedLogs } = createDb({
      daysToExpiry: 30,
      configs: [emailConfig(30, 30, 'medium')],
      qualification: { isCheck: 1 },
      previousLogs: [
        {
          qualificacao_historico_id: 901,
          destinatario: 'funcionario@example.com',
        },
      ],
    });
    vi.mocked(getSetorGestoresBySetor).mockResolvedValue([
      { gestor_email: 'gestor.operacoes@example.com' },
    ] as never);
    const fetchMock = mockBrevoSuccess();

    const summary = await processarNotificacoes(createEnv(db));

    if (expectNoDeliveryWhilePaused(summary, fetchMock)) return;
    expect(summary.enviadas).toBe(1);
    expect(recipientsFrom(fetchMock)).toEqual([{ email: 'gestor.operacoes@example.com' }]);
    expect(insertedLogs[0]?.args[5]).toBe('gestor.operacoes@example.com');
  });

  it('reenvia uma etapa válida que antes foi entregue apenas ao destinatário fixo legado', async () => {
    const { db } = createDb({
      previousLogs: [{ qualificacao_historico_id: 901, destinatario: 'compliance@airtrust.com' }],
    });
    const fetchMock = mockBrevoSuccess();

    const summary = await processarNotificacoes(createEnv(db));

    if (expectNoDeliveryWhilePaused(summary, fetchMock)) return;
    expect(summary.enviadas).toBe(1);
    expect(recipientsFrom(fetchMock)).toEqual([{ email: 'funcionario@example.com' }]);
  });

  it('envia qualificação vencida apenas uma vez mesmo se a configuração legada estiver DAILY', async () => {
    const { db, queries } = createDb({
      daysToExpiry: -3,
      configs: [expiredEmailConfig()],
      qualification: { isCheck: 1 },
    });
    vi.mocked(getSetorGestoresBySetor).mockResolvedValue([
      { gestor_email: 'gestor.operacoes@example.com' },
    ] as never);
    const fetchMock = mockBrevoSuccess();

    const summary = await processarNotificacoes(createEnv(db));

    if (expectNoDeliveryWhilePaused(summary, fetchMock)) return;
    expect(summary.enviadas).toBe(1);
    expect(recipientsFrom(fetchMock)).toEqual([{ email: 'funcionario@example.com' }]);
    expect(getSetorGestoresBySetor).not.toHaveBeenCalled();
    const body = requestBodyFrom(fetchMock);
    expect(body.subject).toBe('🚨 Qualificação vencida: Qualificacao Operacional — há 3 dias');
    expect(body.textContent).toContain('está vencida há 3 dias');
    expect(body.textContent).toContain('Regularize imediatamente.');
    expect(queries.some((query) => query.includes("date(enviado_em) = date('now')"))).toBe(false);
  });

  it('não repete alerta de qualificação vencida quando já houve entrega anterior', async () => {
    const { db } = createDb({
      daysToExpiry: -4,
      configs: [expiredEmailConfig()],
      previousLogs: [
        {
          qualificacao_historico_id: 901,
          destinatario: 'funcionario@example.com',
        },
      ],
    });
    const fetchMock = mockBrevoSuccess();

    const summary = await processarNotificacoes(createEnv(db));

    expect(summary.enviadas).toBe(0);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('não usa o estágio vencido antes da data de vencimento', async () => {
    const { db } = createDb({ daysToExpiry: 0, configs: [expiredEmailConfig()] });
    const fetchMock = mockBrevoSuccess();

    const summary = await processarNotificacoes(createEnv(db));

    expect(summary.enviadas).toBe(0);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('mantém envio ao funcionário de CHECK quando a resolução do gestor falha', async () => {
    const { db, insertedLogs } = createDb({
      daysToExpiry: 7,
      configs: [emailConfig(7, 7, 'critical')],
      qualification: { isCheck: 1 },
    });
    vi.mocked(getSetorGestoresBySetor).mockRejectedValueOnce(
      new Error('manager lookup unavailable'),
    );
    const fetchMock = mockBrevoSuccess();

    const summary = await processarNotificacoes(createEnv(db));

    if (expectNoDeliveryWhilePaused(summary, fetchMock)) return;
    expect(summary.enviadas).toBe(1);
    expect(recipientsFrom(fetchMock)).toEqual([{ email: 'funcionario@example.com' }]);
    expect(insertedLogs[0]?.args[5]).toBe('funcionario@example.com');
  });
});
