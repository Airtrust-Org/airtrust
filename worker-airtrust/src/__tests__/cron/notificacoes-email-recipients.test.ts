import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Env } from '../../types';

vi.mock('../../services/setores-gestores', () => ({
  getSetorGestoresBySetor: vi.fn(),
}));

import { processarNotificacoes } from '../../cron/notificacoes';
import { getSetorGestoresBySetor } from '../../services/setores-gestores';

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
}) {
  const insertedLogs: Array<{ query: string; args: unknown[] }> = [];
  const queries: string[] = [];
  const configs = options?.configs ?? [emailConfig(1, 7, 'critical')];
  const daysToExpiry = options?.daysToExpiry ?? 2;
  const previousLogs = options?.previousLogs ?? [];

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
                funcionario_email: 'funcionario@example.com',
                funcionario_telefone: '',
                funcionario_setor_id: 12,
                qualificacao_codigo: 'QUAL-OPERACIONAL',
                qualificacao_nome: 'Qualificacao Operacional',
                categoria: 'OPERACIONAL',
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

describe('cron notificacoes — destinatarios e marcos de vencimento', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('envia o marco de 45 dias ao funcionario e gestor do setor', async () => {
    const { db } = createDb({ daysToExpiry: 45, configs: [emailConfig(45, 45, 'low')] });
    vi.mocked(getSetorGestoresBySetor).mockResolvedValue([
      { gestor_email: 'GESTOR.OPERACOES@example.com' },
    ] as never);
    const fetchMock = mockBrevoSuccess();

    const summary = await processarNotificacoes(createEnv(db));

    expect(summary.enviadas).toBe(1);
    expect(recipientsFrom(fetchMock)).toEqual([
      { email: 'funcionario@example.com' },
      { email: 'gestor.operacoes@example.com' },
    ]);
  });

  it('envia o marco de entrada em vencimento aos 30 dias', async () => {
    const { db } = createDb({ daysToExpiry: 30, configs: [emailConfig(30, 30, 'medium')] });
    vi.mocked(getSetorGestoresBySetor).mockResolvedValue([
      { gestor_email: 'gestor.operacoes@example.com' },
    ] as never);
    const fetchMock = mockBrevoSuccess();

    const summary = await processarNotificacoes(createEnv(db));

    expect(summary.enviadas).toBe(1);
    expect(recipientsFrom(fetchMock)).toEqual([
      { email: 'funcionario@example.com' },
      { email: 'gestor.operacoes@example.com' },
    ]);
  });

  it('usa os dias configurados como faixas, sem depender de urgencia hardcoded', async () => {
    const stages = [
      emailConfig(60, 60, 'legacy-low'),
      emailConfig(30, 30, 'legacy-medium'),
      emailConfig(10, 10, 'legacy-high'),
      emailConfig(3, 3, 'legacy-critical'),
    ];
    const { db } = createDb({ daysToExpiry: 9, configs: stages });
    vi.mocked(getSetorGestoresBySetor).mockResolvedValue([] as never);
    const fetchMock = mockBrevoSuccess();

    const summary = await processarNotificacoes(createEnv(db));

    expect(summary.enviadas).toBe(1);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('destinatario fixo legado nao substitui funcionario e gestor', async () => {
    const { db, insertedLogs } = createDb();
    vi.mocked(getSetorGestoresBySetor).mockResolvedValue([
      { gestor_email: 'GESTOR.OPERACOES@example.com' },
      { gestor_email: 'gestor.operacoes@example.com' },
    ] as never);
    const fetchMock = mockBrevoSuccess();

    const summary = await processarNotificacoes(createEnv(db));

    expect(summary.enviadas).toBe(1);
    expect(recipientsFrom(fetchMock)).not.toContainEqual({ email: 'compliance@airtrust.com' });
    expect(insertedLogs[0]?.args[5]).toBe('funcionario@example.com, gestor.operacoes@example.com');
  });

  it('nao repete diariamente a mesma etapa se o funcionario ja recebeu', async () => {
    const { db } = createDb({
      daysToExpiry: 44,
      configs: [emailConfig(45, 45, 'low')],
      previousLogs: [
        {
          qualificacao_historico_id: 901,
          destinatario: 'funcionario@example.com, gestor@example.com',
        },
      ],
    });
    vi.mocked(getSetorGestoresBySetor).mockResolvedValue([] as never);
    const fetchMock = mockBrevoSuccess();

    const summary = await processarNotificacoes(createEnv(db));

    expect(summary.enviadas).toBe(0);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('reenvia uma etapa antiga que foi entregue apenas ao destinatario fixo legado', async () => {
    const { db } = createDb({
      previousLogs: [{ qualificacao_historico_id: 901, destinatario: 'compliance@airtrust.com' }],
    });
    vi.mocked(getSetorGestoresBySetor).mockResolvedValue([] as never);
    const fetchMock = mockBrevoSuccess();

    const summary = await processarNotificacoes(createEnv(db));

    expect(summary.enviadas).toBe(1);
    expect(recipientsFrom(fetchMock)).toEqual([{ email: 'funcionario@example.com' }]);
  });

  it('envia diariamente qualificacao vencida ao funcionario e gestor com mensagem explicita', async () => {
    const { db, queries } = createDb({ daysToExpiry: -3, configs: [expiredEmailConfig()] });
    vi.mocked(getSetorGestoresBySetor).mockResolvedValue([
      { gestor_email: 'gestor.operacoes@example.com' },
    ] as never);
    const fetchMock = mockBrevoSuccess();

    const summary = await processarNotificacoes(createEnv(db));

    expect(summary.enviadas).toBe(1);
    expect(recipientsFrom(fetchMock)).toEqual([
      { email: 'funcionario@example.com' },
      { email: 'gestor.operacoes@example.com' },
    ]);
    const body = requestBodyFrom(fetchMock);
    expect(body.subject).toBe('🚨 Qualificação vencida: Qualificacao Operacional — há 3 dias');
    expect(body.textContent).toContain('está vencida há 3 dias');
    expect(body.textContent).toContain('Regularize imediatamente.');
    expect(queries.some((query) => query.includes("date(enviado_em) = date('now')"))).toBe(true);
  });

  it('nao repete alerta de qualificacao vencida no mesmo dia', async () => {
    const { db } = createDb({
      daysToExpiry: -4,
      configs: [expiredEmailConfig()],
      previousLogs: [
        {
          qualificacao_historico_id: 901,
          destinatario: 'funcionario@example.com, gestor@example.com',
        },
      ],
    });
    vi.mocked(getSetorGestoresBySetor).mockResolvedValue([] as never);
    const fetchMock = mockBrevoSuccess();

    const summary = await processarNotificacoes(createEnv(db));

    expect(summary.enviadas).toBe(0);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('nao usa o estagio vencido antes da data de vencimento', async () => {
    const { db } = createDb({ daysToExpiry: 0, configs: [expiredEmailConfig()] });
    vi.mocked(getSetorGestoresBySetor).mockResolvedValue([] as never);
    const fetchMock = mockBrevoSuccess();

    const summary = await processarNotificacoes(createEnv(db));

    expect(summary.enviadas).toBe(0);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('mantem o envio ao funcionario quando a resolucao do gestor falha', async () => {
    const { db, insertedLogs } = createDb();
    vi.mocked(getSetorGestoresBySetor).mockRejectedValueOnce(
      new Error('manager lookup unavailable'),
    );
    const fetchMock = mockBrevoSuccess();

    const summary = await processarNotificacoes(createEnv(db));

    expect(summary.enviadas).toBe(1);
    expect(recipientsFrom(fetchMock)).toEqual([{ email: 'funcionario@example.com' }]);
    expect(insertedLogs[0]?.args[5]).toBe('funcionario@example.com');
  });
});
