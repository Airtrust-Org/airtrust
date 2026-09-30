import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const ROOT = resolve(__dirname, '../../../..');
const read = (p: string) => readFileSync(resolve(ROOT, p), 'utf8');

describe('0519 training compliance evidence profiles', () => {
  it('persists evidence profiles without enrollment side effects or history deletion', () => {
    const sql = read('worker-airtrust/migrations/0519_training_compliance_evidence_profiles.sql');
    expect(sql).toContain('ALTER TABLE qualificacoes_historico ADD COLUMN perfil_competencia TEXT');
    expect(sql).toContain('ALTER TABLE lms_matriculas ADD COLUMN perfil_competencia TEXT');
    expect(sql).toContain("perfil_competencia='AVSEC_TRIPULANTE'");
    expect(sql).toContain("perfil_competencia='PTAP_TRIPULANTE_VOO'");
    expect(sql).toContain('trg_qh_profile_from_evidence_source_0519');
    expect(sql).not.toContain('INSERT INTO lms_matriculas');
    expect(sql).not.toMatch(/DELETE\s+FROM\s+qualificacoes_historico/i);
  });
});
