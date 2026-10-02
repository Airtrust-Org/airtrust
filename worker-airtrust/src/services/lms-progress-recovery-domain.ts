import { mergeScormRuntimeState } from './lms-progress-guardrails';

export type ProgressRecoveryEnrollment = {
  id: number;
  curso_id: number;
  funcionario_id: number;
  status: string;
  progresso_pct: number | null;
  ultimo_slide: number | null;
  data_inicio: string | null;
  data_conclusao: string | null;
  qualificacao_historico_id: number | null;
  curso_titulo: string;
  tipo_conteudo: string | null;
  scorm_id: number | null;
  lesson_status: string | null;
  completion_status: string | null;
  success_status: string | null;
  score_raw: number | null;
  score_max: number | null;
  score_min: number | null;
  score_scaled: number | null;
  session_time: string | null;
  total_time: string | null;
  session_count: number | null;
  suspend_data: string | null;
  launch_data: string | null;
  cmi_json: string | null;
};

export type ProgressRecoveryStateSnapshot = {
  matricula: {
    id: number;
    curso_id: number;
    funcionario_id: number;
    status: string;
    progresso_pct: number;
    ultimo_slide: number;
    data_inicio: string | null;
    data_conclusao: string | null;
    qualificacao_historico_id: number | null;
  };
  scorm: {
    row_present: boolean;
    id: number | null;
    lesson_location: string | null;
    lesson_status: string | null;
    completion_status: string | null;
    success_status: string | null;
    score_raw: number | null;
    score_max: number | null;
    score_min: number | null;
    score_scaled: number | null;
    session_time: string | null;
    total_time: string | null;
    session_count: number | null;
    suspend_data: string | null;
    launch_data: string | null;
    cmi_json: string | null;
  };
};

export type ProgressRecoveryEvaluation = {
  enrollment: ProgressRecoveryEnrollment;
  currentEffectiveProgress: number;
  currentStrongSlide: number;
  currentLessonLocation: string | null;
  blockers: string[];
  risks: string[];
  simulatedProgress: number;
  simulatedSlide: number;
  simulatedMatriculaStatus: string;
  simulatedLessonLocation: string | null;
  differences: Array<{ field: string; current: unknown; simulated: unknown }>;
  currentSnapshot: ProgressRecoveryStateSnapshot;
  simulatedSnapshot: ProgressRecoveryStateSnapshot;
  dryRunReference: string;
};

export function extractLessonLocationValue(cmiJson: string | null | undefined): string | null {
  if (!cmiJson) return null;
  try {
    const parsed = JSON.parse(cmiJson) as Record<string, unknown>;
    const location = parsed['cmi.location'] ?? parsed['cmi.core.lesson_location'];
    return typeof location === 'string' && location.trim() ? location.trim() : null;
  } catch {
    return null;
  }
}

export function normalizeStatusToken(value: string | null | undefined) {
  return String(value ?? '')
    .trim()
    .toUpperCase();
}

export function hashProgressRecoveryReference(value: string) {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return `prr-v1-${(hash >>> 0).toString(16).padStart(8, '0')}`;
}

export function buildProgressRecoveryReference(snapshot: ProgressRecoveryStateSnapshot) {
  return hashProgressRecoveryReference(
    JSON.stringify({
      matricula: {
        id: snapshot.matricula.id,
        curso_id: snapshot.matricula.curso_id,
        funcionario_id: snapshot.matricula.funcionario_id,
        status: snapshot.matricula.status,
        progresso_pct: snapshot.matricula.progresso_pct,
        ultimo_slide: snapshot.matricula.ultimo_slide,
        data_inicio: snapshot.matricula.data_inicio,
        data_conclusao: snapshot.matricula.data_conclusao,
        qualificacao_historico_id: snapshot.matricula.qualificacao_historico_id,
      },
      scorm: {
        row_present: snapshot.scorm.row_present,
        lesson_location: snapshot.scorm.lesson_location,
        lesson_status: snapshot.scorm.lesson_status,
        completion_status: snapshot.scorm.completion_status,
        success_status: snapshot.scorm.success_status,
        score_raw: snapshot.scorm.score_raw,
        score_max: snapshot.scorm.score_max,
        score_min: snapshot.scorm.score_min,
        score_scaled: snapshot.scorm.score_scaled,
        session_time: snapshot.scorm.session_time,
        total_time: snapshot.scorm.total_time,
        session_count: snapshot.scorm.session_count,
        suspend_data: snapshot.scorm.suspend_data,
        launch_data: snapshot.scorm.launch_data,
        cmi_json: snapshot.scorm.cmi_json,
      },
    }),
  );
}

