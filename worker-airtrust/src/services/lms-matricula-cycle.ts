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

/**
 * A new renewal cycle is ONE D1 transaction. Previous SCORM evidence is copied
 * to the immutable per-cycle archive and all xAPI rows remain physically intact,
 * marked as historical. Completion guards query only unarchived xAPI rows.
 *
 * Requires Schema V2 lms-cycle-evidence-0557. If it is missing, D1.batch fails
 * closed and rolls back; never fall back to destructive legacy reset.
 */
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
  if (!beforeReset) throw new Error('LMS_CYCLE_ENROLLMENT_NOT_FOUND');

  // Cancellation is suspension, not permission to erase runtime state.
  if (beforeReset.deleted_at || normalizeStatus(beforeReset.status) === 'CANCELADO') {
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

  // Only terminal cycles may renew. The course must not be reset behind an
  // active learner or concurrent completion.
  const status = normalizeStatus(beforeReset.status);
  if (!['CONCLUIDO', 'REPROVADO'].includes(status)) {
    throw new Error('LMS_CYCLE_ACTIVE_OR_UNKNOWN_STATUS');
  }
  const current = await db.prepare(
    `SELECT id FROM lms_matricula_ciclos
       WHERE matricula_id = ? AND empresa_id = ? AND ciclo_atual = 1
         AND deleted_at IS NULL LIMIT 1`,
  ).bind(params.matriculaId, params.empresaId).first<{id: number}>();
  if (!current?.id) throw new Error('LMS_CYCLE_CURRENT_MISSING');

  const operationId = crypto.randomUUID();
  const marker = `[[LMS_CYCLE_RESET:${operationId}]]`;
  const origin = ['MANUAL', 'AUTO_RENOVACAO', 'LMS'].includes(params.origin || '')
    ? params.origin! : 'AUTO_RENOVACAO';
  const markerExists = `EXISTS (
    SELECT 1 FROM lms_matriculas marker_m
     WHERE marker_m.id = ? AND marker_m.empresa_id = ?
       AND instr(COALESCE(marker_m.observacoes,''), ?) > 0
  )`;
  const guarded = [params.matriculaId, params.empresaId, marker] as const;

  // D1.batch is transactional. The first statement is a compare-and-swap:
  // every write below is conditioned on its unique marker.
  await db.batch([
    db.prepare(`UPDATE lms_matriculas
       SET observacoes = COALESCE(observacoes,'') || char(10) || ?
       WHERE id = ? AND empresa_id = ? AND deleted_at IS NULL
         AND status = ? AND qualificacao_historico_id IS ?
         AND EXISTS(SELECT 1 FROM lms_matricula_ciclos cy
           WHERE cy.id = ? AND cy.empresa_id = ? AND cy.matricula_id = lms_matriculas.id
             AND cy.ciclo_atual = 1 AND cy.deleted_at IS NULL)`)
      .bind(marker,params.matriculaId,params.empresaId,status,
        beforeReset.qualificacao_historico_id,current.id,params.empresaId),

    db.prepare(`INSERT INTO lms_ciclo_evidencias
       (empresa_id,matricula_id,ciclo_id,enrollment_json,scorm_json,diagnostics_json,course_package_prefix)
       SELECT m.empresa_id,m.id,?,
         json_object('status',m.status,'progresso_pct',m.progresso_pct,
           'score_final',m.score_final,'tentativas',m.tentativas,
           'data_inicio',m.data_inicio,'data_conclusao',m.data_conclusao,
           'qualificacao_historico_id',m.qualificacao_historico_id),
         (SELECT json_object(
           'lesson_status',p.lesson_status,'lesson_location',p.lesson_location,
           'completion_status',p.completion_status,'success_status',p.success_status,
           'score_raw',p.score_raw,'score_min',p.score_min,'score_max',p.score_max,
           'score_scaled',p.score_scaled,'session_time',p.session_time,
           'total_time',p.total_time,'suspend_data',p.suspend_data,
           'launch_data',p.launch_data,'cmi_json',p.cmi_json,
           'session_count',p.session_count)
          FROM lms_progresso_scorm p WHERE p.matricula_id=m.id AND p.empresa_id=m.empresa_id),
         (SELECT json_group_array(json_object('tentativa',d.tentativa,'diagnostics_json',d.diagnostics_json))
            FROM lms_completion_diagnostics_snapshots d
           WHERE d.matricula_id=m.id AND d.empresa_id=m.empresa_id),
         (SELECT scorm_package_r2_prefix FROM lms_cursos c
          WHERE c.id=m.curso_id AND c.empresa_id=m.empresa_id)
       FROM lms_matriculas m
       WHERE m.id=? AND m.empresa_id=? AND ${markerExists}`)
      .bind(current.id,params.matriculaId,params.empresaId,...guarded),

    // No DELETE: original xAPI records stay in their own table for audit,
    // permanently attributed to the previous enrollment cycle.
    db.prepare(`UPDATE lms_xapi_statements SET archived_cycle_id = ?
       WHERE empresa_id = ? AND matricula_id = ? AND archived_cycle_id IS NULL
         AND ${markerExists}`)
      .bind(current.id,params.empresaId,params.matriculaId,...guarded),

    db.prepare(`UPDATE lms_matricula_ciclos
       SET ciclo_atual=0,updated_at=datetime('now')
       WHERE id=? AND empresa_id=? AND matricula_id=? AND ciclo_atual=1
         AND deleted_at IS NULL AND ${markerExists}`)
      .bind(current.id,params.empresaId,params.matriculaId,...guarded),

    db.prepare(`UPDATE lms_progresso_scorm
       SET lesson_status=NULL,lesson_location=NULL,completion_status=NULL,
           success_status=NULL,score_raw=NULL,score_min=NULL,score_max=NULL,
           score_scaled=NULL,session_time=NULL,total_time=NULL,session_count = 0,
           suspend_data = NULL,launch_data=NULL,cmi_json = NULL,
           last_commit_at = datetime('now'),updated_at=datetime('now')
       WHERE matricula_id=? AND empresa_id=? AND ${markerExists}`)
      .bind(params.matriculaId,params.empresaId,...guarded),

    db.prepare(`UPDATE lms_matriculas
       SET status = 'NAO_INICIADO',deleted_at=NULL,progresso_pct = 0,
           ultimo_slide = 0,ultima_pagina = 0,score_final=NULL,tentativas=0,
           data_inicio=NULL,data_conclusao=NULL,data_expiracao=?,
           data_matricula=datetime('now'),qualificacao_historico_id=NULL,
           matriculado_por=?,updated_at=datetime('now')
       WHERE id=? AND empresa_id=? AND ${markerExists}`)
      .bind(params.dataExpiracao ?? null,params.matriculadoPor ?? null,
        params.matriculaId,params.empresaId,...guarded),

    db.prepare(`INSERT INTO lms_matricula_ciclos
       (empresa_id,matricula_id,curso_id,funcionario_id,numero_ciclo,origem,
        status,ciclo_atual,observacoes,data_matricula,progresso_pct,tentativas,
        created_at,updated_at,deleted_at)
       SELECT m.empresa_id,m.id,m.curso_id,m.funcionario_id,
         (SELECT MAX(numero_ciclo)+1 FROM lms_matricula_ciclos cy
           WHERE cy.matricula_id=m.id AND cy.empresa_id=m.empresa_id),
         ?,'NAO_INICIADO',1,?,datetime('now'),0,0,datetime('now'),datetime('now'),NULL
       FROM lms_matriculas m
       WHERE m.id=? AND m.empresa_id=? AND ${markerExists}`)
      .bind(origin,params.observacoes??null,params.matriculaId,params.empresaId,...guarded),

    db.prepare(`INSERT INTO audit_logs
       (user_id,action,entity_type,entity_id,old_values,new_values,empresa_id,created_at)
       SELECT NULL,'LMS_CYCLE_ATOMIC_RENEWAL','lms_matriculas',?,
         ?,?, ?,datetime('now')
       WHERE ${markerExists}`)
      .bind(params.matriculaId,
        JSON.stringify({status:beforeReset.status,cycle_id:current.id}),
        JSON.stringify({status:'NAO_INICIADO',operation_id:operationId,archive:true}),
        params.empresaId,...guarded),

    db.prepare(`UPDATE lms_matriculas
       SET observacoes=TRIM(REPLACE(COALESCE(observacoes,''),?,'')),
           updated_at=datetime('now')
       WHERE id=? AND empresa_id=? AND ${markerExists}`)
      .bind(marker,params.matriculaId,params.empresaId,...guarded),
  ]);

  const receipt = await db.prepare(`SELECT 1 AS ok FROM audit_logs
    WHERE action='LMS_CYCLE_ATOMIC_RENEWAL' AND empresa_id=? AND entity_id=?
      AND instr(COALESCE(new_values,''),?)>0 LIMIT 1`)
    .bind(params.empresaId,params.matriculaId,operationId).first<{ok:number}>();
  if (receipt?.ok !== 1) throw new Error('LMS_CYCLE_CONCURRENT_CHANGE');
  const newCycle = await readCurrentMatriculaCycleId(db,params.matriculaId);
  if (!newCycle?.id || newCycle.id===current.id) {
    throw new Error('LMS_CYCLE_POSTCHECK_REQUIRED');
  }
  return newCycle.id;
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
            p.cmi_json, p.suspend_data, p.lesson_status, p.lesson_location
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
    lesson_status:string|null;lesson_location:string|null;
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
    Boolean(row.lesson_location || row.cmi_json || row.suspend_data ||
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
  if(Number(update.meta?.changes)!==1) return 'NOT_ELIGIBLE';
  // Keep the current cycle rather than making a new zero-progress cycle.
  // All runtime SCORM state remains in lms_progresso_scorm untouched.
  await ensureMatriculaCycle(db,{matriculaId:params.matriculaId,empresaId:params.empresaId,
    // MANUAL is an allowed lms_matricula_ciclos.origem CHECK value.
    // An optional missing cycle may be created without an invalid origin.
    origin:'MANUAL'});
  return {status:resumeStatus,progressoPct:originalProgress,scormPreserved:true};
}
