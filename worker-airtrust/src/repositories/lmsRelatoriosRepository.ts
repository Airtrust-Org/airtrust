import type { D1Database } from '@cloudflare/workers-types';
import { buildScormCompletionDiagnostic } from '../services/lms-progress-guardrails';

/**
 * lmsRelatoriosRepository.ts
 *
 * Read-only repository for LMS compliance reports.
 * Extracted from worker-airtrust/src/routes/lms-relatorios.ts.
 *
 * All queries are scoped by empresa_id and preserve soft-delete semantics.
 * No mutations — pure read-only aggregation queries.
 */

// ── Row types ──────────────────────────────────────────────────────────────────

export type ConformidadeRow = {
  funcao: string;
  total_funcionarios: number;
  matriculados: number;
  concluidos: number;
  em_andamento: number;
  nao_iniciados: number;
  reprovados: number;
  taxa_conclusao_pct: number;
};

export type CursoConformidadeRow = {
  curso_id: number;
  curso_titulo: string;
  tipo_conteudo: string;
  categoria: string | null;
  funcao: string;
  matriculados: number;
  concluidos: number;
  taxa_pct: number;
};

export type ExpiracaoRow = {
  matricula_id: number;
  funcionario_id: number;
  funcionario_nome: string;
  funcao: string | null;
  base: string | null;
  curso_id: number;
  curso_titulo: string;
  status: string;
  data_expiracao: string;
  progresso_pct: number;
  dias_restantes: number;
};

export type ScormConclusaoInconsistenteRow = {
  matricula_id: number;
  funcionario_id: number;
  funcionario_nome: string;
  funcao: string | null;
  curso_id: number;
  curso_titulo: string;
  status: string;
  progresso_pct: number;
  score_pct: number | null;
  mastery_score: number | null;
  location: string | null;
  diagnostic_status: string;
  diagnostic_code: string;
  can_finalize: boolean;
  last_commit_at: string | null;
};

// ── Helpers ────────────────────────────────────────────────────────────────────

function assertEmpresaId(empresaId: number): void {
  if (!Number.isInteger(empresaId) || empresaId <= 0) {
    throw new Error('lms relatorios repository requires explicit empresaId');
  }
}

function assertDias(dias: number, max = 180): number {
  const clamped = Math.min(Math.max(1, Math.floor(dias) || 30), max);
  return clamped;
}

function buildCourseSetorFilter(
  courseAlias: string,
  setorIds: number[],
): { clause: string; bindings: number[] } {
  if (setorIds.length === 0) return { clause: '', bindings: [] };
  const placeholders = setorIds.map(() => '?').join(',');
  return {
    clause: `AND (
      EXISTS (
        SELECT 1 FROM lms_cursos_setores lcs_f
        WHERE lcs_f.curso_id = ${courseAlias}.id
          AND lcs_f.empresa_id = ${courseAlias}.empresa_id
          AND lcs_f.setor_id IN (${placeholders})
          AND lcs_f.deleted_at IS NULL
      )
      OR (
        NOT EXISTS (
          SELECT 1 FROM lms_cursos_setores lcs_chk
          WHERE lcs_chk.curso_id = ${courseAlias}.id
            AND lcs_chk.empresa_id = ${courseAlias}.empresa_id
            AND lcs_chk.deleted_at IS NULL
        )
        AND ${courseAlias}.qualificacao_tipo_id IS NOT NULL
        AND EXISTS (
          SELECT 1 FROM qualificacoes_tipos_setores qts_r
          WHERE qts_r.tipo_id = ${courseAlias}.qualificacao_tipo_id
            AND qts_r.empresa_id = ${courseAlias}.empresa_id
            AND qts_r.setor_id IN (${placeholders})
            AND qts_r.deleted_at IS NULL
        )
      )
    )`,
    bindings: [...setorIds, ...setorIds],
  };
}

// ── Queries ────────────────────────────────────────────────────────────────────

/**
 * Conformidade por função (cargo).
 * Retorna % de funcionários com matrícula LMS e taxa de conclusão por função.
 */
