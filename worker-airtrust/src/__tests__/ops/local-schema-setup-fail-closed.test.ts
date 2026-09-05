import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../../../../');
const generalSetup = join(repositoryRoot, 'scripts', 'setup-local-db.sh');
const lmsSetup = join(repositoryRoot, 'scripts', 'setup-local-lms-smoke-db.sh');
const setupScripts = [generalSetup, lmsSetup];

function readScript(path: string): string {
  return readFileSync(path, 'utf8');
}

function functionBody(source: string, name: string): string {
  const match = source.match(new RegExp(`${name}\\(\\) \\{([\\s\\S]*?)\\n\\}`, 'm'));
  expect(match, `${name} must exist`).not.toBeNull();
  return match?.[1] ?? '';
}

describe('local D1 setup scripts', () => {
  it.each(setupScripts)('%s has valid bash syntax', (scriptPath) => {
    const result = spawnSync('bash', ['-n', scriptPath], { encoding: 'utf8' });
    expect(result.status, result.stderr).toBe(0);
  });

  it.each(setupScripts)('%s fails closed when the base schema cannot be applied', (scriptPath) => {
    const source = readScript(scriptPath);
    const body = functionBody(source, 'apply_local_schema');

    expect(body).toContain('if ! npx wrangler d1 execute');
    expect(body).toContain('error ');
    expect(source).not.toMatch(/schema (returned warnings|aplicado com avisos).*continu/i);
  });

  it.each(setupScripts)('%s selects the D1 SQLite by migration-ledger identity', (scriptPath) => {
    const source = readScript(scriptPath);
    const finder = functionBody(source, 'find_local_sqlite');

    expect(source).toContain('list_local_sqlites');
    expect(finder).toContain('sqlite_master');
    expect(finder).toContain("name='d1_migrations'");
    expect(finder).not.toMatch(/head\s+(?:-n\s*)?1\b/);
    expect(finder).toContain('matches=$((matches + 1))');
    expect(finder).toContain('if (( matches > 1 )); then');
    expect(finder).toContain('multiple persisted SQLite files contain d1_migrations');
    expect(source).toContain('elif has_any_local_sqlite; then');
  });

  it.each(setupScripts)('%s does not blindly reapply the base schema', (scriptPath) => {
    const source = readScript(scriptPath);
    expect(source).toContain('find_local_sqlite');
    expect(source).toMatch(/existing local database found|Banco local existente encontrado/);
  });

  it.each(setupScripts)('%s records migrations only after successful execution', (scriptPath) => {
    const source = readScript(scriptPath);
    const body = functionBody(source, 'apply_local_migration');

    const executeIndex = body.indexOf('npx wrangler d1 execute');
    const errorIndex = body.indexOf('error ');
    const recordIndex = body.indexOf('record_local_migration');

    expect(executeIndex).toBeGreaterThan(-1);
    expect(errorIndex).toBeGreaterThan(executeIndex);
    expect(recordIndex).toBeGreaterThan(errorIndex);
    expect(source).not.toMatch(/migration (returned warnings|aplicada com avisos)/i);
  });

  it.each(setupScripts)('%s verifies the local migration ledger', (scriptPath) => {
    const source = readScript(scriptPath);
    expect(source).toContain('require_migration_recorded');
    expect(source).toContain('migration_recorded "$migration_name"');
  });

  it.each(setupScripts)('%s validates legacy migration ledger shape before use', (scriptPath) => {
    const source = readScript(scriptPath);
    const body = functionBody(source, 'record_local_migration');

    expect(source).toContain('require_sqlite_column "d1_migrations" "name"');
    expect(body).toContain('INSERT INTO d1_migrations (name) VALUES');
    expect(body).not.toContain('(name, applied_at)');
  });

  it.each(setupScripts)('%s validates tables and columns explicitly', (scriptPath) => {
    const source = readScript(scriptPath);
    expect(source).toContain('require_sqlite_table');
    expect(source).toContain('require_sqlite_column');
  });

  it('creates LMS tables before validating their contract', () => {
    const source = readScript(lmsSetup);
    const applyIndex = source.indexOf('for migration_file in "${LMS_MIGRATIONS[@]}"; do\n  apply_local_migration');
    const contractIndex = source.indexOf('for table_name in audit_logs lms_cursos');

    expect(applyIndex).toBeGreaterThan(-1);
    expect(contractIndex).toBeGreaterThan(applyIndex);
  });

  it('creates audit logs through migration before validating their contract', () => {
    const source = readScript(lmsSetup);
    const migrationIndex = source.indexOf('0332_create_audit_logs_compatible.sql');
    const applyIndex = source.indexOf('for migration_file in "${LMS_MIGRATIONS[@]}"; do\n  apply_local_migration');
    const contractIndex = source.indexOf('for table_name in audit_logs lms_cursos');

    expect(migrationIndex).toBeGreaterThan(-1);
    expect(applyIndex).toBeGreaterThan(migrationIndex);
    expect(contractIndex).toBeGreaterThan(applyIndex);
    expect(source).not.toContain('qualificacoes_categorias audit_logs; do');
  });

  it.each(setupScripts)('%s excludes the incompatible training-class migration', (scriptPath) => {
    const source = readScript(scriptPath);
    expect(source).not.toContain('$WORKER_DIR/migrations/0390_training_class_management.sql');
  });

  it.each(setupScripts)('%s validates the canonical LMS content filename column', (scriptPath) => {
    const source = readScript(scriptPath);
    expect(source).toContain('require_sqlite_column "lms_cursos" "conteudo_arquivo_nome"');
    expect(source).not.toContain('require_sqlite_column "lms_cursos" "content_filename"');
  });
});