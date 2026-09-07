import type { Context } from 'hono';
import type { Env, Variables } from '../types';
import { hasRole } from './rbac';

type ReversalContext = { Bindings: Env; Variables: Variables };
type JsonRecord = Record<string, unknown>;

type ReversalRow = {
  id: number;
  status: string;
  progresso_pct: number | null;
  score_final: number | null;
  funcionario_id: number;
  qualificacao_historico_id: number | null;
  qualificacao_status: string | null;
  certificado_arquivo_id: number | null;
  qualificacao_renovacao_de: number | null;
};

const REVERSAL_PATH = /^\/api\/lms\/matriculas\/(\d+)\/reverter$/;
const ALLOWED_CLASSIFICATIONS = new Set([
  'CORRECAO',
  'FRAUDE',
  'ERRO_PACOTE',
  'REGRA_HISTORICA',
  'INVALIDACAO',
]);

function jsonResponse(c: Context<ReversalContext>, status: number, body: JsonRecord): Response {
  return c.json(body, status as never);
}

function errorResponse(
  c: Context<ReversalContext>,
  status: number,
  code: string,
  error: string,
): Response {
  return jsonResponse(c, status, { success: false, code, error });
}

function parsePositiveInt(value: unknown): number | null {
  const parsed = typeof value === 'number' ? value : Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
}

function getEmpresaId(c: Context<ReversalContext>): number | null {
  return parsePositiveInt(c.get('empresaId'));
}

function getUserId(c: Context<ReversalContext>): number | null {
  return parsePositiveInt(c.get('userId'));
}

async function readJsonClone(c: Context<ReversalContext>): Promise<JsonRecord> {
  try {
    const parsed = await c.req.raw.clone().json<unknown>();
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
      ? (parsed as JsonRecord)
      : {};
  } catch {
    return {};
  }
}

/**
 * Governed completion reversal entry point.
 *
 * This handler runs before the generic LMS integrity middleware. It uses the
 * schema-supported qualification status CANCELADA plus soft deletion and audit
 * evidence; the public QR lookup already excludes soft-deleted qualification
 * and document records.
 */
