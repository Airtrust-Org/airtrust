import type { Context } from 'hono';
import type { Env, Variables } from '../types';

type PersistedProgressContext = { Bindings: Env; Variables: Variables };
type JsonRecord = Record<string, unknown>;

type PersistedProgressRow = {
  matricula_progresso_pct: number | null;
  scorm_progress_id: number | null;
  cmi_json: string | null;
  xapi_count: number | null;
};

function jsonResponse(
  c: Context<PersistedProgressContext>,
  status: number,
  body: JsonRecord,
): Response {
  return c.json(body, status as never);
}

function parsePositiveInt(value: unknown): number | null {
  const parsed = typeof value === 'number' ? value : Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
}

function normalizeStatus(value: unknown): string {
  return typeof value === 'string' ? value.trim().toLowerCase() : '';
}

async function readJsonClone(c: Context<PersistedProgressContext>): Promise<JsonRecord> {
  try {
    const parsed = await c.req.raw.clone().json<unknown>();
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
      ? (parsed as JsonRecord)
      : {};
  } catch {
    return {};
  }
}

function progressFromLocationString(location: string): number | null {
  const match = location.match(/(\d+)\s*(?:\/|of)\s*(\d+)/i);
  if (!match) return null;
  const current = Number(match[1]);
  const total = Number(match[2]);
  if (!Number.isFinite(current) || !Number.isFinite(total) || total <= 0) return null;
  return Math.max(0, Math.min(100, (current / total) * 100));
}

function finiteNumberOrNull(value: unknown): number | null {
  if (value === null || value === undefined || value === '') return null;
  const n = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(n) ? n : null;
}

/**
 * RevLMS packages persist a resume snapshot under the `airtrust-scorm12-state`
 * schema (nested inside `cmi.suspend_data` as a JSON string, or as a sibling key
 * of the stored SCORM datamodel). It carries `slideAtual` / `totalSlides` and an
 * optional pre-computed `progresso`. This is durable, package-authored evidence
 * of real navigation — not a self-declared value from the terminal request — so
 * the guard must recognise it. Acceptance stays fail-closed: the structure must
 * be internally coherent (positive integer total, in-range current) before it
 * counts. A bare `completed`/`passed` status or a score is never sufficient.
 */
function progressFromRevlmsState(container: Record<string, unknown>): number | null {
  const candidates: unknown[] = [container['airtrust-scorm12-state'], container.state];

  const suspendRaw =
    container['cmi.suspend_data'] ?? container['cmi.core.suspend_data'] ?? container.suspend_data;
  if (typeof suspendRaw === 'string' && suspendRaw.trim()) {
    try {
      candidates.push(JSON.parse(suspendRaw));
    } catch {
      /* opaque suspend_data: not RevLMS state */
    }
  } else if (suspendRaw && typeof suspendRaw === 'object') {
    candidates.push(suspendRaw);
  }

  for (const candidate of candidates) {
    if (!candidate || typeof candidate !== 'object' || Array.isArray(candidate)) continue;
    const state = candidate as Record<string, unknown>;
    if (state.schema !== undefined && state.schema !== 'airtrust-scorm12-state') continue;

    const slideAtual = finiteNumberOrNull(state.slideAtual);
    const totalSlides = finiteNumberOrNull(state.totalSlides);
    if (
      slideAtual === null ||
      totalSlides === null ||
      !Number.isInteger(slideAtual) ||
      !Number.isInteger(totalSlides) ||
      totalSlides <= 0 ||
      slideAtual < 0 ||
      slideAtual > totalSlides
    ) {
      continue;
    }

    const progresso = finiteNumberOrNull(state.progresso);
    if (progresso !== null && (progresso < 0 || progresso > 100)) continue;

    const derived = (slideAtual / totalSlides) * 100;
    const resolved = progresso !== null ? Math.max(progresso, derived) : derived;
    return Math.max(0, Math.min(100, resolved));
  }

  return null;
}

function progressFromCmiJson(value: string | null): number | null {
  if (!value?.trim()) return null;
  try {
    const parsed = JSON.parse(value) as Record<string, unknown>;

    const location = String(
      parsed['cmi.location'] ?? parsed['cmi.core.lesson_location'] ?? parsed.lesson_location ?? '',
    );
    const fromLocation = progressFromLocationString(location);
    if (fromLocation !== null) return fromLocation;

    return progressFromRevlmsState(parsed);
  } catch {
    return null;
  }
}

