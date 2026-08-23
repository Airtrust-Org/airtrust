/**
 * Reproduces the exact condition found in a real staging inspection:
 *
 *   - schema is at 0463 (frms_configuracao_limites exists, but is empty —
 *     zero active rows, exactly like the real staging D1 as of 2026-08-22);
 *   - migration 0464 is applied on top of that empty table;
 *   - the HELICOPTER_OFFSHORE baseline seed is applied.
 *
 * Before the self-contained bootstrap fix, 0464's bootstrap revision
 * ('frms-legacy-global-v2') only gets the ~33 hardcoded biological/fortnight
 * parameters (the ones written as literal INSERT statements in the migration
 * file) — none of the 63 LimitesMap parameters, because those are populated
 * via `INSERT ... SELECT FROM frms_configuracao_limites WHERE ativo = 1`,
 * which yields zero rows against an empty table. The old offshore seed then
 * copied from that same incomplete revision, inheriting the gap.
 *
 * Do NOT "fix" this test by seeding frms_configuracao_limites with
 * LIMITES_DEFAULT values — that would hide the real staging bug instead of
 * proving the baseline is self-contained.
 */
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, describe, expect, it } from 'vitest';

const testDir = dirname(fileURLToPath(import.meta.url));
const migration0464 = readFileSync(join(testDir, '../../../migrations/0464_frms_parameter_governance_recalc.sql'), 'utf8');
const seed = readFileSync(join(testDir, '../../../../scripts/frms-seeds/frms_helicopter_offshore_baseline_v1.sql'), 'utf8');
const tempDirs: string[] = [];
afterAll(() => tempDirs.splice(0).forEach((dir) => rmSync(dir, { recursive: true, force: true })));

function sqlite(path: string, sql: string) {
  return spawnSync('sqlite3', [path], { input: sql, encoding: 'utf8' });
}

/** Schema exactly at 0463: frms_configuracao_limites exists (real table) but is EMPTY. */
function createRealStagingLikeBaseline(): string {
  const dir = mkdtempSync(join(tmpdir(), 'airtrust-staging-repro-'));
  tempDirs.push(dir);
  const path = join(dir, 'db.sqlite');
  const setup = sqlite(path, `
    CREATE TABLE empresas (id INTEGER PRIMARY KEY);
    CREATE TABLE frms_configuracao_limites (nome TEXT, valor_numerico REAL, unidade TEXT, ativo INTEGER, deleted_at TEXT);
    CREATE TABLE frms_fatorizacao_jornada (id TEXT, jornada_id TEXT, deleted_at TEXT, updated_at TEXT);
    CREATE TABLE frms_fadiga_checkin (id TEXT, empresa_id INTEGER, data_checkin TEXT, deleted_at TEXT);
  `);
  expect(setup.status, setup.stderr).toBe(0);
  // Deliberately NOT populated — this is the real staging condition.
  const applied = sqlite(path, migration0464);
  expect(applied.status, applied.stderr).toBe(0);
  return path;
}

describe('real staging condition — empty frms_configuracao_limites', () => {
  it('reproduces: frms-legacy-global-v2 (0464 bootstrap) is left incomplete against an empty legacy table', () => {
    const path = createRealStagingLikeBaseline();
    const count = sqlite(path, `SELECT count(*) FROM frms_config_parameters WHERE revision_id = 'frms-legacy-global-v2';`);
    const total = Number(count.stdout.trim());
    // This documents the real, pre-existing gap in 0464's own bootstrap — not
    // something this fix is responsible for repairing (see LEGACY_GENERAL
    // note in the audit). It is < 128 because the LimitesMap portion never
    // populates against an empty legacy table.
    expect(total).toBeLessThan(128);
  });

  it('HELICOPTER_OFFSHORE V1 does NOT inherit that incompleteness — 128/128 parameters present regardless of frms_configuracao_limites content', () => {
    const path = createRealStagingLikeBaseline();
    const applied = sqlite(path, seed);
    expect(applied.status, applied.stderr).toBe(0);

    const count = sqlite(
      path,
      `SELECT count(*) FROM frms_config_parameters WHERE revision_id = 'frms-helicopter-offshore-baseline-v1';`,
    );
    expect(Number(count.stdout.trim())).toBe(128);
  });

  it('HELICOPTER_OFFSHORE V1 does not read from frms_configuracao_limites or frms-legacy-global-v2 at all', () => {
    const sqlOnly = seed
      .split('\n')
      .filter((line) => !line.trim().startsWith('--'))
      .join('\n');
    expect(sqlOnly).not.toMatch(/frms_configuracao_limites/);
    expect(sqlOnly).not.toMatch(/frms-legacy-global-v2/);
    expect(sqlOnly).not.toMatch(/SELECT/i);
  });
});
