import { describe, expect, it, vi } from 'vitest';
import {
  AnacRabSyncError,
  syncAnacRabPublicData,
} from '../../services/anac/rab-public-sync';

type FakeState = {
  active_snapshot_hash: string | null;
  active_snapshot_key: string | null;
  source_etag: string | null;
  source_last_modified: string | null;
  last_record_count: number | null;
  consecutive_failures: number | null;
} | null;

type FleetRow = {
  id: number;
  empresa_id: number;
  prefixo: string | null;
  modelo: string | null;
  ano_fabricacao: number | null;
};

type Trace = { sql: string; binds: unknown[]; method: string };

function createDb(state: FakeState, fleet: FleetRow[]) {
  const trace: Trace[] = [];

  const db = {
    prepare(sql: string) {
      let binds: unknown[] = [];
      const statement = {
        sql,
        get binds() {
          return binds;
        },
        bind(...values: unknown[]) {
          binds = values;
          return statement;
        },
        async first<T>() {
          trace.push({ sql, binds: [...binds], method: 'first' });
          if (sql.includes('FROM anac_public_sync_state')) return state as T | null;
          return null;
        },
        async all<T>() {
          trace.push({ sql, binds: [...binds], method: 'all' });
          if (sql.includes('FROM aeronaves')) return { results: fleet as T[] };
          return { results: [] as T[] };
        },
        async run() {
          trace.push({ sql, binds: [...binds], method: 'run' });
          return { success: true, meta: {} };
        },
      };
      return statement;
    },
    async batch(statements: Array<{ run: () => Promise<unknown> }>) {
      for (const statement of statements) await statement.run();
      return [];
    },
  } as unknown as D1Database;

  return { db, trace };
}

function createBucket() {
  const puts: Array<{ key: string; value: string }> = [];
  const bucket = {
    async put(key: string, value: string | ArrayBuffer | ReadableStream) {
      puts.push({ key, value: String(value) });
      return {};
    },
  } as unknown as R2Bucket;
  return { bucket, puts };
}

function registrationFor(index: number): string {
  const a = String.fromCharCode(65 + Math.floor(index / (26 * 26)) % 26);
  const b = String.fromCharCode(65 + Math.floor(index / 26) % 26);
  const c = String.fromCharCode(65 + (index % 26));
  return `PR-${a}${b}${c}`;
}

function rabRows(count = 120) {
  return Array.from({ length: count }, (_, index) => ({
    MARCAS: index === 0 ? 'PR-TST' : registrationFor(index),
    MODELO: index === 0 ? 'AW139' : `MODEL-${index}`,
    'NOME FABRICANTE': index === 0 ? 'LEONARDO S.P.A.' : 'SYNTHETIC',
    'NÚM. SÉRIE': `SER-${index}`,
    'ANO FAB': index === 0 ? 2020 : 2010,
    'CD_INTERDICAO': 'N',
    CPF_CNPJ: `sensitive-${index}`,
    PROPRIETARIO: `owner-${index}`,
    OPERADOR: `operator-${index}`,
  }));
}

async function hashBody(body: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(body));
  return Array.from(new Uint8Array(digest))
    .map((value) => value.toString(16).padStart(2, '0'))
    .join('');
}

const fixedNow = () => new Date('2026-08-28T12:00:00.000Z');