export async function enforceLmsCompletionReversal(
  c: Context<ReversalContext>,
): Promise<Response | null> {
  if (c.req.method.toUpperCase() !== 'POST') return null;
  const match = c.req.path.match(REVERSAL_PATH);
  if (!match) return null;

  const matriculaId = parsePositiveInt(match[1]);
  const empresaId = getEmpresaId(c);
  if (!matriculaId || !empresaId) {
    return errorResponse(
      c,
      400,
      'LMS_COMPLETION_REVERSAL_CONTEXT_INVALID',
      'Contexto de reversão inválido.',
    );
  }
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
  if (reason.length < 10 || !ALLOWED_CLASSIFICATIONS.has(classification)) {
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
              qh.status AS qualificacao_status, qh.certificado_arquivo_id,
              qh.renovacao_de AS qualificacao_renovacao_de
         FROM lms_matriculas m
         LEFT JOIN qualificacoes_historico qh
           ON qh.id = m.qualificacao_historico_id
          AND qh.empresa_id = m.empresa_id
        WHERE m.id = ? AND m.empresa_id = ? AND m.deleted_at IS NULL
        LIMIT 1`,
  )
    .bind(matriculaId, empresaId)
    .first<ReversalRow>();

  if (!existing) {
    return errorResponse(c, 404, 'LMS_ENROLLMENT_NOT_FOUND', 'Matrícula não encontrada.');
  }
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
            SET status = 'EM_ANDAMENTO',
                progresso_pct = MIN(COALESCE(progresso_pct, 0), 99),
                score_final = NULL,
                data_conclusao = NULL,
                qualificacao_historico_id = NULL,
                observacoes = CASE
                  WHEN COALESCE(observacoes, '') = '' THEN ?
                  ELSE observacoes || char(10) || ?
                END,
                updated_at = datetime('now')
          WHERE id = ? AND empresa_id = ?
            AND status = 'CONCLUIDO' AND deleted_at IS NULL`,
    ).bind(marker, marker, matriculaId, empresaId),
    c.env.DB.prepare(
      `UPDATE lms_matricula_ciclos
            SET status = 'EM_ANDAMENTO',
                data_conclusao = NULL,
                progresso_pct = MIN(COALESCE(progresso_pct, 0), 99),
                score_final = NULL,
                qualificacao_historico_id = NULL,
                observacoes = CASE
                  WHEN COALESCE(observacoes, '') = '' THEN ?
                  ELSE observacoes || char(10) || ?
                END,
                updated_at = datetime('now')
          WHERE matricula_id = ? AND empresa_id = ?
            AND ciclo_atual = 1 AND deleted_at IS NULL`,
    ).bind(marker, marker, matriculaId, empresaId),
    c.env.DB.prepare(
      `UPDATE lms_progresso_scorm
            SET lesson_status = 'incomplete',
                completion_status = 'incomplete',
                success_status = 'unknown',
                score_raw = NULL,
                score_max = NULL,
                score_min = NULL,
                score_scaled = NULL,
                session_time = NULL,
                total_time = NULL,
                session_count = 0,
                suspend_data = NULL,
                launch_data = NULL,
                cmi_json = NULL,
                last_commit_at = NULL,
                updated_at = datetime('now')
          WHERE matricula_id = ? AND empresa_id = ?`,
    ).bind(matriculaId, empresaId),
  ];

  if (existing.qualificacao_historico_id) {
    statements.push(
      c.env.DB.prepare(
        `UPDATE qualificacoes_historico
              SET status = 'CANCELADA',
                  observacoes = CASE
                    WHEN COALESCE(observacoes, '') = '' THEN ?
                    ELSE observacoes || char(10) || ?
                  END,
                  deleted_at = COALESCE(deleted_at, datetime('now')),
                  updated_at = datetime('now')
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

  // Undo the predecessor materialization the original completion performed
  // (lms-completion.ts marks the immediate predecessor renovada=1/RENOVADA
  // when it sets this row's renovacao_de). Without this, reversing the
  // successor leaves the predecessor permanently stuck as RENOVADA even
  // though the qualification that "renewed" it no longer exists — an
  // orphaned lineage link. Guarded to only restore a row that is still
  // RENOVADA and was renovada specifically by this successor.
  if (existing.qualificacao_historico_id && existing.qualificacao_renovacao_de) {
    statements.push(
      c.env.DB.prepare(
        `UPDATE qualificacoes_historico
              SET renovada = 0,
                  status = 'CONCLUIDA',
                  updated_at = datetime('now')
            WHERE id = ?
              AND empresa_id = ?
              AND funcionario_id = ?
              AND renovada = 1
              AND UPPER(COALESCE(status, '')) = 'RENOVADA'`,
      ).bind(existing.qualificacao_renovacao_de, empresaId, existing.funcionario_id),
    );
  }

  if (existing.certificado_arquivo_id && existing.qualificacao_historico_id) {
    statements.push(
      c.env.DB.prepare(
        `UPDATE documentos
              SET deleted_at = COALESCE(deleted_at, datetime('now')),
                  updated_at = datetime('now')
            WHERE id = ?
              AND EXISTS (
                SELECT 1
                  FROM qualificacoes_historico qh
                 WHERE qh.id = ?
                   AND qh.empresa_id = ?
                   AND qh.certificado_arquivo_id = documentos.id
              )`,
      ).bind(existing.certificado_arquivo_id, existing.qualificacao_historico_id, empresaId),
    );
  }

  statements.push(
    c.env.DB.prepare(
      `INSERT INTO audit_logs
          (user_id, action, entity_type, entity_id, old_values, new_values,
           ip_address, user_agent, empresa_id, created_at)
         VALUES (?, 'LMS_COMPLETION_REVERSED', 'lms_matriculas', ?, ?, ?, ?, ?, ?, datetime('now'))`,
    ).bind(
      getUserId(c),
      matriculaId,
      JSON.stringify(existing),
      JSON.stringify({
        status: 'EM_ANDAMENTO',
        qualification_status: existing.qualificacao_historico_id ? 'CANCELADA' : null,
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

  try {
    await c.env.DB.batch(statements);
  } catch {
    return errorResponse(
      c,
      409,
      'LMS_COMPLETION_REVERSAL_CONFLICT',
      'A reversão concorreu com outra alteração ou violou uma pré-condição.',
    );
  }

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