export async function getConformidadeRows(
  db: D1Database,
  empresaId: number,
  setorIds: number[] = [],
): Promise<ConformidadeRow[]> {
  assertEmpresaId(empresaId);

  const setorFilter = buildCourseSetorFilter('c_sf', setorIds);

  const results = await db
    .prepare(
      `
      WITH funcionario_status AS (
        SELECT
          COALESCE(f.funcao, 'Sem função') AS funcao,
          f.id AS funcionario_id,
          MAX(CASE WHEN m.id IS NOT NULL THEN 1 ELSE 0 END) AS matriculado,
          MAX(CASE WHEN m.status = 'CONCLUIDO' THEN 1 ELSE 0 END) AS tem_concluido,
          MAX(CASE WHEN m.status = 'EM_ANDAMENTO' THEN 1 ELSE 0 END) AS tem_em_andamento,
          MAX(CASE WHEN m.status = 'NAO_INICIADO' THEN 1 ELSE 0 END) AS tem_nao_iniciado,
          MAX(CASE WHEN m.status = 'REPROVADO' THEN 1 ELSE 0 END) AS tem_reprovado
        FROM funcionarios f
        LEFT JOIN lms_matriculas m
          ON m.funcionario_id = f.id
          AND m.empresa_id = f.empresa_id
          AND m.deleted_at IS NULL
          ${setorFilter.clause ? `AND EXISTS (
            SELECT 1 FROM lms_cursos c_sf
            WHERE c_sf.id = m.curso_id AND c_sf.empresa_id = m.empresa_id
              AND c_sf.deleted_at IS NULL
              ${setorFilter.clause}
          )` : ''}
        WHERE f.empresa_id = ?
          AND f.ativo = 1
          AND f.deleted_at IS NULL
          AND UPPER(COALESCE(NULLIF(TRIM(f.status), ''), 'ATIVO')) = 'ATIVO'
        GROUP BY COALESCE(f.funcao, 'Sem função'), f.id
      )
      SELECT
        funcao,
        COUNT(*) AS total_funcionarios,
        SUM(matriculado) AS matriculados,
        SUM(CASE WHEN tem_concluido = 1 THEN 1 ELSE 0 END) AS concluidos,
        SUM(CASE WHEN tem_concluido = 0 AND tem_em_andamento = 1 THEN 1 ELSE 0 END) AS em_andamento,
        SUM(
          CASE
            WHEN tem_concluido = 0
              AND tem_em_andamento = 0
              AND tem_reprovado = 0
              AND matriculado = 1
              AND tem_nao_iniciado = 1
            THEN 1
            ELSE 0
          END
        ) AS nao_iniciados,
        SUM(CASE WHEN tem_concluido = 0 AND tem_em_andamento = 0 AND tem_reprovado = 1 THEN 1 ELSE 0 END) AS reprovados,
        ROUND(
          CASE
            WHEN SUM(matriculado) = 0 THEN 0
            ELSE SUM(CASE WHEN tem_concluido = 1 THEN 1.0 ELSE 0 END)
                 / SUM(matriculado) * 100
          END,
          1
        ) AS taxa_conclusao_pct
      FROM funcionario_status
      GROUP BY funcao
      ORDER BY taxa_conclusao_pct ASC, total_funcionarios DESC
      `,
    )
    .bind(...setorFilter.bindings, empresaId)
    .all<ConformidadeRow>();

  return results.results || [];
}

/**
 * Conformidade por curso e função.
 * Para cada curso, mostra % de conclusão por função.
 */
