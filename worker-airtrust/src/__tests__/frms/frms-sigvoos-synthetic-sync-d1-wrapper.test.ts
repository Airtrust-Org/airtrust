import { describe, expect, it, vi, beforeEach } from 'vitest';

const spawnSyncMock = vi.fn();
vi.mock('node:child_process', () => ({ spawnSync: (...args: unknown[]) => spawnSyncMock(...args) }));

function wranglerJsonResult(results: unknown[], meta: Record<string, unknown> = {}) {
  return {
    status: 0,
    stdout: JSON.stringify([{ results, meta, success: true }]),
    stderr: '',
  };
}

describe('frms-sigvoos-synthetic-sync D1 wrapper — .run() surfaces meta.changes (Gap 1 fix)', () => {
  beforeEach(() => {
    spawnSyncMock.mockReset();
  });

  it('run() returns { success, meta: { changes } } matching the real Cloudflare D1 binding shape', async () => {
    spawnSyncMock.mockReturnValue(wranglerJsonResult([], { changes: 1, last_row_id: 5 }));
    const { makeD1 } = await import('../../../../scripts/staging/frms-sigvoos-synthetic-sync.mjs');
    const db = makeD1('airtrust-db-staging-baseline-20260701');
    const result = await db.prepare('UPDATE x SET y = ? WHERE z = ?').bind(1, 2).run();
    expect(result.success).toBe(true);
    expect(result.meta.changes).toBe(1);
  });

  it('reproduces the original bug shape as a regression guard: meta must never be undefined', async () => {
    spawnSyncMock.mockReturnValue(wranglerJsonResult([], { changes: 0 }));
    const { makeD1 } = await import('../../../../scripts/staging/frms-sigvoos-synthetic-sync.mjs');
    const db = makeD1('airtrust-db-staging-baseline-20260701');
    const result = await db.prepare('UPDATE x SET y = ? WHERE z = ?').bind(1, 2).run();
    // Before the fix this was `{ success: true }` — .meta was undefined and
    // `(updated.meta.changes ?? 0) > 0` in upsertSigvoosConfigRaw threw
    // "Cannot read properties of undefined (reading 'changes')".
    expect(result.meta).toBeDefined();
    expect(typeof result.meta.changes).toBe('number');
  });

  it('run() without bind() also returns proper meta (the no-args prepare().run() path)', async () => {
    spawnSyncMock.mockReturnValue(wranglerJsonResult([], { changes: 1 }));
    const { makeD1 } = await import('../../../../scripts/staging/frms-sigvoos-synthetic-sync.mjs');
    const db = makeD1('airtrust-db-staging-baseline-20260701');
    const result = await db.prepare('DELETE FROM x').run();
    expect(result.success).toBe(true);
    expect(result.meta.changes).toBe(1);
  });

  it('a real error (non-zero wrangler exit) still propagates and is not masked', async () => {
    spawnSyncMock.mockReturnValue({ status: 1, stdout: '', stderr: 'real D1 failure' });
    const { makeD1 } = await import('../../../../scripts/staging/frms-sigvoos-synthetic-sync.mjs');
    const db = makeD1('airtrust-db-staging-baseline-20260701');
    await expect(db.prepare('UPDATE x SET y = 1').run()).rejects.toThrow(/D1 query failed/);
  });
});

describe('upsertSigvoosConfig — exercises the real production function against the fixed wrapper (Gap 1 completion)', () => {
  it('completes without throwing when the UPDATE affects zero rows (falls through to INSERT) — this is the exact call the original bug crashed on', async () => {
    // Every wrangler call (resolveSigvoosEmpresaId lookup, the UPDATE, the
    // INSERT) goes through the same fixed wrapper; all report changes:0/1
    // via proper meta, so `(updated.meta.changes ?? 0) > 0` never throws.
    spawnSyncMock.mockReturnValue(wranglerJsonResult([], { changes: 0 }));
    const { makeD1 } = await import('../../../../scripts/staging/frms-sigvoos-synthetic-sync.mjs');
    const { upsertSigvoosConfig } = await import('../../services/sigvoos-frms');
    const db = makeD1('airtrust-db-staging-baseline-20260701') as unknown as D1Database;
    await expect(
      upsertSigvoosConfig(db, 'last_sync_at', '2026-08-23T00:00:00Z', 999006),
    ).resolves.toBeUndefined();
    expect(spawnSyncMock).toHaveBeenCalled();
  });

  it('completes without throwing when the UPDATE affects an existing row (changes > 0, UPDATE-only path)', async () => {
    spawnSyncMock.mockReturnValue(wranglerJsonResult([], { changes: 1 }));
    const { makeD1 } = await import('../../../../scripts/staging/frms-sigvoos-synthetic-sync.mjs');
    const { upsertSigvoosConfig } = await import('../../services/sigvoos-frms');
    const db = makeD1('airtrust-db-staging-baseline-20260701') as unknown as D1Database;
    await expect(
      upsertSigvoosConfig(db, 'last_sync_at', '2026-08-23T00:00:00Z', 999006),
    ).resolves.toBeUndefined();
    expect(spawnSyncMock).toHaveBeenCalled();
  });
});
