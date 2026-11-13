/**
 * #1325/#2215: impede status NAO_INICIADO com progresso ou CMI SCORM existente.
 * Apenas um fluxo de recuperação governado pode redefinir esses dados.
 * Este guard é somente-leitura, multi-tenant e nunca apaga evidências.
 */
export async function canSetEnrollmentNotStarted(
  db: D1Database,
  empresaId: number,
  matriculaId: number,
  existing: {
    progresso_pct: number | null;
    data_inicio: string | null;
    tipo_conteudo: string | null;
  },
): Promise<boolean> {
  if (Number(existing.progresso_pct ?? 0) > 0 || Boolean(existing.data_inicio)) return false;
  if (String(existing.tipo_conteudo ?? '').toLowerCase() !== 'scorm') return true;

  const persisted = await db.prepare(
    `SELECT 1 AS has_runtime FROM lms_progresso_scorm
       WHERE matricula_id=? AND empresa_id=? LIMIT 1`,
  ).bind(matriculaId, empresaId).first();
  return !persisted;
}
