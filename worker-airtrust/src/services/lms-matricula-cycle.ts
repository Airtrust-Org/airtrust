export interface LmsMatriculaCycleRecord {
  id: number;
  empresa_id?: number;
  curso_id?: number | null;
  funcionario_id?: number | null;
  status: string | null;
  deleted_at: string | null;
  observacoes?: string | null;
  data_matricula?: string | null;
  data_inicio?: string | null;
  data_conclusao?: string | null;
  data_expiracao?: string | null;
  progresso_pct?: number | null;
  score_final?: number | null;
  tentativas?: number | null;
  qualificacao_historico_id?: number | null;
}

type MatriculaSnapshot = Required<Pick<LmsMatriculaCycleRecord, 'id' | 'status' | 'deleted_at'>> & {
  empresa_id: number;
  curso_id: number | null;
  funcionario_id: number | null;
  observacoes: string | null;
  data_matricula: string | null;
  data_inicio: string | null;
  data_conclusao: string | null;
  data_expiracao: string | null;
  progresso_pct: number | null;
  score_final: number | null;
  tentativas: number | null;
  qualificacao_historico_id: number | null;
};

const ACTIVE_MATRICULA_STATUSES = new Set(['NAO_INICIADO', 'EM_ANDAMENTO']);
const REUSABLE_MATRICULA_STATUSES = new Set(['CANCELADO', 'CONCLUIDO', 'REPROVADO']);
const DEFAULT_CYCLE_ORIGIN = 'LMS';

function normalizeStatus(status: string | null | undefined) {
  return String(status ?? '')
    .trim()
    .toUpperCase();
}

export function hasActiveMatriculaCycle(record: LmsMatriculaCycleRecord | null | undefined) {
  if (!record || record.deleted_at) return false;
  return ACTIVE_MATRICULA_STATUSES.has(normalizeStatus(record.status));
}

export function canReuseMatriculaCycle(record: LmsMatriculaCycleRecord | null | undefined) {
  if (!record) return false;
  if (record.deleted_at) return true;
  return REUSABLE_MATRICULA_STATUSES.has(normalizeStatus(record.status));
}

async function readMatriculaSnapshot(
  db: D1Database,
  matriculaId: number,
  empresaId?: number,
) {
  return db
    .prepare(
      `SELECT id,
              empresa_id,
              curso_id,
              funcionario_id,
              status,
              deleted_at,
              observacoes,
              data_matricula,
              data_inicio,
              data_conclusao,
              data_expiracao,
              progresso_pct,
              score_final,
              tentativas,
              qualificacao_historico_id
         FROM lms_matriculas
        WHERE id = ?
          AND (? IS NULL OR empresa_id = ?)
        LIMIT 1`,
    )
    .bind(matriculaId, empresaId ?? null, empresaId ?? null)
    .first<MatriculaSnapshot>();
}

async function readCurrentMatriculaCycleId(db: D1Database, matriculaId: number) {
  return db
    .prepare(
      `SELECT id
         FROM lms_matricula_ciclos
        WHERE matricula_id = ?
          AND ciclo_atual = 1
          AND deleted_at IS NULL
        ORDER BY id DESC
        LIMIT 1`,
    )
    .bind(matriculaId)
    .first<{ id: number }>();
}

async function resolveNextCycleNumber(db: D1Database, matriculaId: number) {
  const row = await db
    .prepare(
      `SELECT COALESCE(MAX(numero_ciclo), 0) AS max_numero
         FROM lms_matricula_ciclos
        WHERE matricula_id = ?`,
    )
    .bind(matriculaId)
    .first<{ max_numero: number | null }>();

  return Number(row?.max_numero ?? 0) + 1;
}

