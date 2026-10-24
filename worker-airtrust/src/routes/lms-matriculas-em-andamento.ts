/** Visão consolidada de matrículas em andamento para gestão. */
import { Hono } from 'hono';
import { requirePermission } from '../middleware/rbac';
import { getEmpresaIdSafe } from './escalas-shared';
import { employeeSectorSql, getEmployeeSectorAccess } from '../services/employee-sector-access';
import { resolveLmsEffectiveProgress } from '../services/lms-progress-guardrails';
import { parsePositiveInt } from '../services/lms-matricula-runtime-domain';
import type { Env } from '../types';

const app = new Hono<{ Bindings: Env }>();

app.get(
  '/em-andamento',
  requirePermission('lms', 'visualizar', 'admin', 'manager'),
  async (c) => {
    const db = c.env.DB;
    const empresaId = getEmpresaIdSafe(c);
    const access = await getEmployeeSectorAccess(c, empresaId);
    const page = parsePositiveInt(c.req.query('page'), 1);
    const limit = Math.min(parsePositiveInt(c.req.query('limit'), 50), 200);
    const offset = (page - 1) * limit;
    const search = (c.req.query('q') || '').trim().slice(0, 120);
    const employeeScope = employeeSectorSql(access, 'f');

    let where = `WHERE m.empresa_id = ?
                   AND m.deleted_at IS NULL
                   AND UPPER(TRIM(COALESCE(m.status, ''))) = 'EM_ANDAMENTO'
                   AND c.empresa_id = m.empresa_id
                   AND c.deleted_at IS NULL
                   AND f.empresa_id = m.empresa_id
                   AND f.deleted_at IS NULL
                   AND COALESCE(f.ativo, 1) = 1
                   AND UPPER(COALESCE(NULLIF(TRIM(f.status), ''), 'ATIVO')) = 'ATIVO'
                   AND ${employeeScope.clause}`;
    const binds: (string | number)[] = [empresaId, ...employeeScope.bindings];

    // Gestores só veem cursos associados aos setores sob sua gestão. Cursos sem
    // vínculo direto usam o setor da qualificação, seguindo o escopo da tela por curso.
    if (access.mode === 'restricted') {
      if (access.setorIds.length === 0) {
        where += ' AND 1 = 0';
      } else {
        const setorPlaceholders = access.setorIds.map(() => '?').join(',');
        where += ` AND (
          EXISTS (
            SELECT 1 FROM lms_cursos_setores lcs
             WHERE lcs.curso_id = c.id AND lcs.empresa_id = c.empresa_id
               AND lcs.setor_id IN (${setorPlaceholders}) AND lcs.deleted_at IS NULL
          ) OR (
            NOT EXISTS (
              SELECT 1 FROM lms_cursos_setores lcs_chk
               WHERE lcs_chk.curso_id = c.id AND lcs_chk.empresa_id = c.empresa_id
                 AND lcs_chk.deleted_at IS NULL
            ) AND c.qualificacao_tipo_id IS NOT NULL AND EXISTS (
              SELECT 1 FROM qualificacoes_tipos_setores qts
               WHERE qts.tipo_id = c.qualificacao_tipo_id AND qts.empresa_id = c.empresa_id
                 AND qts.setor_id IN (${setorPlaceholders}) AND qts.deleted_at IS NULL
            )
          )
        )`;
        binds.push(...access.setorIds, ...access.setorIds);
      }
    }

    if (search) {
      where += ` AND (LOWER(f.nome) LIKE LOWER(?) OR LOWER(COALESCE(f.matricula, '')) LIKE LOWER(?)
                      OR LOWER(c.titulo) LIKE LOWER(?))`;
      const term = `%${search}%`;
      binds.push(term, term, term);
    }

    const total = await db
      .prepare(`SELECT COUNT(*) AS n FROM lms_matriculas m
                JOIN lms_cursos c ON c.id = m.curso_id
                JOIN funcionarios f ON f.id = m.funcionario_id
                ${where}`)
      .bind(...binds)
      .first<{ n: number }>();

    const rows = await db
      .prepare(`SELECT m.id, m.curso_id, m.funcionario_id, m.status, m.progresso_pct,
                       m.data_matricula, m.data_expiracao, m.updated_at,
                       f.nome AS funcionario_nome, f.matricula AS funcionario_matricula,
                       c.titulo AS curso_titulo
                  FROM lms_matriculas m
                  JOIN lms_cursos c ON c.id = m.curso_id
                  JOIN funcionarios f ON f.id = m.funcionario_id
                 ${where}
                 ORDER BY m.updated_at DESC, f.nome COLLATE NOCASE, c.titulo COLLATE NOCASE
                 LIMIT ? OFFSET ?`)
      .bind(...binds, limit, offset)
      .all<Record<string, unknown>>();

    const data = (rows.results ?? []).map((row) => {
      const effectiveProgress = resolveLmsEffectiveProgress({
        status: row.status as string | null,
        progressoBruto: row.progresso_pct as number | null,
      });
      return {
        ...row,
        progresso_bruto: effectiveProgress.progresso_bruto,
        progresso_efetivo: effectiveProgress.progresso_efetivo,
      };
    });

    return c.json({ success: true, data, pagination: { page, limit, total: total?.n ?? 0 } });
  },
);


export default app;
