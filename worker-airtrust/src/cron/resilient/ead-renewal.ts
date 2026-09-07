import {
  canReuseMatriculaCycle,
  ensureMatriculaCycle,
  hasActiveMatriculaCycle,
  resetMatriculaForNewCycle,
} from '../../services/lms-matricula-cycle';
import { getQualificacoesVencimentoExpr } from '../../utils/qualificacoes-alerta-config';
import { sendEmail } from '../../lib/email';
import type { Env } from '../../types';
import {
  enqueueCronJobItem,
  listRunnableCronJobItems,
  markCronJobItemFailed,
  markCronJobItemProcessing,
  markCronJobItemSucceeded,
  recoverStaleCronJobItems,
} from '../job-state';
import { runCronJobWithLease, type CronJobLogger } from './job-runner';

const JOB_NAME = 'ead-renewal';
const SCOPE_KEY = 'global';
export const LMS_RENOVACAO_EAD_JANELA_DIAS = 30;
export const EAD_RENEWAL_DISCOVERY_BATCH = 100;
export const EAD_RENEWAL_PROCESS_BATCH = 50;

interface RenewalRow {
  qualificacao_historico_id: number;
  funcionario_id: number;
  empresa_id: number;
  qualificacao_id: number;
  curso_id: number;
  curso_titulo: string;
}

interface RenewalPayload extends RenewalRow {
  discovered_at: string;
}

interface ExistingMatricula {
  id: number;
  status: string;
  deleted_at: string | null;
}

export function buildQualificacoesEadRenovacaoResilienteQuery(): string {
  const vencExpr = getQualificacoesVencimentoExpr();
  const vencExprQh2 = getQualificacoesVencimentoExpr('qh2', 'qt');
  return `SELECT DISTINCT
           qh.id AS qualificacao_historico_id,
           qh.funcionario_id,
           qh.empresa_id,
           qt.id AS qualificacao_id,
           lc.id AS curso_id,
           lc.titulo AS curso_titulo
         FROM qualificacoes_historico qh
         JOIN qualificacoes_tipos qt
           ON qt.empresa_id = qh.empresa_id
          AND qt.deleted_at IS NULL
          AND (
            qt.id = qh.qualificacao_id
            OR (
              qh.qualificacao_id IS NULL
              AND UPPER(TRIM(COALESCE(qh.qualificacao_codigo, ''))) = UPPER(TRIM(COALESCE(qt.codigo, '')))
            )
          )
         LEFT JOIN qualificacoes_formatos qf
           ON qf.id = COALESCE(qh.formato_id, qt.formato_id)
          AND qf.deleted_at IS NULL
         JOIN lms_cursos lc
           ON lc.qualificacao_tipo_id = qt.id
          AND lc.ativo = 1
          AND lc.publicado = 1
          AND lc.deleted_at IS NULL
          AND lc.empresa_id = qh.empresa_id
         JOIN funcionarios f
           ON f.id = qh.funcionario_id
          AND f.empresa_id = qh.empresa_id
          AND f.deleted_at IS NULL
          AND COALESCE(f.ativo, 1) = 1
          AND UPPER(COALESCE(NULLIF(TRIM(f.status), ''), 'ATIVO')) = 'ATIVO'
        WHERE qh.deleted_at IS NULL
          AND (
            UPPER(TRIM(COALESCE(qf.codigo, ''))) = 'EAD'
            OR UPPER(TRIM(COALESCE(qt.categoria, ''))) IN ('EAD', 'TREINAMENTO EAD')
          )
          AND COALESCE(qh.renovada, 0) = 0
          AND (qh.data_vencimento IS NOT NULL OR qh.data_conclusao IS NOT NULL)
          AND NOT EXISTS (
            SELECT 1
              FROM qualificacoes_historico qh2
             WHERE qh2.empresa_id = qh.empresa_id
               AND qh2.funcionario_id = qh.funcionario_id
               AND qh2.id <> qh.id
               AND qh2.deleted_at IS NULL
               AND COALESCE(qh2.renovada, 0) = 0
               AND (qh2.data_vencimento IS NOT NULL OR qh2.data_conclusao IS NOT NULL)
               AND (
                 qh2.qualificacao_id = qt.id
                 OR UPPER(TRIM(COALESCE(qh2.qualificacao_codigo, ''))) = UPPER(TRIM(COALESCE(qt.codigo, '')))
               )
               AND date(${vencExprQh2}) > date(${vencExpr})
          )
          AND date(${vencExpr}) <= date('now', '+' || ? || ' days')
          AND qh.id > ?
        ORDER BY qh.id ASC
        LIMIT ?`;
}

