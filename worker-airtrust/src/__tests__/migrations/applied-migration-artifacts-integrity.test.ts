import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const testDir = dirname(fileURLToPath(import.meta.url));
const workerRoot = join(testDir, '../../..');
const migrationsDir = join(workerRoot, 'migrations');
const require = createRequire(import.meta.url);
const { listNoGoMigrations } = require('../../../../scripts/migration-no-go-lib.mjs') as {
  listNoGoMigrations: (dir: string) => string[];
};

const APPLIED_IMMUTABLE_MIGRATIONS = [
  {
    file: '0436_simulador_sessao_notificacoes_log_metadata.sql',
    sha256: '747774b4ddbcc14b05450b91bb9495e79658f1d5014e207298941a83dbecf4bd',
  },
] as const;

function sha256Hex(content: string): string {
  return createHash('sha256').update(content).digest('hex');
}

describe('applied migration artifacts integrity', () => {
  it('keeps already-applied migration artifacts byte-stable inside the canonical repo path', () => {
    for (const migration of APPLIED_IMMUTABLE_MIGRATIONS) {
      const migrationPath = join(migrationsDir, migration.file);
      const sql = readFileSync(migrationPath, 'utf8');

      expect(migrationPath).toContain('/worker-airtrust/migrations/');
      expect(sha256Hex(sql)).toBe(migration.sha256);
      expect(sql).toContain('ALTER TABLE notificacoes_log ADD COLUMN updated_at TEXT;');
      expect(sql).toContain('CREATE UNIQUE INDEX IF NOT EXISTS idx_notificacoes_log_empresa_notification_key');
      expect(sql).not.toMatch(/\bwrangler\s+d1\b/i);
      expect(sql).not.toMatch(/\b--remote\b/i);
    }
  });

  it('would fail closed if the pinned artifact changed, without attempting any apply', () => {
    const migration = APPLIED_IMMUTABLE_MIGRATIONS[0];
    const sql = readFileSync(join(migrationsDir, migration.file), 'utf8');
    const mutatedSql = `${sql}\n-- mutation sentinel\n`;

    expect(sha256Hex(mutatedSql)).not.toBe(migration.sha256);
  });

  it('keeps 0432, 0433 and 0435 blocked for production execution while leaving 0436 mutable only by hash guard', () => {
    const blocked = listNoGoMigrations(migrationsDir);

    expect(blocked).toContain('0432_revisao_completa_codigos_manobras.sql');
    expect(blocked).toContain('0433_fix_loft_references.sql');
    expect(blocked).toContain('0435_fix_vencimento_fim_mes_lms.sql');
    expect(blocked).not.toContain('0436_simulador_sessao_notificacoes_log_metadata.sql');
  });
});
