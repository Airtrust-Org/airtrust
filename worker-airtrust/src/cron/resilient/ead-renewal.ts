import {
  canReuseMatriculaCycle,
  ensureMatriculaCycle,
  hasActiveMatriculaCycle,
  resetMatriculaForNewCycle,
} from '../../services/lms-matricula-cycle';
import {
  getQualificacoesVencimentoExpr,
  getTodayIsoSaoPaulo,
} from '../../utils/qualificacoes-alerta-config';
import {
  TRAINING_COMPLIANCE_AVSEC_SUPERSEDED_CTE,
  TRAINING_COMPLIANCE_AVSEC_SUPERSEDED_CTE_NAME,
  trainingComplianceEffectiveRequirementPredicateSql,
  TRAINING_COMPLIANCE_OPERATIONAL_DATE_CTE,
  TRAINING_COMPLIANCE_OPERATIONAL_DATE_SQL,
} from '../../services/training-compliance-rule-engine';
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
export const LMS_RENOVACAO_EAD_JANELA_DIAS = 0;
export const EAD_RENEWAL_DISCOVERY_BATCH = 100;
export const EAD_RENEWAL_PROCESS_BATCH = 50;

export interface RenewalRow {
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
  return `WITH ${TRAINING_COMPLIANCE_OPERATIONAL_DATE_CTE},
       ${TRAINING_COMPLIANCE_AVSEC_SUPERSEDED_CTE},
       ead_eligible_courses AS MATERIALIZED (
         SELECT lc.id AS curso_id,
                lc.titulo AS curso_titulo,
                lc.empresa_id,
                qt.id AS tipo_id,
                UPPER(TRIM(COALESCE(qt.codigo, ''))) AS tipo_codigo_norm
           FROM lms_cursos lc
           CROSS JOIN qualificacoes_tipos qt
             ON qt.id = lc.qualificacao_tipo_id
            AND qt.empresa_id = lc.empresa_id
            AND qt.deleted_at IS NULL
          WHERE lc.ativo = 1
            AND lc.publicado = 1
            AND lc.deleted_at IS NULL
            AND EXISTS (
              SELECT 1
                FROM treinamento_requisitos tr_pre
               WHERE tr_pre.empresa_id = lc.empresa_id
                 AND tr_pre.qualificacao_tipo_id = qt.id
                 AND tr_pre.ativo = 1
                 AND tr_pre.deleted_at IS NULL
                 AND tr_pre.obrigatoriedade = 'OBRIGATORIA'
                 AND COALESCE(tr_pre.auto_matricular_ead, 0) = 1
            )
       ),
       ead_due_candidates AS MATERIALIZED (
         SELECT DISTINCT
                qh.id AS qualificacao_historico_id,
                qh.funcionario_id,
                qh.empresa_id,
                qt.id AS qualificacao_id,
                COALESCE(ec_id.curso_id, ec_cod.curso_id) AS curso_id,
                COALESCE(ec_id.curso_titulo, ec_cod.curso_titulo) AS curso_titulo,
                ${vencExpr} AS venc_expr
           FROM qualificacoes_historico qh
           LEFT JOIN ead_eligible_courses ec_id
             ON ec_id.empresa_id = qh.empresa_id
            AND ec_id.tipo_id = qh.qualificacao_id
           LEFT JOIN ead_eligible_courses ec_cod
             ON qh.qualificacao_id IS NULL
            AND ec_cod.empresa_id = qh.empresa_id
            AND ec_cod.tipo_codigo_norm = UPPER(TRIM(COALESCE(qh.qualificacao_codigo, '')))
           CROSS JOIN qualificacoes_tipos qt
             ON qt.id = COALESCE(ec_id.tipo_id, ec_cod.tipo_id)
            AND qt.empresa_id = qh.empresa_id
            AND qt.deleted_at IS NULL
           LEFT JOIN qualificacoes_formatos qf
             ON qf.id = COALESCE(qh.formato_id, qt.formato_id)
            AND qf.deleted_at IS NULL
           CROSS JOIN funcionarios f
             ON f.id = qh.funcionario_id
            AND f.empresa_id = qh.empresa_id
            AND f.deleted_at IS NULL
            AND COALESCE(f.ativo, 1) = 1
            AND UPPER(COALESCE(NULLIF(TRIM(f.status), ''), 'ATIVO')) = 'ATIVO'
          WHERE qh.deleted_at IS NULL
            AND COALESCE(qh.renovada, 0) = 0
            AND (qh.data_vencimento IS NOT NULL OR qh.data_conclusao IS NOT NULL)
            AND (ec_id.curso_id IS NOT NULL OR ec_cod.curso_id IS NOT NULL)
            AND (
              UPPER(TRIM(COALESCE(qf.codigo, ''))) = 'EAD'
              OR UPPER(TRIM(COALESCE(qt.categoria, ''))) IN ('EAD', 'TREINAMENTO EAD')
            )
            AND date(${vencExpr}) <= date(${TRAINING_COMPLIANCE_OPERATIONAL_DATE_SQL}, '+' || ? || ' days')
            AND qh.id > ?
       )
       SELECT DISTINCT
           cand.qualificacao_historico_id,
           cand.funcionario_id,
           cand.empresa_id,
           cand.qualificacao_id,
           cand.curso_id,
           cand.curso_titulo
         FROM ead_due_candidates cand
         JOIN qualificacoes_tipos qt
           ON qt.id = cand.qualificacao_id
         JOIN funcionarios f
           ON f.id = cand.funcionario_id
         LEFT JOIN ${TRAINING_COMPLIANCE_AVSEC_SUPERSEDED_CTE_NAME} av_superseded
           ON av_superseded.empresa_id = cand.empresa_id
          AND av_superseded.funcionario_id = f.id
        WHERE ${trainingComplianceEffectiveRequirementPredicateSql({ qualificationExpr: 'qt.id', empresaExpr: 'cand.empresa_id', requireAutoEnrollment: true, avsecSupersededFromCte: true })}
          AND NOT EXISTS (
            SELECT 1
              FROM qualificacoes_historico qh2
             WHERE qh2.empresa_id = cand.empresa_id
               AND qh2.funcionario_id = cand.funcionario_id
               AND qh2.id <> cand.qualificacao_historico_id
               AND qh2.deleted_at IS NULL
               AND COALESCE(qh2.renovada, 0) = 0
               AND (qh2.data_vencimento IS NOT NULL OR qh2.data_conclusao IS NOT NULL)
               AND (
                 qh2.qualificacao_id = qt.id
                 OR UPPER(TRIM(COALESCE(qh2.qualificacao_codigo, ''))) = UPPER(TRIM(COALESCE(qt.codigo, '')))
               )
               AND date(${vencExprQh2}) > date(cand.venc_expr)
          )
        ORDER BY cand.qualificacao_historico_id ASC
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

function buildRenewalExpirationDate(): string | null {
  // F-10: a janela de descoberta (hoje = dia do vencimento) NÃO é um prazo
  // de conclusão. Enquanto não existir prazo explícito aprovado para este
  // contrato, não inventar um vencimento "hoje" para a matrícula recém-criada.
  // A qualificação vencida continua sendo VENCIDA no Compliance.
  return null;
}

async function ensureExistingRenewalMatricula(
  db: D1Database,
  existing: ExistingMatricula,
  empresaId: number,
): Promise<{ matriculaId: number; created: false; active: true }> {
  if (hasActiveMatriculaCycle(existing)) {
    const cycleId = await ensureMatriculaCycle(db, {
      matriculaId: existing.id,
      origin: 'AUTO_RENOVACAO',
      empresaId,
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
    empresaId,
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
    return ensureExistingRenewalMatricula(db, existing, payload.empresa_id);
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
      empresaId: payload.empresa_id,
    });
    if (!cycleId) throw new Error('EAD_RENEWAL_CYCLE_NOT_CREATED');
    return { matriculaId, created: true, active: true };
  } catch (error) {
    if (!isMatriculaUniqueConstraintError(error)) throw error;
    existing = await findLatestMatricula(db, payload);
    if (!existing) throw error;
    return ensureExistingRenewalMatricula(db, existing, payload.empresa_id);
  }
}

// O handler legado (fallback sem schema de cron resiliente) usa exatamente
// o mesmo contrato de matrícula/ciclo, inclusive ao encontrar CONCLUIDO.
export async function ensureEadRenewalMatriculaForRow(db: D1Database, row: RenewalRow) {
  return ensureRenewalMatricula(db, { ...row, discovered_at: new Date().toISOString() });
}

// Renovação EAD cria/reabre a matrícula, mas não envia alerta próprio.
// Alertas de vencimento são responsabilidade exclusiva da régua canônica diária.

export async function runEadRenewalJob(db: D1Database, logger: CronJobLogger) {
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
        .bind(getTodayIsoSaoPaulo(), LMS_RENOVACAO_EAD_JANELA_DIAS, cursor, EAD_RENEWAL_DISCOVERY_BATCH)
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
          await markCronJobItemSucceeded(db, {
            jobName: JOB_NAME,
            scopeKey: SCOPE_KEY,
            itemKey: item.item_key,
            stage: 'MATRICULA_CYCLE_READY',
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
