import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildLedgerAppliedSql } from '../../../scripts/lib/migration-remote-apply.mjs';

const MIGRATIONS_DIR = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..', 'migrations');

describe('buildLedgerAppliedSql', () => {
  it('appends a well-formed ledger INSERT after the migration content', () => {
    const out = buildLedgerAppliedSql({ migrationSql: 'CREATE TABLE x(id INT);', migrationName: '0999_test.sql' });
    expect(out).toBe("CREATE TABLE x(id INT);\n\nINSERT INTO d1_migrations (name) VALUES ('0999_test.sql');\n");
  });

  it('rejects a migration name containing a single quote (SQL injection guard) rather than trying to escape it', () => {
    // The filename allowlist regex has no room for `'`, so this can never
    // reach the escaping branch — validation itself is the injection guard.
    expect(() => buildLedgerAppliedSql({ migrationSql: 'SELECT 1;', migrationName: "o'brien.sql" })).toThrow(/inválido/);
  });

  it('supports a custom migrations table name', () => {
    const out = buildLedgerAppliedSql({ migrationSql: 'SELECT 1;', migrationName: 'a.sql', migrationsTableName: 'custom_ledger' });
    expect(out).toContain('INSERT INTO custom_ledger (name)');
  });

  it('rejects empty migration SQL', () => {
    expect(() => buildLedgerAppliedSql({ migrationSql: '', migrationName: 'a.sql' })).toThrow(/vazio/);
    expect(() => buildLedgerAppliedSql({ migrationSql: '   \n\t  ', migrationName: 'a.sql' })).toThrow(/vazio/);
  });

  it('rejects a migration name that is not a bare .sql filename', () => {
    expect(() => buildLedgerAppliedSql({ migrationSql: 'SELECT 1;', migrationName: '../etc/passwd' })).toThrow(/inválido/);
    expect(() => buildLedgerAppliedSql({ migrationSql: 'SELECT 1;', migrationName: '0443.sh' })).toThrow(/inválido/);
    expect(() => buildLedgerAppliedSql({ migrationSql: 'SELECT 1;', migrationName: '' })).toThrow(/inválido/);
  });

  it('rejects an unsafe migrations table name', () => {
    expect(() => buildLedgerAppliedSql({ migrationSql: 'SELECT 1;', migrationName: 'a.sql', migrationsTableName: 'x; DROP TABLE y' })).toThrow(/inválido/);
  });

  it('trims trailing whitespace from the migration content before appending the INSERT', () => {
    const out = buildLedgerAppliedSql({ migrationSql: 'SELECT 1;\n\n\n  ', migrationName: 'a.sql' });
    expect(out.startsWith('SELECT 1;\n\nINSERT')).toBe(true);
  });

  it('produces a well-formed unit for the real 0443 migration file (parses cleanly with a real SQL splitter)', () => {
    const migrationSql = readFileSync(join(MIGRATIONS_DIR, '0443_simuladores_matriz_remediation_compensation.sql'), 'utf8');
    const combined = buildLedgerAppliedSql({ migrationSql, migrationName: '0443_simuladores_matriz_remediation_compensation.sql' });
    expect(combined.endsWith("INSERT INTO d1_migrations (name) VALUES ('0443_simuladores_matriz_remediation_compensation.sql');\n")).toBe(true);
    expect(combined.startsWith(migrationSql.slice(0, 40))).toBe(true);
  });
});
