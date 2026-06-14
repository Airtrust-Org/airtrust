import { describe, expect, it, vi } from 'vitest';
import { BackupOrchestrator } from '../../services/backup/orchestrator';
import type { Env } from '../../types';

async function sha256Hex(content: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(content));
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

function bytesFromString(value: string): Uint8Array {
  return new TextEncoder().encode(value);
}

function createMockDb() {
  const state = {
    finalChecksum: '',
  };

  const db = {
    prepare: vi.fn((sql: string) => {
      const statement = {
        bind: vi.fn((...args: unknown[]) => {
          if (sql.includes('UPDATE backups_controle') && sql.includes('r2_checksum_sha256')) {
            state.finalChecksum = String(args[1] || '');
          }
          return statement;
        }),
        run: vi.fn(async () => ({ meta: { last_row_id: 1 } })),
        all: vi.fn(async () => ({ results: [] })),
        first: vi.fn(async () => null),
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

describe('BackupOrchestrator checksum integrity', () => {
  it('grava SHA-256 real do manifesto de artefatos no campo r2_checksum_sha256', async () => {
    const { db, state } = createMockDb();
    const r2 = createMockR2({
      'tenant-assets/logo.txt': 'demo asset',
    });
    const orchestrator = new BackupOrchestrator({
      DB: db,
      BUCKET: r2.bucket,
    } as Env);

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
    expect(manifest.artifacts.every((artifact) => /^sha256:[a-f0-9]{64}$/.test(artifact.sha256))).toBe(
      true,
    );
    expect(manifest.artifacts.every((artifact) => artifact.size >= 0 && artifact.key)).toBe(true);
    await expect(sha256Hex(manifestJson)).resolves.toBe(state.finalChecksum.replace('sha256:', ''));
  });
});
