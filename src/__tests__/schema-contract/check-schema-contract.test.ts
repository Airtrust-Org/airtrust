import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  assertAllowedRemoteSchemaSql,
  assertReadOnlySql,
  computeSchemaHash,
  extractSingleJsonDocument,
  loadSnapshotFromFile,
  normalizeWranglerExecutePayload,
  parseWranglerExecuteOutput,
  runSchemaContractCheck,
} from '../../schema-contract/checkSchemaContract';

const ROOT = join(__dirname, '../../..');
const CONTRACT_PATH = join(ROOT, 'docs/database/schema-contracts/production-d1-baseline-v2.json');
const SNAPSHOT_PATH = join(ROOT, 'docs/database/production-schema-snapshot-20260714/structural-snapshot.json');
const FIXTURES_DIR = join(__dirname, 'fixtures');

function readFixture(name: string): string {
  return readFileSync(join(FIXTURES_DIR, name), 'utf8');
}

describe('schema contract checker', () => {
  it('accepts read-only SELECT and PRAGMA inspection', () => {
    expect(() => assertReadOnlySql('SELECT * FROM sqlite_master;')).not.toThrow();
    expect(() => assertReadOnlySql('PRAGMA table_info(simuladores);')).not.toThrow();
  });

  it('blocks mutating SQL', () => {
    expect(() => assertReadOnlySql('ALTER TABLE simuladores ADD COLUMN empresa_id INTEGER;')).toThrow(
      /comando mutante/i,
    );
    expect(() => assertReadOnlySql('PRAGMA journal_mode = WAL;')).toThrow(/comando mutante/i);
  });

  it('allows only the production schema inspection SQL allowlist remotely', () => {
    expect(() => assertAllowedRemoteSchemaSql('PRAGMA table_info(simuladores);')).not.toThrow();
    expect(() =>
      assertAllowedRemoteSchemaSql(
        "SELECT type, name, tbl_name, sql FROM sqlite_master WHERE type = 'table' AND name = 'd1_migrations';",
      ),
    ).not.toThrow();
    expect(() => assertAllowedRemoteSchemaSql('SELECT COUNT(*) FROM d1_migrations;')).toThrow(/allowlist/i);
  });

  it('computes the scoped schema hash from the production snapshot', () => {
    const contract = JSON.parse(readFileSync(CONTRACT_PATH, 'utf8'));
    const snapshot = loadSnapshotFromFile(SNAPSHOT_PATH);
    expect(computeSchemaHash(snapshot, contract.scoped_tables)).toBe(contract.schema_hash);
  });

  it('keeps the same schema hash when table and column order changes incidentally', () => {
    const contract = JSON.parse(readFileSync(CONTRACT_PATH, 'utf8'));
    const snapshot = loadSnapshotFromFile(SNAPSHOT_PATH);
    const reorderedSnapshot = structuredClone(snapshot);
    const reversedTables = Object.entries(reorderedSnapshot.tables).reverse();
    reorderedSnapshot.tables = Object.fromEntries(reversedTables);
    for (const table of Object.values(reorderedSnapshot.tables)) {
      table.table_info.results = [...(table.table_info.results ?? [])].reverse();
      table.index_list.results = [...(table.index_list.results ?? [])].reverse();
    }

    expect(computeSchemaHash(reorderedSnapshot, contract.scoped_tables)).toBe(
      'f3a1a2fa2ef07c50660d4c8180bd2bd9dcb98e5423317f7c20ea6d4c9ba787d7',
    );
  });

  it('passes against the audited production structural snapshot', () => {
    const result = runSchemaContractCheck({
      contractPath: CONTRACT_PATH,
      snapshotPath: SNAPSHOT_PATH,
      rootDir: ROOT,
    });

    expect(result.status).toBe('PASS');
    expect(result.issues.some((issue) => issue.severity === 'FAIL')).toBe(false);
  });

  it('fails when a required column disappears', async () => {
    const snapshot = loadSnapshotFromFile(SNAPSHOT_PATH);
    snapshot.tables.simuladores.table_info.results = snapshot.tables.simuladores.table_info.results?.filter(
      (column) => column.name !== 'aeronave_codigo',
    );

    const mutatedPath = join(ROOT, 'docs/database/production-schema-snapshot-20260714/.tmp-schema-contract-test.json');
    const fs = await import('node:fs/promises');
    await fs.writeFile(mutatedPath, JSON.stringify(snapshot), 'utf8');

    try {
      const result = runSchemaContractCheck({
        contractPath: CONTRACT_PATH,
        snapshotPath: mutatedPath,
        rootDir: ROOT,
      });
      expect(result.status).toBe('FAIL');
      expect(result.issues.some((issue) => issue.code === 'MISSING_REQUIRED_COLUMN')).toBe(true);
    } finally {
      await fs.rm(mutatedPath, { force: true });
    }
  });

  it('parses the observed wrangler array-root format', () => {
    const parsed = parseWranglerExecuteOutput(readFixture('wrangler-array-root.txt'));
    expect(parsed[0].ok).toBe(true);
    expect(parsed[0].results?.[0]).toMatchObject({ name: 'id', type: 'INTEGER' });
  });

  it('parses the observed wrangler object-root format', () => {
    const parsed = parseWranglerExecuteOutput(readFixture('wrangler-object-root.txt'));
    expect(parsed[0].ok).toBe(true);
    expect(parsed[0].results?.[0]).toMatchObject({ name: 'id' });
  });

  it('parses a wrapper using root result', () => {
    const parsed = parseWranglerExecuteOutput(readFixture('wrangler-root-result-wrapper.txt'));
    expect(parsed[0].ok).toBe(true);
    expect(parsed[0].results?.[0]).toMatchObject({ name: 'idx_demo' });
  });

  it('parses output with warning before JSON', () => {
    const parsed = parseWranglerExecuteOutput(readFixture('wrangler-warning-before-json.txt'));
    expect(parsed[0].results?.[0]).toMatchObject({ name: 'd1_migrations' });
  });

  it('parses output with metadata after JSON', () => {
    const parsed = parseWranglerExecuteOutput(readFixture('wrangler-metadata-after-json.txt'));
    expect(parsed[0].results?.[0]).toMatchObject({ name: 'd1_migrations' });
  });

  it('fails on ambiguous multiple JSON blocks', () => {
    expect(() => extractSingleJsonDocument(readFixture('wrangler-ambiguous-two-blocks.txt'))).toThrow(/ambigua/i);
  });

  it('fails on invalid JSON', () => {
    expect(() => parseWranglerExecuteOutput(readFixture('wrangler-invalid-json.txt'))).toThrow(
      /nenhum bloco json valido/i,
    );
  });

  it('fails on empty output', () => {
    expect(() => parseWranglerExecuteOutput(readFixture('wrangler-empty.txt'))).toThrow(/vazia/i);
  });

  it('fails closed on remote error', () => {
    expect(() => parseWranglerExecuteOutput(readFixture('wrangler-remote-error.txt'))).toThrow(
      /remote database unavailable/i,
    );
  });

  it('normalizes directly from parsed payload without losing success/results', () => {
    const payload = JSON.parse(readFixture('wrangler-array-root.txt'));
    const normalized = normalizeWranglerExecutePayload(payload);
    expect(normalized).toHaveLength(1);
    expect(normalized[0]).toMatchObject({
      ok: true,
      results: [{ name: 'id' }],
    });
  });
});
