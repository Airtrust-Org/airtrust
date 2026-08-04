import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const changeId = 'qualificacoes-tipos-dominio-override-0454';
const manifestPath = 'worker-airtrust/schema-v2/qualificacoes-tipos-dominio-override-0454.json';

function sha256(value) {
  return createHash('sha256').update(value).digest('hex');
}

describe('Schema V2 0454 production reconciliation', () => {
  it('pins the reviewed SQL and plan hashes', () => {
    const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
    const sql = readFileSync(manifest.filePath);
    const plan = readFileSync(manifest.planPath);

    expect(manifest.changeId).toBe(changeId);
    expect(sha256(sql)).toBe(manifest.fileHash);
    expect(sha256(plan)).toBe(manifest.planHash);
  });

  it('avoids DDL recreation and qualification data mutation', () => {
    const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
    const sql = readFileSync(manifest.filePath, 'utf8');
    const executableSql = sql
      .split('\n')
      .filter((line) => !line.trimStart().startsWith('--'))
      .join('\n');

    expect(executableSql).toContain(
      'CREATE INDEX IF NOT EXISTS idx_qualificacoes_tipos_dominio_codigo',
    );
    expect(executableSql).not.toMatch(/ALTER\s+TABLE/i);
    expect(executableSql).not.toMatch(/\b(?:UPDATE|DELETE|INSERT)\b/i);
    expect(sql).toContain('run 30919588508');
  });
});
