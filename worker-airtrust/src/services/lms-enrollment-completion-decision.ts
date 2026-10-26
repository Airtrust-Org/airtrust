/**
 * Canonical enrollment-level completion decision shared by the integrity
 * middleware, the server-side SCORM finalization and the read-only
 * stuck-enrollment classifier. Extracted from middleware/lms-completion-integrity.ts
 * without changing its precedence, except for the SCORM status-family fix below.
 */
import {
  evaluateLmsCompletionEvidence,
  resolveLmsCompletionScorePct,
  type LmsCompletionDecision,
  type LmsCompletionSource,
} from './lms-completion-evidence';
import { activeXapiFirst } from './lms-active-xapi-read';

type JsonRecord = Record<string, unknown>;

export type EnrollmentEvidenceRow = {
  id: number;
  empresa_id: number;
  funcionario_id: number;
  status: string;
  progresso_pct: number | null;
  data_inicio: string | null;
  qualificacao_historico_id: number | null;
  curso_id: number;
  tipo_conteudo: string | null;
  ativo: number;
  publicado: number;
  scorm_mastery_score: number | null;
  scorm_assessment_policy: 'SCORED' | 'FORMATIVE';
  scorm_package_r2_prefix: string | null;
  scorm_launch_file: string | null;
  gerar_qualificacao_ao_concluir: number;
  lesson_status: string | null;
  completion_status: string | null;
  success_status: string | null;
  score_raw: number | null;
  score_min: number | null;
  score_max: number | null;
  score_scaled: number | null;
  session_time: string | null;
  total_time: string | null;
  suspend_data: string | null;
  cmi_json: string | null;
  xapi_count: number | null;
};

export async function readEnrollmentEvidence(
  db: D1Database,
  empresaId: number,
  matriculaId: number,
): Promise<EnrollmentEvidenceRow | null> {
  return activeXapiFirst<EnrollmentEvidenceRow>(db,
      `SELECT m.id, m.empresa_id, m.funcionario_id, m.status, m.progresso_pct, m.data_inicio,
              m.qualificacao_historico_id,
              c.id AS curso_id, c.tipo_conteudo, c.ativo, c.publicado,
              c.scorm_mastery_score, c.scorm_assessment_policy, c.scorm_package_r2_prefix, c.scorm_launch_file,
              c.gerar_qualificacao_ao_concluir,
              p.lesson_status, p.completion_status, p.success_status,
              p.score_raw, p.score_min, p.score_max, p.score_scaled,
              p.session_time, p.total_time, p.suspend_data, p.cmi_json,
              (SELECT COUNT(*) FROM lms_xapi_statements x
                WHERE x.matricula_id = m.id AND x.empresa_id = m.empresa_id
                  AND x.archived_cycle_id IS NULL) AS xapi_count
         FROM lms_matriculas m
         JOIN lms_cursos c
           ON c.id = m.curso_id
          AND c.empresa_id = m.empresa_id
          AND c.deleted_at IS NULL
         LEFT JOIN lms_progresso_scorm p
           ON p.matricula_id = m.id
          AND p.empresa_id = m.empresa_id
        WHERE m.id = ?
          AND m.empresa_id = ?
          AND m.deleted_at IS NULL
        LIMIT 1`, [matriculaId, empresaId]);
}

function has(record: JsonRecord, key: string): boolean {
  return Object.prototype.hasOwnProperty.call(record, key);
}

/**
 * SCORM 1.2 (`cmi.core.lesson_status`) and SCORM 2004 (`cmi.completion_status`/
 * `cmi.success_status`) are different data models. The runtime only ever
 * updates its own family; the other family's columns can only carry stale LMS
 * resets (e.g. governed reversal writes lesson_status AND completion_status =
 * 'incomplete'). Combining a fresh 1.2 `passed` with a stale 2004 `incomplete`
 * produced a false STATE_INCONSISTENT and stranded learners at 99%.
 *
 * The family is taken from the incoming commit shape when present, otherwise
 * from the persisted CMI snapshot keys. Ambiguous → unchanged (fail-closed).
 */
