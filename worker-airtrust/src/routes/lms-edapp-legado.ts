import { Hono } from 'hono';
import { auth } from '../middleware/auth';
import { requireRole } from '../middleware/rbac';
import type { AuthenticatedRequestEnv } from '../utils/tenant-context';
import { getEmpresaIdSafe } from '../utils/tenant-context';

const app = new Hono<AuthenticatedRequestEnv>();

const COMPLETION_EVENT_TYPES = [
  'CourseCompletedEvent',
  'course.completed',
  'analytics.courseprogress.completed',
] as const;

const COMPLETION_EVENT_TYPES_SQL = COMPLETION_EVENT_TYPES.map((value) => `'${value}'`).join(', ');

app.use('*', auth());

async function countPendingLegacyImports(db: D1Database, empresaId: number) {
  const pendentes = await db
    .prepare(
      `SELECT COUNT(*) AS total
       FROM integracoes_edapp_eventos e
       LEFT JOIN integracoes_edapp_usuarios u
         ON u.empresa_id = e.empresa_id
        AND u.edapp_user_id = e.edapp_user_id
        AND u.deleted_at IS NULL
        AND u.ativo = 1
       LEFT JOIN funcionarios f
         ON f.id = COALESCE(e.funcionario_id, u.funcionario_id)
        AND f.empresa_id = e.empresa_id
        AND f.deleted_at IS NULL
       LEFT JOIN lms_historico_importado h
         ON h.integracao_evento_id = e.id
        AND h.empresa_id = e.empresa_id
        AND h.fonte = 'EDAPP'
        AND h.deleted_at IS NULL
       WHERE e.empresa_id = ?
         AND e.deleted_at IS NULL
         AND e.tipo_evento IN (${COMPLETION_EVENT_TYPES_SQL})
         AND f.id IS NOT NULL
         AND h.id IS NULL`,
    )
    .bind(empresaId)
    .first<{ total: number | null }>();

  return Number(pendentes?.total || 0);
}

app.get('/legado/edapp/resumo', requireRole('admin', 'manager'), async (c) => {
  const empresaId = getEmpresaIdSafe(c);
  if (!empresaId) {
    return c.json(
      { success: false, error: 'Empresa não identificada', code: 'LMS_EDAPP_EMPRESA_REQUIRED' },
      400,
    );
  }

  const summary = await c.env.DB.prepare(
    `SELECT
       COUNT(*) AS total_importado,
       COUNT(DISTINCT funcionario_id) AS total_funcionarios,
       COUNT(DISTINCT COALESCE(CAST(curso_id AS TEXT), curso_titulo)) AS total_cursos,
       SUM(CASE WHEN funcionario_id IS NULL OR status = 'PENDENTE_VINCULO' THEN 1 ELSE 0 END) AS total_pendentes_vinculo,
       SUM(CASE WHEN curso_id IS NULL THEN 1 ELSE 0 END) AS total_sem_curso_lms,
       SUM(CASE WHEN qualificacao_historico_id IS NOT NULL THEN 1 ELSE 0 END) AS total_com_qualificacao,
       MAX(updated_at) AS ultima_importacao_em,
       MAX(data_conclusao) AS ultima_conclusao_em
     FROM lms_historico_importado
     WHERE empresa_id = ?
       AND fonte = 'EDAPP'
       AND deleted_at IS NULL`,
  )
    .bind(empresaId)
    .first<{
      total_importado: number | null;
      total_funcionarios: number | null;
      total_cursos: number | null;
      total_pendentes_vinculo: number | null;
      total_sem_curso_lms: number | null;
      total_com_qualificacao: number | null;
      ultima_importacao_em: string | null;
      ultima_conclusao_em: string | null;
    }>();

  const pendentes = await countPendingLegacyImports(c.env.DB, empresaId);

  return c.json({
    success: true,
    data: {
      total_importado: Number(summary?.total_importado || 0),
      total_funcionarios: Number(summary?.total_funcionarios || 0),
      total_cursos: Number(summary?.total_cursos || 0),
      total_pendentes_vinculo: Number(summary?.total_pendentes_vinculo || 0),
      total_sem_curso_lms: Number(summary?.total_sem_curso_lms || 0),
      total_com_qualificacao: Number(summary?.total_com_qualificacao || 0),
      pendentes_importacao: pendentes,
      ultima_importacao_em: summary?.ultima_importacao_em ?? null,
      ultima_conclusao_em: summary?.ultima_conclusao_em ?? null,
    },
  });
});

