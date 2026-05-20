/**
 * lms-relatorios.ts
 * Relatórios de conformidade LMS — por função, base e status de matrículas.
 */
import { Hono } from 'hono';
import { auth } from '../middleware/auth';
import { getEmpresaIdSafe } from './escalas-shared';
import { requireRole } from '../middleware/rbac';
import type { Env, Variables } from '../types';

const app = new Hono<{ Bindings: Env; Variables: Variables }>();

// ── GET /relatorios/conformidade ─────────────────────────────────────────────
// Retorna % de conformidade por função (cargo), para todos os cursos vinculados a qualificação.
app.get('/relatorios/conformidade', auth(), requireRole('admin', 'manager'), async (c) => {
  const db = c.env.DB;
  const empresaId = getEmpresaIdSafe(c);

  // Para cada função (cargo), calcula % de funcionários com todas as qualificações EAD em dia
  const rows = await db
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
    .bind(empresaId)
    .all<{
      funcao: string;
      total_funcionarios: number;
      matriculados: number;
      concluidos: number;
      em_andamento: number;
      nao_iniciados: number;
      reprovados: number;
      taxa_conclusao_pct: number;
    }>();

  return c.json({ success: true, data: rows.results });
});

// ── GET /relatorios/cursos-conformidade ──────────────────────────────────────
// Por curso: conformidade por função (qual % de cada função concluiu aquele curso)
app.get('/relatorios/cursos-conformidade', auth(), requireRole('admin', 'manager'), async (c) => {
  const db = c.env.DB;
  const empresaId = getEmpresaIdSafe(c);

  const rows = await db
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
      GROUP BY c.id, COALESCE(f.funcao, 'Sem função')
      ORDER BY c.titulo ASC, taxa_pct ASC
      `,
    )
    .bind(empresaId)
    .all<{
      curso_id: number;
      curso_titulo: string;
      tipo_conteudo: string;
      categoria: string | null;
      funcao: string;
      matriculados: number;
      concluidos: number;
      taxa_pct: number;
    }>();

  return c.json({ success: true, data: rows.results });
});

// ── GET /relatorios/expiracoes ───────────────────────────────────────────────
// Matrículas próximas do prazo ou expiradas
app.get('/relatorios/expiracoes', auth(), requireRole('admin', 'manager'), async (c) => {
  const db = c.env.DB;
  const empresaId = getEmpresaIdSafe(c);
  const dias = Math.min(Number(c.req.query('dias') ?? '30'), 180);

  const rows = await db
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
      ORDER BY m.data_expiracao ASC
      LIMIT 500
      `,
    )
    .bind(empresaId, dias)
    .all<{
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
    }>();

  return c.json({ success: true, data: rows.results });
});

export default app;
