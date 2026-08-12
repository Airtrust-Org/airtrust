import type { Context } from 'hono';
import type { Env, Variables } from '../types';
import { hasRole } from './rbac';

type EnrollmentContext = { Bindings: Env; Variables: Variables };
type JsonRecord = Record<string, unknown>;

type RematriculationRow = {
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
};

const REMATRICULATION_PATH = /^\/api\/lms\/matriculas\/(\d+)\/rematricular$/;

function jsonResponse(c: Context<EnrollmentContext>, status: number, body: JsonRecord): Response {
  return c.json(body, status as never);
}

function errorResponse(
  c: Context<EnrollmentContext>,
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

function getEmpresaId(c: Context<EnrollmentContext>): number | null {
  return parsePositiveInt(c.get('empresaId'));
}

function getUserId(c: Context<EnrollmentContext>): number | null {
  return parsePositiveInt(c.get('userId'));
}

async function readJsonClone(c: Context<EnrollmentContext>): Promise<JsonRecord> {
  try {
    const parsed = await c.req.raw.clone().json<unknown>();
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
      ? (parsed as JsonRecord)
      : {};
  } catch {
    return {};
  }
}

async function resolveActorFuncionarioId(c: Context<EnrollmentContext>): Promise<number | null> {
  const direct = parsePositiveInt(c.get('funcionarioId'));
  if (direct) return direct;
  const userId = getUserId(c);
  if (!userId) return null;
  const row = await c.env.DB.prepare(
    'SELECT funcionario_id FROM usuarios WHERE id = ? AND deleted_at IS NULL LIMIT 1',
  )
    .bind(userId)
    .first<{ funcionario_id: number | null }>();
  return parsePositiveInt(row?.funcionario_id);
}

async function guardSelfEnrollment(
  c: Context<EnrollmentContext>,
  empresaId: number,
): Promise<Response | null> {
  if (hasRole(c, 'admin', 'manager')) return null;

  const body = await readJsonClone(c);
  const funcionarioId = parsePositiveInt(body.funcionario_id);
  const cursoId = parsePositiveInt(body.curso_id);
  if (!funcionarioId || !cursoId) return null; // canonical route owns payload validation

  const actorFuncionarioId = await resolveActorFuncionarioId(c);
  if (!actorFuncionarioId || actorFuncionarioId !== funcionarioId) {
    return errorResponse(c, 403, 'LMS_SELF_ENROLLMENT_OWNERSHIP_REQUIRED', 'Acesso negado.');
  }

  try {
    const policy = await c.env.DB.prepare(
      `SELECT c.id, c.ativo, c.publicado, f.setor_id,
                CASE
                  WHEN EXISTS (
                    SELECT 1
                      FROM lms_cursos_setores direct_any
                     WHERE direct_any.curso_id = c.id
                       AND direct_any.empresa_id = c.empresa_id
                       AND direct_any.deleted_at IS NULL
                  )
                  THEN CASE WHEN EXISTS (
                    SELECT 1
                      FROM lms_cursos_setores direct_match
                     WHERE direct_match.curso_id = c.id
                       AND direct_match.empresa_id = c.empresa_id
                       AND direct_match.setor_id = f.setor_id
                       AND direct_match.deleted_at IS NULL
                  ) THEN 1 ELSE 0 END
                  ELSE CASE WHEN c.qualificacao_tipo_id IS NOT NULL AND EXISTS (
                    SELECT 1
                      FROM qualificacoes_tipos_setores fallback_match
                     WHERE fallback_match.tipo_id = c.qualificacao_tipo_id
                       AND fallback_match.empresa_id = c.empresa_id
                       AND fallback_match.setor_id = f.setor_id
                       AND fallback_match.deleted_at IS NULL
                  ) THEN 1 ELSE 0 END
                END AS enrollment_allowed
           FROM lms_cursos c
           JOIN funcionarios f
             ON f.id = ?
            AND f.empresa_id = c.empresa_id
            AND f.deleted_at IS NULL
          WHERE c.id = ?
            AND c.empresa_id = ?
            AND c.deleted_at IS NULL
          LIMIT 1`,
    )
      .bind(funcionarioId, cursoId, empresaId)
      .first<{
        id: number;
        ativo: number;
        publicado: number;
        setor_id: number | null;
        enrollment_allowed: number;
      }>();

    if (!policy || policy.ativo !== 1 || policy.publicado !== 1) {
      return errorResponse(
        c,
        404,
        'LMS_COURSE_UNAVAILABLE',
        'Curso não encontrado ou indisponível.',
      );
    }
    if (policy.enrollment_allowed !== 1) {
      return errorResponse(
        c,
        403,
        'LMS_SELF_ENROLLMENT_NOT_ALLOWED',
        'Publicação não concede matrícula livre. O curso precisa estar explicitamente designado ao setor do aluno.',
      );
    }
    return null;
  } catch {
    return errorResponse(
      c,
      503,
      'LMS_SELF_ENROLLMENT_POLICY_UNAVAILABLE',
      'A política de auto-matrícula não pôde ser validada de forma segura.',
    );
  }
}

function parseOptionalExpiration(value: unknown): string | null | undefined {
  if (value === null || value === undefined || value === '') return null;
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return undefined;
  return value;
}

async function handleRematriculation(
  c: Context<EnrollmentContext>,
  empresaId: number,
  matriculaId: number,
): Promise<Response> {
  if (!hasRole(c, 'admin', 'manager')) {
    return errorResponse(c, 403, 'LMS_REMATRICULATION_FORBIDDEN', 'Acesso negado.');
  }

  const body = await readJsonClone(c);
  const reason = typeof body.reason === 'string' ? body.reason.trim() : '';
  const expiration = parseOptionalExpiration(body.data_expiracao);
  if (reason.length < 10) {
    return errorResponse(
      c,
      400,
      'LMS_REMATRICULATION_REASON_REQUIRED',
      'Informe uma justificativa com ao menos 10 caracteres.',
    );
  }
  if (expiration === undefined) {
    return errorResponse(
      c,
      400,
      'LMS_REMATRICULATION_EXPIRATION_INVALID',
      'data_expiracao deve usar o formato YYYY-MM-DD.',
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
    .first<RematriculationRow>();

  if (!existing) {
    return errorResponse(c, 404, 'LMS_ENROLLMENT_NOT_FOUND', 'Matrícula não encontrada.');
  }
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
         FROM lms_progresso_scorm
        WHERE matricula_id = ? AND empresa_id = ?`,
  )
    .bind(matriculaId, empresaId)
    .first<Record<string, unknown>>();

  const operationId = crypto.randomUUID();
  const operationMarker = `[[LMS_REMATRICULATION:${operationId}]]`;
  const auditNewValues = JSON.stringify({
    status: 'NAO_INICIADO',
    progresso_pct: 0,
    reason,
    operation_id: operationId,
  });
  const reasonLine = `Rematrícula: ${reason}`;

  const markerExists = `EXISTS (
    SELECT 1
      FROM lms_matriculas marker_m
     WHERE marker_m.id = ?
       AND marker_m.empresa_id = ?
       AND instr(COALESCE(marker_m.observacoes, ''), ?) > 0
  )`;

  try {
    await c.env.DB.batch([
      c.env.DB.prepare(
        `UPDATE lms_matriculas
              SET status = 'NAO_INICIADO',
                  progresso_pct = 0,
                  score_final = NULL,
                  tentativas = 0,
                  data_inicio = NULL,
                  data_conclusao = NULL,
                  data_expiracao = COALESCE(?, data_expiracao),
                  qualificacao_historico_id = NULL,
                  observacoes = CASE
                    WHEN COALESCE(observacoes, '') = '' THEN ? || char(10) || ?
                    ELSE observacoes || char(10) || ? || char(10) || ?
                  END,
                  deleted_at = NULL,
                  updated_at = datetime('now')
            WHERE id = ?
              AND empresa_id = ?
              AND qualificacao_historico_id IS NULL
              AND (deleted_at IS NOT NULL OR status = 'CANCELADO')`,
      ).bind(
        expiration,
        reasonLine,
        operationMarker,
        reasonLine,
        operationMarker,
        matriculaId,
        empresaId,
      ),
      c.env.DB.prepare(
        `UPDATE lms_matricula_ciclos
              SET ciclo_atual = 0,
                  status = 'CANCELADO',
                  updated_at = datetime('now')
            WHERE matricula_id = ?
              AND empresa_id = ?
              AND ciclo_atual = 1
              AND deleted_at IS NULL
              AND ${markerExists}`,
      ).bind(matriculaId, empresaId, matriculaId, empresaId, operationMarker),
      c.env.DB.prepare(
        `UPDATE lms_progresso_scorm
              SET lesson_status = 'not attempted',
                  completion_status = 'unknown',
                  success_status = 'unknown',
                  score_raw = NULL,
                  score_min = NULL,
                  score_max = NULL,
                  score_scaled = NULL,
                  session_time = NULL,
                  total_time = NULL,
                  suspend_data = NULL,
                  launch_data = NULL,
                  cmi_json = NULL,
                  session_count = 0,
                  updated_at = datetime('now')
            WHERE matricula_id = ?
              AND empresa_id = ?
              AND ${markerExists}`,
      ).bind(matriculaId, empresaId, matriculaId, empresaId, operationMarker),
      c.env.DB.prepare(
        `INSERT INTO lms_matricula_ciclos
            (empresa_id, matricula_id, curso_id, funcionario_id, numero_ciclo, origem,
             status, ciclo_atual, observacoes, data_matricula, progresso_pct, tentativas,
             created_at, updated_at, deleted_at)
           SELECT m.empresa_id,
                  m.id,
                  m.curso_id,
                  m.funcionario_id,
                  COALESCE((
                    SELECT MAX(numero_ciclo)
                      FROM lms_matricula_ciclos previous_cycle
                     WHERE previous_cycle.matricula_id = m.id
                       AND previous_cycle.empresa_id = m.empresa_id
                  ), 0) + 1,
                  'MANUAL',
                  'NAO_INICIADO',
                  1,
                  ?,
                  datetime('now'),
                  0,
                  0,
                  datetime('now'),
                  datetime('now'),
                  NULL
             FROM lms_matriculas m
            WHERE m.id = ?
              AND m.empresa_id = ?
              AND m.deleted_at IS NULL
              AND instr(COALESCE(m.observacoes, ''), ?) > 0`,
      ).bind(`Rematrícula autorizada: ${reason}`, matriculaId, empresaId, operationMarker),
      c.env.DB.prepare(
        `INSERT INTO audit_logs
            (user_id, action, entity_type, entity_id, old_values, new_values,
             ip_address, user_agent, empresa_id, created_at)
           SELECT ?,
                  'LMS_REMATRICULATION',
                  'lms_matriculas',
                  ?,
                  ?,
                  ?,
                  ?,
                  ?,
                  ?,
                  datetime('now')
            WHERE ${markerExists}`,
      ).bind(
        getUserId(c),
        matriculaId,
        JSON.stringify({ ...existing, scorm_progress: progressSnapshot ?? null }),
        auditNewValues,
        c.req.header('cf-connecting-ip') ?? c.req.header('x-forwarded-for') ?? null,
        c.req.header('user-agent') ?? null,
        empresaId,
        matriculaId,
        empresaId,
        operationMarker,
      ),
      c.env.DB.prepare(
        `UPDATE lms_matriculas
              SET observacoes = TRIM(REPLACE(COALESCE(observacoes, ''), ?, '')),
                  updated_at = datetime('now')
            WHERE id = ?
              AND empresa_id = ?
              AND instr(COALESCE(observacoes, ''), ?) > 0`,
      ).bind(operationMarker, matriculaId, empresaId, operationMarker),
    ]);
  } catch {
    return errorResponse(
      c,
      409,
      'LMS_REMATRICULATION_CONFLICT',
      'A rematrícula concorreu com outra alteração ou violou uma pré-condição.',
    );
  }

  const receipt = await c.env.DB.prepare(
    `SELECT 1 AS ok
         FROM audit_logs
        WHERE action = 'LMS_REMATRICULATION'
          AND entity_type = 'lms_matriculas'
          AND entity_id = ?
          AND empresa_id = ?
          AND instr(COALESCE(new_values, ''), ?) > 0
        LIMIT 1`,
  )
    .bind(matriculaId, empresaId, operationId)
    .first<{ ok: number }>();

  if (receipt?.ok !== 1) {
    return errorResponse(
      c,
      409,
      'LMS_REMATRICULATION_CONFLICT',
      'A matrícula já foi reativada por outra operação.',
    );
  }

  return jsonResponse(c, 200, {
    success: true,
    data: {
      matricula_id: matriculaId,
      status: 'NAO_INICIADO',
      rematriculated: true,
      operation_id: operationId,
    },
  });
}

/**
 * Canonical pre-handler for self-enrollment policy and rematriculation.
 * Runs before the legacy LMS route module.
 */
export async function enforceLmsEnrollmentIntegrity(
  c: Context<EnrollmentContext>,
): Promise<Response | null> {
  if (c.req.method.toUpperCase() !== 'POST') return null;
  const empresaId = getEmpresaId(c);
  if (!empresaId) return null;

  if (c.req.path === '/api/lms/matriculas') {
    return guardSelfEnrollment(c, empresaId);
  }

  const rematriculation = c.req.path.match(REMATRICULATION_PATH);
  if (rematriculation) {
    const matriculaId = parsePositiveInt(rematriculation[1]);
    if (!matriculaId) {
      return errorResponse(c, 400, 'LMS_ENROLLMENT_ID_INVALID', 'ID inválido.');
    }
    return handleRematriculation(c, empresaId, matriculaId);
  }

  return null;
}
