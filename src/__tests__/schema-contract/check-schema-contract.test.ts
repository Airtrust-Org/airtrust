import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  assertReadOnlySql,
  computeSchemaHash,
  loadSnapshotFromFile,
  runSchemaContractCheck,
} from '../../schema-contract/checkSchemaContract';

const ROOT = join(__dirname, '../../..');
const CONTRACT_PATH = join(ROOT, 'docs/database/schema-contracts/production-d1-baseline-v2.json');
const SNAPSHOT_PATH = join(ROOT, 'docs/database/production-schema-snapshot-20260714/structural-snapshot.json');

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

  it('computes the scoped schema hash from the production snapshot', () => {
    const contract = JSON.parse(readFileSync(CONTRACT_PATH, 'utf8'));
    const snapshot = loadSnapshotFromFile(SNAPSHOT_PATH);
    expect(computeSchemaHash(snapshot, contract.scoped_tables)).toBe(contract.schema_hash);
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
});
