/**
 * P13-05 (review): o disjuntor por template so abre por NOT_APPROVED quando a
 * consulta de aprovacao ao provedor foi conclusiva. Timeout/503 e transitorio e
 * nao pode suprimir as demais notificacoes do ciclo.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

// Funcao simples (nao vi.fn): o vitest marca como erro do teste as promises
// rejeitadas que ficam registradas em mock.results, mesmo quando tratadas.
let approvalCalls = 0;
let approvalBehavior: (call: number) => Promise<{ status: string; rejection_reason: string }>;
vi.mock('../../utils/twilio-content', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../utils/twilio-content')>()),
  getTwilioWhatsAppApproval: async () => {
    approvalCalls += 1;
    return approvalBehavior(approvalCalls);
  },
}));

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
  const localTemplate = {
    template_key: 'cma_expiring',
    twilio_content_sid: 'HX0000000000000000000000000000000',
    approval_status: 'received',
    body_text: 'corpo',
  };
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
      const executeFirst = async () =>
        query.includes('FROM alertas_whatsapp_templates') ? localTemplate : null;
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

describe('P13-05 disjuntor por template nao aprovado', () => {
  beforeEach(() => {
    approvalCalls = 0;
  });

  it('provedor respondeu "pending": abre o disjuntor e grava um unico erro', async () => {
    approvalBehavior = async () => ({ status: 'pending', rejection_reason: '' });
    const { env, inserts } = createEnv(5);
    await processarNotificacoes(env);
    expect(approvalCalls).toBe(1);
    expect(inserts).toHaveLength(1);
    expect(inserts[0][5]).toBe('WHATSAPP_TEMPLATE_NOT_APPROVED');
  });

  it('timeout/503 na consulta de aprovacao nao abre o disjuntor: cada qualificacao tenta de novo', async () => {
    approvalBehavior = async () => {
      throw new Error('503 Service Unavailable');
    };
    const { env, inserts } = createEnv(4);
    await processarNotificacoes(env);
    expect(approvalCalls).toBe(4);
    expect(inserts).toHaveLength(4);
  });

  it('a falha transitoria so afeta quem falhou: se o provedor volta, o template aprova', async () => {
    approvalBehavior = async (call) => {
      if (call === 1) throw new Error('timeout');
      return { status: 'approved', rejection_reason: '' };
    };
    const { env, inserts } = createEnv(3);
    await processarNotificacoes(env);
    expect(approvalCalls).toBe(2);
    // 1a qualificacao falhou por NOT_APPROVED (transitorio); as demais passaram da etapa do template
    expect(inserts.filter((row) => row[5] === 'WHATSAPP_TEMPLATE_NOT_APPROVED')).toHaveLength(1);
  });
});
