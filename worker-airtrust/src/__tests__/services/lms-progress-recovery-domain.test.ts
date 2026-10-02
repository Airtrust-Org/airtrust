import { describe, expect, it } from 'vitest';
import {
  buildAppliedScormState,
  buildProgressRecoveryReference,
  buildProgressRecoverySnapshot,
  buildRecoveryDryRunDifferences,
  evaluateProgressRecovery,
  extractLessonLocationValue,
  normalizeStatusToken,
  safeJsonParseObject,
  summarizeProgressRecoverySnapshot,
  type ProgressRecoveryEnrollment,
} from '../../services/lms-progress-recovery-domain';

function enrollment(overrides: Partial<ProgressRecoveryEnrollment> = {}): ProgressRecoveryEnrollment {
  return {
    id: 501, curso_id: 9, funcionario_id: 77, status: 'EM_ANDAMENTO', progresso_pct: 40,
    ultimo_slide: 40, data_inicio: '2026-10-01', data_conclusao: null,
    qualificacao_historico_id: null, curso_titulo: 'AW139', tipo_conteudo: 'scorm', scorm_id: 900,
    lesson_status: 'incomplete', completion_status: null, success_status: null,
    score_raw: 75, score_max: 100, score_min: 0, score_scaled: 0.75,
    session_time: '0000:10:00.00', total_time: '0001:00:00.00', session_count: 2,
    suspend_data: 'checkpoint-forte', launch_data: null,
    cmi_json: JSON.stringify({ 'cmi.location': '40/100', 'cmi.suspend_data': 'checkpoint-forte' }),
    ...overrides,
  };
}

describe('LMS progress recovery domain helpers', () => {
  it('extracts location and normalizes status without widening invalid JSON', () => {
    expect(extractLessonLocationValue(JSON.stringify({ 'cmi.location': ' 40/100 ' }))).toBe('40/100');
    expect(extractLessonLocationValue(JSON.stringify({ 'cmi.core.lesson_location': '41/100' }))).toBe('41/100');
    expect(extractLessonLocationValue('{invalid')).toBeNull();
    expect(normalizeStatusToken(' em_andamento ')).toBe('EM_ANDAMENTO');
  });

  it('builds deterministic snapshots and stable dry-run references', () => {
    const current = enrollment();
    const snapshot = buildProgressRecoverySnapshot({ enrollment: current, progressPct: 40, slide: 40,
      lessonLocation: '40/100', matriculaStatus: current.status, cmiJson: current.cmi_json,
      suspendData: current.suspend_data });
    expect(snapshot.matricula).toMatchObject({ id: 501, progresso_pct: 40, ultimo_slide: 40 });
    expect(snapshot.scorm).toMatchObject({ row_present: true, lesson_location: '40/100' });
    const ref = buildProgressRecoveryReference(snapshot);
    expect(ref).toMatch(/^prr-v1-[0-9a-f]{8}$/);
    expect(buildProgressRecoveryReference(snapshot)).toBe(ref);
  });

  it('summarizes snapshots without returning suspend_data contents', () => {
    const current = enrollment();
    const snapshot = buildProgressRecoverySnapshot({ enrollment: current, progressPct: 40, slide: 40,
      lessonLocation: '40/100', matriculaStatus: current.status, cmiJson: current.cmi_json,
      suspendData: current.suspend_data });
    const summary = summarizeProgressRecoverySnapshot(snapshot);
    expect(summary.scorm).toMatchObject({ lesson_location: '40/100', suspend_data_present: true });
    expect(JSON.stringify(summary)).not.toContain('checkpoint-forte');
  });

  it('builds applied SCORM state while preserving protected suspend data', () => {
    const result = buildAppliedScormState({ enrollment: enrollment(), targetLessonLocation: '60/100' });
    expect(result.lessonLocation).toBe('60/100');
    expect(result.suspendData).toBe('checkpoint-forte');
    expect(result.cmiJson).toContain('60/100');
  });

  it('parses only JSON objects for audit recovery metadata', () => {
    expect(safeJsonParseObject('{"ok":true}')).toEqual({ ok: true });
    expect(safeJsonParseObject('[1,2]')).toBeNull();
    expect(safeJsonParseObject('{invalid')).toBeNull();
    expect(safeJsonParseObject(null)).toBeNull();
  });

  it('reports only fields that differ between current and simulated recovery state', () => {
    expect(buildRecoveryDryRunDifferences({ currentStatus: 'NAO_INICIADO', currentProgress: 0,
      currentSlide: 0, currentLessonLocation: null, simulatedStatus: 'EM_ANDAMENTO',
      simulatedProgress: 25, simulatedSlide: 25, simulatedLessonLocation: '25/100' })).toEqual([
      { field: 'matricula.status', current: 'NAO_INICIADO', simulated: 'EM_ANDAMENTO' },
      { field: 'matricula.progresso_pct', current: 0, simulated: 25 },
      { field: 'matricula.ultimo_slide', current: 0, simulated: 25 },
      { field: 'scorm.lesson_location', current: null, simulated: '25/100' },
    ]);
  });
  it('evaluates recovery targets without changing the fail-closed blocker policy', () => {
    const allowed = evaluateProgressRecovery({
      enrollment: enrollment(),
      targetLessonLocation: '60/100',
      targetProgressPct: 60,
    });
    expect(allowed.blockers).toEqual([]);
    expect(allowed.risks).toContain('CURRENT_SCORE_WILL_BE_PRESERVED');
    expect(allowed.simulatedProgress).toBe(60);
    expect(allowed.simulatedSlide).toBe(60);
    expect(allowed.simulatedMatriculaStatus).toBe('EM_ANDAMENTO');

    const blocked = evaluateProgressRecovery({
      enrollment: enrollment({ status: 'CONCLUIDO', qualificacao_historico_id: 88, data_conclusao: '2026-10-02' }),
      targetLessonLocation: '30/100',
      targetProgressPct: 100,
      targetLessonStatus: 'passed',
      targetScoreRaw: 90,
      targetMatriculaStatus: 'CONCLUIDO',
    });
    expect(blocked.blockers).toEqual(expect.arrayContaining([
      'TERMINAL_STATUS',
      'QUALIFICATION_ALREADY_LINKED',
      'TARGET_PROGRESS_COMPLETION_NOT_ALLOWED',
      'TARGET_LOCATION_REGRESSION',
      'TARGET_LESSON_STATUS_COMPLETION_FORBIDDEN',
      'TARGET_SCORE_CHANGE_FORBIDDEN',
      'TARGET_MATRICULA_STATUS_COMPLETION_FORBIDDEN',
      'DATA_CONCLUSAO_ALREADY_PRESENT',
    ]));
    expect(evaluateProgressRecovery({
      enrollment: enrollment(),
      targetLessonLocation: '30/100',
      targetProgressPct: 30,
    }).blockers).toContain('TARGET_PROGRESS_REGRESSION');

    expect(() => evaluateProgressRecovery({
      enrollment: enrollment(),
      targetLessonLocation: 'invalid',
      targetProgressPct: 50,
    })).toThrow('target_lesson_location deve estar no formato n/total');
  });

});
