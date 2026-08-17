import type { DomainEventPayloadBase } from '../domainEvents';
import { registerHandler } from '../eventProcessor';

export async function handleTripulanteAlocadoHospedagem(
  db: D1Database,
  payload: DomainEventPayloadBase,
): Promise<void> {
  if (!payload.base_destino || !payload.funcionario_id) return;

  const empresaId = Number(payload.empresa_id);
  const funcionarioId = String(payload.funcionario_id);
  const baseDestino = String(payload.base_destino).trim();
  let baseOrigem = payload.base_origem ? String(payload.base_origem).trim() : '';

  if (!baseOrigem && Number.isFinite(empresaId) && empresaId > 0) {
    const funcionario = await db
      .prepare(
        `SELECT base
         FROM funcionarios
         WHERE id = ?
           AND empresa_id = ?
           AND deleted_at IS NULL
         LIMIT 1`,
      )
      .bind(funcionarioId, empresaId)
      .first<{ base: string | null }>();
    baseOrigem = String(funcionario?.base || '').trim();
  }

  if (
    !baseDestino ||
    !baseOrigem ||
    baseDestino.localeCompare(baseOrigem, undefined, { sensitivity: 'accent' }) === 0
  ) {
    return;
  }

  const escalaId = payload.escala_id ? String(payload.escala_id) : null;
  const dataInicio = payload.data_inicio ? String(payload.data_inicio) : null;
  const dataFim = payload.data_fim ? String(payload.data_fim) : null;

  // Defense-in-depth: prove the referenced funcionario belongs to the event's
  // empresa_id before inserting a tenant-stamped hospedagem_sugestao that
  // references it. The baseOrigem-enrichment lookup above only runs when
  // base_origem is missing from the payload, so it can't be relied on as
  // the sole ownership proof.
  if (!Number.isFinite(empresaId) || empresaId <= 0) return;
  const owned = await db
    .prepare(
      `SELECT id FROM funcionarios WHERE id = ? AND empresa_id = ? AND deleted_at IS NULL LIMIT 1`,
    )
    .bind(funcionarioId, empresaId)
    .first<{ id: number }>();
  if (!owned) return;

  await db
    .prepare(
      `INSERT INTO hospedagem_sugestoes
        (id, empresa_id, funcionario_id, escala_id, base, data_inicio, data_fim, status, created_at, updated_at)
       SELECT ?, ?, ?, ?, ?, ?, ?, 'pendente', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
       WHERE NOT EXISTS (
         SELECT 1
         FROM hospedagem_sugestoes
         WHERE empresa_id = ?
           AND funcionario_id = ?
           AND COALESCE(escala_id, '') = COALESCE(?, '')
           AND UPPER(TRIM(base)) = UPPER(TRIM(?))
           AND COALESCE(data_inicio, '') = COALESCE(?, '')
           AND COALESCE(data_fim, '') = COALESCE(?, '')
           AND status <> 'cancelado'
           AND deleted_at IS NULL
       )`,
    )
    .bind(
      crypto.randomUUID(),
      empresaId,
      funcionarioId,
      escalaId,
      baseDestino,
      dataInicio,
      dataFim,
      empresaId,
      funcionarioId,
      escalaId,
      baseDestino,
      dataInicio,
      dataFim,
    )
    .run();
}

registerHandler('hospedagem', 'TRIPULANTE_ALOCADO', async (db, _tipo, payload) => {
  await handleTripulanteAlocadoHospedagem(db, payload);
});

registerHandler('hospedagem', 'FUNCIONARIO_INATIVADO', async (db, _tipo, payload) => {
  if (!payload.funcionario_id || !payload.empresa_id) return;

  // Defense-in-depth: hospedagens has no empresa_id column of its own, so ownership
  // is verified via the referenced funcionario before writing.
  await db
    .prepare(
      `UPDATE hospedagens
       SET status = 'cancelado',
           observacoes = COALESCE(observacoes,'') || ' [Cancelado: funcionário inativado]',
           updated_at = CURRENT_TIMESTAMP
       WHERE funcionario_id = ?
         AND status IN ('reservado', 'confirmado')
         AND deleted_at IS NULL
         AND funcionario_id IN (
           SELECT id FROM funcionarios WHERE id = ? AND empresa_id = ? AND deleted_at IS NULL
         )`,
    )
    .bind(Number(payload.funcionario_id), Number(payload.funcionario_id), Number(payload.empresa_id))
    .run();
});