describe('ANAC RAB public sync', () => {
  it('promotes a validated payload and persists only a minimized fleet snapshot', async () => {
    const { db, trace } = createDb(null, [
      { id: 44, empresa_id: 6, prefixo: 'PR-TST', modelo: 'AW139', ano_fabricacao: 2020 },
    ]);
    const { bucket, puts } = createBucket();
    const body = JSON.stringify(rabRows());
    const fetchImpl = vi.fn(async () =>
      new Response(body, {
        status: 200,
        headers: {
          'content-type': 'application/json',
          etag: '"rab-v1"',
          'last-modified': 'Fri, 28 Aug 2026 10:00:00 GMT',
        },
      }),
    ) as unknown as typeof fetch;

    const result = await syncAnacRabPublicData(
      { DB: db, BUCKET: bucket },
      { fetchImpl, now: fixedNow },
    );

    expect(result).toMatchObject({
      outcome: 'PROMOTED',
      recordCount: 120,
      rejectedCount: 0,
      fleetAircraftCount: 1,
    });
    expect(puts).toHaveLength(1);
    expect(puts[0].key).toMatch(/^regulatory\/anac\/public\/rab\/2026\/08\/[a-f0-9]{64}\.min\.json$/);
    expect(puts[0].value).toContain('PR-TST');
    expect(puts[0].value).toContain('AW139');
    expect(puts[0].value).not.toContain('sensitive-0');
    expect(puts[0].value).not.toContain('owner-0');
    expect(puts[0].value).not.toContain('operator-0');
    expect(trace.some((entry) => entry.sql.includes('INSERT INTO anac_rab_aircraft_cache'))).toBe(true);
    expect(trace.some((entry) => entry.sql.includes('INSERT INTO anac_public_sync_state'))).toBe(true);
  });

  it('uses conditional request metadata and keeps the active version on HTTP 304', async () => {
    const state = {
      active_snapshot_hash: 'abc123',
      active_snapshot_key: 'regulatory/anac/public/rab/2026/08/abc123.min.json',
      source_etag: '"rab-v1"',
      source_last_modified: 'Fri, 28 Aug 2026 10:00:00 GMT',
      last_record_count: 120,
      consecutive_failures: 0,
    };
    const { db } = createDb(state, []);
    const { bucket, puts } = createBucket();
    const fetchImpl = vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
      const headers = new Headers(init?.headers);
      expect(headers.get('If-None-Match')).toBe('"rab-v1"');
      expect(headers.get('If-Modified-Since')).toBe('Fri, 28 Aug 2026 10:00:00 GMT');
      return new Response(null, { status: 304, headers: { etag: '"rab-v1"' } });
    }) as unknown as typeof fetch;

    const result = await syncAnacRabPublicData(
      { DB: db, BUCKET: bucket },
      { fetchImpl, now: fixedNow },
    );

    expect(result).toMatchObject({
      outcome: 'NOT_MODIFIED',
      snapshotHash: 'abc123',
      recordCount: 120,
    });
    expect(puts).toHaveLength(0);
  });

  it('does not parse or persist another snapshot when content hash is unchanged', async () => {
    const body = JSON.stringify(rabRows());
    const hash = await hashBody(body);
    const state = {
      active_snapshot_hash: hash,
      active_snapshot_key: `regulatory/anac/public/rab/2026/08/${hash}.min.json`,
      source_etag: null,
      source_last_modified: null,
      last_record_count: 120,
      consecutive_failures: 0,
    };
    const { db } = createDb(state, []);
    const { bucket, puts } = createBucket();
    const fetchImpl = vi.fn(async () => new Response(body, { status: 200 })) as unknown as typeof fetch;

    const result = await syncAnacRabPublicData(
      { DB: db, BUCKET: bucket },
      { fetchImpl, now: fixedNow },
    );

    expect(result.outcome).toBe('UNCHANGED');
    expect(result.snapshotHash).toBe(hash);
    expect(puts).toHaveLength(0);
  });

  it('rejects an implausibly small upstream payload and preserves the previous active snapshot', async () => {
    const state = {
      active_snapshot_hash: 'previous-hash',
      active_snapshot_key: 'regulatory/anac/public/rab/2026/07/previous-hash.min.json',
      source_etag: null,
      source_last_modified: null,
      last_record_count: 120,
      consecutive_failures: 0,
    };
    const { db, trace } = createDb(state, []);
    const { bucket, puts } = createBucket();
    const fetchImpl = vi.fn(async () =>
      new Response(JSON.stringify(rabRows(10)), { status: 200 }),
    ) as unknown as typeof fetch;

    await expect(
      syncAnacRabPublicData({ DB: db, BUCKET: bucket }, { fetchImpl, now: fixedNow }),
    ).rejects.toEqual(expect.objectContaining<Partial<AnacRabSyncError>>({ code: 'TOO_FEW_RECORDS' }));

    expect(puts).toHaveLength(0);
    expect(
      trace.some(
        (entry) =>
          entry.sql.includes('INSERT INTO anac_public_sync_state') &&
          entry.binds.includes('TOO_FEW_RECORDS'),
      ),
    ).toBe(true);
    expect(
      trace.some(
        (entry) =>
          entry.sql.includes('INSERT INTO anac_rab_aircraft_cache') ||
          entry.sql.includes('active_snapshot_hash = excluded.active_snapshot_hash'),
      ),
    ).toBe(false);
  });
});