export function selectScormStatusFamily(params: {
  incoming: JsonRecord;
  cmiJson: string | null | undefined;
  lessonStatus: unknown;
  completionStatus: unknown;
  successStatus: unknown;
}): { lessonStatus: unknown; completionStatus: unknown; successStatus: unknown } {
  const { incoming } = params;
  let family: '1.2' | '2004' | null = null;
  const incoming12 = has(incoming, 'lesson_status');
  const incoming2004 = has(incoming, 'completion_status') || has(incoming, 'success_status');
  if (incoming12 && !incoming2004) family = '1.2';
  else if (incoming2004 && !incoming12) family = '2004';
  else if (!incoming12 && !incoming2004 && params.cmiJson) {
    try {
      const cmi = JSON.parse(params.cmiJson) as JsonRecord;
      if (cmi && typeof cmi === 'object' && !Array.isArray(cmi)) {
        const cmi12 = has(cmi, 'cmi.core.lesson_status');
        const cmi2004 = has(cmi, 'cmi.completion_status') || has(cmi, 'cmi.success_status');
        if (cmi12 && !cmi2004) family = '1.2';
        else if (cmi2004 && !cmi12) family = '2004';
      }
    } catch {
      family = null;
    }
  }
  if (family === '1.2') {
    return { lessonStatus: params.lessonStatus, completionStatus: null, successStatus: null };
  }
  if (family === '2004') {
    return { lessonStatus: null, completionStatus: params.completionStatus, successStatus: params.successStatus };
  }
  return {
    lessonStatus: params.lessonStatus,
    completionStatus: params.completionStatus,
    successStatus: params.successStatus,
  };
}

export function scorePctFromValues(raw: unknown, max: unknown, scaled: unknown, min?: unknown): number | null {
  return resolveLmsCompletionScorePct({
    scoreRaw: raw, scoreMin: min, scoreMax: max, scoreScaled: scaled,
  });
}

function progressFromCmiJson(value: unknown): number | null {
  if (typeof value !== 'string' || !value.trim()) return null;
  try {
    const parsed = JSON.parse(value) as Record<string, unknown>;
    const location = String(
      parsed['cmi.location'] ?? parsed['cmi.core.lesson_location'] ?? parsed.lesson_location ?? '',
    );
    const match = location.match(/(\d+)\s*(?:\/|of)\s*(\d+)/i);
    if (!match) return null;
    const current = Number(match[1]);
    const total = Number(match[2]);
    if (!Number.isFinite(current) || !Number.isFinite(total) || total <= 0) return null;
    return Math.max(0, Math.min(100, (current / total) * 100));
  } catch {
    return null;
  }
}

function resolveProgressPct(row: EnrollmentEvidenceRow, incoming: JsonRecord): number {
  const existing = Number.isFinite(Number(row.progresso_pct)) ? Number(row.progresso_pct) : 0;
  const incomingLocation = progressFromCmiJson(incoming.cmi_json);
  const storedLocation = progressFromCmiJson(row.cmi_json);
  const incomingScore = scorePctFromValues(
    incoming.score_raw,
    incoming.score_max,
    incoming.score_scaled,
    incoming.score_min,
  );
  const storedScore = scorePctFromValues(row.score_raw, row.score_max, row.score_scaled, row.score_min);
  return Math.max(
    existing,
    incomingLocation ?? 0,
    storedLocation ?? 0,
    incomingScore ?? 0,
    storedScore ?? 0,
  );
}

function hasIncomingRuntimeEvidence(incoming: JsonRecord): boolean {
  return [
    incoming.cmi_json,
    incoming.suspend_data,
    incoming.session_time,
    incoming.total_time,
    incoming.score_raw,
    incoming.score_scaled,
  ].some((value) => value !== null && value !== undefined && value !== '');
}

export function hasStoredRuntimeEvidence(row: EnrollmentEvidenceRow): boolean {
  return [
    row.lesson_status,
    row.completion_status,
    row.success_status,
    row.cmi_json,
    row.suspend_data,
    row.session_time,
    row.total_time,
    row.score_raw,
    row.score_scaled,
  ].some((value) => value !== null && value !== undefined && value !== '');
}

function contentType(row: EnrollmentEvidenceRow): string {
  return String(row.tipo_conteudo ?? 'scorm').trim().toLowerCase();
}

function isInteractive(row: EnrollmentEvidenceRow): boolean {
  const type = contentType(row);
  return type === 'scorm' || type === 'h5p';
}

