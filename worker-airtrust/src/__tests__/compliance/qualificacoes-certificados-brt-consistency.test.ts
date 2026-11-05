/**
 * Auditoria de Compliance (2ª rodada) — consistência de "hoje" entre Compliance, Qualificações e
 * validação pública de certificados.
 *
 * O Compliance passou a classificar vencimento pelo dia civil de America/Sao_Paulo (#1916), mas três
 * leituras de Qualificações/Certificados ainda comparavam com a data UTC. Entre 21h e 24h BRT a data
 * UTC já é a do dia seguinte, então um item que vence HOJE aparecia como VENCIDO nessas telas
 * enquanto o Compliance o mostrava como VENCENDO (dias=0). Cobertos aqui:
 *   - GET /api/qualificacoes/historico (status derivado da linha da lista);
 *   - GET /api/certificados/validacao/:hash (situacao_operacional_atual, página pública);
 *   - checkConflitos (aviso "já possui esta qualificação válida").
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Hono } from 'hono';
import type { Env } from '../../types';

const { histCacheMock, ensureHistoricoSchemaMock } = vi.hoisted(() => ({
  histCacheMock: {
    cache: null as null | { key: string; ts: number; data: Record<string, number> },
    inflight: new Map<string, Promise<Record<string, number>>>(),
  },
  ensureHistoricoSchemaMock: vi.fn(),
}));

vi.mock('../../middleware/auth', () => ({
  auth: () =>
    async (c: { set: (key: string, value: unknown) => void }, next: () => Promise<void>) => {
      c.set('userId', 101);
      c.set('userRole', 'GESTOR');
      c.set('funcionarioId', null);
      await next();
    },
}));
vi.mock('../../middleware/tenant', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../middleware/tenant')>();
  return { ...actual, getTenantContext: () => ({ empresaId: 6, role: 'manager' }) };
});
vi.mock('../../utils/auditoria', () => ({
  registrarAuditoria: vi.fn(),
  extrairUsuarioAuditoria: () => ({ usuario_id: 99, origem: 'test' }),
}));
vi.mock('../../routes/qualificacoes/historico-write', () => ({ default: new Hono() }));
vi.mock('../../middleware/employee-sector-access', () => ({
  getEmployeeSectorAccess: vi.fn(async () => ({ mode: 'all', setorIds: [], funcionarioId: null })),
  filterRequestedSetorIdsByAccess: (ids: number[]) => ids,
}));
vi.mock('../../services/qualificacoes/historico-helpers', async () => {
  const actual = await vi.importActual<typeof import('../../services/qualificacoes/historico-helpers')>(
    '../../services/qualificacoes/historico-helpers',
  );
  return { ...actual, histCache: histCacheMock, ensureHistoricoSchema: ensureHistoricoSchemaMock };
});

import historicoRouter from '../../routes/qualificacoes/historico';
import validacaoCertificadosRoutes from '../../routes/certificados/validacao';
import { checkConflitos } from '../../routes/qualificacoes/validacao';
import { generateCertificateValidationHash } from '../../utils/certificate-validation-hash';

/** Instante UTC → situação esperada para um item que vence em 2026-11-04 (dia civil BRT). */
const VENCE = '2026-11-04';
const INSTANTES = [
  { label: '20:59 BRT do dia do vencimento (23:59Z)', now: '2026-11-04T23:59:00Z', venceHoje: true },
  { label: '22:30 BRT do dia do vencimento (01:30Z, já é dia 05 em UTC)', now: '2026-11-05T01:30:00Z', venceHoje: true },
  { label: '23:59 BRT do dia do vencimento (02:59Z)', now: '2026-11-05T02:59:00Z', venceHoje: true },
  { label: '00:00 BRT do dia seguinte (03:00Z)', now: '2026-11-05T03:00:00Z', venceHoje: false },
] as const;

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  histCacheMock.cache = null;
  histCacheMock.inflight.clear();
  ensureHistoricoSchemaMock.mockResolvedValue(undefined);
});
afterEach(() => vi.useRealTimers());

function historicoDb() {
  const row = {
    id: 1,
    funcionario_id: 9,
    funcionario_nome: 'Tripulante Sintético',
    tipo_id: 5,
    tipo_nome: 'NR35',
    tipo_codigo: 'NR35',
    validade_meses: 12,
    data_realizacao: '2025-11-04',
    data_vencimento: VENCE,
    renovada: 0,
    tem_renovacao_posterior: 0,
    renovacao_de: null,
    qualificacao_status: 'CONCLUIDA',
  };
  const bind = (query: string) => ({
    first: async () => {
      if (query.includes('FROM empresas WHERE id')) return { operational_domain_rbac_enabled: 0 };
      if (query.includes('COUNT(*) as total') && !query.includes('SUM(CASE')) return { total: 1 };
      return null;
    },
    all: async () => {
      if (query.includes('PRAGMA table_info(qualificacoes_historico)')) return { results: [{ name: 'renovacao_de' }] };
      if (query.includes('PRAGMA table_info(modelos_aeronave)')) return { results: [{ name: 'modelo' }] };
      if (query.includes('LIMIT ? OFFSET ?')) return { results: [row] };
      return { results: [] };
    },
    run: async () => ({ meta: { changes: 0 } }),
  });
  return {
    prepare: (query: string) => ({
      bind: () => bind(query),
      first: () => bind(query).first(),
      all: () => bind(query).all(),
      run: () => bind(query).run(),
    }),
  } as unknown as D1Database;
}

