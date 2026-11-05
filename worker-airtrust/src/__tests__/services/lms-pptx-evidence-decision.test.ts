import { describe, expect, it } from 'vitest';
import { buildEnrollmentCompletionDecision, type EnrollmentEvidenceRow } from '../../services/lms-enrollment-completion-decision';

function qualifyingRow(kind: string = 'pptx', progress: number = 100): EnrollmentEvidenceRow {
  return {
    id: 200, empresa_id: 6, funcionario_id: 60, status: 'EM_ANDAMENTO',
    progresso_pct: progress, data_inicio: '2026-11-05', qualificacao_historico_id: null,
    curso_id: 22, tipo_conteudo: kind, ativo: 1, publicado: 1,
    scorm_mastery_score: 70, scorm_assessment_policy: 'SCORED',
    scorm_package_r2_prefix: null, scorm_launch_file: null,
    gerar_qualificacao_ao_concluir: 1, lesson_status: null,
    completion_status: null, success_status: null,
    score_raw: null, score_min: null, score_max: null, score_scaled: null,
    session_time: null, total_time: null, suspend_data: null,
    cmi_json: null, xapi_count: 0,
  };
}

describe('PPTX completion evidence is server-owned', () => {
  it('rejects browser progress at 100 percent or final-slide marker without verified coverage', () => {
    const actual = buildEnrollmentCompletionDecision(qualifyingRow(), 'manual', {}, false, {
      explicitCompletion: true,
    });
    expect(actual.accepted).toBe(false);
    expect(actual.code).toBe('CONTENT_EVIDENCE_REQUIRED');
  });
  it('accepts qualifying PPTX only with verified current-cycle coverage', () => {
    const actual = buildEnrollmentCompletionDecision(qualifyingRow('pptx',0), 'manual', {}, false, {
      explicitCompletion: true, serverValidatedPptxCoverage: true,
    });
    expect(actual).toMatchObject({ accepted: true, code: 'COMPLETION_ACCEPTED' });
  });
  it('never authorizes a qualifying PDF using the PPTX-only coverage switch', () => {
    const actual = buildEnrollmentCompletionDecision(qualifyingRow('pdf'), 'manual', {}, false, {
      explicitCompletion: true, serverValidatedPptxCoverage: true,
    });
    expect(actual.accepted).toBe(false);
    expect(actual.code).toBe('CONTENT_EVIDENCE_REQUIRED');
  });
  it('does not authorize qualification for a cancelled enrollment with valid ledger', () => {
    const row = { ...qualifyingRow(), status: 'CANCELADO' };
    const actual = buildEnrollmentCompletionDecision(row, 'manual', {}, false, {
      explicitCompletion: true, serverValidatedPptxCoverage: true,
    });
    expect(actual).toMatchObject({ accepted: false, code: 'ENROLLMENT_INACTIVE' });
  });
});
