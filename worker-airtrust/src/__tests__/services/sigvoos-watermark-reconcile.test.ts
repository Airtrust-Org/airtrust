import { createRequire } from 'node:module';
import { describe, expect, it } from 'vitest';
import {
  persistSigvoosSyncMetadata,
  shouldAdvanceSigvoosSyncProgress,
  type SigvoosSyncSummary,
} from '../../services/sigvoos-frms';

function summary(from: string, to: string, raw = 2): SigvoosSyncSummary {
  return {
    periodo: { from, to },
    resetExecutado: false,
    totalRegistrosBrutos: raw,
    totalRegistrosNormalizados: raw,
    totalDiasAgrupados: 1,
    totalImportacoes: 1,
    totalImportados: 1,
    totalSubstituidos: 0,
    totalIgnorados: 0,
    totalErros: 0,
    camposDetectados: [],
    exemplosNormalizados: [],
    exemplosBrutos: [],
    importacoes: [],
  };
}

describe('SIGVOOS historical reconciliation progress', () => {
  it('refuses invalid dates and never rewinds chronological progress', () => {
    expect(shouldAdvanceSigvoosSyncProgress('2026-11-02', '2026-10-31')).toBe(false);
    expect(shouldAdvanceSigvoosSyncProgress('2026-11-02', '2026-11-02')).toBe(true);
    expect(shouldAdvanceSigvoosSyncProgress('2026-11-02', '2026-11-03')).toBe(true);
    expect(shouldAdvanceSigvoosSyncProgress(null, '2026-11-02')).toBe(true);
    expect(() => shouldAdvanceSigvoosSyncProgress('2026-11-02', '2026-02-30'))
      .toThrow('SIGVOOS_INVALID_PROGRESS_DATE');
  });

  it('does not overwrite newer last_sync_to, period or counters after older recheck', async () => {
    const { DatabaseSync } = createRequire(import.meta.url)('node:sqlite');
    const sqlite = new DatabaseSync(':memory:');
    try {
      sqlite.exec(`CREATE TABLE integracoes_sigvoos_config (
        empresa_id INTEGER, chave TEXT, valor TEXT, created_at TEXT,
        updated_at TEXT, deleted_at TEXT
      )`);
      const db = {
        prepare(sql: string) {
          return {
            bind(...binds: unknown[]) {
              return {
                async all() {
                  return { results: sqlite.prepare(sql).all(...(binds as (string | number | null)[])) };
                },
                async run() {
                  const result = sqlite.prepare(sql).run(...(binds as (string | number | null)[]));
                  return { meta: { changes: result.changes } };
                },
              };
            },
          };
        },
      } as unknown as D1Database;
      await persistSigvoosSyncMetadata(db, 7, summary('2026-11-02', '2026-11-02', 8));
      await persistSigvoosSyncMetadata(db, 7, summary('2026-10-31', '2026-10-31', 1));
      function get(key: string) {
        return sqlite.prepare('SELECT valor FROM integracoes_sigvoos_config WHERE empresa_id = 7 AND chave = ?').get(key)?.valor;
      }
      expect(get('last_sync_to')).toBe('2026-11-02');
      expect(get('last_sync_from')).toBe('2026-11-02');
      expect(get('last_sync_total_raw')).toBe('8');
      await persistSigvoosSyncMetadata(db, 7, summary('2026-11-03', '2026-11-03', 12));
      expect(get('last_sync_to')).toBe('2026-11-03');
      expect(get('last_sync_total_raw')).toBe('12');
      expect(sqlite.prepare('SELECT COUNT(*) AS n FROM integracoes_sigvoos_config WHERE empresa_id = 7 AND chave = ?').get('last_sync_to')?.n).toBe(1);
    } finally {
      sqlite.close();
    }
  });
});
