import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const changes = [
  {
    id: 'sigvoos-shadow-parallel-0467',
    manifest: 'worker-airtrust/schema-v2/sigvoos-shadow-parallel-0467.json',
  },
  {
    id: 'sigvoos-shadow-leg-crew-0468',
    manifest: 'worker-airtrust/schema-v2/sigvoos-shadow-leg-crew-0468.json',
  },
  {
    id: 'lms-completion-diagnostics-0469',
    manifest: 'worker-airtrust/schema-v2/lms-completion-diagnostics-0469.json',
  },
];

function sha256(value) {
  return createHash('sha256').update(value).digest('hex');
}

describe('Schema V2 production governance for 0467-0469', () => {
  it.each(changes)('pins reviewed hashes for $id', ({ id, manifest: manifestPath }) => {
    const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
    const sql = readFileSync(manifest.filePath);
    const plan = readFileSync(manifest.planPath);

    expect(manifest.changeId).toBe(id);
    expect(manifest.baselineId).toBe('production-d1-baseline-v2-20260714');
    expect(sha256(sql)).toBe(manifest.fileHash);
    expect(sha256(plan)).toBe(manifest.planHash);
  });

  it('keeps all reviewed SQL additive and tenant-scoped', () => {
    for (const { manifest: manifestPath } of changes) {
      const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
      const sql = readFileSync(manifest.filePath, 'utf8');
      const executableSql = sql
        .split('\n')
        .filter((line) => !line.trimStart().startsWith('--'))
        .join('\n');

      expect(sql).toContain('empresa_id');
      expect(executableSql).toMatch(/CREATE\s+(?:UNIQUE\s+)?(?:TABLE|INDEX)/i);
      expect(executableSql).not.toMatch(/\b(?:DROP|DELETE|UPDATE|ALTER|REPLACE)\b/i);
      expect(sql).toContain('source_reference:');
      expect(sql).toContain('operational_decision:');
      expect(sql).toContain('dry_run_required:');
      expect(sql).toContain('rollback_plan_required:');
    }
  });

  it('keeps production postconditions read-only and scoped to approved change ids', () => {
    const validator = readFileSync(
      'scripts/schema-v2/validate-0467-0469-production-postconditions.sh',
      'utf8',
    );
    for (const { id } of changes) {
      expect(validator).toContain(id);
    }
    expect(validator).toContain('DB_NAME="airtrust-db"');
    expect(validator).toContain('ENV_NAME="production"');
    expect(validator).toContain('PRODUCTION_POSTCONDITIONS_OK');
    expect(validator).not.toMatch(/wrangler d1 execute[^\n]*(?:--file|INSERT|UPDATE|DELETE|DROP|ALTER)/i);
  });
});