export async function getCursosConformidadeRows(
  db: D1Database,
  empresaId: number,
  setorIds: number[] = [],
): Promise<CursoConformidadeRow[]> {
  assertEmpresaId(empresaId);

  const setorFilter = buildCourseSetorFilter('c', setorIds);

  const results = await db
    .prepare(
      `
      SELECT
        c.id AS curso_id,
        c.titulo AS curso_titulo,
        c.tipo_conteudo,
        c.categoria,
        COALESCE(f.funcao, 'Sem função') AS funcao,
        COUNT(DISTINCT m.funcionario_id) AS matriculados,
        SUM(CASE WHEN m.status = 'CONCLUIDO' THEN 1 ELSE 0 END) AS concluidos,
        ROUND(
          CASE
            WHEN COUNT(DISTINCT m.funcionario_id) = 0 THEN 0
            ELSE SUM(CASE WHEN m.status = 'CONCLUIDO' THEN 1.0 ELSE 0 END)
                 / COUNT(DISTINCT m.funcionario_id) * 100
          END,
          1
        ) AS taxa_pct
      FROM lms_cursos c
      JOIN lms_matriculas m ON m.curso_id = c.id AND m.empresa_id = c.empresa_id AND m.deleted_at IS NULL
      JOIN funcionarios f
        ON f.id = m.funcionario_id
       AND f.empresa_id = m.empresa_id
       AND f.deleted_at IS NULL
       AND COALESCE(f.ativo, 1) = 1
       AND UPPER(COALESCE(NULLIF(TRIM(f.status), ''), 'ATIVO')) = 'ATIVO'
      WHERE c.empresa_id = ?
        AND c.deleted_at IS NULL
        AND c.ativo = 1
        AND c.publicado = 1
        ${setorFilter.clause}
      GROUP BY c.id, COALESCE(f.funcao, 'Sem função')
      ORDER BY c.titulo ASC, taxa_pct ASC
      `,
    )
    .bind(empresaId, ...setorFilter.bindings)
    .all<CursoConformidadeRow>();

  return results.results || [];
}

/**
 * Matrículas próximas do prazo ou expiradas.
 * Retorna matrículas com data_expiracao dentro de `dias` dias (max 180).
 */
export async function getExpiracaoRows(
  db: D1Database,
  empresaId: number,
  dias: number,
  setorIds: number[] = [],
): Promise<ExpiracaoRow[]> {
  assertEmpresaId(empresaId);
  const diasClamped = assertDias(dias);

  const setorFilter = buildCourseSetorFilter('c', setorIds);

  const results = await db
    .prepare(
      `
      SELECT
        m.id AS matricula_id,
        m.funcionario_id,
        f.nome AS funcionario_nome,
        f.funcao,
        f.base,
        c.id AS curso_id,
        c.titulo AS curso_titulo,
        m.status,
        m.data_expiracao,
        m.progresso_pct,
        CAST(julianday(m.data_expiracao) - julianday('now') AS INTEGER) AS dias_restantes
      FROM lms_matriculas m
      JOIN funcionarios f
        ON f.id = m.funcionario_id
       AND f.deleted_at IS NULL
       AND COALESCE(f.ativo, 1) = 1
       AND UPPER(COALESCE(NULLIF(TRIM(f.status), ''), 'ATIVO')) = 'ATIVO'
      JOIN lms_cursos c ON c.id = m.curso_id
      WHERE m.empresa_id = ?
        AND m.deleted_at IS NULL
        AND m.data_expiracao IS NOT NULL
        AND m.status NOT IN ('CANCELADO', 'CONCLUIDO')
        AND m.data_expiracao <= date('now', '+' || ? || ' days')
        ${setorFilter.clause}
      ORDER BY m.data_expiracao ASC
      LIMIT 500
      `,
    )
    .bind(empresaId, diasClamped, ...setorFilter.bindings)
    .all<ExpiracaoRow>();

  return results.results || [];
}

type ScormConclusaoInconsistenteLightRow = {
  matricula_id: number;
  funcionario_id: number;
  funcionario_nome: string;
  funcao: string | null;
  curso_id: number;
  curso_titulo: string;
  status: string;
  progresso_pct: number;
  scorm_mastery_score: number | null;
  lesson_status: string | null;
  completion_status: string | null;
  success_status: string | null;
  score_raw: number | null;
  score_max: number | null;
  score_scaled: number | null;
  session_time: string | null;
  total_time: string | null;
  last_commit_at: string | null;
  cursor_last_commit_at: string;
  cursor_matricula_updated_at: string;
};

type ScormRuntimePayloadRow = {
  matricula_id: number;
  suspend_data: string | null;
  cmi_json: string | null;
};

type ScormListCursor = {
  lastCommitAt: string;
  matriculaUpdatedAt: string;
  matriculaId: number;
};

export type ScormConclusaoInconsistentePage = {
  rows: ScormConclusaoInconsistenteRow[];
  nextCursor: string | null;
};

export type ScormConclusaoInconsistenteOptions = {
  limit?: number;
  cursor?: string | null;
};

const SCORM_LIST_DEFAULT_LIMIT = 100;
const SCORM_LIST_MAX_LIMIT = 200;

function resolveScormListLimit(value: number | undefined): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) return SCORM_LIST_DEFAULT_LIMIT;
  return Math.min(Math.floor(parsed), SCORM_LIST_MAX_LIMIT);
}

