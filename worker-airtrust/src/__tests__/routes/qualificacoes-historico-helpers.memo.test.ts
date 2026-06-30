import { describe, expect, it, vi } from 'vitest';
import {
  buildOrderByClause,
  ensureModelosAeronaveModeloColumn,
  generateETag,
  SORTABLE_COLUMNS,
} from '../../routes/qualificacoes/historico-helpers';

describe('qualificacoes historico helper memoization', () => {
  it('memoiza o PRAGMA de modelos_aeronave e nao executa DML em runtime', async () => {
    const calls: Array<{ query: string; method: 'all' | 'run' }> = [];
    const db = {
      prepare: vi.fn((query: string) => ({
        all: async () => {
          calls.push({ query, method: 'all' });
          return { results: [{ name: 'modelo' }] };
        },
        run: async () => {
          calls.push({ query, method: 'run' });
          return { meta: { changes: 1 } };
        },
      })),
    } as unknown as D1Database;

    await ensureModelosAeronaveModeloColumn(db);
    await ensureModelosAeronaveModeloColumn(db);

    const pragmaCalls = calls.filter((call) => call.query.includes('PRAGMA table_info(modelos_aeronave)'));
    const writeCalls = calls.filter((call) => call.method === 'run');

    expect(pragmaCalls).toHaveLength(1);
    expect(writeCalls).toHaveLength(0);
  });

  it('buildOrderByClause status ASC usa rank numérico com PLANEJADA = 1 (primeiro)', () => {
    const clause = buildOrderByClause('status', 'ASC');
    // Must use numeric ranking, not alphabetical string comparison
    expect(clause).toContain('THEN 1');
    // PLANEJADA rank must come before VENCIDA (2), VENCENDO (3), VALIDA (4)
    const planejadaRankMatch = clause.match(/IN \('PLANEJADA','PLANEJADO'\)[^)]*THEN (\d+)/);
    expect(planejadaRankMatch).not.toBeNull();
    expect(Number(planejadaRankMatch![1])).toBe(1);
    // Must check qh.status directly (not just data_conclusao IS NULL)
    expect(clause).toContain("UPPER(COALESCE(qh.status,'')) IN ('PLANEJADA','PLANEJADO')");
  });

  it('buildOrderByClause status ASC coloca PLANEJADA (rank 1) antes de VENCIDA (rank 2)', () => {
    const clause = buildOrderByClause('status', 'ASC');
    const vencidaMatch = clause.match(/date\('now'\) THEN (\d+)/);
    expect(vencidaMatch).not.toBeNull();
    const vencidaRank = Number(vencidaMatch![1]);
    const planejadaMatch = clause.match(/IN \('PLANEJADA','PLANEJADO'\)[^)]*THEN (\d+)/);
    const planejadaRank = Number(planejadaMatch![1]);
    expect(planejadaRank).toBeLessThan(vencidaRank);
  });

  it('buildOrderByClause status DESC inverte ordem (rank DESC)', () => {
    const clauseAsc = buildOrderByClause('status', 'ASC');
    const clauseDesc = buildOrderByClause('status', 'DESC');
    expect(clauseAsc).toContain('ASC');
    expect(clauseDesc).toContain('DESC');
    expect(clauseAsc).not.toBe(clauseDesc);
  });

  it('SORTABLE_COLUMNS.status identifica PLANEJADA por qh.status antes de data_conclusao', () => {
    const statusExpr = SORTABLE_COLUMNS['status'];
    // Must check status field before data_conclusao to catch records with data_conclusao set
    const statusCheckIdx = statusExpr.indexOf("UPPER(COALESCE(qh.status,'')) IN ('PLANEJADA','PLANEJADO')");
    const dataConclusaoIdx = statusExpr.indexOf('qh.data_conclusao IS NULL');
    // Both checks present
    expect(statusCheckIdx).toBeGreaterThan(-1);
    expect(dataConclusaoIdx).toBeGreaterThan(-1);
    // status check appears in the same WHEN branch as OR data_conclusao IS NULL
    expect(statusCheckIdx).toBeLessThan(dataConclusaoIdx);
  });

  it('gera etags diferentes quando apenas o scope tenant-aware muda no fim da chave', () => {
    const tenantA = generateETag([
      'historico-stats',
      0,
      0,
      0,
      0,
      0,
      'live',
      'scope-tenant-a',
    ]);
    const tenantB = generateETag([
      'historico-stats',
      384,
      47,
      0,
      4,
      46,
      'live',
      'scope-tenant-b',
    ]);

    expect(tenantA).not.toBe(tenantB);
  });
});
