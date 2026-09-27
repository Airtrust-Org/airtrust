import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Env } from '../../types';

vi.mock('../../services/setores-gestores', () => ({
  getSetorGestoresBySetor: vi.fn(),
}));

import { processarNotificacoes } from '../../cron/notificacoes';
import { getSetorGestoresBySetor } from '../../services/setores-gestores';

function isoDateIn(days: number): string {
  const date = new Date();
  date.setUTCHours(0, 0, 0, 0);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function createDb() {
  const insertedLogs: Array<{ query: string; args: unknown[] }> = [];
  const db = {
    prepare: vi.fn((query: string) => {
      const executeAll = async (args: unknown[]) => {
        if (query.includes('FROM notificacoes_config')) {
          return {
            results: [
              {
                id: 1,
                tipo: 'EMAIL',
                ativo: 1,
                dias_antes: 7,
                urgencia: 'critical',
                destinatarios: '["compliance@airtrust.com"]',
                template:
                  'Qualificacao {{qualificacao}} de {{funcionario}} vence em {{dias}} dias.',
              },
            ],
          };
        }
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
                data_vencimento: isoDateIn(2),
              },
            ],
          };
        }
        if (query.includes('SELECT qualificacao_historico_id')) return { results: [] };
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
  return { db, insertedLogs };
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

describe('cron notificacoes — destinatarios dinamicos', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('envia alerta critico ao funcionario e gestor, sem deixar destinatario fixo legado substitui-los', async () => {
    const { db, insertedLogs } = createDb();
    vi.mocked(getSetorGestoresBySetor).mockResolvedValue([
      { gestor_email: 'GESTOR.OPERACOES@example.com' },
      { gestor_email: 'gestor.operacoes@example.com' },
    ] as never);
    const fetchMock = mockBrevoSuccess();

    const summary = await processarNotificacoes(createEnv(db));

    expect(summary.enviadas).toBe(1);
    expect(getSetorGestoresBySetor).toHaveBeenCalledWith(db, 6, 12, true);
    const request = fetchMock.mock.calls[0]?.[1] as RequestInit;
    const payload = JSON.parse(String(request.body));
    expect(payload.to).toEqual([
      { email: 'funcionario@example.com' },
      { email: 'gestor.operacoes@example.com' },
    ]);
    expect(payload.to).not.toContainEqual({ email: 'compliance@airtrust.com' });
    expect(insertedLogs[0]?.args[5]).toBe('funcionario@example.com, gestor.operacoes@example.com');
  });

  it('mantem o envio ao funcionario quando a resolucao do gestor falha', async () => {
    const { db, insertedLogs } = createDb();
    vi.mocked(getSetorGestoresBySetor).mockRejectedValueOnce(new Error('manager lookup unavailable'));
    const fetchMock = mockBrevoSuccess();

    const summary = await processarNotificacoes(createEnv(db));

    expect(summary.enviadas).toBe(1);
    const request = fetchMock.mock.calls[0]?.[1] as RequestInit;
    const payload = JSON.parse(String(request.body));
    expect(payload.to).toEqual([{ email: 'funcionario@example.com' }]);
    expect(insertedLogs[0]?.args[5]).toBe('funcionario@example.com');
  });
});
