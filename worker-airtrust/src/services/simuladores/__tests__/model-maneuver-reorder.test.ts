import { describe, expect, it, vi } from 'vitest';
import { reorderModelManeuversAtomically } from '../model-maneuver-reorder';

function mockDb() {
  const writes: Array<{ query: string; params: unknown[] }> = [];
  const prepare = vi.fn((query: string) => ({
    bind: vi.fn((...params: unknown[]) => {
      const entry = { query, params };
      writes.push(entry);
      return entry;
    }),
  }));
  const batch = vi.fn(async () => []);
  return { db: { prepare, batch } as unknown as D1Database, prepare, batch, writes };
}

describe('model maneuver atomic reorder (PERF-05)', () => {
  it('batches 22 valid maneuvers into one D1 roundtrip, preserving position and model id', async () => {
    const { db, prepare, batch, writes } = mockDb();
    const maneuvers = Array.from({ length: 22 }, (_, i) => ({ id: i + 1, ordem: 22 - i }));
    const result = await reorderModelManeuversAtomically(db, 'modelo-123', maneuvers);
    expect(result).toBe(22);
    expect(prepare).toHaveBeenCalledTimes(22);
    expect(batch).toHaveBeenCalledTimes(1);
    expect(batch.mock.calls[0]?.[0]).toHaveLength(22);
    expect(writes[0]?.params).toEqual([22, 1, 'modelo-123']);
    expect(writes[21]?.params).toEqual([1, 22, 'modelo-123']);
    expect(writes.every((entry) => entry.query.includes('WHERE id = ? AND modelo_id = ? AND deleted_at IS NULL'))).toBe(true);
  });

  it('preserves skip-invalid behavior and avoids D1 batch if no valid elements', async () => {
    const { db, batch, writes } = mockDb();
    expect(await reorderModelManeuversAtomically(db, 'model', [null, {}, { id: 0, ordem: 1 }, { id: 3, ordem: 0 }, { id: 2.4, ordem: 3 }])).toBe(0);
    expect(batch).not.toHaveBeenCalled();
    expect(writes).toEqual([]);
  });

  it('keeps input order for duplicate IDs and only updates rows of the selected model', async () => {
    const { db, batch, writes } = mockDb();
    const count = await reorderModelManeuversAtomically(db, 'tenant-model-42', [
      { id: '4', ordem: '2' }, { id: '4', ordem: '3' }, { id: 2, ordem: 4 },
      { id: -1, ordem: 9 }, { id: 3, ordem: -1 },
    ]);
    expect(count).toBe(3);
    expect(batch).toHaveBeenCalledTimes(1);
    expect(writes.map((w) => w.params)).toEqual([[2, 4, 'tenant-model-42'], [3, 4, 'tenant-model-42'], [4, 2, 'tenant-model-42']]);
  });

  it('propagates a D1 batch failure for route 500, never silently audits success', async () => {
    const { db, batch } = mockDb();
    batch.mockRejectedValueOnce(new Error('D1_ERROR'));
    await expect(reorderModelManeuversAtomically(db, 'model', [{ id: 1, ordem: 2 }])).rejects.toThrow('D1_ERROR');
  });
});
