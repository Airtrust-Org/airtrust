import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, describe, expect, it } from 'vitest';

const testDir = dirname(fileURLToPath(import.meta.url));
const migration = readFileSync(join(testDir, '../../../migrations/0464_frms_parameter_governance_recalc.sql'), 'utf8');
const tempDirs: string[] = [];

afterAll(() => tempDirs.splice(0).forEach((dir) => rmSync(dir, { recursive: true, force: true })));

function sqlite(path: string, sql: string) {
  return spawnSync('sqlite3', [path], { input: sql, encoding: 'utf8' });
}

function createBaseline(): string {
  const dir = mkdtempSync(join(tmpdir(), 'airtrust-0464-'));
  tempDirs.push(dir);
  const path = join(dir, 'db.sqlite');
  const result = sqlite(path, `
    CREATE TABLE empresas (id INTEGER PRIMARY KEY);
    CREATE TABLE frms_configuracao_limites (nome TEXT, valor_numerico REAL, unidade TEXT, ativo INTEGER, deleted_at TEXT);
    INSERT INTO frms_configuracao_limites VALUES ('FDP_MAXIMO_HORAS', 11, 'hora', 1, NULL);
    CREATE TABLE frms_fatorizacao_jornada (id TEXT, jornada_id TEXT, deleted_at TEXT, updated_at TEXT);
    CREATE TABLE frms_fadiga_checkin (id TEXT, empresa_id INTEGER, data_checkin TEXT, deleted_at TEXT);
  `);
  expect(result.status, result.stderr).toBe(0);
  return path;
}

describe('migration 0464 FRMS parameter governance', () => {
  it('creates immutable revision, parameter and recalculation ledger tables and bootstraps legacy provenance', () => {
    const path = createBaseline();
    const applied = sqlite(path, migration);
    expect(applied.status, applied.stderr).toBe(0);
    const result = sqlite(path, `
      SELECT count(*) FROM frms_config_revisions;
      SELECT numeric_value FROM frms_config_parameters WHERE parameter_key = 'FDP_MAXIMO_HORAS';
      PRAGMA table_info(frms_fatorizacao_jornada);
    `);
    expect(result.status, result.stderr).toBe(0);
    expect(result.stdout).toContain('1');
    expect(result.stdout).toContain('11.0');
    expect(result.stdout).toMatch(/config_revision_id/);
    expect(result.stdout).toMatch(/recalc_state/);
  });

  it('does not permit a second application to mask a migration-order problem', () => {
    const path = createBaseline();
    expect(sqlite(path, migration).status).toBe(0);
    const second = sqlite(path, migration);
    expect(second.status).not.toBe(0);
    expect(second.stderr).toMatch(/already exists/i);
  });
});
