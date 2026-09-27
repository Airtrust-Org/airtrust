import type { Env } from '../types';
import { getModuleAlertSettings, renderAlertTemplate } from '../services/module-alert-settings';

function dailyId(parts: Array<string | number>): string {
  return [...parts, new Date().toISOString().slice(0, 10)].join(':');
}

function formatDateBr(value: string): string {
  const [y, m, d] = value.slice(0, 10).split('-');
  return y && m && d ? `${d}/${m}/${y}` : value;
}

function deadlineStatus(days: number): string {
  if (days === 0) return 'vence hoje';
  if (days === 1) return 'vence amanhã';
  return `vence em ${days} dias`;
}

export async function processLmsCompletionReminders(
  env: Env,
): Promise<{ avaliados: number; criados: number }> {
  const companies = await env.DB.prepare(
    'SELECT id FROM empresas WHERE ativo = 1 AND deleted_at IS NULL ORDER BY id',
  ).all<{ id: number }>();
  let evaluated = 0;
  let created = 0;

  for (const company of companies.results || []) {
    const empresaId = Number(company.id);
    if (!empresaId) continue;
    const settings = (await getModuleAlertSettings(env.DB, empresaId)).lms_completion;
    if (!settings.enabled || settings.thresholds.length === 0) continue;

    const placeholders = settings.thresholds.map(() => '?').join(', ');
    const rows = await env.DB.prepare(
      `SELECT m.id, m.funcionario_id, m.empresa_id, c.titulo, m.data_expiracao,
                CAST(julianday(date(m.data_expiracao)) - julianday(date('now')) AS INTEGER) AS dias_restantes
           FROM lms_matriculas m
           JOIN lms_cursos c ON c.id = m.curso_id AND c.empresa_id = m.empresa_id AND c.deleted_at IS NULL
           JOIN funcionarios f ON f.id = m.funcionario_id AND f.empresa_id = m.empresa_id
            AND f.deleted_at IS NULL AND COALESCE(f.ativo, 1) = 1
            AND UPPER(COALESCE(NULLIF(TRIM(f.status), ''), 'ATIVO')) = 'ATIVO'
          WHERE m.deleted_at IS NULL
            AND m.empresa_id = ?
            AND m.status IN ('NAO_INICIADO', 'EM_ANDAMENTO')
            AND m.data_expiracao IS NOT NULL
            AND CAST(julianday(date(m.data_expiracao)) - julianday(date('now')) AS INTEGER) IN (${placeholders})`,
    )
      .bind(empresaId, ...settings.thresholds)
      .all<{
        id: number;
        funcionario_id: number;
        empresa_id: number;
        titulo: string;
        data_expiracao: string;
        dias_restantes: number;
      }>();

    for (const row of rows.results || []) {
      evaluated += 1;
      const vars = {
        treinamento: row.titulo,
        dias: row.dias_restantes,
        status_prazo: deadlineStatus(row.dias_restantes),
        data_limite: formatDateBr(row.data_expiracao),
      };
      const result = await env.DB.prepare(
        `INSERT OR IGNORE INTO notificacoes_inapp (
             id, funcionario_id, empresa_id, tipo, titulo, mensagem, referencia_id, referencia_tipo, created_at
           ) VALUES (?, ?, ?, ?, ?, ?, ?, 'lms_matricula', ?)`,
      )
        .bind(
          dailyId([
            'lms',
            'prazo_conclusao',
            empresaId,
            row.funcionario_id,
            row.id,
            row.dias_restantes,
          ]),
          String(row.funcionario_id),
          empresaId,
          `lms_prazo_conclusao_${row.dias_restantes}_dias`,
          renderAlertTemplate(settings.title_template, vars),
          renderAlertTemplate(settings.message_template, vars),
          String(row.id),
          new Date().toISOString(),
        )
        .run();
      created += Number(result.meta?.changes || 0);
    }
  }

  return { avaliados: evaluated, criados: created };
}
