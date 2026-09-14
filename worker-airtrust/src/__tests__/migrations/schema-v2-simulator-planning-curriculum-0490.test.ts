import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const ROOT = join(__dirname, '../../../..');
const migrationPath = join(ROOT, 'worker-airtrust/migrations/0490_simulator_planning_curriculum_metadata.sql');
const changePath = join(ROOT, 'worker-airtrust/schema-v2/changes/0490_simulator_planning_curriculum_metadata.sql');
const planPath = join(ROOT, 'worker-airtrust/schema-v2/plans/simulator-planning-curriculum-metadata-0490.md');
const manifestPath = join(ROOT, 'worker-airtrust/schema-v2/simulator-planning-curriculum-metadata-0490.json');
const sha256 = (value: string) => createHash('sha256').update(value).digest('hex');

describe('0490 Schema V2 reviewed bundle', () => {
  it('keeps canonical migration and Schema V2 SQL byte-identical', () => {
    expect(readFileSync(changePath, 'utf8')).toBe(readFileSync(migrationPath, 'utf8'));
  });

  it('pins the exact reviewed SQL and plan hashes', () => {
    const change = readFileSync(changePath, 'utf8');
    const plan = readFileSync(planPath, 'utf8');
    const manifest = JSON.parse(readFileSync(manifestPath, 'utf8')) as Record<string, string>;
    expect(manifest).toMatchObject({
      changeId: 'simulator-planning-curriculum-metadata-0490',
      baselineId: 'production-d1-baseline-v2-20260714',
      filePath: 'worker-airtrust/schema-v2/changes/0490_simulator_planning_curriculum_metadata.sql',
      planPath: 'worker-airtrust/schema-v2/plans/simulator-planning-curriculum-metadata-0490.md',
    });
    expect(manifest.fileHash).toBe(sha256(change));
    expect(manifest.planHash).toBe(sha256(plan));
  });

  it('documents that merge is not remote-apply authorization', () => {
    const plan = readFileSync(planPath, 'utf8');
    expect(plan).toContain('Merging this plan does not authorize production apply or deployment.');
    expect(plan).toContain('D1 Time Travel recovery point');
  });
});