function parsePayload(value: string | null): RenewalPayload | null {
  if (!value) return null;
  try {
    const parsed = JSON.parse(value) as Record<string, unknown>;
    const numericKeys = [
      'qualificacao_historico_id',
      'funcionario_id',
      'empresa_id',
      'qualificacao_id',
      'curso_id',
    ] as const;
    const numbers = Object.fromEntries(
      numericKeys.map((key) => [key, Number(parsed[key])]),
    ) as Record<(typeof numericKeys)[number], number>;
    if (
      numericKeys.some((key) => !Number.isInteger(numbers[key]) || numbers[key] <= 0) ||
      typeof parsed.curso_titulo !== 'string' ||
      typeof parsed.discovered_at !== 'string'
    ) {
      return null;
    }
    return {
      qualificacao_historico_id: numbers.qualificacao_historico_id,
      funcionario_id: numbers.funcionario_id,
      empresa_id: numbers.empresa_id,
      qualificacao_id: numbers.qualificacao_id,
      curso_id: numbers.curso_id,
      curso_titulo: parsed.curso_titulo,
      discovered_at: parsed.discovered_at,
    };
  } catch {
    return null;
  }
}

async function findLatestMatricula(
  db: D1Database,
  payload: Pick<RenewalPayload, 'curso_id' | 'funcionario_id' | 'empresa_id'>,
): Promise<ExistingMatricula | null> {
  return db
    .prepare(
      `SELECT id, status, deleted_at
         FROM lms_matriculas
        WHERE curso_id = ?
          AND funcionario_id = ?
          AND empresa_id = ?
        ORDER BY CASE WHEN deleted_at IS NULL THEN 0 ELSE 1 END, id DESC
        LIMIT 1`,
    )
    .bind(payload.curso_id, payload.funcionario_id, payload.empresa_id)
    .first<ExistingMatricula>();
}

function isMatriculaUniqueConstraintError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error ?? '');
  return message.includes('UNIQUE constraint failed') && message.includes('lms_matriculas');
}

function buildRenewalExpirationDate(): string {
  const expiration = new Date();
  expiration.setUTCDate(expiration.getUTCDate() + LMS_RENOVACAO_EAD_JANELA_DIAS);
  return expiration.toISOString().slice(0, 10);
}

async function ensureExistingRenewalMatricula(
  db: D1Database,
  existing: ExistingMatricula,
): Promise<{ matriculaId: number; created: false; active: true }> {
  if (hasActiveMatriculaCycle(existing)) {
    const cycleId = await ensureMatriculaCycle(db, {
      matriculaId: existing.id,
      origin: 'AUTO_RENOVACAO',
    });
    if (!cycleId) throw new Error('EAD_RENEWAL_CYCLE_NOT_CREATED');
    return { matriculaId: existing.id, created: false, active: true };
  }

  if (!canReuseMatriculaCycle(existing)) {
    throw new Error(`EAD_RENEWAL_EXISTING_MATRICULA_NOT_REUSABLE:${existing.status}`);
  }

  const cycleId = await resetMatriculaForNewCycle(db, {
    matriculaId: existing.id,
    dataExpiracao: buildRenewalExpirationDate(),
    observacoes: 'Matrícula automática: renovação de qualificação EAD vencendo',
    origin: 'AUTO_RENOVACAO',
  });
  if (!cycleId) throw new Error('EAD_RENEWAL_CYCLE_NOT_CREATED');

  return { matriculaId: existing.id, created: false, active: true };
}

async function ensureRenewalMatricula(
  db: D1Database,
  payload: RenewalPayload,
): Promise<{ matriculaId: number; created: boolean; active: boolean }> {
  let existing = await findLatestMatricula(db, payload);
  if (existing) {
    return ensureExistingRenewalMatricula(db, existing);
  }

  const expirationDate = buildRenewalExpirationDate();

  try {
    const inserted = await db
      .prepare(
        `INSERT INTO lms_matriculas (
           empresa_id, curso_id, funcionario_id, data_expiracao, observacoes
         ) VALUES (?, ?, ?, ?, 'Matrícula automática: renovação de qualificação EAD vencendo')`,
      )
      .bind(payload.empresa_id, payload.curso_id, payload.funcionario_id, expirationDate)
      .run();
    const matriculaId = Number(inserted.meta.last_row_id || 0);
    if (!matriculaId) throw new Error('EAD_RENEWAL_MATRICULA_NOT_CREATED');
    const cycleId = await ensureMatriculaCycle(db, {
      matriculaId,
      origin: 'AUTO_RENOVACAO',
    });
    if (!cycleId) throw new Error('EAD_RENEWAL_CYCLE_NOT_CREATED');
    return { matriculaId, created: true, active: true };
  } catch (error) {
    if (!isMatriculaUniqueConstraintError(error)) throw error;
    existing = await findLatestMatricula(db, payload);
    if (!existing) throw error;
    return ensureExistingRenewalMatricula(db, existing);
  }
}

