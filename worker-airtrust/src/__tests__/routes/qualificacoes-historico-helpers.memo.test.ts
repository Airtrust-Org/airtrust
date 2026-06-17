import { describe, expect, it, vi } from 'vitest';
import { ensureModelosAeronaveModeloColumn } from '../../routes/qualificacoes/historico-helpers';

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
});
