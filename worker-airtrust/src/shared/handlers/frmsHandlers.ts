import type { D1Database } from '@cloudflare/workers-types';
import { registerHandler } from '../eventProcessor';

async function upsertCargaTrabalho(db: D1Database, payload: Record<string, unknown>) {
  if (!payload.funcionario_id || !payload.empresa_id) return;
  await db
    .prepare(
      `INSERT OR IGNORE INTO frms_carga_trabalho
        (id, empresa_id, funcionario_id, escala_id, escala_tripulacao_id, data_inicio, data_fim, tipo_alocacao, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)`,
    )
    .bind(
      crypto.randomUUID(),
      Number(payload.empresa_id),
      String(payload.funcionario_id),
      payload.escala_id ? String(payload.escala_id) : null,
      payload.tripulacao_id ? String(payload.tripulacao_id) : null,
      payload.data_inicio ? String(payload.data_inicio) : null,
      payload.data_fim ? String(payload.data_fim) : null,
      String(payload.papel ?? 'PIC'),
    )
    .run();
}

registerHandler('frms', 'TRIPULANTE_ALOCADO', async (db, _tipo, payload) => {
  await upsertCargaTrabalho(db, payload);
});

registerHandler('frms', 'TRIPULANTE_ALTERADO', async (db, _tipo, payload) => {
  await upsertCargaTrabalho(db, payload);
});

registerHandler('frms', 'TRIPULANTE_REMOVIDO', async (db, _tipo, payload) => {
  if (!payload.tripulacao_id || !payload.empresa_id) return;
  // Defense-in-depth: scope by empresa_id in addition to escala_tripulacao_id so a
  // payload id that (due to an upstream bug) belongs to another tenant cannot delete rows.
  await db
    .prepare(
      `UPDATE frms_carga_trabalho
       SET deleted_at = CURRENT_TIMESTAMP
       WHERE escala_tripulacao_id = ? AND empresa_id = ? AND deleted_at IS NULL`,
    )
    .bind(String(payload.tripulacao_id), Number(payload.empresa_id))
    .run();
});
