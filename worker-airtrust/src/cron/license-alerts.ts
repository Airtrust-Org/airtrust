import type { Env } from '../types';
import { enviarEmailAlert } from './notificacoes';
import { getSetorGestoresBySetor } from '../services/setores-gestores';
import { getModuleAlertSettings, renderAlertTemplate } from '../services/module-alert-settings';
import { normalizeEmailRecipients } from './notificacoes';

type LicenseRow = {
  id: number;
  funcionario_id: number;
  funcionario_cpf: string | null;
  funcionario_nome: string;
  funcionario_email: string | null;
  setor_id: number | null;
  tipo: string;
  numero: string;
  data_vencimento: string;
  dias: number;
};

function dateBr(value: string): string {
  const [y, m, d] = value.slice(0, 10).split('-');
  return y && m && d ? `${d}/${m}/${y}` : value;
}

function stageFor(days: number, thresholds: number[]): number | null {
  if (days < 0) return null;
  const sorted = [...thresholds].sort((a, b) => b - a);
  for (let i = 0; i < sorted.length; i += 1) {
    const upper = sorted[i];
    const lower = sorted[i + 1] ?? -1;
    if (days <= upper && days > lower) return upper;
  }
  return null;
}

async function alreadySent(
  db: D1Database,
  empresaId: number,
  licenseId: number,
  stage: string,
  expiredLookbackDays: number | null,
): Promise<boolean> {
  const marker = `[LICENCA:${licenseId}:${stage}]`;
  const window =
    expiredLookbackDays == null
      ? ''
      : expiredLookbackDays === 1
        ? "AND date(enviado_em) = date('now')"
        : `AND enviado_em >= datetime('now', '-${Math.max(1, Math.min(365, expiredLookbackDays))} day')`;
  const row = await db
    .prepare(
      `SELECT 1 AS ok FROM notificacoes_log
        WHERE empresa_id = ? AND assunto = ? AND status = 'enviada' ${window}
        LIMIT 1`,
    )
    .bind(empresaId, marker)
    .first<{ ok: number }>();
  return Boolean(row?.ok);
}

async function logDelivery(
  db: D1Database,
  empresaId: number,
  row: LicenseRow,
  marker: string,
  recipients: string[],
  body: string,
  ok: boolean,
  error: string | null = null,
): Promise<void> {
  await db
    .prepare(
      `INSERT INTO notificacoes_log
        (empresa_id, config_id, qualificacao_historico_id, funcionario_cpf,
         tipo, destinatario, assunto, corpo, status, erro_mensagem, enviado_em)
       VALUES (?, NULL, NULL, ?, 'EMAIL_LICENCA', ?, ?, ?, ?, ?, CASE WHEN ? THEN datetime('now') ELSE NULL END)`,
    )
    .bind(
      empresaId,
      row.funcionario_cpf,
      recipients.join(', '),
      marker,
      body,
      ok ? 'enviada' : 'erro',
      error,
      ok ? 1 : 0,
    )
    .run();
}

export async function processLicenseAlerts(
  env: Env,
): Promise<{ avaliadas: number; enviadas: number; erros: number }> {
  const companies = await env.DB.prepare(
    'SELECT id FROM empresas WHERE ativo = 1 AND deleted_at IS NULL ORDER BY id',
  ).all<{ id: number }>();
  let avaliadas = 0;
  let enviadas = 0;
  let erros = 0;

  for (const company of companies.results || []) {
    const empresaId = Number(company.id);
    const settings = (await getModuleAlertSettings(env.DB, empresaId)).licenses;
    if (!settings.enabled) continue;
    const maxDays = Math.max(0, ...settings.thresholds);
    const licenses = await env.DB.prepare(
      `SELECT l.id, l.funcionario_id, f.cpf AS funcionario_cpf, f.nome AS funcionario_nome,
                f.email AS funcionario_email, f.setor_id, l.tipo, l.numero, l.data_vencimento,
                CAST(julianday(date(l.data_vencimento)) - julianday(date('now')) AS INTEGER) AS dias
           FROM licencas l
           JOIN funcionarios f ON f.id = l.funcionario_id AND f.empresa_id = ?
          WHERE l.deleted_at IS NULL AND f.deleted_at IS NULL
            AND COALESCE(f.ativo, 1) = 1
            AND UPPER(COALESCE(NULLIF(TRIM(f.status), ''), 'ATIVO')) = 'ATIVO'
            AND date(l.data_vencimento) <= date('now', '+' || ? || ' days')
            AND l.id IN (
              SELECT MAX(l2.id) FROM licencas l2
               WHERE l2.deleted_at IS NULL
               GROUP BY l2.funcionario_id, l2.tipo, l2.numero
            )
          ORDER BY l.data_vencimento ASC`,
    )
      .bind(empresaId, maxDays)
      .all<LicenseRow>();

    for (const row of licenses.results || []) {
      avaliadas += 1;
      const expired = row.dias < 0;
      const stage = expired ? 'VENCIDA' : stageFor(row.dias, settings.thresholds);
      if (!stage) continue;
      const lookback = expired
        ? settings.expired_frequency === 'DAILY'
          ? 1
          : settings.expired_interval_days
        : null;
      if (await alreadySent(env.DB, empresaId, row.id, String(stage), lookback)) continue;

      const dynamicRecipients: string[] = [];
      if (row.funcionario_email) dynamicRecipients.push(row.funcionario_email);
      if (row.setor_id) {
        try {
          const managers = await getSetorGestoresBySetor(env.DB, empresaId, row.setor_id, true);
          dynamicRecipients.push(...managers.map((m) => m.gestor_email).filter(Boolean));
        } catch {
          // A falha de resolução do gestor não impede a notificação do funcionário.
        }
      }
      const recipients = normalizeEmailRecipients(dynamicRecipients);
      if (!recipients.length) continue;

      const diasVencida = Math.abs(Math.min(row.dias, 0));
      const vars = {
        funcionario: row.funcionario_nome,
        licenca: [row.tipo, row.numero].filter(Boolean).join(' '),
        tipo: row.tipo,
        numero: row.numero,
        dias: row.dias,
        dias_vencida: diasVencida,
        unidade_dias_vencida: diasVencida === 1 ? 'dia' : 'dias',
        data_vencimento: dateBr(row.data_vencimento),
      };
      const subject = renderAlertTemplate(
        expired ? settings.expired_subject_template : settings.subject_template,
        vars,
      );
      const body = renderAlertTemplate(
        expired ? settings.expired_message_template : settings.message_template,
        vars,
      );
      const marker = `[LICENCA:${row.id}:${stage}]`;
      try {
        await enviarEmailAlert(env, recipients, subject, body);
        await logDelivery(env.DB, empresaId, row, marker, recipients, body, true);
        enviadas += 1;
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        await logDelivery(env.DB, empresaId, row, marker, recipients, body, false, message);
        erros += 1;
      }
    }
  }

  return { avaliadas, enviadas, erros };
}
