import type { Env } from '../types';
import { buildSnapshot } from '../routes/compliance-treinamentos';
import type { EmployeeSectorAccess } from '../services/employee-sector-access';
import {
  buildTrainingComplianceReportRows,
  complianceReportScheduleWindow,
  getComplianceReportAutomationPolicy,
  sendTrainingComplianceReportToSectorManagers,
} from '../services/training-compliance-reports';
import { getSchemaColumns } from '../utils/db-schema';

const ALL_ACCESS: EmployeeSectorAccess = { mode: 'all', setorIds: [], funcionarioId: null };
type ClaimState = { claimed: boolean; logId: number | null };

async function hasAutomationLogSchema(db: D1Database): Promise<boolean> {
  try {
    const names = await getSchemaColumns(db, 'notificacoes_log');
    return (
      names.has('notification_key') && names.has('tentativas_envio') && names.has('updated_at')
    );
  } catch {
    return false;
  }
}

async function claimReportRun(
  db: D1Database,
  empresaId: number,
  sectorId: number,
  sectorName: string,
  scheduleKey: string,
): Promise<ClaimState> {
  const notificationKey = `COMPLIANCE_REPORT:${scheduleKey}:SETOR:${sectorId}`;
  const marker = `[COMPLIANCE_GESTOR:RELATORIO:${scheduleKey}:${sectorId}]`;
  const insert = await db
    .prepare(
      `INSERT OR IGNORE INTO notificacoes_log (
         empresa_id, tipo, destinatario, assunto, corpo, status,
         notification_key, tentativas_envio, created_at, updated_at
       ) VALUES (?, 'EMAIL_COMPLIANCE_GESTOR_RELATORIO', NULL, ?, ?, 'processando', ?, 1, datetime('now'), datetime('now'))`,
    )
    .bind(
      empresaId,
      marker,
      JSON.stringify({ setor_id: sectorId, setor_nome: sectorName, schedule_key: scheduleKey }),
      notificationKey,
    )
    .run();
  if (Number(insert.meta?.changes || 0) > 0) {
    const created = await db
      .prepare(
        'SELECT id FROM notificacoes_log WHERE empresa_id = ? AND notification_key = ? LIMIT 1',
      )
      .bind(empresaId, notificationKey)
      .first<{ id: number }>();
    return { claimed: true, logId: created?.id ? Number(created.id) : null };
  }

  const existing = await db
    .prepare(
      `SELECT id, status, tentativas_envio, updated_at
         FROM notificacoes_log
        WHERE empresa_id = ? AND notification_key = ? LIMIT 1`,
    )
    .bind(empresaId, notificationKey)
    .first<{
      id: number;
      status: string | null;
      tentativas_envio: number | null;
      updated_at: string | null;
    }>();
  if (!existing || existing.status === 'enviada') {
    return { claimed: false, logId: existing?.id ? Number(existing.id) : null };
  }
  const attempts = Number(existing.tentativas_envio || 0);
  if (attempts >= 3) return { claimed: false, logId: Number(existing.id) };
  const retry = await db
    .prepare(
      `UPDATE notificacoes_log
          SET status = 'processando', erro_mensagem = NULL,
              tentativas_envio = COALESCE(tentativas_envio, 0) + 1,
              updated_at = datetime('now')
        WHERE id = ? AND empresa_id = ?
          AND (
            status = 'erro'
            OR (
              status = 'processando'
              AND COALESCE(updated_at, created_at) <= datetime('now', '-30 minutes')
            )
          )`,
    )
    .bind(existing.id, empresaId)
    .run();
  return {
    claimed: Number(retry.meta?.changes || 0) > 0,
    logId: Number(existing.id),
  };
}

async function finishReportRun(
  db: D1Database,
  empresaId: number,
  logId: number | null,
  result: { sent: boolean; recipients: number; error: string | null },
) {
  if (!logId) return;
  await db
    .prepare(
      `UPDATE notificacoes_log
          SET status = ?, destinatario = ?, erro_mensagem = ?,
              enviado_em = CASE WHEN ? THEN datetime('now') ELSE enviado_em END,
              updated_at = datetime('now')
        WHERE id = ? AND empresa_id = ?`,
    )
    .bind(
      result.sent ? 'enviada' : 'erro',
      result.recipients ? `${result.recipients} gestor(es)` : null,
      result.error,
      result.sent ? 1 : 0,
      logId,
      empresaId,
    )
    .run();
}

export async function processTrainingComplianceReportAutomation(
  env: Env,
  now = new Date(),
): Promise<{
  empresas: number;
  setores: number;
  enviados: number;
  falhas: number;
  ignorados: number;
}> {
  if (!(await hasAutomationLogSchema(env.DB))) {
    console.warn(
      '[training-compliance-reports] Schema de idempotencia indisponivel; automacao nao executada',
    );
    return { empresas: 0, setores: 0, enviados: 0, falhas: 0, ignorados: 1 };
  }

  const companies = await env.DB.prepare(
    'SELECT id, nome FROM empresas WHERE deleted_at IS NULL ORDER BY id',
  ).all<{ id: number; nome: string }>();
  let processedCompanies = 0;
  let sectors = 0;
  let sent = 0;
  let failures = 0;
  let skipped = 0;

  for (const company of companies.results || []) {
    const empresaId = Number(company.id);
    if (!empresaId) continue;
    const policy = await getComplianceReportAutomationPolicy(env.DB, empresaId);
    const window = complianceReportScheduleWindow(policy, now);
    if (!window.due) continue;
    processedCompanies += 1;
    const snapshot = await buildSnapshot(env.DB, empresaId, ALL_ACCESS);
    const placeholders = policy.sector_ids.map(() => '?').join(',');
    const sectorRows = await env.DB.prepare(
      `SELECT id, nome FROM setores
          WHERE empresa_id = ? AND id IN (${placeholders})
            AND deleted_at IS NULL AND COALESCE(ativo,1)=1
          ORDER BY nome`,
    )
      .bind(empresaId, ...policy.sector_ids)
      .all<{ id: number; nome: string }>();

    for (const sector of sectorRows.results || []) {
      sectors += 1;
      const claim = await claimReportRun(
        env.DB,
        empresaId,
        Number(sector.id),
        sector.nome,
        window.triggerKey,
      );
      if (!claim.claimed) {
        skipped += 1;
        continue;
      }
      try {
        const rows = buildTrainingComplianceReportRows(snapshot, {
          setor_id: Number(sector.id),
          statuses: policy.statuses,
          critico: policy.critical_only,
          ate_dias: policy.due_within_days,
        });
        const result = await sendTrainingComplianceReportToSectorManagers({
          env,
          db: env.DB,
          empresaId,
          empresaNome: company.nome || 'Empresa',
          setorId: Number(sector.id),
          setorNome: sector.nome,
          rows,
        });
        await finishReportRun(env.DB, empresaId, claim.logId, result);
        if (result.sent) sent += 1;
        else failures += 1;
      } catch (error) {
        failures += 1;
        const message = error instanceof Error ? error.message : String(error);
        await finishReportRun(env.DB, empresaId, claim.logId, {
          sent: false,
          recipients: 0,
          error: message.slice(0, 800),
        });
        console.error('[training-compliance-reports] Falha no envio automatico', {
          empresa_id: empresaId,
          setor_id: Number(sector.id),
          error: message,
        });
      }
    }
  }

  return {
    empresas: processedCompanies,
    setores: sectors,
    enviados: sent,
    falhas: failures,
    ignorados: skipped,
  };
}
