/**
 * Matricula CONCLUIDA com qualificacao viva nao pode virar CANCELADA (#1492).
 *
 * O historico continua valido (Compliance/Ficha 360), mas a matricula cancelada
 * sai das grades LMS e da evidencia LMS do Compliance, deixando as telas
 * divergentes. Para desfazer uma conclusao indevida, ajuste/exclua a
 * qualificacao primeiro.
 */
export async function completedCancelBlock(
  db: D1Database,
  empresaId: number,
  matriculaId: number,
  nextStatus: string,
  existing: { status: string; qualificacao_historico_id: number | null },
): Promise<{
  success: false;
  code: 'LMS_COMPLETED_WITH_QUALIFICATION';
  error: string;
  data: { matricula_id: number; status_atual: string };
} | null> {
  if (nextStatus !== 'CANCELADO' || String(existing.status).toUpperCase() !== 'CONCLUIDO') {
    return null;
  }
  const live = await db
    .prepare(
      `SELECT 1 AS found FROM qualificacoes_historico
        WHERE empresa_id = ? AND deleted_at IS NULL
          AND (lms_matricula_id = ? OR id = ?)
        LIMIT 1`,
    )
    .bind(empresaId, matriculaId, existing.qualificacao_historico_id ?? 0)
    .first<{ found: number }>();
  if (!live) return null;
  return {
    success: false,
    code: 'LMS_COMPLETED_WITH_QUALIFICATION',
    error:
      'Matrícula concluída possui qualificação vigente no histórico e não pode ser cancelada. Ajuste ou exclua a qualificação antes.',
    data: { matricula_id: matriculaId, status_atual: existing.status },
  };
}
