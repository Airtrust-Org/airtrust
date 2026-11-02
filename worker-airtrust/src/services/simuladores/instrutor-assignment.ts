import type { D1Database } from '@cloudflare/workers-types';
import { getSchemaColumns } from '../../utils/db-schema';
import { instrutorEstaEntreParticipantes } from './shared';

export type InstrutorAssignmentResult = { ok: true } | { ok: false; status: 400; error: string };

export interface InstrutorAssignmentInput {
  empresaId: number;
  sessaoId: string | number;
  instrutorId: unknown;
  /** True when the PUT also resends the participant list (it is validated separately). */
  participantesReenviados: boolean;
}

/**
 * Guardrail for assigning the instructor of a simulator session.
 *
 * - The instructor must belong to the tenant and, when the schema has the flag,
 *   have `is_instrutor` set. This prevents an examiner/checker from being
 *   assigned as the instructor of the trainee's pedagogical record.
 * - Self-evaluation block: when participants are not resent, the new
 *   instructor must not already be an active participant of the session.
 *
 * Pure of HTTP concerns: callers translate the result into a response.
 */
export async function validateInstrutorAssignment(
  db: D1Database,
  input: InstrutorAssignmentInput,
): Promise<InstrutorAssignmentResult> {
  const funcionarioColumns = await getSchemaColumns(db, 'funcionarios');
  const hasIsInstrutor = funcionarioColumns.has('is_instrutor');
  const instrutorFlagExpr = hasIsInstrutor ? 'COALESCE(is_instrutor, 0)' : '1';
  const instrutorRow = await db
    .prepare(
      `SELECT ${instrutorFlagExpr} as is_instrutor
         FROM funcionarios
         WHERE id = ?
           AND empresa_id = ?
           AND deleted_at IS NULL`,
    )
    .bind(input.instrutorId, input.empresaId)
    .first<{ is_instrutor: number }>();

  if (!instrutorRow || (hasIsInstrutor && Number(instrutorRow.is_instrutor) !== 1)) {
    return { ok: false, status: 400, error: 'Instrutor inválido para esta empresa.' };
  }

  if (!input.participantesReenviados) {
    const participantesAtuais = await db
      .prepare(
        'SELECT funcionario_id FROM sessoes_participantes WHERE sessao_id = ? AND deleted_at IS NULL',
      )
      .bind(input.sessaoId)
      .all();
    if (instrutorEstaEntreParticipantes(input.instrutorId, participantesAtuais.results || [])) {
      return {
        ok: false,
        status: 400,
        error: 'O instrutor da sessão não pode constar como participante avaliado',
      };
    }
  }

  return { ok: true };
}
