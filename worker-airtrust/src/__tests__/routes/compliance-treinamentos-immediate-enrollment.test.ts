import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const source = readFileSync(resolve(process.cwd(), 'src/routes/compliance-treinamentos.ts'), 'utf8');
const enrollmentService = readFileSync(
  resolve(process.cwd(), 'src/services/training-compliance-rule-enrollment.ts'), 'utf8',
);
const body = enrollmentService.slice(
  enrollmentService.indexOf('async function performComplianceRuleEnrollment'),
  enrollmentService.indexOf('export async function reconcileTrainingComplianceRuleEnrollment'),
);
const post = source.slice(source.indexOf("app.post('/regras',"),
  source.indexOf("app.put('/regras/:id',"));
const put = source.slice(source.indexOf("app.put('/regras/:id',"),
  source.indexOf("app.delete('/regras/:id',"));

describe('Compliance requirement save enrollment synchronization', () => {
  it('bulk reconciliation endpoint requires admin, is read-only, scoped and excludes employee PII', () => {
    const start = source.indexOf("app.get('/funcionarios/requisitos-lote'");
    const end = source.indexOf("app.get('/funcionarios/:id'", start);
    const route = source.slice(start, end);
    expect(start).toBeGreaterThan(0);
    expect(end).toBeGreaterThan(start);
    expect(route).toContain("requireRole('admin')");
    expect(route).toContain('const empresaId = getEmpresaId(c)');
    expect(route).toContain('getEmployeeSectorAccess(c, empresaId)');
    expect(route).toContain('new Map(snapshot.people.map');
    expect(route).toContain("COMPLIANCE_BATCH_EMPLOYEE_NOT_FOUND");
    expect(route).toContain('return { id, requisitos: person.requisitos }');
    expect(route).not.toMatch(/\.run\(\)|\.batch\(|UPDATE |INSERT |DELETE /);
  });


  it('reconciles immediately on both create and edit after saving the requirement', () => {
    expect(post).toContain('reconcileTrainingComplianceRuleEnrollment(');
    expect(put).toContain('reconcileTrainingComplianceRuleEnrollment(');
    expect(post.indexOf('insertTrainingComplianceRequirement('))
      .toBeLessThan(post.indexOf('reconcileTrainingComplianceRuleEnrollment('));
    expect(put.indexOf('updateTrainingComplianceRequirement('))
      .toBeLessThan(put.indexOf('reconcileTrainingComplianceRuleEnrollment('));
  });

  it('requires a single published linked course and respects the effective rule', () => {
    expect(body).toContain('req.regra_id === ruleId');
    expect(body).toContain("rule.obrigatoriedade !== 'OBRIGATORIA'");
    expect(body).toContain("rule.modalidade_requerida !== 'EAD'");
    expect(body).toContain('rule.auto_matricular_ead !== 1');
    expect(body).toContain('req.auto_matricular_ead === 1');
    expect(body).toContain('!req.evidencia_pendente_validacao');
    expect(body).toContain('trainingComplianceNeedsImmediateEnrollmentOnRuleSave');
    expect(body).toContain('c.qualificacao_tipo_id=? AND c.ativo=1 AND c.publicado=1');
    expect(body).toContain("(courses.results || []).length !== 1");
  });

  it('preserves valid evidence, active cycles, tenant scope, and historical cycles', () => {
    expect(body).toContain('buildSnapshot(db, empresaId, access)');
    expect(body).toContain('hasActiveMatriculaCycle(existing)');
    expect(body).toContain('canReuseMatriculaCycle(existing)');
    expect(body).toContain('resetMatriculaForNewCycle(');
    expect(body).toContain('createComplianceEnrollmentAtomic(');
    expect(body).toContain('stampLmsEnrollmentEvidenceProfile(');
    expect(body).toContain('empresa_id=? AND curso_id=? AND funcionario_id=?');
    expect(body).toContain("registro_id: existing.id");
  });

  it('never sends email invitations while reconciling the rule', () => {
    expect(body).not.toMatch(/sendMatriculaEmail|enviar_convite_email|convites\/lote|sendEmail/);
  });

  it('exposes classified diagnostics only through staging-authenticated rule routes', () => {
    expect(post).toContain('sanitizeComplianceEnrollmentResponse(rawEnrollment, c.env.ENVIRONMENT)');
    expect(put).toContain('sanitizeComplianceEnrollmentResponse(rawEnrollment, c.env.ENVIRONMENT)');
    expect(source).toContain("app.post('/regras', requireRole('admin', 'manager')");
    expect(source).toContain("app.put('/regras/:id', requireRole('admin', 'manager')");
  });

  it('reports deferred synchronization rather than claiming complete success', () => {
    expect(enrollmentService).toContain('AUTO_ENROLLMENT_DEFERRED');
    expect(enrollmentService).toContain('LMS_COURSE_MAPPING_UNAVAILABLE');
    expect(post).toContain('...enrollment');
    expect(put).toContain('data: enrollment');
  });
});


describe('Tenant-scoped designation enrollment synchronization',()=>{
  it('resolves the winning condition rule without a deeply nested effective-requirement predicate',()=>{
    const code=readFileSync(resolve(process.cwd(),'src/routes/compliance-treinamentos-conditions.ts'),'utf8');
    const writer=code.slice(code.indexOf('async function autoEnrollAssignedConditionRequirements'),
      code.indexOf("app.get('/condicoes/catalogos'"));
    expect(writer).toContain("tr.modalidade_requerida='EAD' OR (tr.modalidade_requerida IS NULL AND tr.empresa_id=6)");
    expect(writer).toContain("COALESCE(tr.auto_matricular_ead,0)=1");
    expect(writer).toContain("NOT EXISTS(SELECT 1 FROM treinamento_requisitos higher");
    expect(writer).toContain('trainingComplianceRuleApplicabilitySql');
    expect(writer).toContain('trainingComplianceRulePrioritySql');
    expect(writer).not.toContain('trainingComplianceEffectiveRequirementPredicateSql');
    expect(writer).toContain("courses.results||[]).length!==1");
    expect(writer).toContain("summary.skipped_valid_evidence+=1");
    expect(writer).toContain("createComplianceEnrollmentAtomic(");
    expect(writer).toContain("operationalDate,usuarioId");
    expect(writer).not.toContain("INSERT INTO lms_matriculas");
    expect(writer).toContain("AUTO_DESIGNACAO_ENROLLMENT_NOT_CONFIRMED");
    expect(writer).toContain("AUTO_DESIGNACAO_EXISTING_CYCLE_NOT_REUSABLE");
  });
  it('pre-enrolls future designations while preserving effective dates for Compliance obligations',()=>{
    const code=readFileSync(resolve(process.cwd(),'src/routes/compliance-treinamentos-conditions.ts'),'utf8');
    const atomic=readFileSync(resolve(process.cwd(),'src/services/training-compliance-create-enrollment.ts'),'utf8');
    expect(code).toContain('dataInicio>getTodayIsoSaoPaulo()?dataInicio:getTodayIsoSaoPaulo()');
    expect(atomic).toContain('operationalDate?:string');
    expect(atomic).toContain('const operationalDate=p.operationalDate || getTodayIsoSaoPaulo()');
    expect(code).toContain("origin:'AUTO_DESIGNACAO'");
  });
});
