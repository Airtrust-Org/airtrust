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

async function readMatriculaSnapshot(db: D1Database, matriculaId: number) {
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
        LIMIT 1`,
    )
    .bind(matriculaId)
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
  params: { matriculaId: number; origin?: string },
) {
  const snapshot = await readMatriculaSnapshot(db, params.matriculaId);
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
  },
) {
  const beforeReset = await readMatriculaSnapshot(db, params.matriculaId);

  if (beforeReset) {
    await upsertCurrentMatriculaCycle(db, beforeReset, params.origin ?? 'AUTO_RENOVACAO');
    await db
      .prepare(
        `UPDATE lms_matricula_ciclos
            SET ciclo_atual = 0,
                updated_at = datetime('now')
          WHERE matricula_id = ?
            AND ciclo_atual = 1
            AND deleted_at IS NULL`,
      )
      .bind(params.matriculaId)
      .run();
  }

  await db
    .prepare(
      `UPDATE lms_matriculas
          SET status = 'NAO_INICIADO',
              deleted_at = NULL,
              progresso_pct = 0,
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
        WHERE id = ?`,
    )
    .bind(
      params.dataExpiracao ?? null,
      params.matriculadoPor ?? null,
      params.observacoes ?? null,
      params.matriculaId,
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
              last_commit_at = NULL,
              updated_at = datetime('now')
        WHERE matricula_id = ?`,
    )
    .bind(params.matriculaId)
    .run();

  await db
    .prepare('DELETE FROM lms_xapi_statements WHERE matricula_id = ?')
    .bind(params.matriculaId)
    .run();

  return ensureMatriculaCycle(db, {
    matriculaId: params.matriculaId,
    origin: params.origin ?? 'AUTO_RENOVACAO',
  });
}
