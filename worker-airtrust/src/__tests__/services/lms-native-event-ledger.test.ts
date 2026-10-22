import { describe, expect, it } from 'vitest';
import {
  MAX_NATIVE_LEDGER_EVENTS,
  readNativeEventLedger,
} from '../../services/lms-native-event-ledger';

type Row = {
  event_id: string;
  sequencia: number;
  unidade_id: string;
  payload_sha256: string;
};

function ledgerDb(rows: Row[], options: { unavailablePage?: number; failQuery?: boolean } = {}) {
  const calls: Array<{ sql: string; params: unknown[] }> = [];
  const db = {
    prepare(sql: string) {
      if (options.failQuery || !sql.includes('ORDER BY sequencia ASC LIMIT 500')) {
        throw Error('UNBOUNDED_QUERY_OR_BAD_SHAPE');
      }
      return {
        bind(...params: unknown[]) {
          calls.push({ sql, params });
          return {
            async all() {
              if (options.unavailablePage === calls.length) {
                return { success: false, results: [] };
              }
              return {
                success: true,
                results: rows.filter((r) => r.sequencia > Number(params[1])).slice(0, 500),
              };
            },
          };
        },
      };
    },
  } as unknown as D1Database;
  return { db, calls };
}
const generate = (n: number) => Array.from({ length: n }, (_, i): Row => ({
  event_id: 'visit-' + (i + 1), sequencia: i + 1,
  unidade_id: 'intro', payload_sha256: 'a'.repeat(64),
}));

describe('Native event ledger — bounded keyset pagination without evidence loss', () => {
  it('reads 501 records in two bounded queries without losing resume sequence', async () => {
    const fixture = ledgerDb(generate(501));
    const actual = await readNativeEventLedger(fixture.db, 51);
    expect(actual).toHaveLength(501);
    expect(actual[500]).toMatchObject({ sequencia: 501, event_id: 'visit-501' });
    expect(fixture.calls.map((r) => r.params)).toEqual([[51, 0], [51, 500]]);
    expect(fixture.calls.every((r) => r.sql.includes('LIMIT 500'))).toBe(true);
  });

  it('accepts exactly 10000 immutable events and checks the final empty page', async () => {
    const f = ledgerDb(generate(MAX_NATIVE_LEDGER_EVENTS));
    expect(await readNativeEventLedger(f.db, 51)).toHaveLength(MAX_NATIVE_LEDGER_EVENTS);
    expect(f.calls).toHaveLength(21);
    expect(f.calls.at(-1)?.params).toEqual([51, 10000]);
  });

  it('refuses 10001 events instead of silently truncating the ledger', async () => {
    const f = ledgerDb(generate(MAX_NATIVE_LEDGER_EVENTS + 1));
    await expect(readNativeEventLedger(f.db, 51)).rejects.toMatchObject({
      code: 'NATIVE_LEDGER_CAP_EXCEEDED',
    });
  });

  it('refuses missing event sequence in the middle or across a page boundary', async () => {
    for (const events of [
      [{ ...generate(1)[0], sequencia: 2 }],
      generate(501).map((r) => r.sequencia === 501 ? { ...r, sequencia: 502 } : r),
    ]) {
      const f = ledgerDb(events);
      await expect(readNativeEventLedger(f.db, 51)).rejects.toMatchObject({
        code: 'NATIVE_LEDGER_SEQUENCE_INVALID',
      });
    }
  });

  it('refuses page read errors instead of returning incomplete history', async () => {
    const f = ledgerDb(generate(501), { unavailablePage: 2 });
    await expect(readNativeEventLedger(f.db, 51)).rejects.toMatchObject({
      code: 'NATIVE_LEDGER_READ_UNAVAILABLE',
    });
  });

  it('rejects invalid binding before touching the database', async () => {
    const f = ledgerDb([]);
    await expect(readNativeEventLedger(f.db, 0)).rejects.toMatchObject({
      code: 'NATIVE_LEDGER_INVALID_BINDING',
    });
    expect(f.calls).toHaveLength(0);
  });
});