export function buildProgressRecoverySnapshot(params: {
  enrollment: ProgressRecoveryEnrollment;
  progressPct: number;
  slide: number;
  lessonLocation: string | null;
  matriculaStatus: string;
  cmiJson: string | null;
  suspendData: string | null;
}) {
  return {
    matricula: {
      id: params.enrollment.id,
      curso_id: params.enrollment.curso_id,
      funcionario_id: params.enrollment.funcionario_id,
      status: params.matriculaStatus,
      progresso_pct: params.progressPct,
      ultimo_slide: params.slide,
      data_inicio: params.enrollment.data_inicio,
      data_conclusao: params.enrollment.data_conclusao,
      qualificacao_historico_id: params.enrollment.qualificacao_historico_id,
    },
    scorm: {
      row_present: params.enrollment.scorm_id != null,
      id: params.enrollment.scorm_id,
      lesson_location: params.lessonLocation,
      lesson_status: params.enrollment.lesson_status,
      completion_status: params.enrollment.completion_status,
      success_status: params.enrollment.success_status,
      score_raw: params.enrollment.score_raw,
      score_max: params.enrollment.score_max,
      score_min: params.enrollment.score_min,
      score_scaled: params.enrollment.score_scaled,
      session_time: params.enrollment.session_time,
      total_time: params.enrollment.total_time,
      session_count: params.enrollment.session_count,
      suspend_data: params.suspendData,
      launch_data: params.enrollment.launch_data,
      cmi_json: params.cmiJson,
    },
  } satisfies ProgressRecoveryStateSnapshot;
}

export function summarizeProgressRecoverySnapshot(snapshot: ProgressRecoveryStateSnapshot) {
  return {
    matricula: {
      id: snapshot.matricula.id,
      status: snapshot.matricula.status,
      progresso_pct: snapshot.matricula.progresso_pct,
      ultimo_slide: snapshot.matricula.ultimo_slide,
      qualificacao_historico_id: snapshot.matricula.qualificacao_historico_id,
    },
    scorm: {
      lesson_location: snapshot.scorm.lesson_location,
      lesson_status: snapshot.scorm.lesson_status,
      completion_status: snapshot.scorm.completion_status,
      success_status: snapshot.scorm.success_status,
      score_raw: snapshot.scorm.score_raw,
      score_max: snapshot.scorm.score_max,
      score_scaled: snapshot.scorm.score_scaled,
      suspend_data_present: Boolean(snapshot.scorm.suspend_data?.trim()),
    },
  };
}

export function buildAppliedScormState(params: {
  enrollment: ProgressRecoveryEnrollment;
  targetLessonLocation: string;
}) {
  const currentSuspendData = params.enrollment.suspend_data?.trim()
    ? params.enrollment.suspend_data
    : null;
  const incomingCmi = {
    'cmi.location': params.targetLessonLocation,
    'cmi.core.lesson_location': params.targetLessonLocation,
    ...(currentSuspendData ? { 'cmi.suspend_data': currentSuspendData } : {}),
  };
  const runtimeMerge = mergeScormRuntimeState({
    currentCmiJson: params.enrollment.cmi_json,
    incomingCmiJson: JSON.stringify(incomingCmi),
    currentSuspendData,
    incomingSuspendData: currentSuspendData,
  });

  return {
    cmiJson: runtimeMerge.cmiJson,
    suspendData: runtimeMerge.suspendData,
    lessonLocation: extractLessonLocationValue(runtimeMerge.cmiJson),
  };
}

export function safeJsonParseObject(value: string | null | undefined) {
  if (!value) return null;
  try {
    const parsed = JSON.parse(value) as Record<string, unknown>;
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

export function buildRecoveryDryRunDifferences(params: {
  currentStatus: string;
  currentProgress: number;
  currentSlide: number;
  currentLessonLocation: string | null;
  simulatedStatus: string;
  simulatedProgress: number;
  simulatedSlide: number;
  simulatedLessonLocation: string | null;
}) {
  const differences: Array<{ field: string; current: unknown; simulated: unknown }> = [];

  if (params.currentStatus !== params.simulatedStatus) {
    differences.push({
      field: 'matricula.status',
      current: params.currentStatus,
      simulated: params.simulatedStatus,
    });
  }
  if (params.currentProgress !== params.simulatedProgress) {
    differences.push({
      field: 'matricula.progresso_pct',
      current: params.currentProgress,
      simulated: params.simulatedProgress,
    });
  }
  if (params.currentSlide !== params.simulatedSlide) {
    differences.push({
      field: 'matricula.ultimo_slide',
      current: params.currentSlide,
      simulated: params.simulatedSlide,
    });
  }
  if ((params.currentLessonLocation ?? null) !== (params.simulatedLessonLocation ?? null)) {
    differences.push({
      field: 'scorm.lesson_location',
      current: params.currentLessonLocation,
      simulated: params.simulatedLessonLocation,
    });
  }

  return differences;
}
