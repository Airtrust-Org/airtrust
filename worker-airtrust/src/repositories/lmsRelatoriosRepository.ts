import type { D1Database } from '@cloudflare/workers-types';

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
