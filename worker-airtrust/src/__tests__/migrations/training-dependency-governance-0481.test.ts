import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const ROOT = join(__dirname, '../../../..');
const migration = readFileSync(
  join(ROOT, 'worker-airtrust/migrations/0481_training_dependency_planning.sql'),
  'utf8',
);
const plan = readFileSync(
  join(ROOT, 'worker-airtrust/schema-v2/plans/training-dependency-planning-0481.md'),
  'utf8',
);

describe('0481 training dependency governance', () => {
  it('keeps the migration additive and non-backfilling', () => {
    expect(migration).toContain('CREATE TABLE IF NOT EXISTS treinamento_dependencias');
    expect(migration).toContain('CREATE TABLE IF NOT EXISTS treinamento_dependencia_eventos');
    expect(migration).not.toMatch(/UPDATE\s+qualificacoes_historico/i);
    expect(migration).not.toMatch(/DELETE\s+FROM\s+qualificacoes_historico/i);
    expect(plan).toContain('No migration-time backfill');
  });

  it('pins the reviewed AW139 rule and fail-closed preflight', () => {
    expect(migration).toContain("id=33 AND empresa_id=6 AND codigo='G1'");
    expect(migration).toContain("id=106 AND empresa_id=6 AND codigo='G1-SEM'");
    expect(migration).toContain("SELECT 6,33,106,6,'2026-08-31'");
    expect(migration).toContain('0481 postseed: approved AW139 rule missing or ambiguous');
  });
});