function contentEvidenceValidated(row: EnrollmentEvidenceRow, source: LmsCompletionSource): boolean {
  const type = contentType(row);
  // SCORM and H5P completion claims are checked by their respective runtime
  // guards. A manual/admin request may reuse only persisted SCORM final
  // status; it must never turn a client-owned non-SCORM percentage into an
  // issuance signal.
  if (source === 'scorm') return type === 'scorm';
  if (source === 'xapi') return type === 'h5p';
  if (source === 'administrative') {
    // Administrative completion is the governed exception for incidents where
    // persisted runtime evidence is real (progress/score) but the terminal
    // SCORM status was lost. Authorization + reason are validated separately
    // by evaluateLmsCompletionEvidence; returning true here does not bypass
    // progress, failure-precedence or enrollment/course gates. Only a
    // separately authorized administrator may waive the assessment score.
    return type === 'scorm';
  }
  return false;
}

export function isEnrollmentPackageBound(row: EnrollmentEvidenceRow): boolean {
  const type = contentType(row);
  if (type === 'scorm') {
    return Boolean(row.scorm_package_r2_prefix && row.scorm_launch_file);
  }
  if (type === 'h5p') return Boolean(row.scorm_package_r2_prefix);
  return true;
}

export function buildEnrollmentCompletionDecision(
  row: EnrollmentEvidenceRow,
  source: LmsCompletionSource,
  incoming: JsonRecord,
  assetSessionValid: boolean,
  options: {
    explicitCompletion?: boolean;
    explicitFailure?: boolean;
    administrativeAuthorized?: boolean;
    administrativeReason?: unknown;
    /** Active package is study-only (manifest assessment NONE/EXTERNAL): no score applies. */
    studyOnly?: boolean;
    administrativeScoreOverride?: boolean;
  } = {},
): LmsCompletionDecision {
  const interactive = isInteractive(row);
  const progressPct = resolveProgressPct(row, incoming);
  const progressPresent =
    hasStoredRuntimeEvidence(row) ||
    hasIncomingRuntimeEvidence(incoming) ||
    Number(row.xapi_count ?? 0) > 0 ||
    progressPct > 0;
  // An explicit, server-owned course policy distinguishes formative participation
  // from graded assessment. Only FORMATIVE can omit a score; missing/unknown
  // policy stays SCORED (fail-closed, including legacy rows and test fixtures).
  const isFormative = (row.scorm_assessment_policy === 'FORMATIVE' || options.studyOnly === true) &&
    row.tipo_conteudo === 'scorm';
  const requiresAssessment = interactive && !isFormative &&
    (row.gerar_qualificacao_ao_concluir === 1 || row.scorm_mastery_score !== null);
  const statuses = source === 'scorm' || source === 'administrative' || source === 'manual'
    ? selectScormStatusFamily({
      incoming,
      cmiJson: typeof incoming.cmi_json === 'string' ? incoming.cmi_json : row.cmi_json,
      lessonStatus: incoming.lesson_status ?? row.lesson_status,
      completionStatus: incoming.completion_status ?? row.completion_status,
      successStatus: incoming.success_status ?? row.success_status,
    })
    : {
      lessonStatus: incoming.lesson_status ?? row.lesson_status,
      completionStatus: incoming.completion_status ?? row.completion_status,
      successStatus: incoming.success_status ?? row.success_status,
    };

  return evaluateLmsCompletionEvidence({
    source,
    enrollmentActive: !['CANCELADO'].includes(String(row.status).toUpperCase()),
    courseAvailable: row.ativo === 1 && row.publicado === 1,
    packageBound: isEnrollmentPackageBound(row),
    assetSessionValid,
    progressRowPresent: progressPresent,
    progressPct,
    lessonStatus: statuses.lessonStatus,
    completionStatus: statuses.completionStatus,
    successStatus: statuses.successStatus,
    explicitCompletion: options.explicitCompletion,
    explicitFailure: options.explicitFailure,
    scoreRaw: incoming.score_raw ?? row.score_raw,
    scoreMin: incoming.score_min ?? row.score_min,
    scoreMax: incoming.score_max ?? row.score_max,
    scoreScaled: incoming.score_scaled ?? row.score_scaled,
    masteryScore: isFormative || options.administrativeScoreOverride ? null : row.scorm_mastery_score,
    requiresAssessment: requiresAssessment && !options.administrativeScoreOverride,
    generatesQualification: row.gerar_qualificacao_ao_concluir === 1,
    informativeCourse: !interactive && row.gerar_qualificacao_ao_concluir !== 1,
    contentEvidenceValidated: contentEvidenceValidated(row, source),
    minimumTimeSatisfied: undefined,
    administrativeAuthorized: options.administrativeAuthorized,
    administrativeReason: options.administrativeReason,
  });
}
