import { describe, expect, it, vi } from 'vitest';
import { processarNotificacoes } from '../../cron/notificacoes';
import type { Env } from '../../types';

describe('cron notificacoes writer tenant isolation', () => {
  it('grava empresa_id em novos registros de notificacoes_log', async () => {
    const insertCalls: Array<{ query: string; args: unknown[] }> = [];
    const recentReads: Array<{ query: string; args: unknown[] }> = [];

    const db = {
      prepare: vi.fn((query: string) => {
        const executeAll = async (args: unknown[]) => {
          if (query.includes('FROM notificacoes_config')) {
            return {
              results: [
                {
                  id: 10,
                  tipo: 'DASHBOARD',
                  ativo: 1,
                  dias_antes: 50000,
                  urgencia: null,
                  destinatarios: null,
                  template: 'Qualificacao {{qualificacao}} para {{funcionario}}',
                },
              ],
            };
          }

          if (query.includes('FROM empresas')) {
            return {
              results: [{ id: 7, codigo: 'TENANT-7', nome: 'Empresa 7' }],
            };
          }

          if (query.includes('FROM qualificacoes_historico qh')) {
            return {
              results: [
                {
                  id: 55,
                  funcionario_id: 88,
                  funcionario_cpf: '123.456.789-00',
                  funcionario_nome: 'Funcionario Teste',
                  funcionario_email: '',
                  funcionario_telefone: '',
                  qualificacao_codigo: 'CMA',
                  qualificacao_nome: 'CMA Inicial',
                  categoria: 'CMA',
                  data_vencimento: '2099-12-31',
                },
              ],
            };
          }

          if (query.includes('SELECT qualificacao_historico_id')) {
            recentReads.push({ query, args });
            return { results: [] };
          }

          return { results: [], args };
        };

        const executeRun = async (args: unknown[]) => {
          if (query.includes('INSERT INTO notificacoes_log')) {
            insertCalls.push({ query, args });
          }

          return { meta: { changes: 1 } };
        };

        return {
          all: async () => executeAll([]),
          run: async () => executeRun([]),
          bind: (...args: unknown[]) => ({
            all: async () => executeAll(args),
            run: async () => executeRun(args),
          }),
        };
      }),
    } as unknown as D1Database;

    const env = {
      DB: db,
      BUCKET: {} as R2Bucket,
      JWT_SECRET: 'test',
      ENVIRONMENT: 'development',
      API_URL: 'http://localhost:8787',
      FRONTEND_URL: 'http://localhost:3000',
      DEBUG: 'false',
      LOG_LEVEL: 'info',
    } as Env;

    const summary = await processarNotificacoes(env);

    expect(summary.enviadas).toBe(1);
    expect(recentReads).toHaveLength(1);
    expect(recentReads[0]?.query).toContain('WHERE empresa_id = ?');
    expect(recentReads[0]?.args[0]).toBe(7);
    expect(recentReads[0]?.args[1]).toBe(10);
    expect(insertCalls).toHaveLength(1);
    expect(insertCalls[0]?.query).toContain('empresa_id');
    expect(insertCalls[0]?.args[0]).toBe(7);
    expect(insertCalls[0]?.args[1]).toBe(10);
    expect(insertCalls[0]?.args[2]).toBe(55);
  });
});
