import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const source = readFileSync(resolve(process.cwd(), 'src/routes/compliance-treinamentos.ts'), 'utf8');
const body = source.slice(source.indexOf('async function reconcileEnrollmentAfterComplianceSave('),
  source.indexOf('export type TrainingComplianceSnapshot'));
const post = source.slice(source.indexOf("app.post('/regras',"),
  source.indexOf("app.put('/regras/:id',"));
const put = source.slice(source.indexOf("app.put('/regras/:id',"),
  source.indexOf("app.delete('/regras/:id',"));

describe('Compliance requirement save enrollment synchronization', () => {
  it('reconciles immediately on both create and edit after saving the requirement', () => {
    expect(post).toContain('reconcileEnrollmentAfterComplianceSave(');
    expect(put).toContain('reconcileEnrollmentAfterComplianceSave(');
    expect(post.indexOf('insertTrainingComplianceRequirement('))
      .toBeLessThan(post.indexOf('reconcileEnrollmentAfterComplianceSave('));
    expect(put.indexOf('updateTrainingComplianceRequirement('))
      .toBeLessThan(put.indexOf('reconcileEnrollmentAfterComplianceSave('));
  });

  it('requires a single published linked course and respects the effective rule', () => {
    expect(body).toContain('req.regra_id === ruleId');
    expect(body).toContain("rule.obrigatoriedade !== 'OBRIGATORIA'");
    expect(body).toContain("rule.modalidade_requerida !== 'EAD'");
    expect(body).toContain('trainingComplianceNeedsImmediateEnrollmentOnRuleSave');
    expect(body).toContain('qualificacao_tipo_id=? AND ativo=1 AND publicado=1');
    expect(body).toContain("(courses.results || []).length !== 1");
  });

  it('preserves valid evidence, active cycles, tenant scope, and historical cycles', () => {
    expect(body).toContain('buildSnapshot(db, empresaId, access)');
    expect(body).toContain('hasActiveMatriculaCycle(existing)');
    expect(body).toContain('canReuseMatriculaCycle(existing)');
    expect(body).toContain('resetMatriculaForNewCycle(');
    expect(body).toContain('ensureMatriculaCycle(');
    expect(body).toContain('stampLmsEnrollmentEvidenceProfile(');
    expect(body).toContain('empresa_id=? AND curso_id=? AND funcionario_id=?');
    expect(body).toContain("registro_id: existing.id");
  });

  it('never sends email invitations while reconciling the rule', () => {
    expect(body).not.toMatch(/sendMatriculaEmail|enviar_convite_email|convites\/lote|sendEmail/);
  });

  it('reports deferred synchronization rather than claiming complete success', () => {
    expect(post).toContain('AUTO_ENROLLMENT_DEFERRED');
    expect(put).toContain('AUTO_ENROLLMENT_DEFERRED');
    expect(post).toContain('LMS_COURSE_MAPPING_UNAVAILABLE');
    expect(put).toContain('LMS_COURSE_MAPPING_UNAVAILABLE');
  });
});