async function ensureRenewalNotification(
  db: D1Database,
  payload: RenewalPayload,
  matriculaId: number,
): Promise<void> {
  const notificationId = [
    'lms',
    'lms_renovacao_automatica',
    payload.empresa_id,
    payload.funcionario_id,
    'lms_matricula',
    matriculaId,
    payload.qualificacao_historico_id,
  ].join(':');

  await db
    .prepare(
      `INSERT OR IGNORE INTO notificacoes_inapp (
         id, funcionario_id, empresa_id, tipo, titulo, mensagem,
         referencia_id, referencia_tipo, created_at
       ) VALUES (?, ?, ?, 'lms_renovacao_automatica',
         'Treinamento de renovação disponível',
         'Sua qualificação EAD vence em breve. Você foi matriculado automaticamente em: ' || ?,
         ?, 'lms_matricula', ?)`,
    )
    .bind(
      notificationId,
      String(payload.funcionario_id),
      payload.empresa_id,
      payload.curso_titulo,
      String(matriculaId),
      new Date().toISOString(),
    )
    .run();
}

async function ensureRenewalEmail(
  env: Env,
  db: D1Database,
  payload: RenewalPayload,
): Promise<void> {
  try {
    const func = await db
      .prepare(
        `SELECT nome, email FROM funcionarios WHERE id = ? AND empresa_id = ? AND deleted_at IS NULL`,
      )
      .bind(payload.funcionario_id, payload.empresa_id)
      .first<{ nome: string; email: string | null }>();

    if (!func?.email) return;

    const frontendUrl = String(env.FRONTEND_URL || 'https://airtrust.online').replace(/\/$/, '');
    const cursoUrl = `${frontendUrl}/lms/cursos/${payload.curso_id}`;
    const nomeAluno = func.nome || `Funcionário ${payload.funcionario_id}`;

    await sendEmail(env, {
      to: [{ email: func.email, name: nomeAluno }],
      subject: `Treinamento disponível: ${payload.curso_titulo}`,
      textContent: [
        `Olá ${nomeAluno},`,
        '',
        `Sua qualificação EAD vence em breve. Você foi matriculado automaticamente no curso: ${payload.curso_titulo}`,
        '',
        `Acesse: ${cursoUrl}`,
        '',
        'Este e-mail foi enviado automaticamente pela plataforma AirTrust.',
      ].join('\n'),
      htmlContent: `<div style="font-family:Arial,sans-serif;font-size:14px;color:#1f2937;line-height:1.6;max-width:600px;margin:0 auto;padding:20px">
        <p>Olá <strong>${nomeAluno}</strong>,</p>
        <p>Sua qualificação EAD vence em breve. Você foi matriculado automaticamente no curso:</p>
        <div style="background:#f0f9ff;border-left:4px solid #3b82f6;padding:12px 16px;margin:12px 0;border-radius:4px">
          <p style="font-size:16px;font-weight:600;margin:0;color:#1e3a5f">${payload.curso_titulo}</p>
        </div>
        <p style="margin:24px 0"><a href="${cursoUrl}" style="background:#2563eb;color:#fff;padding:12px 24px;border-radius:6px;text-decoration:none;font-weight:600;display:inline-block">Acessar curso</a></p>
        <p style="color:#6b7280;font-size:12px;margin-top:24px">Este e-mail foi enviado automaticamente pela plataforma AirTrust.</p>
      </div>`,
    });
  } catch (err) {
    console.warn('[ead-renewal] Falha ao enviar email de renovação:', err);
  }
}

