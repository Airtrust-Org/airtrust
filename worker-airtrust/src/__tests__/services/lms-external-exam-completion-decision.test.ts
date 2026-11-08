import { describe, expect, it } from 'vitest';
import {
  buildEnrollmentCompletionDecision, type EnrollmentEvidenceRow,
} from '../../services/lms-enrollment-completion-decision';

function row(overrides: Partial<EnrollmentEvidenceRow> = {}): EnrollmentEvidenceRow {
  return {
    id: 90, empresa_id: 6, funcionario_id: 30,
    status: 'EM_ANDAMENTO', progresso_pct: 100, data_inicio: '2026-11-07',
    qualificacao_historico_id: null, curso_id: 84, tipo_conteudo: 'scorm',
    ativo: 1, publicado: 1, scorm_mastery_score: 80,
    scorm_assessment_policy: 'SCORED',
    scorm_package_r2_prefix: 'lms/scorm/6/84/_candidates/pkg/',
    scorm_launch_file: 'index.html', gerar_qualificacao_ao_concluir: 1,
    lesson_status: 'completed', completion_status: null, success_status: null,
    score_raw: null, score_min: null, score_max: null, score_scaled: null,
    session_time: '00:12:00', total_time: null, suspend_data: null,
    cmi_json: '{"cmi.core.lesson_status":"completed"}', xapi_count: 0,
    ...overrides,
  };
}

describe('content-only EXTERNAL: enrollment completion stays exam-bound', () => {
  it('does not complete a SCORED enrollment on study evidence alone', () => {
    const decision = buildEnrollmentCompletionDecision(row(), 'scorm', {}, true, {
      explicitCompletion: true,
    });
    expect(decision).toMatchObject({ accepted: false, code: 'SCORE_MISSING' });
  });

  it('accepts no SCORM score only after Worker-validated external exam evidence', () => {
    const decision = buildEnrollmentCompletionDecision(row(), 'scorm', {}, true, {
      explicitCompletion: true, approvedExternalExam: true,
    });
    expect(decision).toMatchObject({
      accepted: true, code: 'COMPLETION_ACCEPTED', scorePct: null,
    });
  });

  it('does not waive edition binding, active enrollment or asset session checks', () => {
    const options = { explicitCompletion: true, approvedExternalExam: true };
    expect(buildEnrollmentCompletionDecision(row({status:'CANCELADO'}), 'scorm', {}, true, options).accepted).toBe(false);
    expect(buildEnrollmentCompletionDecision(row(), 'scorm', {}, false, options).accepted).toBe(false);
    expect(buildEnrollmentCompletionDecision(row({ scorm_package_r2_prefix: null }), 'scorm', {}, true, options).accepted).toBe(false);
  });

  it('never treats the EXTERNAL exam switch as an approval for another content type', () => {
    const decision = buildEnrollmentCompletionDecision(
      row({ tipo_conteudo: 'h5p', scorm_package_r2_prefix: 'h5p/test/' }),
      'xapi', {}, true, { explicitCompletion: true, approvedExternalExam: true },
    );
    expect(decision.accepted).toBe(false);
  });
});
