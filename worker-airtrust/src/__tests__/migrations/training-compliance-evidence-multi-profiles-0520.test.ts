import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const ROOT = resolve(__dirname, '../../../..');
const read = (p: string) => readFileSync(resolve(ROOT, p), 'utf8');

describe('0520 training compliance evidence multi profiles', () => {
  it('normalizes multiple profiles per qualification evidence without duplicating history', () => {
    const sql = read('worker-airtrust/migrations/0520_training_compliance_evidence_multi_profiles.sql');
    expect(sql).toContain('CREATE TABLE IF NOT EXISTS qualificacoes_historico_perfis_competencia');
    expect(sql).toContain('uq_qh_perfil_competencia_ativo');
    expect(sql).toContain('trg_qh_perfil_competencia_tenant_0520');
    expect(sql).toContain("FROM qualificacoes_historico qh");
    expect(sql).not.toContain('INSERT INTO qualificacoes_historico(');
    expect(sql).not.toMatch(/DELETE\s+FROM\s+qualificacoes_historico/i);
  });

  it('keeps migration and Schema V2 change identical and wires governed pre/post validation', () => {
    const migration = read('worker-airtrust/migrations/0520_training_compliance_evidence_multi_profiles.sql');
    const change = read('worker-airtrust/schema-v2/changes/0520_training_compliance_evidence_multi_profiles.sql');
    const productionWorkflow = read('.github/workflows/apply-schema-change-v2.yml');
    const stagingWorkflow = read('.github/workflows/staging-d1-schema-change.yml');
    expect(change).toBe(migration);
    expect(productionWorkflow).toContain("inputs.change_id == 'training-compliance-evidence-multi-profiles-0520'");
    expect(productionWorkflow).toContain('validate-0520-production-preflight.sh');
    expect(productionWorkflow).toContain('validate-0520-production-postconditions.sh');
    expect(stagingWorkflow).toContain('0520_training_compliance_evidence_multi_profiles.sql');
  });
});