describe('Histórico de Qualificações: status da linha usa o dia civil de São Paulo', () => {
  it.each(INSTANTES)('$label', async ({ now, venceHoje }) => {
    vi.setSystemTime(new Date(now));
    const app = new Hono<{ Bindings: Env }>();
    app.route('/historico', historicoRouter);
    const res = await app.request('/historico?stats=false&limit=10', undefined, { DB: historicoDb() } as Env);
    expect(res.status).toBe(200);
    const body = (await res.json()) as { data: Array<{ status: string }> };
    expect(body.data[0]?.status).toBe(venceHoje ? 'VENCENDO_30' : 'VENCIDA');
  });
});

async function certificateRow() {
  const hash = await generateCertificateValidationHash({
    funcionarioCpf: '123.456.789-01',
    qualificacaoCodigo: 'NR35',
    dataConclusao: '2025-11-04',
    numeroCertificado: 'CERT-BRT',
  });
  return {
    hash,
    row: {
      id: 21,
      r2_key: 'cert/CERT-BRT.pdf',
      created_at: '2025-11-04T12:00:00Z',
      numero_certificado: 'CERT-BRT',
      data_conclusao: '2025-11-04',
      data_vencimento: VENCE,
      validade_meses: 12,
      carga_horaria: 8,
      instrutor: 'Instrutor',
      tipo_treinamento: 'INICIAL',
      funcionario_nome: 'Tripulante Sintético',
      funcionario_cpf: '123.456.789-01',
      codigo_anac: 'ANAC000',
      qualificacao_nome: 'NR35',
      qualificacao_codigo: 'NR35',
      qualificacao_categoria: 'EAD',
      qualificacao_carga_padrao: 8,
      qualificacao_carga_inicial: 8,
      qualificacao_carga_recorrente: 8,
      qualificacao_validade: 12,
      vencimento_fim_mes: 0,
      empresa_nome: 'Empresa Sintética',
      validacao_hash: hash,
    },
  };
}

function certificateEnv(rows: Array<Record<string, unknown>>) {
  const db = {
    prepare(sql: string) {
      const run = async (args: unknown[] = []) => {
        if (sql.includes('PRAGMA table_info')) return { results: [{ name: 'validacao_hash' }] };
        if (sql.includes('validacao_hash = ?')) {
          return { results: rows.filter((r) => r.validacao_hash === String(args[0])) };
        }
        return { results: [] };
      };
      return { all: () => run(), bind: (...args: unknown[]) => ({ all: () => run(args) }) };
    },
  };
  return { DB: db, BUCKET: { head: async (k: string) => (k ? { key: k } : null) }, ENVIRONMENT: 'test' } as unknown as Env;
}

describe('Validação pública de certificado: validade vai até o fim do dia em São Paulo', () => {
  it.each(INSTANTES)('$label', async ({ now, venceHoje }) => {
    vi.setSystemTime(new Date(now));
    const { hash, row } = await certificateRow();
    const res = await validacaoCertificadosRoutes.request(`/${hash}`, {}, certificateEnv([row]));
    expect(res.status).toBe(200);
    const body = (await res.json()) as { valido: boolean; situacao_operacional_atual: string };
    expect(body.valido).toBe(true);
    expect(body.situacao_operacional_atual).toBe(venceHoje ? 'VALIDA' : 'VENCIDA');
  });
});

describe('checkConflitos: aviso de qualificação ainda válida', () => {
  function conflictDb(dataVencimento: string) {
    return {
      prepare: () => ({
        bind: () => ({
          first: async () => ({ id: 7, data_vencimento: dataVencimento }),
        }),
      }),
    } as unknown as D1Database;
  }

  it('às 22:30 BRT, vencimento amanhã (dia 05) ainda é "válida": avisa', async () => {
    vi.setSystemTime(new Date('2026-11-05T01:30:00Z')); // 22:30 BRT do dia 04
    const result = await checkConflitos(conflictDb('2026-11-05'), 1, 2);
    expect(result.avisos.join(' ')).toMatch(/já possui esta qualificação válida até 2026-11-05/);
  });

  it('vencimento no próprio dia não gera aviso de "válida" (regra `>` preservada)', async () => {
    vi.setSystemTime(new Date('2026-11-05T01:30:00Z'));
    const result = await checkConflitos(conflictDb('2026-11-04'), 1, 2);
    expect(result.avisos).toEqual([]);
  });
});
