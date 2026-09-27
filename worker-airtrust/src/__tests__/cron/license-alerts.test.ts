import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Env } from '../../types';

vi.mock('../../services/setores-gestores', () => ({
  getSetorGestoresBySetor: vi.fn(),
}));

import { processLicenseAlerts } from '../../cron/license-alerts';
import { getSetorGestoresBySetor } from '../../services/setores-gestores';

function isoDateIn(days: number): string {
  const date = new Date();
  date.setUTCHours(0, 0, 0, 0);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function settings(overrides: Record<string, unknown> = {}) {
  return JSON.stringify({
    system_settings: {
      moduleAlertSettings: {
        licenses: {
          enabled: true,
          thresholds: [45, 30, 15, 7],
          expired_frequency: 'DAILY',
          expired_interval_days: 1,
          subject_template: 'Licença {{licenca}} vence em {{dias}} dias',
          message_template: '{{funcionario}}: {{licenca}} vence em {{data_vencimento}}.',
          expired_subject_template:
            'URGENTE: {{licenca}} vencida há {{dias_vencida}} {{unidade_dias_vencida}}',
          expired_message_template:
            '{{funcionario}}: {{licenca}} está vencida há {{dias_vencida}} {{unidade_dias_vencida}}.',
          ...overrides,
        },
      },
    },
  });
}

function createDb(options: {
  days: number;
  alreadySent?: boolean;
  policy?: Record<string, unknown>;
}) {
  const inserts: Array<{ query: string; args: unknown[] }> = [];
  const binds: Array<{ query: string; args: unknown[] }> = [];
  const db = {
    prepare: vi.fn((query: string) => {
      const executeAll = async (args: unknown[]) => {
        binds.push({ query, args });
        if (query.includes('SELECT id FROM empresas')) return { results: [{ id: 6 }] };
        if (query.includes('FROM licencas l')) {
          return {
            results: [
              {
                id: 501,
                funcionario_id: 77,
                funcionario_cpf: '00000000000',
                funcionario_nome: 'Funcionario Teste',
                funcionario_email: 'funcionario@example.com',
                setor_id: 12,
                tipo: 'CHT',
                numero: 'ABC123',
                data_vencimento: isoDateIn(options.days),
                dias: options.days,
              },
            ],
          };
        }
        return { results: [] };
      };
      const executeFirst = async (args: unknown[]) => {
        binds.push({ query, args });
        if (query.includes('SELECT cores_tema FROM empresas_config')) {
          return { cores_tema: settings(options.policy) };
        }
        if (query.includes('SELECT 1 AS ok FROM notificacoes_log')) {
          return options.alreadySent ? { ok: 1 } : null;
        }
        return null;
      };
      const executeRun = async (args: unknown[]) => {
        binds.push({ query, args });
        if (query.includes('INSERT INTO notificacoes_log')) inserts.push({ query, args });
        return { meta: { changes: 1 } };
      };
      return {
        all: async () => executeAll([]),
        first: async () => executeFirst([]),
        run: async () => executeRun([]),
        bind: (...args: unknown[]) => ({
          all: async () => executeAll(args),
          first: async () => executeFirst(args),
          run: async () => executeRun(args),
        }),
      };
    }),
  } as unknown as D1Database;
  return { db, inserts, binds };
}

function env(db: D1Database): Env {
  return {
    DB: db,
    BUCKET: {} as R2Bucket,
    JWT_SECRET: 'test',
    ENVIRONMENT: 'staging',
    DEBUG: 'false',
    LOG_LEVEL: 'error',
    API_URL: 'http://localhost:8787',
    FRONTEND_URL: 'http://localhost:3000',
    BREVO_API_KEY: 'test-key',
    BREVO_FROM_EMAIL: 'no-reply@example.com',
  } as Env;
}

function mockEmailSuccess() {
  const fetchMock = vi.fn().mockResolvedValue({ ok: true, status: 201, text: async () => '' });
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

describe('license alerts', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('envia marco de 45 dias ao funcionario e ao gestor do setor', async () => {
    const { db, inserts } = createDb({ days: 45 });
    vi.mocked(getSetorGestoresBySetor).mockResolvedValue([
      { gestor_email: 'GESTOR@example.com' },
    ] as never);
    const fetchMock = mockEmailSuccess();

    const result = await processLicenseAlerts(env(db));

    expect(result).toEqual({ avaliadas: 1, enviadas: 1, erros: 0 });
    const request = fetchMock.mock.calls[0]?.[1] as RequestInit;
    const body = JSON.parse(String(request.body)) as {
      to: Array<{ email: string }>;
      subject: string;
    };
    expect(body.to).toEqual([
      { email: 'funcionario@example.com' },
      { email: 'gestor@example.com' },
    ]);
    expect(body.subject).toContain('vence em 45 dias');
    expect(inserts[0]?.args[3]).toBe('[LICENCA:501:45]');
  });

  it('envia licença vencida com mensagem explícita e deduplicação diária', async () => {
    const { db, binds } = createDb({ days: -3 });
    vi.mocked(getSetorGestoresBySetor).mockResolvedValue([] as never);
    const fetchMock = mockEmailSuccess();

    const result = await processLicenseAlerts(env(db));

    expect(result.enviadas).toBe(1);
    const request = fetchMock.mock.calls[0]?.[1] as RequestInit;
    const body = JSON.parse(String(request.body)) as { subject: string; textContent: string };
    expect(body.subject).toContain('vencida há 3 dias');
    expect(body.textContent).toContain('está vencida há 3 dias');
    expect(binds.some(({ query }) => query.includes("date(enviado_em) = date('now')"))).toBe(true);
  });

  it('não repete o mesmo estágio já entregue', async () => {
    const { db } = createDb({ days: 30, alreadySent: true });
    vi.mocked(getSetorGestoresBySetor).mockResolvedValue([] as never);
    const fetchMock = mockEmailSuccess();

    const result = await processLicenseAlerts(env(db));

    expect(result.enviadas).toBe(0);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('respeita a régua configurada pela empresa', async () => {
    const { db } = createDb({ days: 20, policy: { thresholds: [60, 20, 5] } });
    vi.mocked(getSetorGestoresBySetor).mockResolvedValue([] as never);
    const fetchMock = mockEmailSuccess();

    const result = await processLicenseAlerts(env(db));

    expect(result.enviadas).toBe(1);
    const request = fetchMock.mock.calls[0]?.[1] as RequestInit;
    const body = JSON.parse(String(request.body)) as { subject: string };
    expect(body.subject).toContain('vence em 20 dias');
  });
});
