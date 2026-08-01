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

  it('does not replay the incompatible training-class migration in LMS smoke', () => {
    const source = readScript(lmsSetup);
    expect(source).not.toContain('0390_training_class_management.sql');
  });
});
