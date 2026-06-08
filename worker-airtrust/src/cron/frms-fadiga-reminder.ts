import type { Env } from '../types';

export async function frmsFadigaReminder(env: Env): Promise<{ notificacoes: number }> {
  const db = env.DB;

  const empresas = await db
    .prepare(
      `SELECT empresa_id
         FROM frms_fadiga_config_empresa
        WHERE ativo = 1 AND deleted_at IS NULL`,
    )
    .all<{ empresa_id: number }>();

  let notificacoes = 0;
  const hoje = new Date().toISOString().slice(0, 10);

  for (const row of empresas.results || []) {
    const empresaId = Number(row.empresa_id);

    const jaExiste = await db
      .prepare(
        `SELECT id
           FROM notificacoes_sistema
          WHERE tipo = 'FRMS_CHECKIN_REMINDER'
            AND grupo = 'frms'
            AND date(created_at) = date('now')
            AND json_extract(dados, '$.empresa_id') = ?
          LIMIT 1`,
      )
      .bind(empresaId)
      .first<{ id: number }>();

    if (jaExiste?.id) continue;

    const semCheckin = await db
      .prepare(
        `SELECT f.id, f.nome
           FROM funcionarios f
          WHERE f.deleted_at IS NULL
            AND COALESCE(f.ativo, 1) = 1
            AND f.empresa_id = ?
            AND UPPER(COALESCE(f.funcao, '')) IN ('PILOTO', 'COPILOTO', 'COMANDANTE')
            AND NOT EXISTS (
              SELECT 1
                FROM frms_fadiga_checkin ch
               WHERE ch.empresa_id = ?
                 AND ch.funcionario_id = f.id
                 AND ch.data_checkin = ?
                 AND ch.deleted_at IS NULL
            )
          ORDER BY f.nome ASC`,
      )
      .bind(empresaId, empresaId, hoje)
      .all<{ id: number; nome: string }>();

    if (!semCheckin.results?.length) continue;

    const preview = semCheckin.results
      .slice(0, 12)
      .map((f) => `${f.nome} (#${f.id})`)
      .join('; ');

    await db
      .prepare(
        `INSERT INTO notificacoes_sistema
         (tipo, prioridade, titulo, mensagem, grupo, dados, empresa_id, created_at, updated_at)
         VALUES ('FRMS_CHECKIN_REMINDER', 'MEDIA', 'Check-in de fadiga pendente', ?, 'frms', ?, ?, datetime('now'), datetime('now'))`,
      )
      .bind(
        `${semCheckin.results.length} tripulante(s) sem check-in de fadiga em ${hoje}. ${preview}`,
        JSON.stringify({
          empresa_id: empresaId,
          data_checkin: hoje,
          pendentes: semCheckin.results,
        }),
        empresaId,
      )
      .run();

    notificacoes += 1;
  }

  return { notificacoes };
}
