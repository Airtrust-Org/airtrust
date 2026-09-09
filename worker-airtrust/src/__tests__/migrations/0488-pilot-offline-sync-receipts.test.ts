import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const ROOT = join(__dirname, '../../../..');
const migrationPath = join(
  ROOT,
  'worker-airtrust/migrations/0488_controle_voos_pilot_offline_sync_receipts.sql',
);
const changePath = join(
  ROOT,
  'worker-airtrust/schema-v2/changes/0488_controle_voos_pilot_offline_sync_receipts.sql',
);
const planPath = join(
  ROOT,
  'worker-airtrust/schema-v2/plans/controle-voos-pilot-offline-sync-receipts-0488.md',
);
const manifestPath = join(
  ROOT,
  'worker-airtrust/schema-v2/controle-voos-pilot-offline-sync-receipts-0488.json',
);

const migration = readFileSync(migrationPath, 'utf8');
const change = readFileSync(changePath, 'utf8');
const plan = readFileSync(planPath, 'utf8');
const manifest = JSON.parse(readFileSync(manifestPath, 'utf8')) as {
  changeId: string;
  filePath: string;
  fileHash: string;
  planPath: string;
  planHash: string;
};

const sha256 = (value: string) => createHash('sha256').update(value).digest('hex');
const executable = (value: string) =>
  value
    .split('\n')
    .filter((line) => !line.trimStart().startsWith('--'))
    .join('\n');

describe('0488 Pilot offline sync receipts migration', () => {
  it('keeps local migration and governed Schema V2 change byte-identical', () => {
    expect(change).toBe(migration);
  });

  it('is additive-only and creates only the idempotency receipt structure', () => {
    const sql = executable(change);
    expect(sql).toContain('CREATE TABLE IF NOT EXISTS cv_offline_sync_receipts');
    expect(sql).toContain('CREATE UNIQUE INDEX IF NOT EXISTS uq_cv_offline_sync_receipts_empresa_operation');
    expect(sql).toContain('ON cv_offline_sync_receipts (empresa_id, client_operation_id)');
    expect(sql).toContain("result_status IN ('accepted', 'conflict', 'rejected_retriable', 'rejected_permanent')");
    expect(sql).not.toMatch(/\b(?:DROP|ALTER|UPDATE|DELETE)\b/i);
    expect(sql).not.toMatch(/\bINSERT\s+INTO\b/i);
  });

  it('pins the exact reviewed SQL and plan hashes in the manifest', () => {
    expect(manifest).toMatchObject({
      changeId: 'controle-voos-pilot-offline-sync-receipts-0488',
      filePath: 'worker-airtrust/schema-v2/changes/0488_controle_voos_pilot_offline_sync_receipts.sql',
      planPath: 'worker-airtrust/schema-v2/plans/controle-voos-pilot-offline-sync-receipts-0488.md',
    });
    expect(manifest.fileHash).toBe(sha256(change));
    expect(manifest.planHash).toBe(sha256(plan));
  });

  it('plan explicitly keeps remote apply and runtime enablement separate', () => {
    expect(plan).toContain('PILOT_OFFLINE_SYNC_ENABLED');
    expect(plan).toContain('No staging or production apply is authorized by this plan.');
    expect(plan).toContain('No generic migration-chain replay is permitted.');
  });
});
