import { describe, expect, it } from 'vitest';
import { buildSnapshot } from '../../services/training-compliance-snapshot-builder';

// #2078: rajadas de buildSnapshot (varios endpoints da tela de Compliance) nao podem
// multiplicar as leituras pesadas no D1. Coalescemos apenas leituras identicas EM VOO.
function countingDb() {
  const state = { statements: 0 };
  const stmt = () => {
    const s: any = {
      bind: () => s,
      all: async () => { state.statements++; await new Promise((r) => setTimeout(r, 15)); return { results: [] }; },
      first: async () => { state.statements++; await new Promise((r) => setTimeout(r, 15)); return null; },
      run: async () => { state.statements++; return { success: true, meta: {} }; },
      raw: async () => { state.statements++; await new Promise((r) => setTimeout(r, 15)); return []; },
    };
    return s;
  };
  const db: any = { prepare: () => stmt(), batch: async (l: any[]) => { state.statements += l.length; return l.map(() => ({ results: [] })); } };
  return { db: db as D1Database, state };
}
const ALL = { mode: 'all' } as any;

describe('buildSnapshot in-flight coalescing (#2078)', () => {
  it('N chamadas concorrentes do mesmo tenant leem o D1 uma unica vez', async () => {
    const single = countingDb();
    await buildSnapshot(single.db, 6, ALL);
    const base = single.state.statements;
    expect(base).toBeGreaterThan(0);

    const burst = countingDb();
    await Promise.all([1, 2, 3, 4, 5].map(() => buildSnapshot(burst.db, 6, ALL)));
    expect(burst.state.statements).toBe(base);
  });

  it('nao ha cache pos-conclusao: chamada posterior le o D1 novamente', async () => {
    const c = countingDb();
    await buildSnapshot(c.db, 6, ALL);
    const first = c.state.statements;
    await buildSnapshot(c.db, 6, ALL);
    expect(c.state.statements).toBeGreaterThan(first);
  });

  it('tenants diferentes nunca compartilham leitura em voo', async () => {
    const single = countingDb();
    await buildSnapshot(single.db, 6, ALL);
    const base = single.state.statements;
    const c = countingDb();
    await Promise.all([buildSnapshot(c.db, 6, ALL), buildSnapshot(c.db, 7, ALL)]);
    expect(c.state.statements).toBeGreaterThan(base);
  });

  it('falha compartilhada propaga a todos e libera a chave para nova tentativa', async () => {
    let fail = true;
    const db: any = { prepare: () => { const s: any = { bind: () => s, all: async () => { if (fail) throw new Error('D1 overloaded'); return { results: [] }; }, first: async () => null, raw: async () => [] }; return s; }, batch: async () => [] };
    const r = await Promise.allSettled([buildSnapshot(db, 6, ALL), buildSnapshot(db, 6, ALL)]);
    expect(r.every((x) => x.status === 'rejected')).toBe(true);
    fail = false;
    await expect(buildSnapshot(db, 6, ALL)).resolves.toBeDefined();
  });
});