app.get('/legado/edapp/historico', requireRole('admin', 'manager'), async (c) => {
  const empresaId = getEmpresaIdSafe(c);
  if (!empresaId) {
    return c.json({ success: false, error: 'Empresa não identificada' }, 400);
  }

  const q = c.req.query('q') ?? '';
  const status = c.req.query('status') ?? '';
  const funcionarioId = c.req.query('funcionario_id')
    ? Number(c.req.query('funcionario_id'))
    : null;
  const page = Math.max(1, Number(c.req.query('page') ?? 1));
  const limit = Math.min(100, Math.max(1, Number(c.req.query('limit') ?? 50)));
  const offset = (page - 1) * limit;

  const conditions: string[] = ['h.empresa_id = ?', "h.fonte = 'EDAPP'", 'h.deleted_at IS NULL'];
  const bindings: (string | number)[] = [empresaId];

  if (q) {
    conditions.push(
      "(LOWER(COALESCE(h.funcionario_nome, f.nome, '')) LIKE ? OR LOWER(COALESCE(h.edapp_course_title, h.curso_titulo, '')) LIKE ?)",
    );
    const like = `%${q.toLowerCase()}%`;
    bindings.push(like, like);
  }
  if (status) {
    conditions.push('h.status = ?');
    bindings.push(status);
  }
  if (funcionarioId) {
    conditions.push('h.funcionario_id = ?');
    bindings.push(funcionarioId);
  }

  const where = conditions.join(' AND ');

  const [countRow, rows] = await Promise.all([
    c.env.DB.prepare(
      `SELECT COUNT(*) AS total
         FROM lms_historico_importado h
         LEFT JOIN funcionarios f
           ON f.id = h.funcionario_id
          AND f.empresa_id = h.empresa_id
        WHERE ${where}`,
    )
      .bind(...bindings)
      .first<{ total: number }>(),
    c.env.DB.prepare(
      `SELECT
         h.id,
         h.funcionario_id,
         COALESCE(h.funcionario_nome, f.nome) AS funcionario_nome,
         f.matricula AS funcionario_matricula,
         f.funcao AS funcionario_funcao,
         f.ativo AS funcionario_atual_ativo,
         f.status AS funcionario_atual_status,
         f.deleted_at AS funcionario_atual_deleted_at,
         h.curso_id,
         COALESCE(h.edapp_course_title, h.curso_titulo) AS curso_titulo,
         h.curso_categoria,
         h.edapp_course_id,
         h.edapp_course_external_id,
         h.edapp_user_id,
         h.status,
         h.progresso_pct,
         h.score_final,
         h.qualificacao_codigo,
         h.qualificacao_historico_id,
         h.data_conclusao,
         h.completed_at,
         h.funcionario_match_type,
         h.curso_match_type,
         h.created_at,
         h.updated_at
       FROM lms_historico_importado h
       LEFT JOIN funcionarios f
         ON f.id = h.funcionario_id
        AND f.empresa_id = h.empresa_id
       WHERE ${where}
       ORDER BY h.data_conclusao DESC, h.id DESC
       LIMIT ? OFFSET ?`,
    )
      .bind(...bindings, limit, offset)
      .all<Record<string, unknown>>(),
  ]);

  return c.json({
    success: true,
    data: rows.results ?? [],
    pagination: {
      total: Number(countRow?.total ?? 0),
      page,
      limit,
      pages: Math.ceil(Number(countRow?.total ?? 0) / limit),
    },
  });
});

app.post('/legado/edapp/importar', requireRole('admin', 'manager'), (c) =>
  c.json(
    {
      success: false,
      error: 'Importação EdApp encerrada; histórico disponível somente para leitura',
      code: 'LMS_EDAPP_IMPORT_RETIRED',
    },
    410,
  ),
);

export default app;
