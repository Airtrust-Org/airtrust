import { createHash } from 'node:crypto';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { execSql, querySql } from '../helpers/sqlite-batch-runner';

const ROOT = join(__dirname, '../../../..');
const migrationPath = join(ROOT, 'worker-airtrust/migrations/0508_training_compliance_daily_snapshots.sql');
const changePath = join(ROOT, 'worker-airtrust/schema-v2/changes/0508_training_compliance_daily_snapshots.sql');
const planPath = join(ROOT, 'worker-airtrust/schema-v2/plans/training-compliance-daily-snapshots-0508.md');
const manifestPath = join(ROOT, 'worker-airtrust/schema-v2/training-compliance-daily-snapshots-0508.json');
const migration = readFileSync(migrationPath, 'utf8');
const tempDirs: string[] = [];
const sha256 = (value: string) => createHash('sha256').update(value).digest('hex');

function createDatabase() {
  const dir = mkdtempSync(join(tmpdir(), 'airtrust-training-compliance-snapshots-0508-'));
  tempDirs.push(dir);
  return join(dir, 'test.sqlite');
}

afterEach(() => {
  while (tempDirs.length) rmSync(tempDirs.pop()!, { recursive: true, force: true });
});

describe('0508 training compliance daily snapshots', () => {
  it('pins Schema V2 SQL and plan hashes', () => {
    const change = readFileSync(changePath, 'utf8');
    const plan = readFileSync(planPath, 'utf8');
    const manifest = JSON.parse(readFileSync(manifestPath, 'utf8')) as Record<string, string>;

    expect(change).toBe(migration);
    expect(manifest).toMatchObject({
      changeId: 'training-compliance-daily-snapshots-0508',
      baselineId: 'production-d1-baseline-v2-20260714',
      filePath: 'worker-airtrust/schema-v2/changes/0508_training_compliance_daily_snapshots.sql',
      planPath: 'worker-airtrust/schema-v2/plans/training-compliance-daily-snapshots-0508.md',
    });
    expect(manifest.fileHash).toBe(sha256(change));
    expect(manifest.planHash).toBe(sha256(plan));
  });

  it('is additive/idempotent and enforces one tenant+scope snapshot per day', () => {
    const db = createDatabase();
    expect(execSql(db, migration).code).toBe(0);
    expect(execSql(db, migration).code).toBe(0);

    expect(
      execSql(
        db,
        `INSERT INTO training_compliance_daily_snapshots
          (empresa_id,setor_id,funcao_id,snapshot_date,pessoas,requisitos_obrigatorios,conformes,compliance_pct)
         VALUES (1,10,2,'2026-09-21',5,20,18,90);`,
      ).code,
    ).toBe(0);

    const duplicate = execSql(
      db,
      `INSERT INTO training_compliance_daily_snapshots
        (empresa_id,setor_id,funcao_id,snapshot_date,pessoas,requisitos_obrigatorios,conformes,compliance_pct)
       VALUES (1,10,2,'2026-09-21',5,20,18,90);`,
    );
    expect(duplicate.code).not.toBe(0);

    expect(
      execSql(
        db,
        `INSERT INTO training_compliance_daily_snapshots
          (empresa_id,setor_id,funcao_id,snapshot_date,pessoas,requisitos_obrigatorios,conformes,compliance_pct)
         VALUES (2,10,2,'2026-09-21',5,20,18,90);`,
      ).code,
    ).toBe(0);

    const rows = querySql<{ empresa_id: number }>(db, 'SELECT empresa_id FROM training_compliance_daily_snapshots ORDER BY empresa_id;');
    expect(rows.map((row) => row.empresa_id)).toEqual([1, 2]);
  });

  it('rejects impossible percentages and negative aggregate counts', () => {
    const db = createDatabase();
    expect(execSql(db, migration).code).toBe(0);
    expect(
      execSql(
        db,
        `INSERT INTO training_compliance_daily_snapshots
          (empresa_id,setor_id,funcao_id,snapshot_date,pessoas,requisitos_obrigatorios,conformes,compliance_pct)
         VALUES (1,0,0,'2026-09-21',1,1,1,101);`,
      ).code,
    ).not.toBe(0);
    expect(
      execSql(
        db,
        `INSERT INTO training_compliance_daily_snapshots
          (empresa_id,setor_id,funcao_id,snapshot_date,pessoas,requisitos_obrigatorios,conformes,compliance_pct)
         VALUES (1,0,0,'2026-09-21',-1,1,1,100);`,
      ).code,
    ).not.toBe(0);
  });
});