function invalidScormCursor(): Error & { code: 'INVALID_SCORM_CURSOR' } {
  const error = new Error('Cursor SCORM inválido') as Error & {
    code: 'INVALID_SCORM_CURSOR';
  };
  error.code = 'INVALID_SCORM_CURSOR';
  return error;
}

function encodeScormListCursor(row: ScormConclusaoInconsistenteLightRow): string {
  const payload: ScormListCursor = {
    lastCommitAt: row.cursor_last_commit_at,
    matriculaUpdatedAt: row.cursor_matricula_updated_at,
    matriculaId: row.matricula_id,
  };
  return btoa(JSON.stringify(payload))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/g, '');
}

function decodeScormListCursor(raw: string | null | undefined): ScormListCursor | null {
  if (!raw) return null;

  try {
    const normalized = raw.replace(/-/g, '+').replace(/_/g, '/');
    const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, '=');
    const parsed = JSON.parse(atob(padded)) as Partial<ScormListCursor>;
    if (
      typeof parsed.lastCommitAt !== 'string' ||
      typeof parsed.matriculaUpdatedAt !== 'string' ||
      !Number.isInteger(parsed.matriculaId) ||
      Number(parsed.matriculaId) <= 0
    ) {
      throw invalidScormCursor();
    }
    return parsed as ScormListCursor;
  } catch (error) {
    if ((error as { code?: string }).code === 'INVALID_SCORM_CURSOR') throw error;
    throw invalidScormCursor();
  }
}

