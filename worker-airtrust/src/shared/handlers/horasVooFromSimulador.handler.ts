import type { D1Database } from '@cloudflare/workers-types';

export async function syncHorasVooFromSimulador(
  db: D1Database,
  fichaId: number,
  empresaId: number,
): Promise<void> {
  const ficha = await db
    .prepare(
      `SELECT fs.id, fs.funcionario_id, fs.status, fs.deleted_at, fs.data_sessao, fs.modelo_sessao_id,
              fs.instrutor_id, fs.duracao_min
       FROM fichas_sessao fs
       WHERE fs.id = ?
       LIMIT 1`,
    )
    .bind(fichaId)
    .first<{
      id: number;
      funcionario_id: number;
      status: string | null;
      deleted_at: string | null;
      data_sessao: string | null;
      modelo_sessao_id: number | null;
      instrutor_id: number | null;
      duracao_min: number | null;
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

  const modeloSessao = await db
    .prepare(
      `SELECT nome, duracao_min
       FROM modelos_sessao
       WHERE id = ?
       LIMIT 1`,
    )
    .bind(ficha.modelo_sessao_id || null)
    .first<{ nome: string | null; duracao_min: number | null }>();

  const duracao = Number(ficha.duracao_min || modeloSessao?.duracao_min || 0);
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
        modeloSessao?.nome || 'SIMULADOR',
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
      modeloSessao?.nome || 'SIMULADOR',
      duracao,
      funcao === 'PIC' ? duracao : 0,
      funcao,
      fichaId,
    )
    .run();
}
