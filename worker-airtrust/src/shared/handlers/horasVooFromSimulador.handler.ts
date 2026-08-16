import type { D1Database } from '@cloudflare/workers-types';

export const FICHA_HORAS_VOO_SOURCE_SQL = `SELECT
  fs.id,
  fs.colaborador_id_aluno AS funcionario_id,
  fs.status,
  fs.deleted_at,
  COALESCE(fs.data_sessao, sa.data) AS data_sessao,
  fs.instrutor_id,
  COALESCE(sa.duracao_minutos, ms.duracao_estimada, 0) AS duracao_min,
  COALESCE(ms.nome, sa.nome, fs.tipo_sessao, 'SIMULADOR') AS modelo_nome
FROM fichas_sessao fs
LEFT JOIN simulador_agendamentos sa
  ON sa.id = fs.agendamento_slot_id
 AND sa.empresa_id = fs.empresa_id
 AND sa.deleted_at IS NULL
LEFT JOIN modelos_sessao ms
  ON ms.id = COALESCE(fs.template_id, sa.template_id)
 AND ms.deleted_at IS NULL
WHERE fs.id = ?
  AND fs.empresa_id = ?
LIMIT 1`;

export async function syncHorasVooFromSimulador(
  db: D1Database,
  fichaId: number,
  empresaId: number,
): Promise<void> {
  const ficha = await db
    .prepare(FICHA_HORAS_VOO_SOURCE_SQL)
    .bind(fichaId, empresaId)
    .first<{
      id: number;
      funcionario_id: number;
      status: string | null;
      deleted_at: string | null;
      data_sessao: string | null;
      instrutor_id: number | null;
      duracao_min: number | null;
      modelo_nome: string | null;
    }>();

  if (!ficha || !ficha.funcionario_id) return;

  const existing = await db
    .prepare(
      `SELECT id FROM horas_voo_lancamentos
       WHERE sessao_simulador_id = ? AND empresa_id = ?
       LIMIT 1`,
    )
    .bind(fichaId, empresaId)
    .first<{ id: number }>();

  const status = String(ficha.status || '').toUpperCase();
  if (ficha.deleted_at || status !== 'CONCLUIDA') {
    if (existing?.id) {
      await db
        .prepare(
          `UPDATE horas_voo_lancamentos
           SET deleted_at = datetime('now'), updated_at = datetime('now')
           WHERE id = ?`,
        )
        .bind(existing.id)
        .run();
    }
    return;
  }

  const duracao = Number(ficha.duracao_min || 0);
  const funcao = ficha.instrutor_id === ficha.funcionario_id ? 'PIC' : 'ALUNO';

  if (existing?.id) {
    await db
      .prepare(
        `UPDATE horas_voo_lancamentos
         SET funcionario_id = ?,
             empresa_id = ?,
             data_voo = ?,
             modelo_aeronave = ?,
             duracao_total_min = ?,
             duracao_pic_min = ?,
             duracao_sic_min = 0,
             funcao = ?,
             is_simulador = 1,
             origem_registro = 'SIMULADOR',
             deleted_at = NULL,
             updated_at = datetime('now')
         WHERE id = ?`,
      )
      .bind(
        ficha.funcionario_id,
        empresaId,
        (ficha.data_sessao || new Date().toISOString()).slice(0, 10),
        ficha.modelo_nome || 'SIMULADOR',
        duracao,
        funcao === 'PIC' ? duracao : 0,
        funcao,
        existing.id,
      )
      .run();
    return;
  }

  await db
    .prepare(
      `INSERT INTO horas_voo_lancamentos (
         funcionario_id, empresa_id, data_voo, modelo_aeronave,
         duracao_total_min, duracao_pic_min, duracao_sic_min,
         funcao, is_simulador, origem_registro, sessao_simulador_id,
         created_at, updated_at
       ) VALUES (?, ?, ?, ?, ?, ?, 0, ?, 1, 'SIMULADOR', ?, datetime('now'), datetime('now'))`,
    )
    .bind(
      ficha.funcionario_id,
      empresaId,
      (ficha.data_sessao || new Date().toISOString()).slice(0, 10),
      ficha.modelo_nome || 'SIMULADOR',
      duracao,
      funcao === 'PIC' ? duracao : 0,
      funcao,
      fichaId,
    )
    .run();
}
