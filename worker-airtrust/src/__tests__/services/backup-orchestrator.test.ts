import { afterEach, describe, expect, it, vi } from 'vitest';
import { BackupOrchestrator } from '../../services/backup/orchestrator';
import type { Env } from '../../types';

async function sha256Hex(content: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(content));
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

function bytesFromString(value: string): Uint8Array {
  return new TextEncoder().encode(value);
}

type MockDbOptions = {
  missingTable?: string;
};

function extractPragmaTable(sql: string): string | null {
  const match = sql.match(/^PRAGMA table_info\("([A-Za-z_][A-Za-z0-9_]*)"\)$/);
  return match?.[1] || null;
}

function createMockDb(options: MockDbOptions = {}) {
  const state = {
    finalChecksum: '',
    preparedSql: [] as string[],
    controlUuids: [] as string[],
    controlScopes: [] as string[],
    controlTriggeredBy: [] as string[],
    statusUpdates: [] as string[],
    latestAutomaticStatus: null as string | null,
  };
  const knownUuids = new Set<string>();

  const db = {
    prepare: vi.fn((sql: string) => {
      state.preparedSql.push(sql.replace(/\s+/g, ' ').trim());
      let bindings: unknown[] = [];

      const statement = {
        bind: vi.fn((...args: unknown[]) => {
          bindings = args;
          if (sql.includes('UPDATE backups_controle') && sql.includes('r2_checksum_sha256')) {
            state.finalChecksum = String(args[1] || '');
          }
          return statement;
        }),
        run: vi.fn(async () => {
          if (sql.includes('INSERT INTO backups_controle')) {
            const uuid = String(bindings[0] || '');
            if (knownUuids.has(uuid)) {
              throw new Error('UNIQUE constraint failed: backups_controle.uuid');
            }
            knownUuids.add(uuid);
            state.controlUuids.push(uuid);
            state.controlScopes.push(String(bindings[2] || ''));
            state.controlTriggeredBy.push(String(bindings[3] || ''));
            if (String(bindings[3] || '').startsWith('CRON_')) {
              state.latestAutomaticStatus = 'EM_PROGRESSO';
            }
            return { meta: { last_row_id: state.controlUuids.length } };
          }

          if (sql.includes('UPDATE backups_controle') && sql.includes('r2_checksum_sha256')) {
            const status = String(bindings[0] || '');
            state.statusUpdates.push(status);
            state.latestAutomaticStatus = status;
          } else if (sql.includes("SET status = 'FALHOU'")) {
            state.statusUpdates.push('FALHOU');
            state.latestAutomaticStatus = 'FALHOU';
          }

          return { meta: { last_row_id: 1 } };
        }),
        all: vi.fn(async () => {
          const table = extractPragmaTable(sql);
          if (table) {
            if (table === options.missingTable) return { results: [] };
            if (table === 'system_config') {
              return { results: [{ name: 'key' }, { name: 'value' }] };
            }
            return { results: [{ name: 'id' }, { name: 'deleted_at' }] };
          }

          return { results: [] };
        }),
        first: vi.fn(async () => {
          if (
            sql.includes('FROM backups_controle') &&
            sql.includes("date(created_at) = date('now')")
          ) {
            return state.latestAutomaticStatus ? { status: state.latestAutomaticStatus } : null;
          }
          return null;
        }),
      };
      return statement;
    }),
  } as unknown as D1Database;

  return { db, state };
}

function createMockR2(initialObjects: Record<string, string>) {
  const store = new Map<string, Uint8Array>();
  const uploaded = new Map<string, unknown>();

  for (const [key, value] of Object.entries(initialObjects)) {
    store.set(key, bytesFromString(value));
    uploaded.set(key, '2026-06-14T10:00:00.000Z');
  }

  const bucket = {
    put: vi.fn(async (key: string, value: string | ArrayBuffer | Uint8Array) => {
      const bytes =
        typeof value === 'string'
          ? bytesFromString(value)
          : value instanceof Uint8Array
            ? value
            : new Uint8Array(value);
      store.set(key, bytes);
      uploaded.set(key, new Date('2026-06-14T12:00:00.000Z'));
      return null;
    }),
    get: vi.fn(async (key: string) => {
      const bytes = store.get(key);
      if (!bytes) return null;

      return {
        key,
        size: bytes.byteLength,
        uploaded: uploaded.get(key),
        etag: `etag-${key}`,
        arrayBuffer: async () =>
          bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength),
      } as unknown as R2ObjectBody;
    }),
    list: vi.fn(async (options?: { prefix?: string }) => {
      const prefix = options?.prefix || '';
      const objects = [...store.entries()]
        .filter(([key]) => key.startsWith(prefix))
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([key, bytes]) => ({
          key,
          size: bytes.byteLength,
          uploaded: uploaded.get(key),
          etag: `etag-${key}`,
        }));

      return {
        objects,
        truncated: false,
        cursor: undefined,
        delimitedPrefixes: [],
      };
    }),
  } as unknown as R2Bucket;

  return {
    bucket,
    keys: () => [...store.keys()],
    text: (key: string) => new TextDecoder().decode(store.get(key)),
  };
}

