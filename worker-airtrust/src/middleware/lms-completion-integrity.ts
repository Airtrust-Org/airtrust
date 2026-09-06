import type { Context } from 'hono';
import { hasRole } from './rbac';
import type { Env, JwtPayload, Variables } from '../types';
import { verifyJWT } from '../utils/security';
import {
  evaluateLmsCompletionEvidence,
  type LmsCompletionDecision,
  type LmsCompletionSource,
} from '../services/lms-completion-evidence';

type LmsIntegrityContext = { Bindings: Env; Variables: Variables };

type JsonRecord = Record<string, unknown>;

type EnrollmentEvidenceRow = {
  id: number;
  empresa_id: number;
  funcionario_id: number;
  status: string;
  progresso_pct: number | null;
  qualificacao_historico_id: number | null;
  curso_id: number;
  tipo_conteudo: string | null;
  ativo: number;
  publicado: number;
  scorm_mastery_score: number | null;
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

const ASSET_COOKIE = 'airtrust_lms_asset_token';

function jsonResponse(c: Context<LmsIntegrityContext>, status: number, body: JsonRecord): Response {
  return c.json(body, status as never);
}

function errorResponse(
  c: Context<LmsIntegrityContext>,
  status: number,
  code: string,
  error: string,
  data?: JsonRecord,
): Response {
  return jsonResponse(c, status, { success: false, code, error, ...(data ? { data } : {}) });
}

function parsePositiveInt(value: unknown): number | null {
  const parsed = typeof value === 'number' ? value : Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
}

function getEmpresaId(c: Context<LmsIntegrityContext>): number | null {
  const direct = c.get('empresaId');
  return parsePositiveInt(direct);
}

function getUserId(c: Context<LmsIntegrityContext>): number | null {
  return parsePositiveInt(c.get('userId'));
}

async function resolveActorFuncionarioId(
  c: Context<LmsIntegrityContext>,
  db: D1Database,
): Promise<number | null> {
  const direct = parsePositiveInt(c.get('funcionarioId'));
  if (direct) return direct;
  const userId = getUserId(c);
  if (!userId) return null;
  const row = await db
    .prepare('SELECT funcionario_id FROM usuarios WHERE id = ? AND deleted_at IS NULL LIMIT 1')
    .bind(userId)
    .first<{ funcionario_id: number | null }>();
  return parsePositiveInt(row?.funcionario_id);
}

async function readJsonClone(c: Context<LmsIntegrityContext>): Promise<JsonRecord> {
  try {
    const parsed = await c.req.raw.clone().json<unknown>();
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
      ? (parsed as JsonRecord)
      : {};
  } catch {
    return {};
  }
}

function normalizeStatus(value: unknown): string {
  return typeof value === 'string' ? value.trim().toLowerCase() : '';
}

function parseAssetCookie(request: Request): string | null {
  const cookieHeader = request.headers.get('cookie') ?? '';
  for (const part of cookieHeader.split(';')) {
    const [name, ...rest] = part.trim().split('=');
    if (name !== ASSET_COOKIE) continue;
    const encoded = rest.join('=').trim();
    if (!encoded) return null;
    try {
      return decodeURIComponent(encoded);
    } catch {
      return null;
    }
  }
  return null;
}

async function hasValidAssetSession(
  c: Context<LmsIntegrityContext>,
  row: EnrollmentEvidenceRow,
): Promise<boolean> {
  if (!c.env.JWT_SECRET) return false;
  const token = parseAssetCookie(c.req.raw);
  if (!token) return false;
  const payload = (await verifyJWT(token, c.env.JWT_SECRET)) as JwtPayload | null;
  if (!payload || payload.token_type !== 'lms_asset' || payload.asset_scope !== 'course_assets') {
    return false;
  }
  return (
    Number(payload.empresa_id ?? 0) === row.empresa_id &&
    Number(payload.asset_curso_id ?? 0) === row.curso_id &&
    Number(payload.asset_matricula_id ?? 0) === row.id &&
    payload.asset_preview !== true
  );
}

async function readEnrollmentEvidence(
  db: D1Database,
  empresaId: number,
  matriculaId: number,
): Promise<EnrollmentEvidenceRow | null> {
  return db
    .prepare(
      `SELECT m.id, m.empresa_id, m.funcionario_id, m.status, m.progresso_pct,
              m.qualificacao_historico_id,
              c.id AS curso_id, c.tipo_conteudo, c.ativo, c.publicado,
              c.scorm_mastery_score, c.scorm_package_r2_prefix, c.scorm_launch_file,
              c.gerar_qualificacao_ao_concluir,
              p.lesson_status, p.completion_status, p.success_status,
              p.score_raw, p.score_min, p.score_max, p.score_scaled,
              p.session_time, p.total_time, p.suspend_data, p.cmi_json,
              (SELECT COUNT(*) FROM lms_xapi_statements x
                WHERE x.matricula_id = m.id AND x.empresa_id = m.empresa_id) AS xapi_count
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
        LIMIT 1`,
    )
    .bind(matriculaId, empresaId)
    .first<EnrollmentEvidenceRow>();
}

function scorePctFromValues(raw: unknown, max: unknown, scaled: unknown): number | null {
  if (typeof scaled === 'number' && Number.isFinite(scaled) && scaled >= 0 && scaled <= 1) {
    return scaled * 100;
  }
  if (
    typeof raw === 'number' &&
    Number.isFinite(raw) &&
    typeof max === 'number' &&
    Number.isFinite(max) &&
    max > 0
  ) {
    return Math.max(0, Math.min(100, (raw / max) * 100));
  }
  if (typeof raw === 'number' && Number.isFinite(raw) && raw >= 0 && raw <= 100) return raw;
  return null;
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
  );
  const storedScore = scorePctFromValues(row.score_raw, row.score_max, row.score_scaled);
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

function hasStoredRuntimeEvidence(row: EnrollmentEvidenceRow): boolean {
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

function isInteractive(row: EnrollmentEvidenceRow): boolean {
  const type = String(row.tipo_conteudo ?? 'scorm')
    .trim()
    .toLowerCase();
  return type === 'scorm' || type === 'h5p';
}

function contentEvidenceValidated(row: EnrollmentEvidenceRow, source: LmsCompletionSource): boolean {
  const type = String(row.tipo_conteudo ?? 'scorm')
    .trim()
    .toLowerCase();

  // SCORM and H5P completion claims are checked by their respective runtime
  // guards above. A manual/admin request may reuse only persisted SCORM final
  // status; it must never turn a client-owned non-SCORM percentage into an
  // issuance signal.
  if (source === 'scorm') return type === 'scorm';
  if (source === 'xapi') return type === 'h5p';
  if (source === 'administrative') {
    return (
      type === 'scorm' &&
      (['completed', 'complete'].includes(normalizeStatus(row.completion_status)) ||
        ['passed', 'completed', 'complete'].includes(normalizeStatus(row.lesson_status)) ||
        normalizeStatus(row.success_status) === 'passed')
    );
  }
  return false;
}

function packageBound(row: EnrollmentEvidenceRow): boolean {
  const type = String(row.tipo_conteudo ?? 'scorm')
    .trim()
    .toLowerCase();
  if (type === 'scorm') {
    return Boolean(row.scorm_package_r2_prefix && row.scorm_launch_file);
  }
  if (type === 'h5p') return Boolean(row.scorm_package_r2_prefix);
  return true;
}

function buildDecision(
  row: EnrollmentEvidenceRow,
  source: LmsCompletionSource,
  incoming: JsonRecord,
  assetSessionValid: boolean,
  options: {
    explicitCompletion?: boolean;
    explicitFailure?: boolean;
    administrativeAuthorized?: boolean;
    administrativeReason?: unknown;
  } = {},
): LmsCompletionDecision {
  const interactive = isInteractive(row);
  const incomingLesson = incoming.lesson_status;
  const incomingCompletion = incoming.completion_status;
  const incomingSuccess = incoming.success_status;
  const progressPct = resolveProgressPct(row, incoming);
  const progressPresent =
    hasStoredRuntimeEvidence(row) ||
    hasIncomingRuntimeEvidence(incoming) ||
    Number(row.xapi_count ?? 0) > 0 ||
    progressPct > 0;
  // Preserve the existing qualification policy: interactive content that
  // generates an operational qualification must still satisfy the assessment
  // gate. The new non-SCORM evidence gate must not weaken SCORM/H5P rules.
  const requiresAssessment =
    interactive && (row.gerar_qualificacao_ao_concluir === 1 || row.scorm_mastery_score !== null);

  return evaluateLmsCompletionEvidence({
    source,
    enrollmentActive: !['CANCELADO'].includes(String(row.status).toUpperCase()),
    courseAvailable: row.ativo === 1 && row.publicado === 1,
    packageBound: packageBound(row),
    assetSessionValid,
    progressRowPresent: progressPresent,
    progressPct,
    lessonStatus: incomingLesson ?? row.lesson_status,
    completionStatus: incomingCompletion ?? row.completion_status,
    successStatus: incomingSuccess ?? row.success_status,
    explicitCompletion: options.explicitCompletion,
    explicitFailure: options.explicitFailure,
    scoreRaw: incoming.score_raw ?? row.score_raw,
    scoreMin: incoming.score_min ?? row.score_min,
    scoreMax: incoming.score_max ?? row.score_max,
    scoreScaled: incoming.score_scaled ?? row.score_scaled,
    masteryScore: row.scorm_mastery_score,
    requiresAssessment,
    generatesQualification: row.gerar_qualificacao_ao_concluir === 1,
    informativeCourse: !interactive && row.gerar_qualificacao_ao_concluir !== 1,
    contentEvidenceValidated: contentEvidenceValidated(row, source),
    minimumTimeSatisfied: undefined,
    administrativeAuthorized: options.administrativeAuthorized,
    administrativeReason: options.administrativeReason,
  });
}

function decisionRejection(
  c: Context<LmsIntegrityContext>,
  matriculaId: number,
  decision: LmsCompletionDecision,
): Response {
  return errorResponse(
    c,
    409,
    decision.code,
    'Conclusão rejeitada: as evidências LMS não satisfazem o contrato canônico.',
    {
      matricula_id: matriculaId,
      completion_decision: decision,
    },
  );
}

async function enforceOwnership(
  c: Context<LmsIntegrityContext>,
  row: EnrollmentEvidenceRow,
): Promise<Response | null> {
  if (hasRole(c, 'admin', 'manager')) return null;
  const actorFuncionarioId = await resolveActorFuncionarioId(c, c.env.DB);
  if (!actorFuncionarioId || actorFuncionarioId !== row.funcionario_id) {
    return errorResponse(c, 403, 'LMS_ENROLLMENT_OWNERSHIP_REQUIRED', 'Acesso negado.');
  }
  return null;
}

async function guardScormCommit(
  c: Context<LmsIntegrityContext>,
  empresaId: number,
): Promise<Response | null> {
  const incoming = await readJsonClone(c);
  const matriculaId = parsePositiveInt(incoming.matricula_id);
  if (!matriculaId) return null;
  const lesson = normalizeStatus(incoming.lesson_status);
  const completion = normalizeStatus(incoming.completion_status);
  const success = normalizeStatus(incoming.success_status);
  const completionSignal =
    ['passed', 'completed', 'complete'].includes(lesson) ||
    ['completed', 'complete'].includes(completion) ||
    success === 'passed' ||
    incoming.completion_candidate === true;
  const failureSignal = lesson === 'failed' || success === 'failed';
  if (!completionSignal) return null; // pure failure/progress still reaches the canonical route

  const row = await readEnrollmentEvidence(c.env.DB, empresaId, matriculaId);
  if (!row) return errorResponse(c, 404, 'LMS_ENROLLMENT_NOT_FOUND', 'Matrícula não encontrada.');
  const ownershipError = await enforceOwnership(c, row);
  if (ownershipError) return ownershipError;
  const assetSessionValid = await hasValidAssetSession(c, row);
  const decision = buildDecision(row, 'scorm', incoming, assetSessionValid, {
    explicitCompletion:
      ['completed', 'complete'].includes(completion) || incoming.completion_candidate === true,
    explicitFailure: failureSignal,
  });
  return decision.accepted ? null : decisionRejection(c, matriculaId, decision);
}

async function guardXapiStatement(
  c: Context<LmsIntegrityContext>,
  empresaId: number,
): Promise<Response | null> {
  const incoming = await readJsonClone(c);
  const matriculaId = parsePositiveInt(incoming.matricula_id);
  if (!matriculaId) return null;
  const verb =
    incoming.verb && typeof incoming.verb === 'object'
      ? normalizeStatus((incoming.verb as JsonRecord).id)
      : '';
  const result =
    incoming.result && typeof incoming.result === 'object' ? (incoming.result as JsonRecord) : {};
  const completionSignal = verb.endsWith('/passed') || verb.endsWith('/completed');
  const failureSignal = verb.endsWith('/failed') || result.success === false;
  if (!completionSignal) return null;

  const row = await readEnrollmentEvidence(c.env.DB, empresaId, matriculaId);
  if (!row) return errorResponse(c, 404, 'LMS_ENROLLMENT_NOT_FOUND', 'Matrícula não encontrada.');
  const ownershipError = await enforceOwnership(c, row);
  if (ownershipError) return ownershipError;
  const assetSessionValid = await hasValidAssetSession(c, row);
  const score =
    result.score && typeof result.score === 'object' ? (result.score as JsonRecord) : {};
  const normalized: JsonRecord = {
    lesson_status: verb.endsWith('/failed')
      ? 'failed'
      : verb.endsWith('/passed')
        ? 'passed'
        : verb.endsWith('/completed')
          ? 'completed'
          : null,
    completion_status:
      result.completion === true ? 'completed' : result.completion === false ? 'incomplete' : null,
    success_status: result.success === true ? 'passed' : result.success === false ? 'failed' : null,
    score_raw: score.raw,
    score_min: score.min,
    score_max: score.max,
    score_scaled: score.scaled,
    total_time: result.duration,
  };
  const decision = buildDecision(row, 'xapi', normalized, assetSessionValid, {
    explicitCompletion: result.completion === true || verb.endsWith('/completed'),
    explicitFailure: failureSignal,
  });
  return decision.accepted ? null : decisionRejection(c, matriculaId, decision);
}

async function guardManualFinalize(
  c: Context<LmsIntegrityContext>,
  empresaId: number,
  matriculaId: number,
): Promise<Response | null> {
  const row = await readEnrollmentEvidence(c.env.DB, empresaId, matriculaId);
  if (!row) return errorResponse(c, 404, 'LMS_ENROLLMENT_NOT_FOUND', 'Matrícula não encontrada.');
  const ownershipError = await enforceOwnership(c, row);
  if (ownershipError) return ownershipError;
  if (String(row.status).toUpperCase() === 'CONCLUIDO') return null;
  const assetSessionValid = await hasValidAssetSession(c, row);
  const storedCompletion =
    ['completed', 'complete'].includes(normalizeStatus(row.completion_status)) ||
    Number(row.progresso_pct ?? 0) >= 100;
  const decision = buildDecision(row, 'manual', {}, assetSessionValid, {
    explicitCompletion: storedCompletion,
    explicitFailure:
      normalizeStatus(row.lesson_status) === 'failed' ||
      normalizeStatus(row.success_status) === 'failed',
  });
  return decision.accepted ? null : decisionRejection(c, matriculaId, decision);
}

async function guardAdministrativeStatus(
  c: Context<LmsIntegrityContext>,
  empresaId: number,
  matriculaId: number,
): Promise<Response | null> {
  const incoming = await readJsonClone(c);
  const requestedStatus = String(incoming.status ?? '')
    .trim()
    .toUpperCase();
  const row = await readEnrollmentEvidence(c.env.DB, empresaId, matriculaId);
  if (!row) return errorResponse(c, 404, 'LMS_ENROLLMENT_NOT_FOUND', 'Matrícula não encontrada.');

  if (String(row.status).toUpperCase() === 'CONCLUIDO' && requestedStatus !== 'CONCLUIDO') {
    return errorResponse(
      c,
      409,
      'LMS_COMPLETION_REVERSAL_REQUIRED',
      'Conclusões não podem ser rebaixadas por PATCH. Use o caminho governado de reversão.',
      {
        matricula_id: matriculaId,
        reversal_endpoint: `/api/lms/matriculas/${matriculaId}/reverter`,
      },
    );
  }
  if (requestedStatus !== 'CONCLUIDO') return null;

  const administrativeAuthorized =
    hasRole(c, 'admin') || (hasRole(c, 'manager') && row.gerar_qualificacao_ao_concluir !== 1);
  const decision = buildDecision(row, 'administrative', {}, true, {
    explicitCompletion: true,
    explicitFailure:
      normalizeStatus(row.lesson_status) === 'failed' ||
      normalizeStatus(row.success_status) === 'failed',
    administrativeAuthorized,
    administrativeReason: incoming.observacoes,
  });
  return decision.accepted ? null : decisionRejection(c, matriculaId, decision);
}

async function handleProgressPatch(
  c: Context<LmsIntegrityContext>,
  empresaId: number,
  matriculaId: number,
): Promise<Response> {
  const body = await readJsonClone(c);
  const allowed = ['progresso_pct', 'ultimo_slide', 'ultima_pagina'] as const;
  const values: Partial<Record<(typeof allowed)[number], number>> = {};
  for (const key of allowed) {
    if (body[key] === undefined) continue;
    if (typeof body[key] !== 'number' || !Number.isInteger(body[key]) || Number(body[key]) < 0) {
      return errorResponse(c, 400, 'LMS_PROGRESS_INVALID', `Campo ${key} inválido.`);
    }
    values[key] = Number(body[key]);
  }
  if (values.progresso_pct !== undefined && values.progresso_pct > 100) {
    return errorResponse(c, 400, 'LMS_PROGRESS_INVALID', 'progresso_pct deve estar entre 0 e 100.');
  }
  if (Object.keys(values).length === 0) {
    return errorResponse(
      c,
      400,
      'LMS_PROGRESS_INVALID',
      'Nenhum campo de progresso foi informado.',
    );
  }

  const existing = await c.env.DB.prepare(
    `SELECT id, status, funcionario_id, progresso_pct, ultimo_slide, ultima_pagina
         FROM lms_matriculas
        WHERE id = ? AND empresa_id = ? AND deleted_at IS NULL
        LIMIT 1`,
  )
    .bind(matriculaId, empresaId)
    .first<{
      id: number;
      status: string;
      funcionario_id: number;
      progresso_pct: number | null;
      ultimo_slide: number | null;
      ultima_pagina: number | null;
    }>();
  if (!existing)
    return errorResponse(c, 404, 'LMS_ENROLLMENT_NOT_FOUND', 'Matrícula não encontrada.');

  if (!hasRole(c, 'admin', 'manager')) {
    const actorFuncionarioId = await resolveActorFuncionarioId(c, c.env.DB);
    if (!actorFuncionarioId || actorFuncionarioId !== existing.funcionario_id) {
      return errorResponse(
        c,
        403,
        'LMS_PROGRESS_OWNERSHIP_REQUIRED',
        'Sem permissão para atualizar esta matrícula.',
      );
    }
  }
  if (String(existing.status).toUpperCase() === 'CANCELADO') {
    return errorResponse(
      c,
      409,
      'LMS_ENROLLMENT_INACTIVE',
      'Matrícula cancelada não aceita progresso.',
    );
  }
  if (String(existing.status).toUpperCase() === 'CONCLUIDO') {
    return jsonResponse(c, 200, {
      success: true,
      data: { matricula_id: matriculaId, status: 'CONCLUIDO', ignored: true },
    });
  }

  const newStatus =
    String(existing.status).toUpperCase() === 'NAO_INICIADO' ? 'EM_ANDAMENTO' : existing.status;
  const setClauses = [
    "updated_at = datetime('now')",
    'status = ?',
    "data_inicio = COALESCE(data_inicio, datetime('now'))",
  ];
  const binds: unknown[] = [newStatus];
  if (values.progresso_pct !== undefined) {
    setClauses.push('progresso_pct = MAX(COALESCE(progresso_pct, 0), ?)');
    binds.push(values.progresso_pct);
  }
  if (values.ultimo_slide !== undefined) {
    setClauses.push('ultimo_slide = MAX(COALESCE(ultimo_slide, 0), ?)');
    binds.push(values.ultimo_slide);
  }
  if (values.ultima_pagina !== undefined) {
    setClauses.push('ultima_pagina = MAX(COALESCE(ultima_pagina, 0), ?)');
    binds.push(values.ultima_pagina);
  }
  binds.push(matriculaId, empresaId, existing.funcionario_id);

  const audit = {
    old: {
      status: existing.status,
      progresso_pct: existing.progresso_pct,
      ultimo_slide: existing.ultimo_slide,
      ultima_pagina: existing.ultima_pagina,
    },
    requested: values,
  };
  await c.env.DB.batch([
    c.env.DB.prepare(
      `UPDATE lms_matriculas SET ${setClauses.join(', ')}
          WHERE id = ? AND empresa_id = ? AND funcionario_id = ? AND deleted_at IS NULL`,
    ).bind(...binds),
    c.env.DB.prepare(
      `INSERT INTO audit_logs
          (user_id, action, entity_type, entity_id, old_values, new_values, ip_address, user_agent, empresa_id, created_at)
         VALUES (?, 'LMS_PROGRESS_UPDATED', 'lms_matriculas', ?, ?, ?, ?, ?, ?, datetime('now'))`,
    ).bind(
      getUserId(c),
      matriculaId,
      JSON.stringify(audit.old),
      JSON.stringify({ status: newStatus, ...values }),
      c.req.header('cf-connecting-ip') ?? c.req.header('x-forwarded-for') ?? null,
      c.req.header('user-agent') ?? null,
      empresaId,
    ),
  ]);

  const updated = await c.env.DB.prepare(
    `SELECT id, status, progresso_pct, ultimo_slide, ultima_pagina
         FROM lms_matriculas WHERE id = ? AND empresa_id = ? AND funcionario_id = ?`,
  )
    .bind(matriculaId, empresaId, existing.funcionario_id)
    .first<Record<string, unknown>>();
  return jsonResponse(c, 200, { success: true, data: { matricula_id: matriculaId, ...updated } });
}

async function guardSelfEnrollment(
  c: Context<LmsIntegrityContext>,
  empresaId: number,
): Promise<Response | null> {
  const body = await readJsonClone(c);
  const funcionarioId = parsePositiveInt(body.funcionario_id);
  const cursoId = parsePositiveInt(body.curso_id);
  if (!funcionarioId || !cursoId) return null;

  const existing = await c.env.DB.prepare(
    `SELECT id, status, deleted_at, qualificacao_historico_id
         FROM lms_matriculas
        WHERE curso_id = ? AND funcionario_id = ? AND empresa_id = ?
        LIMIT 1`,
  )
    .bind(cursoId, funcionarioId, empresaId)
    .first<{
      id: number;
      status: string;
      deleted_at: string | null;
      qualificacao_historico_id: number | null;
    }>();
  if (existing && (existing.deleted_at || String(existing.status).toUpperCase() === 'CANCELADO')) {
    return errorResponse(
      c,
      409,
      'LMS_REMATRICULATION_REQUIRED',
      'A matrícula anterior está cancelada. Ela não pode ser devolvida como nova matrícula.',
      {
        matricula_id: existing.id,
        rematriculation_endpoint: `/api/lms/matriculas/${existing.id}/rematricular`,
      },
    );
  }

  if (hasRole(c, 'admin', 'manager')) return null;
  const actorFuncionarioId = await resolveActorFuncionarioId(c, c.env.DB);
  if (!actorFuncionarioId || actorFuncionarioId !== funcionarioId) {
    return errorResponse(c, 403, 'LMS_SELF_ENROLLMENT_OWNERSHIP_REQUIRED', 'Acesso negado.');
  }

  const policy = await c.env.DB.prepare(
    `SELECT c.id, c.ativo, c.publicado, f.setor_id,
              CASE WHEN EXISTS (
                SELECT 1 FROM lms_cursos_setores cs
                 WHERE cs.curso_id = c.id AND cs.empresa_id = c.empresa_id
                   AND cs.setor_id = f.setor_id AND cs.deleted_at IS NULL
              ) THEN 1 ELSE 0 END AS course_designated,
              CASE WHEN c.qualificacao_tipo_id IS NOT NULL AND EXISTS (
                SELECT 1 FROM qualificacoes_tipos_setores qs
                 WHERE qs.tipo_id = c.qualificacao_tipo_id AND qs.empresa_id = c.empresa_id
                   AND qs.setor_id = f.setor_id AND qs.deleted_at IS NULL
              ) THEN 1 ELSE 0 END AS qualification_designated
         FROM lms_cursos c
         JOIN funcionarios f
           ON f.id = ? AND f.empresa_id = c.empresa_id AND f.deleted_at IS NULL
        WHERE c.id = ? AND c.empresa_id = ? AND c.deleted_at IS NULL
        LIMIT 1`,
  )
    .bind(funcionarioId, cursoId, empresaId)
    .first<{
      id: number;
      ativo: number;
      publicado: number;
      setor_id: number | null;
      course_designated: number;
      qualification_designated: number;
    }>();
  if (!policy || policy.ativo !== 1 || policy.publicado !== 1) {
    return errorResponse(c, 404, 'LMS_COURSE_UNAVAILABLE', 'Curso não encontrado ou indisponível.');
  }
  if (policy.course_designated !== 1 && policy.qualification_designated !== 1) {
    return errorResponse(
      c,
      403,
      'LMS_SELF_ENROLLMENT_NOT_ALLOWED',
      'Publicação não concede matrícula livre. O curso precisa estar explicitamente designado ao setor do aluno.',
    );
  }
  return null;
}

async function handleRematriculation(
  c: Context<LmsIntegrityContext>,
  empresaId: number,
  matriculaId: number,
): Promise<Response> {
  if (!hasRole(c, 'admin', 'manager')) {
    return errorResponse(c, 403, 'LMS_REMATRICULATION_FORBIDDEN', 'Acesso negado.');
  }
  const body = await readJsonClone(c);
  const reason = typeof body.reason === 'string' ? body.reason.trim() : '';
  if (reason.length < 10) {
    return errorResponse(
      c,
      400,
      'LMS_REMATRICULATION_REASON_REQUIRED',
      'Informe uma justificativa com ao menos 10 caracteres.',
    );
  }
  const existing = await c.env.DB.prepare(
    `SELECT id, curso_id, funcionario_id, status, deleted_at, qualificacao_historico_id,
              progresso_pct, score_final, data_inicio, data_conclusao
         FROM lms_matriculas
        WHERE id = ? AND empresa_id = ?
        LIMIT 1`,
  )
    .bind(matriculaId, empresaId)
    .first<{
      id: number;
      curso_id: number;
      funcionario_id: number;
      status: string;
      deleted_at: string | null;
      qualificacao_historico_id: number | null;
      progresso_pct: number | null;
      score_final: number | null;
      data_inicio: string | null;
      data_conclusao: string | null;
    }>();
  if (!existing)
    return errorResponse(c, 404, 'LMS_ENROLLMENT_NOT_FOUND', 'Matrícula não encontrada.');
  if (!existing.deleted_at && String(existing.status).toUpperCase() !== 'CANCELADO') {
    return errorResponse(
      c,
      409,
      'LMS_REMATRICULATION_NOT_ALLOWED',
      'A matrícula ainda está ativa.',
    );
  }
  if (existing.qualificacao_historico_id) {
    return errorResponse(
      c,
      409,
      'LMS_COMPLETION_REVERSAL_REQUIRED',
      'A matrícula possui qualificação vinculada. Reverta a conclusão antes de rematricular.',
    );
  }

  const progressSnapshot = await c.env.DB.prepare(
    `SELECT lesson_status, completion_status, success_status, score_raw, score_min, score_max,
              score_scaled, session_time, total_time, suspend_data, launch_data, cmi_json, session_count
         FROM lms_progresso_scorm WHERE matricula_id = ? AND empresa_id = ?`,
  )
    .bind(matriculaId, empresaId)
    .first<Record<string, unknown>>();
  try {
    await c.env.DB.batch([
      c.env.DB.prepare(
        `UPDATE lms_matricula_ciclos
              SET ciclo_atual = 0, status = 'CANCELADO', updated_at = datetime('now')
            WHERE matricula_id = ? AND empresa_id = ? AND ciclo_atual = 1 AND deleted_at IS NULL`,
      ).bind(matriculaId, empresaId),
      c.env.DB.prepare(
        `UPDATE lms_matriculas
              SET status = 'NAO_INICIADO', progresso_pct = 0, score_final = NULL,
                  tentativas = 0, data_inicio = NULL, data_conclusao = NULL,
                  data_expiracao = COALESCE(?, data_expiracao), qualificacao_historico_id = NULL,
                  observacoes = CASE WHEN COALESCE(observacoes, '') = '' THEN ? ELSE observacoes || char(10) || ? END,
                  deleted_at = NULL, updated_at = datetime('now')
            WHERE id = ? AND empresa_id = ?
              AND (deleted_at IS NOT NULL OR status = 'CANCELADO')`,
      ).bind(
        body.data_expiracao ?? null,
        `Rematrícula: ${reason}`,
        `Rematrícula: ${reason}`,
        matriculaId,
        empresaId,
      ),
      c.env.DB.prepare(
        `UPDATE lms_progresso_scorm
              SET lesson_status = 'not attempted', completion_status = 'unknown', success_status = 'unknown',
                  score_raw = NULL, score_min = NULL, score_max = NULL, score_scaled = NULL,
                  session_time = NULL, total_time = NULL, suspend_data = NULL, launch_data = NULL,
                  cmi_json = NULL, session_count = 0, updated_at = datetime('now')
            WHERE matricula_id = ? AND empresa_id = ?`,
      ).bind(matriculaId, empresaId),
      c.env.DB.prepare(
        `INSERT INTO lms_matricula_ciclos
            (empresa_id, matricula_id, curso_id, funcionario_id, numero_ciclo, origem,
             status, ciclo_atual, observacoes, data_matricula, progresso_pct, tentativas,
             created_at, updated_at, deleted_at)
           SELECT m.empresa_id, m.id, m.curso_id, m.funcionario_id,
                  COALESCE((SELECT MAX(numero_ciclo) FROM lms_matricula_ciclos WHERE matricula_id = m.id), 0) + 1,
                  'MANUAL', 'NAO_INICIADO', 1, ?, datetime('now'), 0, 0,
                  datetime('now'), datetime('now'), NULL
             FROM lms_matriculas m
            WHERE m.id = ? AND m.empresa_id = ? AND m.deleted_at IS NULL`,
      ).bind(`Rematrícula autorizada: ${reason}`, matriculaId, empresaId),
      c.env.DB.prepare(
        `INSERT INTO audit_logs
            (user_id, action, entity_type, entity_id, old_values, new_values, ip_address, user_agent, empresa_id, created_at)
           VALUES (?, 'LMS_REMATRICULATION', 'lms_matriculas', ?, ?, ?, ?, ?, ?, datetime('now'))`,
      ).bind(
        getUserId(c),
        matriculaId,
        JSON.stringify({ ...existing, scorm_progress: progressSnapshot ?? null }),
        JSON.stringify({ status: 'NAO_INICIADO', progresso_pct: 0, reason }),
        c.req.header('cf-connecting-ip') ?? c.req.header('x-forwarded-for') ?? null,
        c.req.header('user-agent') ?? null,
        empresaId,
      ),
    ]);
  } catch {
    return errorResponse(
      c,
      409,
      'LMS_REMATRICULATION_CONFLICT',
      'A rematrícula concorreu com outra alteração. Recarregue o estado.',
    );
  }
  return jsonResponse(c, 200, {
    success: true,
    data: { matricula_id: matriculaId, status: 'NAO_INICIADO', rematriculated: true },
  });
}

async function handleCompletionReversal(
  c: Context<LmsIntegrityContext>,
  empresaId: number,
  matriculaId: number,
): Promise<Response> {
  if (!hasRole(c, 'admin')) {
    return errorResponse(
      c,
      403,
      'LMS_COMPLETION_REVERSAL_FORBIDDEN',
      'Somente administradores podem reverter conclusões.',
    );
  }
  const body = await readJsonClone(c);
  const reason = typeof body.reason === 'string' ? body.reason.trim() : '';
  const classification = String(body.classification ?? '')
    .trim()
    .toUpperCase();
  const allowed = new Set(['CORRECAO', 'FRAUDE', 'ERRO_PACOTE', 'REGRA_HISTORICA', 'INVALIDACAO']);
  if (reason.length < 10 || !allowed.has(classification)) {
    return errorResponse(
      c,
      400,
      'LMS_COMPLETION_REVERSAL_INVALID',
      'Informe justificativa e classificação válida para a reversão.',
    );
  }
  const existing = await c.env.DB.prepare(
    `SELECT m.id, m.status, m.progresso_pct, m.score_final, m.funcionario_id,
              m.qualificacao_historico_id,
              qh.status AS qualificacao_status, qh.certificado_arquivo_id
         FROM lms_matriculas m
         LEFT JOIN qualificacoes_historico qh
           ON qh.id = m.qualificacao_historico_id
          AND qh.empresa_id = m.empresa_id
        WHERE m.id = ? AND m.empresa_id = ? AND m.deleted_at IS NULL
        LIMIT 1`,
  )
    .bind(matriculaId, empresaId)
    .first<{
      id: number;
      status: string;
      progresso_pct: number | null;
      score_final: number | null;
      funcionario_id: number;
      qualificacao_historico_id: number | null;
      qualificacao_status: string | null;
      certificado_arquivo_id: number | null;
    }>();
  if (!existing)
    return errorResponse(c, 404, 'LMS_ENROLLMENT_NOT_FOUND', 'Matrícula não encontrada.');
  if (String(existing.status).toUpperCase() !== 'CONCLUIDO') {
    return errorResponse(
      c,
      409,
      'LMS_COMPLETION_NOT_ACTIVE',
      'A matrícula não possui conclusão ativa para reverter.',
    );
  }

  const marker = `Conclusão LMS invalidada (${classification}): ${reason}`;
  const statements: D1PreparedStatement[] = [
    c.env.DB.prepare(
      `UPDATE lms_matriculas
            SET status = 'EM_ANDAMENTO', progresso_pct = MIN(COALESCE(progresso_pct, 0), 99),
                score_final = NULL, data_conclusao = NULL, qualificacao_historico_id = NULL,
                observacoes = CASE WHEN COALESCE(observacoes, '') = '' THEN ? ELSE observacoes || char(10) || ? END,
                updated_at = datetime('now')
          WHERE id = ? AND empresa_id = ? AND status = 'CONCLUIDO' AND deleted_at IS NULL`,
    ).bind(marker, marker, matriculaId, empresaId),
    c.env.DB.prepare(
      `UPDATE lms_matricula_ciclos
            SET status = 'EM_ANDAMENTO', data_conclusao = NULL,
                progresso_pct = MIN(COALESCE(progresso_pct, 0), 99), score_final = NULL,
                qualificacao_historico_id = NULL,
                observacoes = CASE WHEN COALESCE(observacoes, '') = '' THEN ? ELSE observacoes || char(10) || ? END,
                updated_at = datetime('now')
          WHERE matricula_id = ? AND empresa_id = ? AND ciclo_atual = 1 AND deleted_at IS NULL`,
    ).bind(marker, marker, matriculaId, empresaId),
    c.env.DB.prepare(
      `UPDATE lms_progresso_scorm
            SET lesson_status = 'incomplete', completion_status = 'incomplete', success_status = 'unknown',
                score_raw = NULL, score_scaled = NULL, updated_at = datetime('now')
          WHERE matricula_id = ? AND empresa_id = ?`,
    ).bind(matriculaId, empresaId),
  ];
  if (existing.qualificacao_historico_id) {
    statements.push(
      c.env.DB.prepare(
        `UPDATE qualificacoes_historico
              SET status = 'INVALIDADA',
                  observacoes = CASE WHEN COALESCE(observacoes, '') = '' THEN ? ELSE observacoes || char(10) || ? END,
                  deleted_at = COALESCE(deleted_at, datetime('now')), updated_at = datetime('now')
            WHERE id = ? AND empresa_id = ? AND funcionario_id = ?`,
      ).bind(
        marker,
        marker,
        existing.qualificacao_historico_id,
        empresaId,
        existing.funcionario_id,
      ),
    );
  }
  if (existing.certificado_arquivo_id && existing.qualificacao_historico_id) {
    statements.push(
      c.env.DB.prepare(
        `UPDATE documentos
              SET deleted_at = COALESCE(deleted_at, datetime('now')), updated_at = datetime('now')
            WHERE id = ?
              AND EXISTS (
                SELECT 1 FROM qualificacoes_historico qh
                 WHERE qh.id = ? AND qh.empresa_id = ? AND qh.certificado_arquivo_id = documentos.id
              )`,
      ).bind(existing.certificado_arquivo_id, existing.qualificacao_historico_id, empresaId),
    );
  }
  statements.push(
    c.env.DB.prepare(
      `INSERT INTO audit_logs
          (user_id, action, entity_type, entity_id, old_values, new_values, ip_address, user_agent, empresa_id, created_at)
         VALUES (?, 'LMS_COMPLETION_REVERSED', 'lms_matriculas', ?, ?, ?, ?, ?, ?, datetime('now'))`,
    ).bind(
      getUserId(c),
      matriculaId,
      JSON.stringify(existing),
      JSON.stringify({
        status: 'EM_ANDAMENTO',
        qualification_invalidated: Boolean(existing.qualificacao_historico_id),
        certificate_invalidated: Boolean(existing.certificado_arquivo_id),
        classification,
        reason,
      }),
      c.req.header('cf-connecting-ip') ?? c.req.header('x-forwarded-for') ?? null,
      c.req.header('user-agent') ?? null,
      empresaId,
    ),
  );
  await c.env.DB.batch(statements);
  return jsonResponse(c, 200, {
    success: true,
    data: {
      matricula_id: matriculaId,
      status: 'EM_ANDAMENTO',
      qualificacao_invalidada: Boolean(existing.qualificacao_historico_id),
      certificado_invalidado: Boolean(existing.certificado_arquivo_id),
      qr_valido: false,
    },
  });
}

/**
 * Runs after global auth + tenant resolution and before the LMS route handlers.
 * Returning a Response short-circuits the legacy handler; returning null keeps
 * the existing HTTP contract while enforcing this canonical integrity gate.
 */
export async function enforceLmsCompletionIntegrity(
  c: Context<LmsIntegrityContext>,
): Promise<Response | null> {
  const path = c.req.path;
  const method = c.req.method.toUpperCase();
  if (!path.startsWith('/api/lms/')) return null;
  const empresaId = getEmpresaId(c);
  if (!empresaId) return null;

  if (method === 'POST' && path === '/api/lms/matriculas/scorm/commit') {
    return guardScormCommit(c, empresaId);
  }
  if (method === 'POST' && path === '/api/lms/xapi/statements') {
    return guardXapiStatement(c, empresaId);
  }
  if (method === 'POST' && path === '/api/lms/matriculas') {
    return guardSelfEnrollment(c, empresaId);
  }

  const progress = path.match(/^\/api\/lms\/matriculas\/(\d+)\/progresso$/);
  if (method === 'PATCH' && progress) {
    return handleProgressPatch(c, empresaId, Number(progress[1]));
  }
  const finalize = path.match(/^\/api\/lms\/matriculas\/(\d+)\/finalizar$/);
  if (method === 'POST' && finalize) {
    return guardManualFinalize(c, empresaId, Number(finalize[1]));
  }
  const status = path.match(/^\/api\/lms\/matriculas\/(\d+)\/status$/);
  if (method === 'PATCH' && status) {
    return guardAdministrativeStatus(c, empresaId, Number(status[1]));
  }
  const rematriculate = path.match(/^\/api\/lms\/matriculas\/(\d+)\/rematricular$/);
  if (method === 'POST' && rematriculate) {
    return handleRematriculation(c, empresaId, Number(rematriculate[1]));
  }
  const reverse = path.match(/^\/api\/lms\/matriculas\/(\d+)\/reverter$/);
  if (method === 'POST' && reverse) {
    return handleCompletionReversal(c, empresaId, Number(reverse[1]));
  }
  return null;
}