async function upsertCurrentMatriculaCycle(
  db: D1Database,
  snapshot: MatriculaSnapshot,
  origin: string = DEFAULT_CYCLE_ORIGIN,
) {
  const current = await readCurrentMatriculaCycleId(db, snapshot.id);

  if (current?.id) {
    await db
      .prepare(
        `UPDATE lms_matricula_ciclos
            SET empresa_id = ?,
                curso_id = ?,
                funcionario_id = ?,
                origem = COALESCE(NULLIF(origem, ''), ?),
                status = ?,
                observacoes = ?,
                data_matricula = ?,
                data_inicio = ?,
                data_conclusao = ?,
                data_expiracao = ?,
                progresso_pct = COALESCE(?, 0),
                score_final = ?,
                tentativas = COALESCE(?, 0),
                qualificacao_historico_id = ?,
                updated_at = datetime('now')
          WHERE id = ?`,
      )
      .bind(
        snapshot.empresa_id,
        snapshot.curso_id,
        snapshot.funcionario_id,
        origin,
        normalizeStatus(snapshot.status) || 'NAO_INICIADO',
        snapshot.observacoes,
        snapshot.data_matricula,
        snapshot.data_inicio,
        snapshot.data_conclusao,
        snapshot.data_expiracao,
        snapshot.progresso_pct,
        snapshot.score_final,
        snapshot.tentativas,
        snapshot.qualificacao_historico_id,
        current.id,
      )
      .run();

    return current.id;
  }

  const numeroCiclo = await resolveNextCycleNumber(db, snapshot.id);
  const insert = await db
    .prepare(
      `INSERT INTO lms_matricula_ciclos (
         empresa_id,
         matricula_id,
         curso_id,
         funcionario_id,
         numero_ciclo,
         origem,
         status,
         ciclo_atual,
         observacoes,
         data_matricula,
         data_inicio,
         data_conclusao,
         data_expiracao,
         progresso_pct,
         score_final,
         tentativas,
         qualificacao_historico_id,
         created_at,
         updated_at,
         deleted_at
       ) VALUES (?, ?, ?, ?, ?, ?, ?, 1, ?, ?, ?, ?, ?, COALESCE(?, 0), ?, COALESCE(?, 0), ?, datetime('now'), datetime('now'), NULL)`,
    )
    .bind(
      snapshot.empresa_id,
      snapshot.id,
      snapshot.curso_id,
      snapshot.funcionario_id,
      numeroCiclo,
      origin,
      normalizeStatus(snapshot.status) || 'NAO_INICIADO',
      snapshot.observacoes,
      snapshot.data_matricula,
      snapshot.data_inicio,
      snapshot.data_conclusao,
      snapshot.data_expiracao,
      snapshot.progresso_pct,
      snapshot.score_final,
      snapshot.tentativas,
      snapshot.qualificacao_historico_id,
    )
    .run();

  return Number(insert.meta.last_row_id || 0);
}

export async function ensureMatriculaCycle(
  db: D1Database,
  params: { matriculaId: number; origin?: string; empresaId?: number },
) {
  const snapshot = await readMatriculaSnapshot(db, params.matriculaId, params.empresaId);
  if (!snapshot) return null;

  return upsertCurrentMatriculaCycle(db, snapshot, params.origin ?? DEFAULT_CYCLE_ORIGIN);
}

export async function syncMatriculaCycleFromMatricula(
  db: D1Database,
  params: { matriculaId: number; origin?: string },
) {
  return ensureMatriculaCycle(db, params);
}

export async function syncMatriculaCycleHistoricoLink(
  db: D1Database,
  params: { matriculaId: number; historicoId: number; empresaId: number },
) {
  await db
    .prepare(
      `UPDATE lms_matricula_ciclos
          SET qualificacao_historico_id = ?,
              updated_at = datetime('now')
        WHERE matricula_id = ?
          AND ciclo_atual = 1
          AND deleted_at IS NULL`,
    )
    .bind(params.historicoId, params.matriculaId)
    .run();

  await db
    .prepare(
      `UPDATE qualificacoes_historico
          SET lms_matricula_ciclo_id = (
                SELECT id
                  FROM lms_matricula_ciclos
                 WHERE matricula_id = ?
                   AND ciclo_atual = 1
                   AND deleted_at IS NULL
                 ORDER BY id DESC
                 LIMIT 1
              ),
              updated_at = datetime('now')
        WHERE id = ?
          AND empresa_id = ?
          AND deleted_at IS NULL`,
    )
    .bind(params.matriculaId, params.historicoId, params.empresaId)
    .run();
}

