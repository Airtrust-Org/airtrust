import type { Env } from '../types';
import { getModuleAlertSettings, renderAlertTemplate } from '../services/module-alert-settings';
import { loadDailyCheckinObligations } from '../lib/frms/checkin-obligation';
import { getSaoPauloOperationalDate } from './frms-daily-check';

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
  // Data civil operacional (America/Sao_Paulo), não a data UTC.
  const hoje = getSaoPauloOperationalDate();

  for (const row of empresas.results || []) {
    const empresaId = Number(row.empresa_id);
    const settings = (await getModuleAlertSettings(db, empresaId)).frms_checkin_reminder;
    if (!settings.enabled) continue;

    const jaExiste = await db
      .prepare(
        `SELECT id
           FROM notificacoes_sistema
          WHERE tipo = 'FRMS_CHECKIN_REMINDER'
            AND grupo = 'frms'
            AND json_extract(dados, '$.data_checkin') = ?
            AND json_extract(dados, '$.empresa_id') = ?
          LIMIT 1`,
      )
      .bind(hoje, empresaId)
      .first<{ id: number }>();

    if (jaExiste?.id) continue;

    const semCheckin = await db
      .prepare(
        `SELECT f.id, f.nome
           FROM funcionarios f
          WHERE f.deleted_at IS NULL
            AND COALESCE(f.ativo, 1) = 1
            AND UPPER(COALESCE(NULLIF(TRIM(f.status), ''), 'ATIVO')) = 'ATIVO'
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

    // Só entra no lembrete quem tem obrigação canônica no dia (atividade, voo
    // programado ou dia de serviço da escala). Quinzena-base presumida, folga,
    // férias e afastamento não geram pendência.
    const obrigacoes = semCheckin.results?.length
      ? await loadDailyCheckinObligations(db, empresaId, hoje)
      : new Map();
    const pendentes = (semCheckin.results || []).filter(
      (f) => obrigacoes.get(Number(f.id))?.status === 'PENDENTE',
    );
    if (!pendentes.length) continue;

    const preview = pendentes
      .slice(0, 12)
      .map((f) => `${f.nome} (#${f.id})`)
      .join('; ');

    const vars = { total: pendentes.length, data: hoje, resumo: preview };
    await db
      .prepare(
        `INSERT INTO notificacoes_sistema
         (tipo, prioridade, titulo, mensagem, grupo, dados, empresa_id, created_at, updated_at)
         VALUES ('FRMS_CHECKIN_REMINDER', 'MEDIA', ?, ?, 'frms', ?, ?, datetime('now'), datetime('now'))`,
      )
      .bind(
        renderAlertTemplate(settings.title_template, vars),
        renderAlertTemplate(settings.message_template, vars),
        JSON.stringify({
          empresa_id: empresaId,
          data_checkin: hoje,
          pendentes,
        }),
        empresaId,
      )
      .run();

    notificacoes += 1;
  }

  return { notificacoes };
}
