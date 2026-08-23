import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, describe, expect, it } from 'vitest';

const testDir = dirname(fileURLToPath(import.meta.url));
const migration0464 = readFileSync(join(testDir, '../../../migrations/0464_frms_parameter_governance_recalc.sql'), 'utf8');
const seed = readFileSync(
  join(testDir, '../../../../scripts/frms-seeds/frms_helicopter_offshore_baseline_v1.sql'),
  'utf8',
);
const tempDirs: string[] = [];

afterAll(() => tempDirs.splice(0).forEach((dir) => rmSync(dir, { recursive: true, force: true })));

function sqlite(path: string, sql: string) {
  return spawnSync('sqlite3', [path], { input: sql, encoding: 'utf8' });
}

function createBaselineWithGovernance(): string {
  const dir = mkdtempSync(join(tmpdir(), 'airtrust-offshore-v1-'));
  tempDirs.push(dir);
  const path = join(dir, 'db.sqlite');
  const setup = sqlite(path, `
    CREATE TABLE empresas (id INTEGER PRIMARY KEY);
    CREATE TABLE frms_configuracao_limites (nome TEXT, valor_numerico REAL, unidade TEXT, ativo INTEGER, deleted_at TEXT);
    CREATE TABLE frms_fatorizacao_jornada (id TEXT, jornada_id TEXT, deleted_at TEXT, updated_at TEXT);
    CREATE TABLE frms_fadiga_checkin (id TEXT, empresa_id INTEGER, data_checkin TEXT, deleted_at TEXT);
  `);
  expect(setup.status, setup.stderr).toBe(0);
  const applied = sqlite(path, migration0464);
  expect(applied.status, applied.stderr).toBe(0);
  return path;
}

describe('FRMS_HELICOPTER_OFFSHORE_BASELINE_V1 seed', () => {
  it('applies cleanly on top of 0464 and creates exactly one ACTIVE HELICOPTER_OFFSHORE revision', () => {
    const path = createBaselineWithGovernance();
    const applied = sqlite(path, seed);
    expect(applied.status, applied.stderr).toBe(0);

    const result = sqlite(
      path,
      `SELECT count(*) FROM frms_config_revisions WHERE profile_code = 'HELICOPTER_OFFSHORE' AND status = 'ACTIVE';`,
    );
    expect(result.status, result.stderr).toBe(0);
    expect(result.stdout.trim()).toBe('1');
  });

  it('model_version (policy_version) is exactly LEGACY_MODEL_V2 as requested, not a new model', () => {
    const path = createBaselineWithGovernance();
    sqlite(path, seed);
    const result = sqlite(
      path,
      `SELECT policy_version FROM frms_config_revisions WHERE profile_code = 'HELICOPTER_OFFSHORE';`,
    );
    expect(result.stdout.trim()).toBe('LEGACY_MODEL_V2');
  });

  it('does not assign any tenant to HELICOPTER_OFFSHORE (empresa_id NULL, no assignment row)', () => {
    const path = createBaselineWithGovernance();
    sqlite(path, seed);
    const empresaId = sqlite(
      path,
      `SELECT empresa_id FROM frms_config_revisions WHERE profile_code = 'HELICOPTER_OFFSHORE';`,
    );
    expect(empresaId.stdout.trim()).toBe('');
    const assignments = sqlite(path, `SELECT count(*) FROM frms_profile_assignments;`);
    expect(assignments.stdout.trim()).toBe('0');
  });

  it('is self-contained: independent of LEGACY_GENERAL/frms_configuracao_limites entirely, with the full 128-parameter set', () => {
    const path = createBaselineWithGovernance();
    sqlite(path, seed);

    // Deliberately NOT compared against 'frms-legacy-global-v2' — that
    // revision's completeness depends on frms_configuracao_limites, which is
    // empty in real staging (see frms-helicopter-offshore-empty-legacy-
    // staging-repro.test.ts). HELICOPTER_OFFSHORE V1 must not depend on it.
    const countResult = sqlite(
      path,
      `SELECT count(*) FROM frms_config_parameters WHERE revision_id = 'frms-helicopter-offshore-baseline-v1';`,
    );
    expect(Number(countResult.stdout.trim())).toBe(128);
  });

  it('fails closed on a second application instead of silently double-seeding (UNIQUE constraint)', () => {
    const path = createBaselineWithGovernance();
    sqlite(path, seed);
    const secondApply = sqlite(path, seed);
    expect(secondApply.status).not.toBe(0);
  });
});