export async function upsertImportedEdappCycle(
  db: D1Database,
  params: { historicoImportadoId: number },
) {
  const historico = await db
    .prepare(
      `SELECT id,
              empresa_id,
              funcionario_id,
              curso_id,
              status,
              progresso_pct,
              score_final,
              qualificacao_historico_id,
              data_conclusao,
              completed_at,
              curso_titulo,
              deleted_at
         FROM lms_historico_importado
        WHERE id = ?
        LIMIT 1`,
    )
    .bind(params.historicoImportadoId)
    .first<{
      id: number;
      empresa_id: number;
      funcionario_id: number | null;
      curso_id: number | null;
      status: string | null;
      progresso_pct: number | null;
      score_final: number | null;
      qualificacao_historico_id: number | null;
      data_conclusao: string | null;
      completed_at: string | null;
      curso_titulo: string | null;
      deleted_at: string | null;
    }>();

  if (!historico || !historico.funcionario_id || !historico.curso_id) {
    return null;
  }

  const existing = await db
    .prepare(
      `SELECT id
         FROM lms_matricula_ciclos
        WHERE historico_importado_id = ?
          AND deleted_at IS NULL
        LIMIT 1`,
    )
    .bind(historico.id)
    .first<{ id: number }>();

  const dataConclusao = historico.data_conclusao ?? historico.completed_at ?? null;

  if (existing?.id) {
    await db
      .prepare(
        `UPDATE lms_matricula_ciclos
            SET empresa_id = ?,
                curso_id = ?,
                funcionario_id = ?,
                status = ?,
                observacoes = ?,
                data_matricula = ?,
                data_conclusao = ?,
                progresso_pct = COALESCE(?, 100),
                score_final = ?,
                qualificacao_historico_id = ?,
                updated_at = datetime('now'),
                deleted_at = ?
          WHERE id = ?`,
      )
      .bind(
        historico.empresa_id,
        historico.curso_id,
        historico.funcionario_id,
        normalizeStatus(historico.status) || 'CONCLUIDO',
        `Histórico legado importado do EdApp${historico.curso_titulo ? `: ${historico.curso_titulo}` : ''}`,
        dataConclusao,
        dataConclusao,
        historico.progresso_pct,
        historico.score_final,
        historico.qualificacao_historico_id,
        historico.deleted_at,
        existing.id,
      )
      .run();

    if (historico.qualificacao_historico_id) {
      await db
        .prepare(
          `UPDATE qualificacoes_historico
              SET lms_matricula_ciclo_id = ?,
                  updated_at = datetime('now')
            WHERE id = ?
              AND empresa_id = ?
              AND deleted_at IS NULL`,
        )
        .bind(existing.id, historico.qualificacao_historico_id, historico.empresa_id)
        .run();
    }

    await db
      .prepare(
        `UPDATE lms_historico_importado
            SET lms_matricula_ciclo_id = ?,
                updated_at = datetime('now')
          WHERE id = ?`,
      )
      .bind(existing.id, historico.id)
      .run();

    return existing.id;
  }

  const insert = await db
    .prepare(
      `INSERT INTO lms_matricula_ciclos (
         empresa_id,
         historico_importado_id,
         curso_id,
         funcionario_id,
         numero_ciclo,
         origem,
         status,
         ciclo_atual,
         observacoes,
         data_matricula,
         data_conclusao,
         progresso_pct,
         score_final,
         tentativas,
         qualificacao_historico_id,
         created_at,
         updated_at,
         deleted_at
       ) VALUES (?, ?, ?, ?, 1, 'IMPORTADO_EDAPP', ?, 0, ?, ?, ?, COALESCE(?, 100), ?, 1, ?, datetime('now'), datetime('now'), ?)`,
    )
    .bind(
      historico.empresa_id,
      historico.id,
      historico.curso_id,
      historico.funcionario_id,
      normalizeStatus(historico.status) || 'CONCLUIDO',
      `Histórico legado importado do EdApp${historico.curso_titulo ? `: ${historico.curso_titulo}` : ''}`,
      dataConclusao,
      dataConclusao,
      historico.progresso_pct,
      historico.score_final,
      historico.qualificacao_historico_id,
      historico.deleted_at,
    )
    .run();

  const cycleId = Number(insert.meta.last_row_id || 0);

  await db
    .prepare(
      `UPDATE lms_historico_importado
          SET lms_matricula_ciclo_id = ?,
              updated_at = datetime('now')
        WHERE id = ?`,
    )
    .bind(cycleId, historico.id)
    .run();

  if (historico.qualificacao_historico_id) {
    await db
      .prepare(
        `UPDATE qualificacoes_historico
            SET lms_matricula_ciclo_id = ?,
                updated_at = datetime('now')
          WHERE id = ?
            AND empresa_id = ?
            AND deleted_at IS NULL`,
      )
      .bind(cycleId, historico.qualificacao_historico_id, historico.empresa_id)
      .run();
  }

  return cycleId;
}