function createOrchestrator(options: MockDbOptions = {}) {
  const { db, state } = createMockDb(options);
  const r2 = createMockR2({
    'tenant-assets/logo.txt': 'demo asset',
  });
  const orchestrator = new BackupOrchestrator({
    DB: db,
    BUCKET: r2.bucket,
  } as Env);

  return { orchestrator, state, r2 };
}

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe('BackupOrchestrator integrity', () => {
  it('grava SHA-256 real do manifesto de artefatos no campo r2_checksum_sha256', async () => {
    const { orchestrator, state, r2 } = createOrchestrator();

    await orchestrator.executarBackupManual({
      tipo: 'MODULAR',
      modulos: ['CONFIGURACOES'],
      triggered_by: 'UNIT_TEST',
    });

    expect(state.finalChecksum).toMatch(/^sha256:[a-f0-9]{64}$/);
    expect(state.finalChecksum).not.toContain('UNIT_TEST');

    const manifestKey = r2.keys().find((key) => key.endsWith('/checksum-manifest.json'));
    expect(manifestKey).toBeTruthy();

    const manifestJson = r2.text(manifestKey as string);
    const manifest = JSON.parse(manifestJson) as {
      artifacts: Array<{ key: string; size: number; sha256: string }>;
    };

    expect(manifest.artifacts.length).toBeGreaterThan(0);
    expect(
      manifest.artifacts.every((artifact) => /^sha256:[a-f0-9]{64}$/.test(artifact.sha256)),
    ).toBe(true);
    expect(manifest.artifacts.every((artifact) => artifact.size >= 0 && artifact.key)).toBe(true);
    await expect(sha256Hex(manifestJson)).resolves.toBe(state.finalChecksum.replace('sha256:', ''));
  });

  it('exporta tabelas sem deleted_at e filtra soft delete apenas quando a coluna existe', async () => {
    const { orchestrator, state } = createOrchestrator();

    await orchestrator.executarBackupManual({
      tipo: 'MODULAR',
      modulos: ['CONFIGURACOES'],
      triggered_by: 'UNIT_TEST',
    });

    expect(state.preparedSql).toContain('SELECT * FROM "system_config"');
    expect(state.preparedSql).not.toContain(
      'SELECT * FROM "system_config" WHERE "deleted_at" IS NULL',
    );
    expect(state.preparedSql).toContain('SELECT * FROM "funcoes" WHERE "deleted_at" IS NULL');
  });

  it('falha o backup e registra FALHOU quando uma tabela configurada está ausente', async () => {
    const { orchestrator, state } = createOrchestrator({ missingTable: 'system_config' });

    await expect(
      orchestrator.executarBackupManual({
        tipo: 'MODULAR',
        modulos: ['CONFIGURACOES'],
        triggered_by: 'UNIT_TEST',
      }),
    ).rejects.toThrow('Falha ao exportar tabela configurada system_config');

    expect(state.statusUpdates).toContain('FALHOU');
    expect(state.statusUpdates).not.toContain('CONCLUIDO');
    expect(state.finalChecksum).toBe('');
  });

  it('mantém uma única execução automática concluída por tipo e dia UTC', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-08-02T03:00:00.000Z'));
    const { orchestrator, state } = createOrchestrator();

    await orchestrator.executarBackupAutomatico('DIARIO');
    await orchestrator.executarBackupAutomatico('DIARIO');

    expect(state.controlUuids).toEqual(['cron-diario-2026-08-02']);
    expect(state.controlScopes).toEqual(['SYSTEM_GLOBAL']);
    expect(state.controlTriggeredBy).toEqual(['CRON_DIARIO']);
    expect(state.statusUpdates).toContain('CONCLUIDO');
  });
});
