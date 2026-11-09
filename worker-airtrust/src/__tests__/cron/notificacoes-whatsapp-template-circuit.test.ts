/**
 * P13-05: template de WhatsApp nao sincronizado/aprovado gerava uma linha de erro
 * por qualificacao a cada ciclo (168 mil em 6 meses). Com o disjuntor por ciclo,
 * so a primeira falha de cada template e gravada; as demais sao puladas.
 */
import { describe, expect, it, vi } from 'vitest';
import { processarNotificacoes } from '../../cron/notificacoes';
import type { Env } from '../../types';

function qualificacao(id: number) {
  return {
    id,
    funcionario_id: 100 + id,
    funcionario_cpf: `000.000.000-0${id}`,
    funcionario_nome: `Funcionario ${id}`,
    funcionario_email: '',
    funcionario_telefone: `+5511999990${id}00`,
    qualificacao_codigo: 'CMA',
    qualificacao_nome: 'CMA Inicial',
    categoria: 'CMA',
    data_vencimento: '2099-12-31',
  };
}

function createEnv(total: number) {
  const inserts: unknown[][] = [];
  const db = {
    prepare: vi.fn((query: string) => {
      const executeAll = async () => {
        if (query.includes('FROM notificacoes_config')) {
          return {
            results: [
              {
                id: 10,
                tipo: 'WHATSAPP',
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
          return { results: [{ id: 7, codigo: 'TENANT-7', nome: 'Empresa 7' }] };
        }
        if (query.includes('FROM qualificacoes_historico qh')) {
          return { results: Array.from({ length: total }, (_, i) => qualificacao(i + 1)) };
        }
        return { results: [] };
      };
      const executeRun = async (args: unknown[]) => {
        if (query.includes('INSERT INTO notificacoes_log')) inserts.push(args);
        return { meta: { changes: 1 } };
      };
      const executeFirst = async () => null; // nenhum template local sincronizado
      return {
        all: executeAll,
        run: () => executeRun([]),
        first: executeFirst,
        bind: (...args: unknown[]) => ({
          all: executeAll,
          run: () => executeRun(args),
          first: executeFirst,
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
  return { env, inserts };
}

describe('P13-05 disjuntor do template WhatsApp por ciclo', () => {
  it('grava um unico erro para N qualificacoes que usam o mesmo template quebrado', async () => {
    const { env, inserts } = createEnv(6);
    const summary = await processarNotificacoes(env);

    expect(summary.enviadas).toBe(0);
    expect(inserts).toHaveLength(1);
    // empresa_id, config_id, qualificacao_historico_id, cpf, tipo, mensagem de erro
    expect(inserts[0][0]).toBe(7);
    expect(inserts[0][1]).toBe(10);
    expect(inserts[0][5]).toBe('WHATSAPP_TEMPLATE_NOT_SYNCED');
  });

  it('as qualificacoes puladas continuam contadas como nao enviadas', async () => {
    const { env } = createEnv(4);
    const summary = await processarNotificacoes(env);
    expect(summary.enviadas).toBe(0);
    expect(summary.erros).toBeGreaterThanOrEqual(4);
  });
});