export async function getScormConclusaoInconsistenteRows(
  db: D1Database,
  empresaId: number,
  setorIds: number[] = [],
  options: ScormConclusaoInconsistenteOptions = {},
): Promise<ScormConclusaoInconsistentePage> {
  assertEmpresaId(empresaId);
  const setorFilter = buildCourseSetorFilter('c', setorIds);
  const limit = resolveScormListLimit(options.limit);
  const cursor = decodeScormListCursor(options.cursor);
  const cursorClause = cursor
    ? `AND (
        COALESCE(p.last_commit_at, '') < ?
        OR (
          COALESCE(p.last_commit_at, '') = ?
          AND COALESCE(m.updated_at, '') < ?
        )
        OR (
          COALESCE(p.last_commit_at, '') = ?
          AND COALESCE(m.updated_at, '') = ?
          AND m.id < ?
        )
      )`
    : '';
  const cursorBindings = cursor
    ? [
        cursor.lastCommitAt,
        cursor.lastCommitAt,
        cursor.matriculaUpdatedAt,
        cursor.lastCommitAt,
        cursor.matriculaUpdatedAt,
        cursor.matriculaId,
      ]
    : [];

  // Phase 1: tenant, employee/sector scope, diagnostic pre-filter and keyset
  // pagination are applied without materializing suspend_data or cmi_json.
  const lightResults = await db
    .prepare(
      `
      SELECT
        m.id AS matricula_id,
        m.funcionario_id,
        f.nome AS funcionario_nome,
        f.funcao,
        c.id AS curso_id,
        c.titulo AS curso_titulo,
        m.status,
        COALESCE(m.progresso_pct, 0) AS progresso_pct,
        c.scorm_mastery_score,
        p.lesson_status,
        p.completion_status,
        p.success_status,
        p.score_raw,
        p.score_max,
        p.score_scaled,
        p.session_time,
        p.total_time,
        p.last_commit_at,
        COALESCE(p.last_commit_at, '') AS cursor_last_commit_at,
        COALESCE(m.updated_at, '') AS cursor_matricula_updated_at
      FROM lms_matriculas m
      JOIN lms_cursos c
        ON c.id = m.curso_id
       AND c.empresa_id = m.empresa_id
       AND c.deleted_at IS NULL
      JOIN funcionarios f
        ON f.id = m.funcionario_id
       AND f.empresa_id = m.empresa_id
       AND f.deleted_at IS NULL
       AND COALESCE(f.ativo, 1) = 1
       AND UPPER(COALESCE(NULLIF(TRIM(f.status), ''), 'ATIVO')) = 'ATIVO'
      JOIN lms_progresso_scorm p
        ON p.matricula_id = m.id
       AND p.empresa_id = m.empresa_id
      WHERE m.empresa_id = ?
        AND m.deleted_at IS NULL
        AND c.tipo_conteudo = 'scorm'
        AND m.status <> 'CONCLUIDO'
        AND LOWER(TRIM(COALESCE(p.lesson_status, ''))) NOT IN ('passed', 'completed', 'failed')
        AND LOWER(TRIM(COALESCE(p.success_status, ''))) <> 'failed'
        AND NOT (
          LOWER(TRIM(COALESCE(p.completion_status, ''))) = 'completed'
          AND LOWER(TRIM(COALESCE(p.success_status, ''))) IN ('', 'passed', 'unknown')
        )
        AND (
          COALESCE(m.progresso_pct, 0) >= 99
          OR p.cmi_json IS NOT NULL
          OR COALESCE(p.score_scaled, -2) >= 0.95
          OR (p.score_raw IS NOT NULL AND p.score_max > 0 AND (p.score_raw * 1.0 / p.score_max) >= 0.95)
          OR (p.score_raw >= 95 AND (p.score_max IS NULL OR p.score_max <= 0))
        )
        ${setorFilter.clause}
        ${cursorClause}
      ORDER BY
        COALESCE(p.last_commit_at, '') DESC,
        COALESCE(m.updated_at, '') DESC,
        m.id DESC
      LIMIT ?
      `,
    )
    .bind(
      empresaId,
      ...setorFilter.bindings,
      ...cursorBindings,
      limit + 1,
    )
    .all<ScormConclusaoInconsistenteLightRow>();

  const scannedRows = lightResults.results || [];
  const pageRows = scannedRows.slice(0, limit);
  const nextCursor =
    scannedRows.length > limit && pageRows.length > 0
      ? encodeScormListCursor(pageRows[pageRows.length - 1]!)
      : null;

  if (pageRows.length === 0) return { rows: [], nextCursor };

  // Phase 2: one tenant-scoped batch query loads payloads only for the bounded
  // page. This deliberately avoids a per-row/N+1 fetch.
  const placeholders = pageRows.map(() => '?').join(',');
  const payloadResults = await db
    .prepare(
      `SELECT matricula_id, suspend_data, cmi_json
         FROM lms_progresso_scorm
        WHERE empresa_id = ?
          AND matricula_id IN (${placeholders})`,
    )
    .bind(empresaId, ...pageRows.map((row) => row.matricula_id))
    .all<ScormRuntimePayloadRow>();
  const payloadByMatricula = new Map(
    (payloadResults.results || []).map((row) => [row.matricula_id, row]),
  );

  const rows = pageRows
    .map((row) => {
      const payload = payloadByMatricula.get(row.matricula_id);
      const diagnostic = buildScormCompletionDiagnostic({
        lessonStatus: row.lesson_status,
        completionStatus: row.completion_status,
        successStatus: row.success_status,
        scoreRaw: row.score_raw,
        scoreMax: row.score_max,
        scoreScaled: row.score_scaled,
        masteryScore: row.scorm_mastery_score,
        progressoPct: row.progresso_pct,
        cmiJson: payload?.cmi_json ?? null,
        suspendData: payload?.suspend_data ?? null,
        sessionTime: row.session_time,
        totalTime: row.total_time,
      });

      return {
        matricula_id: row.matricula_id,
        funcionario_id: row.funcionario_id,
        funcionario_nome: row.funcionario_nome,
        funcao: row.funcao,
        curso_id: row.curso_id,
        curso_titulo: row.curso_titulo,
        status: row.status,
        progresso_pct: row.progresso_pct,
        score_pct: diagnostic.score_pct,
        mastery_score: diagnostic.mastery_score,
        location: diagnostic.location,
        diagnostic_status: diagnostic.status,
        diagnostic_code: diagnostic.code,
        can_finalize: diagnostic.can_finalize,
        last_commit_at: row.last_commit_at,
      };
    })
    .filter(
      (row) =>
        row.diagnostic_code !== 'SCORM_NONE' &&
        (row.diagnostic_status === 'candidate' ||
          row.diagnostic_code === 'SCORM_STATUS_INCONSISTENT' ||
          row.diagnostic_code === 'SCORM_FINAL_COMMIT_MISSING'),
    );

  return { rows, nextCursor };
}