export async function resetMatriculaForNewCycle(
  db: D1Database,
  params: {
    matriculaId: number;
    dataExpiracao?: string | null;
    observacoes?: string | null;
    matriculadoPor?: number | null;
    origin?: string;
    empresaId: number;
  },
) {
  const beforeReset = await readMatriculaSnapshot(db, params.matriculaId, params.empresaId);

  // System-wide fail-safe: Compliance, roster and automatic EAD renewals must
  // never destroy surviving progress merely because a matrícula was cancelled.
  // An explicitly authorized new edition uses /nova-edicao, not this routine.
  if (beforeReset && (beforeReset.deleted_at ||
      normalizeStatus(beforeReset.status) === 'CANCELADO')) {
    const resumed = await reactivateCancelledMatriculaPreservingProgress(db, {
      empresaId: params.empresaId, matriculaId: params.matriculaId,
      dataExpiracao: params.dataExpiracao, observacoes: params.observacoes,
      matriculadoPor: params.matriculadoPor, bucket: undefined,
    });
    if (typeof resumed !== 'object') {
      throw new Error('LMS_CANCELLED_PROGRESS_PRESERVATION_REQUIRED');
    }
    const current = await readCurrentMatriculaCycleId(db, params.matriculaId);
    return current?.id ?? null;
  }

  if (beforeReset) {
    await upsertCurrentMatriculaCycle(db, beforeReset, params.origin ?? 'AUTO_RENOVACAO');
    await db
      .prepare(
        `UPDATE lms_matricula_ciclos
            SET ciclo_atual = 0,
                updated_at = datetime('now')
          WHERE matricula_id = ?
            AND empresa_id = ?
            AND ciclo_atual = 1
            AND deleted_at IS NULL`,
      )
      .bind(params.matriculaId, params.empresaId)
      .run();
  }

  await db
    .prepare(
      `UPDATE lms_matriculas
          SET status = 'NAO_INICIADO',
              deleted_at = NULL,
              progresso_pct = 0,
              ultimo_slide = 0,
              ultima_pagina = 0,
              score_final = NULL,
              tentativas = 0,
              data_inicio = NULL,
              data_conclusao = NULL,
              data_expiracao = ?,
              data_matricula = datetime('now'),
              qualificacao_historico_id = NULL,
              matriculado_por = ?,
              observacoes = ?,
              updated_at = datetime('now')
        WHERE id = ?
          AND empresa_id = ?`,
    )
    .bind(
      params.dataExpiracao ?? null,
      params.matriculadoPor ?? null,
      params.observacoes ?? null,
      params.matriculaId,
      params.empresaId,
    )
    .run();

  await db
    .prepare(
      `UPDATE lms_progresso_scorm
          SET lesson_status = NULL,
              completion_status = NULL,
              success_status = NULL,
              score_raw = NULL,
              score_max = NULL,
              score_min = NULL,
              score_scaled = NULL,
              session_time = NULL,
              total_time = NULL,
              session_count = 0,
              suspend_data = NULL,
              launch_data = NULL,
              cmi_json = NULL,
              last_commit_at = datetime('now'),
              updated_at = datetime('now')
        WHERE matricula_id = ?
          AND EXISTS (
            SELECT 1
              FROM lms_matriculas m
             WHERE m.id = lms_progresso_scorm.matricula_id
               AND m.empresa_id = ?
          )`,
    )
    .bind(params.matriculaId, params.empresaId)
    .run();

  await db
    .prepare(
      `DELETE FROM lms_xapi_statements
        WHERE matricula_id = ?
          AND EXISTS (
            SELECT 1
              FROM lms_matriculas m
             WHERE m.id = lms_xapi_statements.matricula_id
               AND m.empresa_id = ?
          )`,
    )
    .bind(params.matriculaId, params.empresaId)
    .run();

  return ensureMatriculaCycle(db, {
    matriculaId: params.matriculaId,
    origin: params.origin ?? 'AUTO_RENOVACAO',
    empresaId: params.empresaId,
  });
}


/**
 * Resume a cancelled enrollment in the SAME SCORM edition without losing
 * progress/CMI. A new edition is an explicit, separately authorized operation.
 * Never revive a qualification-bearing enrollment or change the learner/course.
 */
