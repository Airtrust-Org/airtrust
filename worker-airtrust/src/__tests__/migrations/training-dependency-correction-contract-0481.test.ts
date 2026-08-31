import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const ROOT = join(__dirname, '../../../..');
const MIGRATION = readFileSync(
  join(ROOT, 'worker-airtrust/migrations/0481_training_dependency_planning.sql'),
  'utf8',
);

describe('0481 training dependency correction contract', () => {
  it('keeps source-date correction behavior versioned in the migration', () => {
    expect(MIGRATION).toContain('trg_treinamento_dependencia_evento_recalculate');
    expect(MIGRATION).toContain('DEPENDENCIA_TREINAMENTO_RECALCULADA');
    expect(MIGRATION).toContain('source_completion_date');
    expect(MIGRATION).toContain('planejamento_vencimento_referencia = date(');
    expect(MIGRATION).toContain("planejamento_status='PROPOSTO'");
    expect(MIGRATION).toContain('data planejada preservada apos correcao do Periodico');
  });

  it('fails closed on production qualification-id drift before seeding the rule', () => {
    expect(MIGRATION).toContain('0481 preflight: AW139 Periodico G1 id=33 drifted');
    expect(MIGRATION).toContain('0481 preflight: AW139 Semestral G1-SEM id=106 drifted');
    expect(MIGRATION).toContain('0481 postseed: approved AW139 rule missing or ambiguous');
  });
});