/**
 * Completion evidence must pre-exist the terminal request. The current payload,
 * including its score or self-declared location, cannot prove its own progress.
 */
export function hasPersistedCompletionProgressEvidence(row: PersistedProgressRow): boolean {
  const matriculaProgress = Number(row.matricula_progresso_pct ?? 0);
  if (Number.isFinite(matriculaProgress) && matriculaProgress > 0) return true;

  const storedCmiProgress = progressFromCmiJson(row.cmi_json);
  if (storedCmiProgress !== null && storedCmiProgress > 0) return true;

  return Number(row.xapi_count ?? 0) > 0;
}

function isScormCompletion(body: JsonRecord): boolean {
  const lesson = normalizeStatus(body.lesson_status);
  const completion = normalizeStatus(body.completion_status);
  const success = normalizeStatus(body.success_status);
  return (
    ['passed', 'completed', 'complete'].includes(lesson) ||
    ['completed', 'complete'].includes(completion) ||
    success === 'passed' ||
    body.completion_candidate === true
  );
}

function getXapiVerbId(body: JsonRecord): string {
  return body.verb && typeof body.verb === 'object'
    ? normalizeStatus((body.verb as JsonRecord).id)
    : '';
}

function getXapiResult(body: JsonRecord): JsonRecord {
  return body.result && typeof body.result === 'object' ? (body.result as JsonRecord) : {};
}

function isCanonicalXapiTerminalVerb(verb: string): boolean {
  return verb.endsWith('/passed') || verb.endsWith('/completed');
}

function isXapiCompletion(body: JsonRecord): boolean {
  const verb = getXapiVerbId(body);
  const result = getXapiResult(body);
  return isCanonicalXapiTerminalVerb(verb) || result.completion === true;
}

/**
 * Rejects terminal SCORM/xAPI requests when no earlier progress evidence exists.
 * It runs before the generic completion-decision middleware.
 */
export async function enforcePersistedLmsProgressEvidence(
  c: Context<PersistedProgressContext>,
): Promise<Response | null> {
  if (c.req.method.toUpperCase() !== 'POST') return null;
  const path = c.req.path;
  const isScorm = path === '/api/lms/matriculas/scorm/commit';
  const isXapi = path === '/api/lms/xapi/statements';
  if (!isScorm && !isXapi) return null;

  const body = await readJsonClone(c);
  const completionRequested = isScorm ? isScormCompletion(body) : isXapiCompletion(body);
  if (!completionRequested) return null;

  if (isXapi) {
    const verb = getXapiVerbId(body);
    const result = getXapiResult(body);
    if (result.completion === true && !isCanonicalXapiTerminalVerb(verb)) {
      return jsonResponse(c, 409, {
        success: false,
        code: 'LMS_XAPI_TERMINAL_VERB_REQUIRED',
        error: 'Conclusão xAPI exige verbo terminal completed ou passed.',
      });
    }
  }

  const matriculaId = parsePositiveInt(body.matricula_id);
  const empresaId = parsePositiveInt(c.get('empresaId'));
  if (!matriculaId || !empresaId) return null;

  const row = await c.env.DB.prepare(
    `SELECT m.progresso_pct AS matricula_progresso_pct,
              p.matricula_id AS scorm_progress_id,
              p.cmi_json,
              (SELECT COUNT(*)
                 FROM lms_xapi_statements x
                WHERE x.matricula_id = m.id
                  AND x.empresa_id = m.empresa_id) AS xapi_count
         FROM lms_matriculas m
         LEFT JOIN lms_progresso_scorm p
           ON p.matricula_id = m.id
          AND p.empresa_id = m.empresa_id
        WHERE m.id = ?
          AND m.empresa_id = ?
          AND m.deleted_at IS NULL
        LIMIT 1`,
  )
    .bind(matriculaId, empresaId)
    .first<PersistedProgressRow>();

  // The canonical integrity gate owns not-found and ownership responses.
  if (!row) return null;
  if (hasPersistedCompletionProgressEvidence(row)) return null;

  return jsonResponse(c, 409, {
    success: false,
    code: 'LMS_PERSISTED_PROGRESS_REQUIRED',
    error: 'Conclusão rejeitada: não existe progresso anterior persistido para esta matrícula.',
    data: {
      matricula_id: matriculaId,
      persisted_progress_required: true,
    },
  });
}