export async function runEadRenewalJob(db: D1Database, env: Env, logger: CronJobLogger) {
  return runCronJobWithLease({
    db,
    jobName: JOB_NAME,
    scopeKey: SCOPE_KEY,
    logger,
    ttlSeconds: 240,
    budgetMs: 25_000,
    execute: async (context) => {
      await recoverStaleCronJobItems(db, {
        jobName: JOB_NAME,
        scopeKey: SCOPE_KEY,
        staleMinutes: 30,
      });

      let cursor = Number(context.state?.cursor_value ?? 0);
      if (!Number.isFinite(cursor) || cursor < 0) cursor = 0;

      const discovery = await db
        .prepare(buildQualificacoesEadRenovacaoResilienteQuery())
        .bind(LMS_RENOVACAO_EAD_JANELA_DIAS, cursor, EAD_RENEWAL_DISCOVERY_BATCH)
        .all<RenewalRow>();
      const rows = discovery.results || [];
      const discoveredAt = new Date().toISOString();

      for (const row of rows) {
        await enqueueCronJobItem(db, {
          jobName: JOB_NAME,
          scopeKey: SCOPE_KEY,
          itemKey: `qh:${row.qualificacao_historico_id}`,
          stage: 'MATRICULA_PENDING',
          payload: { ...row, discovered_at: discoveredAt },
        });
      }

      const discoveryComplete = rows.length < EAD_RENEWAL_DISCOVERY_BATCH;
      cursor = discoveryComplete ? 0 : Number(rows.at(-1)?.qualificacao_historico_id ?? cursor);
      await context.checkpoint({
        cursorValue: String(cursor),
        metadata: { discoveryComplete, discovered_count: rows.length },
      });
      await context.heartbeat();

      const items = await listRunnableCronJobItems(db, {
        jobName: JOB_NAME,
        scopeKey: SCOPE_KEY,
        limit: EAD_RENEWAL_PROCESS_BATCH,
      });

      let processed = 0;
      let failed = 0;
      let created = 0;
      let repaired = 0;
      for (const item of items) {
        if (!context.hasBudget(1800)) break;
        const claimed = await markCronJobItemProcessing(db, {
          jobName: JOB_NAME,
          scopeKey: SCOPE_KEY,
          itemKey: item.item_key,
          stage: 'MATRICULA_ENSURE',
        });
        if (!claimed) continue;

        const payload = parsePayload(item.payload_json);
        if (!payload) {
          failed++;
          await markCronJobItemFailed(db, {
            jobName: JOB_NAME,
            scopeKey: SCOPE_KEY,
            itemKey: item.item_key,
            stage: 'INVALID_PAYLOAD',
            errorCode: 'EAD_RENEWAL_INVALID_PAYLOAD',
            errorMessage: 'Payload operacional inválido.',
            retryDelaySeconds: 86400,
          });
          continue;
        }

        try {
          const result = await ensureRenewalMatricula(db, payload);
          await ensureRenewalNotification(db, payload, result.matriculaId);
          await ensureRenewalEmail(env, db, payload);
          await markCronJobItemSucceeded(db, {
            jobName: JOB_NAME,
            scopeKey: SCOPE_KEY,
            itemKey: item.item_key,
            stage: 'MATRICULA_CYCLE_NOTIFICATION_READY',
          });
          processed++;
          if (result.created) created++;
          else repaired++;
        } catch (error) {
          failed++;
          await markCronJobItemFailed(db, {
            jobName: JOB_NAME,
            scopeKey: SCOPE_KEY,
            itemKey: item.item_key,
            stage: 'MATRICULA_REPAIR_FAILED',
            errorCode: 'EAD_RENEWAL_REPAIR_FAILED',
            errorMessage: error instanceof Error ? error.message : String(error),
            retryDelaySeconds: Math.min(3600, 60 * 2 ** Math.min(item.attempts, 5)),
          });
        }
      }

      const remaining = await db
        .prepare(
          `SELECT COUNT(*) AS total
             FROM cron_job_items
            WHERE job_name = ?
              AND scope_key = ?
              AND status != 'SUCCEEDED'`,
        )
        .bind(JOB_NAME, SCOPE_KEY)
        .first<{ total: number }>();
      const pending = Number(remaining?.total || 0);
      const succeeded = discoveryComplete && pending === 0 && failed === 0;

      return {
        outcome: succeeded ? ('SUCCEEDED' as const) : ('PARTIAL' as const),
        processedCount: processed,
        failedCount: failed,
        cursorAfter: String(cursor),
        metadata: {
          discoveryComplete,
          pending_count: pending,
          matriculas_created: created,
          matriculas_repaired: repaired,
        },
        markStateSuccess: succeeded,
      };
    },
  });
}
