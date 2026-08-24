/**
 * Snapshot do diagnóstico granular AIRTRUST_COMPLETION_DIAGNOSTICS_V1.
 *
 * IMPORTANTE: este payload é INFORMATIVO. Ele nunca altera lesson_status,
 * score, status de matrícula, qualificação ou certificado. A autoridade
 * canônica de conclusão permanece em `lms-progress-guardrails.ts`.
 *
 * O servidor re-sanitiza tudo que recebe: o pacote SCORM é conteúdo não
 * confiável. Qualquer id de empresa/matrícula/usuário que o payload tente
 * afirmar é descartado — o contexto vem sempre do request autenticado.
 */

export const DIAGNOSTICS_VERSION = 'AIRTRUST_COMPLETION_DIAGNOSTICS_V1';

/** Limite defensivo do JSON serializado. */
export const MAX_SNAPSHOT_JSON_CHARS = 64_000;
export const MAX_ITEMS_PER_COLLECTION = 200;
export const MAX_TEXT_LENGTH = 200;

export interface SnapshotSlideRef {
  id: string | null;
  index: number | null;
  title: string | null;
}

export interface CompletionDiagnosticsSnapshot {
  version: 1;
  courseId: string | null;
  currentSlide: SnapshotSlideRef | null;
  slides: {
    totalRequired: number | null;
    completedRequired: number | null;
    missing: SnapshotSlideRef[];
  };
  assessment: {
    required: boolean;
    completed: boolean;
    scoreRaw: number | null;
    masteryScore: number | null;
    passed: boolean | null;
    unanswered: SnapshotSlideRef[];
    incomplete: SnapshotSlideRef[];
  };
  packageStatus: {
    lessonStatus: string | null;
    finishRequested: boolean;
  };
  updatedAt: string | null;
}

function sanitizeText(value: unknown, maxLength = MAX_TEXT_LENGTH): string | null {
  if (typeof value !== 'string') return null;
  // eslint-disable-next-line no-control-regex
  const cleaned = value.replace(/[\u0000-\u001F\u007F-\u009F]/g, ' ').replace(/\s+/g, ' ').trim();
  if (!cleaned) return null;
  return cleaned.length > maxLength ? cleaned.slice(0, maxLength) : cleaned;
}

function sanitizeFiniteNumber(value: unknown): number | null {
  if (typeof value !== 'number' || !Number.isFinite(value)) return null;
  return value;
}

function sanitizeSlideRef(value: unknown): SnapshotSlideRef | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const raw = value as Record<string, unknown>;
  const id = sanitizeText(raw.id, 120);
  const index = sanitizeFiniteNumber(raw.index);
  const title = sanitizeText(raw.title);
  if (id === null && index === null && title === null) return null;
  return { id, index, title };
}

function sanitizeSlideRefList(value: unknown): SnapshotSlideRef[] {
  if (!Array.isArray(value)) return [];
  const out: SnapshotSlideRef[] = [];
  for (const entry of value.slice(0, MAX_ITEMS_PER_COLLECTION)) {
    const ref = sanitizeSlideRef(entry);
    if (ref) out.push(ref);
  }
  return out;
}

/**
 * Valida e normaliza um snapshot recebido do cliente.
 * Retorna `null` para qualquer payload inválido — o chamador responde 400.
 */
export function parseCompletionDiagnosticsSnapshot(
  raw: unknown,
): CompletionDiagnosticsSnapshot | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const data = raw as Record<string, unknown>;
  if (data.version !== 1) return null;

  try {
    const serialized = JSON.stringify(data);
    if (typeof serialized !== 'string' || serialized.length > MAX_SNAPSHOT_JSON_CHARS) return null;
  } catch {
    return null;
  }

  const section = (key: string): Record<string, unknown> => {
    const v = data[key];
    return v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : {};
  };

  const slidesRaw = section('slides');
  const assessmentRaw = section('assessment');
  const statusRaw = section('packageStatus');
  const passedRaw = assessmentRaw.passed;

  return {
    version: 1,
    courseId: sanitizeText(data.courseId, 120),
    currentSlide: sanitizeSlideRef(data.currentSlide),
    slides: {
      totalRequired: sanitizeFiniteNumber(slidesRaw.totalRequired),
      completedRequired: sanitizeFiniteNumber(slidesRaw.completedRequired),
      missing: sanitizeSlideRefList(slidesRaw.missing),
    },
    assessment: {
      required: assessmentRaw.required === true,
      completed: assessmentRaw.completed === true,
      scoreRaw: sanitizeFiniteNumber(assessmentRaw.scoreRaw),
      masteryScore: sanitizeFiniteNumber(assessmentRaw.masteryScore),
      passed: typeof passedRaw === 'boolean' ? passedRaw : null,
      unanswered: sanitizeSlideRefList(assessmentRaw.unanswered),
      incomplete: sanitizeSlideRefList(assessmentRaw.incomplete),
    },
    packageStatus: {
      lessonStatus: sanitizeText(statusRaw.lessonStatus, 60),
      finishRequested: statusRaw.finishRequested === true,
    },
    updatedAt: sanitizeText(data.updatedAt, 40),
  };
}
