type RoleContext = { funcao: string | null; cargo: string | null };

export const MSG_EVD_REFERENCE_NOT_FOUND = 'Tripulante ou escala não encontrado para esta empresa.';

export async function getRoleContext(db: D1Database, empresaId: number, funcionarioId: number) {
  return db
    .prepare(
      `SELECT funcao, cargo FROM funcionarios
        WHERE id = ? AND deleted_at IS NULL AND COALESCE(ativo, 1) = 1
          AND UPPER(COALESCE(NULLIF(TRIM(status), ''), 'ATIVO')) = 'ATIVO'
          AND empresa_id = ? LIMIT 1`,
    )
    .bind(funcionarioId, empresaId)
    .first<RoleContext>();
}

export async function hasTenantOwnedEvdReferences(params: {
  db: D1Database;
  empresaId: number;
  crewIds: Array<number | null | undefined>;
  escalaId?: string | null;
}): Promise<boolean> {
  for (const id of new Set(params.crewIds.filter((value): value is number => value != null))) {
    const row = await params.db
      .prepare('SELECT id FROM funcionarios WHERE id = ? AND empresa_id = ? AND deleted_at IS NULL LIMIT 1')
      .bind(id, params.empresaId)
      .first();
    if (!row) return false;
  }
  if (params.escalaId) {
    const row = await params.db
      .prepare('SELECT id FROM escalas_mensais WHERE id = ? AND empresa_id = ? AND deleted_at IS NULL LIMIT 1')
      .bind(params.escalaId, params.empresaId)
      .first();
    if (!row) return false;
  }
  return true;
}

export async function hasReliableQualificationSource(
  db: D1Database,
  empresaId: number,
  funcionarioId: number,
): Promise<boolean> {
  const funcionario = await db
    .prepare(
      `SELECT modelo_aeronave_id, aeronave FROM funcionarios
        WHERE id = ? AND empresa_id = ? AND deleted_at IS NULL AND COALESCE(ativo, 1) = 1 LIMIT 1`,
    )
    .bind(funcionarioId, empresaId)
    .first<{ modelo_aeronave_id: string | null; aeronave: string | null }>();
  if (!funcionario) return false;
  const associacao = await db
    .prepare(
      `SELECT 1 FROM funcionarios_aeronaves fa
         JOIN funcionarios f ON CAST(f.id AS INTEGER) = CAST(fa.funcionario_id AS INTEGER)
          AND f.empresa_id = ? AND f.deleted_at IS NULL
        WHERE CAST(fa.funcionario_id AS INTEGER) = ? AND fa.deleted_at IS NULL
          AND COALESCE(fa.ativo, 1) = 1 AND (fa.data_fim IS NULL OR date(fa.data_fim) >= date('now')) LIMIT 1`,
    )
    .bind(empresaId, funcionarioId)
    .first();
  return Boolean(
    associacao || String(funcionario.modelo_aeronave_id || '').trim() || String(funcionario.aeronave || '').trim(),
  );
}
