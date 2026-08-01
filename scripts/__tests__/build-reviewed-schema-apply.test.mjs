// source_reference: synthetic unit-test fixtures for reviewed Schema V2 builder; no operational D1 execution.
import { createHash } from 'node:crypto';
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { buildReviewedSchemaApply } from '../schema-v2/build-reviewed-schema-apply.mjs';

const previousCwd = process.cwd();
afterEach(() => {
  process.chdir(previousCwd);
  vi.restoreAllMocks();
});

function hash(value) {
  return createHash('sha256').update(value).digest('hex');
}

function fixture(overrides = {}) {
  const root = mkdtempSync(join(tmpdir(), 'airtrust-schema-v2-'));
  process.chdir(root);
  mkdirSync('worker-airtrust/schema-v2/plans', { recursive: true });
  const sqlPath = 'worker-airtrust/schema-v2/0999_safe.sql';
  const planPath = 'worker-airtrust/schema-v2/plans/safe-change.md';
  const sql = 'CREATE TABLE safe_table (id INTEGER PRIMARY KEY);\n';
  const plan = '# Reviewed plan\n\nCreate safe_table.\n';
  writeFileSync(sqlPath, sql);
  writeFileSync(planPath, plan);
  const manifest = {
    changeId: 'safe-change',
    baselineId: 'baseline-v2',
    filePath: sqlPath,
    fileHash: hash(sql),
    planPath,
    planHash: hash(plan),
    ...overrides,
  };
  const manifestPath = 'worker-airtrust/schema-v2/safe-change.json';
  writeFileSync(manifestPath, JSON.stringify(manifest));
  return { root, manifestPath, outputPath: 'combined.sql', manifest };
}

describe('buildReviewedSchemaApply', () => {
  it('verifies both reviewed artifacts and appends ledger to the same SQL file', () => {
    const f = fixture();
    const result = buildReviewedSchemaApply({
      manifestPath: f.manifestPath,
      outputPath: f.outputPath,
      expectedChangeId: 'safe-change',
      githubSha: 'a'.repeat(40),
    });
    const combined = readFileSync(f.outputPath, 'utf8');
    expect(combined).toContain('CREATE TABLE safe_table');
    expect(combined).toContain('INSERT INTO airtrust_schema_changes_v2');
    expect(combined).toContain("'safe-change'");
    expect(result.manifestHash).toMatch(/^[0-9a-f]{64}$/);
  });

  it('rejects path traversal before reading the SQL file', () => {
    const f = fixture({ filePath: 'worker-airtrust/schema-v2/../secret.sql' });
    expect(() =>
      buildReviewedSchemaApply({
        manifestPath: f.manifestPath,
        outputPath: f.outputPath,
        expectedChangeId: 'safe-change',
        githubSha: 'b'.repeat(40),
      }),
    ).toThrow(/filePath is invalid/);
  });

  it('rejects hostile identifiers that could escape ledger SQL literals', () => {
    const f = fixture({ changeId: "safe-change'; SELECT 1;--" });
    expect(() =>
      buildReviewedSchemaApply({
        manifestPath: f.manifestPath,
        outputPath: f.outputPath,
        expectedChangeId: "safe-change'; SELECT 1;--",
        githubSha: 'c'.repeat(40),
      }),
    ).toThrow(/change_id is invalid/);
  });

  it('fails closed when SQL or plan content no longer matches review hashes', () => {
    const f = fixture();
    writeFileSync(f.manifest.filePath, 'DROP TABLE usuarios;\n');
    expect(() =>
      buildReviewedSchemaApply({
        manifestPath: f.manifestPath,
        outputPath: f.outputPath,
        expectedChangeId: 'safe-change',
        githubSha: 'd'.repeat(40),
      }),
    ).toThrow(/SQL hash mismatch/);
  });
});