export async function reactivateCancelledMatriculaPreservingProgress(
  db: D1Database,
  params: { empresaId: number; matriculaId: number; dataExpiracao?: string | null;
    observacoes?: string | null; matriculadoPor?: number | null; bucket: R2Bucket | null | undefined },
): Promise<{status: 'EM_ANDAMENTO' | 'NAO_INICIADO'; progressoPct: number; scormPreserved: boolean} | 'NOT_ELIGIBLE' | 'NEW_EDITION_REQUIRED'> {
  const row = await db.prepare(
    `SELECT m.id, m.empresa_id, m.curso_id, m.funcionario_id,
            m.status, m.deleted_at, m.qualificacao_historico_id,
            m.progresso_pct, m.ultimo_slide, m.data_inicio,
            c.tipo_conteudo, c.scorm_package_r2_prefix,
            p.cmi_json, p.suspend_data, p.lesson_status
       FROM lms_matriculas m
       JOIN lms_cursos c ON c.id=m.curso_id AND c.empresa_id=m.empresa_id
       LEFT JOIN lms_progresso_scorm p
         ON p.matricula_id=m.id AND p.empresa_id=m.empresa_id
      WHERE m.id=? AND m.empresa_id=? AND c.deleted_at IS NULL
      LIMIT 1`,
  ).bind(params.matriculaId,params.empresaId).first<{
    id:number;empresa_id:number;curso_id:number;funcionario_id:number;
    status:string;deleted_at:string|null;qualificacao_historico_id:number|null;
    progresso_pct:number|null;ultimo_slide:number|null;data_inicio:string|null;tipo_conteudo:string|null;
    scorm_package_r2_prefix:string|null;cmi_json:string|null;suspend_data:string|null;
    lesson_status:string|null;
  }>();
  if(!row || (!row.deleted_at && String(row.status).toUpperCase()!=='CANCELADO') ||
      row.qualificacao_historico_id != null) return 'NOT_ELIGIBLE';
  // Import lazily? No: the detector is deterministic and never changes D1/R2.
  const { detectLmsEditionMismatch } = await import('./lms-edition-mismatch');
  const edition=await detectLmsEditionMismatch({
    bucket:params.bucket,db,empresaId:params.empresaId,cursoId:row.curso_id,
    contentType:row.tipo_conteudo,activePrefix:row.scorm_package_r2_prefix,
    cmiJson:row.cmi_json,suspendData:row.suspend_data,
    enrollmentStartedAt:row.data_inicio,
  });
  if(edition) return 'NEW_EDITION_REQUIRED';
  const originalProgress=Number(row.progresso_pct ?? 0);
  const hasProgress=originalProgress>0 || Number(row.ultimo_slide||0)>0 ||
    Boolean(row.cmi_json || row.suspend_data ||
      (row.lesson_status && !['not attempted','not_attempted','unknown'].includes(row.lesson_status.toLowerCase())));
  const resumeStatus=hasProgress?'EM_ANDAMENTO':'NAO_INICIADO';
  const update=await db.prepare(
    `UPDATE lms_matriculas
        SET status=?, deleted_at=NULL, data_conclusao=NULL,
            data_expiracao=COALESCE(?,data_expiracao),
            matriculado_por=COALESCE(?,matriculado_por),
            observacoes=CASE WHEN ? IS NULL OR ?='' THEN observacoes
              WHEN COALESCE(observacoes,'')='' THEN ?
              ELSE observacoes || char(10) || ? END,
            updated_at=datetime('now')
      WHERE id=? AND empresa_id=?
        AND (status='CANCELADO' OR deleted_at IS NOT NULL)
        AND qualificacao_historico_id IS NULL`,
  ).bind(resumeStatus,params.dataExpiracao??null,params.matriculadoPor??null,
    params.observacoes??null,params.observacoes??null,params.observacoes??null,
    params.observacoes??null,params.matriculaId,params.empresaId).run();
  // D1 may include trigger side effects in changes; >=1 still proves the
  // guarded UPDATE wrote a row. Never interpret zero/missing as success.
  if(!Number.isFinite(Number(update.meta?.changes)) || Number(update.meta?.changes)<1)
    return 'NOT_ELIGIBLE';
  // Keep the current cycle rather than making a new zero-progress cycle.
  // All runtime SCORM state remains in lms_progresso_scorm untouched.
  await ensureMatriculaCycle(db,{matriculaId:params.matriculaId,empresaId:params.empresaId,
    // MANUAL is an allowed lms_matricula_ciclos.origem CHECK value.
    // An optional missing cycle may be created without an invalid origin.
    origin:'MANUAL'});
  return {status:resumeStatus,progressoPct:originalProgress,scormPreserved:true};
}
