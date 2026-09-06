/**
 * SIMULADORES — Equipamentos (simuladores físicos)
 * Routes: GET /health, GET /alertas, PUT /alertas/:id/resolver, GET /tipos-check,
 *         GET /, POST /, GET /:id, PUT /:id, DELETE /:id
 *
 * NOTE: /:id routes are registered LAST within this module so that all
 * specific-path routes (from other modules mounted before this one in
 * simuladores-core.ts) take precedence.
 */

import { Hono, type Context } from 'hono';
import type { ContentfulStatusCode } from 'hono/utils/http-status';
import type { Env } from '../types';

type DbRow = Record<string, unknown>;
type DbValue = string | number | null;
type SimuladoresContext = Context<{ Bindings: Env }>;
import { auth } from '../middleware/auth';
import { requireRole } from '../middleware/rbac';
import { getTenantContext } from '../middleware/tenant';
import { requireAdminForDelete, audit } from './simuladores-shared';
import { createLogger, toError } from '../utils/logger';

const app = new Hono<{ Bindings: Env }>();

function simuladoresErrorResponse(
  c: SimuladoresContext,
  error: unknown,
  message: string,
  code: string,
  status: ContentfulStatusCode = 500,
) {
  const logger = createLogger(c, 'SimuladoresEquipamentosRoutes');
  logger.error(message, toError(error), { route: c.req.path, status });
  return c.json({ success: false, error: message, code }, status);
}
app.use('*', async (c, next) => {
  if (c.req.method === 'GET' && c.req.path.endsWith('/health')) {
    return next();
  }
  return auth()(c, next);
});

// ==========================================================================
// HEALTH
// ==========================================================================

app.get('/health', async (c) => {
  return c.json({
    success: true,
    message: 'Módulo Simuladores online',
    endpoints: 66,
    timestamp: new Date().toISOString(),
  });
});

// ==========================================================================
// ALERTAS DE REFORÇO
// ==========================================================================

// GET /api/simuladores/alertas - Listar todos alertas ativos (para instrutores/gestores)
app.get('/alertas', async (c) => {
  try {
    const { empresaId } = getTenantContext(c);
    const status = c.req.query('status') || 'ATIVO';

    const alertas = await c.env.DB.prepare(
      `SELECT 
        ar.*,
        f.nome as funcionario_nome,
        f.cpf as funcionario_cpf,
        f.matricula as funcionario_matricula,
        i.nome as instrutor_nome
       FROM alertas_reforco ar
       INNER JOIN funcionarios f
         ON ar.funcionario_id = f.id
        AND f.deleted_at IS NULL
        AND f.empresa_id = ?
       LEFT JOIN funcionarios i
         ON ar.instrutor_id_notificado = i.id
        AND i.deleted_at IS NULL
        AND i.empresa_id = ?
       WHERE ar.status = ?
         AND ar.deleted_at IS NULL
       ORDER BY ar.created_at DESC`,
    )
      .bind(empresaId, empresaId, status)
      .all();

    return c.json({ success: true, data: alertas.results });
  } catch (error) {
    return simuladoresErrorResponse(
      c,
      error,
      'Erro ao listar alertas de reforço',
      'SIMULADORES_ALERTAS_LIST_ERROR',
    );
  }
});

// PUT /api/simuladores/alertas/:id/resolver - Marcar alerta como resolvido
app.put('/alertas/:id/resolver', requireRole('admin', 'manager', 'instructor'), async (c) => {
  try {
    const { empresaId } = getTenantContext(c);
    const alertaId = c.req.param('id');
    const body = await c.req.json();
    const { nota_resolucao, ficha_id_resolucao, observacoes_resolucao } = body;

    const anterior = await c.env.DB.prepare(
      `SELECT ar.*
       FROM alertas_reforco ar
       INNER JOIN funcionarios f
         ON ar.funcionario_id = f.id
        AND f.deleted_at IS NULL
        AND f.empresa_id = ?
       WHERE ar.id = ? AND ar.deleted_at IS NULL`,
    )
      .bind(empresaId, alertaId)
      .first();

    if (!anterior) {
      return c.json(
        { success: false, error: 'Alerta não encontrado', code: 'ALERTA_REFORCO_NOT_FOUND' },
        404,
      );
    }

    await c.env.DB.prepare(
      `UPDATE alertas_reforco
       SET status = 'RESOLVIDO',
           data_resolucao = datetime('now'),
           nota_resolucao = ?,
           ficha_id_resolucao = ?,
           observacoes_resolucao = ?,
           updated_at = datetime('now')
       WHERE id = ?
         AND EXISTS (
           SELECT 1
           FROM funcionarios f
           WHERE f.id = alertas_reforco.funcionario_id
             AND f.deleted_at IS NULL
             AND f.empresa_id = ?
         )`,
    )
      .bind(
        nota_resolucao || null,
        ficha_id_resolucao || null,
        observacoes_resolucao || '',
        alertaId,
        empresaId,
      )
      .run();

    await audit(c.env.DB, {
      tabela: 'alertas_reforco',
      acao: 'UPDATE',
      registro_id: alertaId,
      dados_anteriores: anterior,
      dados_novos: { status: 'RESOLVIDO', nota_resolucao, observacoes_resolucao },
    });

    // Busca o alerta atualizado
    const alertaAtualizado = await c.env.DB.prepare(
      `SELECT ar.*
       FROM alertas_reforco ar
       INNER JOIN funcionarios f
         ON ar.funcionario_id = f.id
        AND f.deleted_at IS NULL
        AND f.empresa_id = ?
       WHERE ar.id = ? AND ar.deleted_at IS NULL`,
    )
      .bind(empresaId, alertaId)
      .first();

    return c.json({ success: true, data: alertaAtualizado || null });
  } catch (error) {
    return simuladoresErrorResponse(
      c,
      error,
      'Erro ao resolver alerta de reforço',
      'SIMULADORES_ALERTA_RESOLVE_ERROR',
    );
  }
});

// ==================== TIPOS DE CHECK ====================

app.get('/tipos-check', async (c) => {
  try {
    const { empresaId } = getTenantContext(c);
    const modelo = (c.req.query('modelo') || '').toUpperCase();

    const tipos = await c.env.DB.prepare(
      `SELECT
        id,
        codigo,
        nome,
        descricao,
        tipo,
        categoria,
        validade,
        carga_horaria,
        is_check
      FROM qualificacoes_tipos
      WHERE deleted_at IS NULL
        AND empresa_id = ?
        AND UPPER(COALESCE(categoria, '')) = 'CHECK'
        AND ativo = 1
      ORDER BY codigo ASC`,
    )
      .bind(empresaId)
      .all();

    let data: DbRow[] = (tipos.results || []) as DbRow[];

    // Filtrar por modelo de aeronave: exibir apenas checks do modelo solicitado
    // + checks genéricos (sem sufixo -76 nem -139, ex: FAP14).
    // Padrão de código: FAP05.2-76, FAP06-139, FAP14 (sem sufixo = genérico)
    if (modelo) {
      const is139 = modelo.includes('139');
      const is76 = modelo.includes('76');
      data = data.filter((t: DbRow) => {
        const codigo = String(t.codigo || '').toUpperCase();
        const has139Suffix = codigo.endsWith('-139');
        const has76Suffix = codigo.endsWith('-76');
        if (has139Suffix) return is139;
        if (has76Suffix) return is76;
        return true; // sem sufixo de modelo = genérico (FAP14 etc.) → sempre exibir
      });
    }

    return c.json({ success: true, data });
  } catch (error) {
    return simuladoresErrorResponse(
      c,
      error,
      'Erro ao buscar tipos de check',
      'SIMULADORES_TIPOS_CHECK_ERROR',
    );
  }
});

// ========================================================================
// SIMULADORES - CRUD Principal (list e create)
// ========================================================================

app.get('/', async (c) => {
  try {
    const { empresaId } = getTenantContext(c);
    // Check if empresa_id column exists (may not be present in older DB schemas)
    const tableInfo = await c.env.DB.prepare('PRAGMA table_info(simuladores)').all();
    const hasEmpresaId = (tableInfo.results || []).some(
      (row: DbRow) => String(row.name || '') === 'empresa_id',
    );
    const page = Math.max(parseInt(c.req.query('page') || '1', 10) || 1, 1);
    const limit = Math.min(Math.max(parseInt(c.req.query('limit') || '100', 10) || 100, 1), 500);
    const offset = (page - 1) * limit;
    const search = (c.req.query('search') || '').trim();
    const status = c.req.query('status') || '';
    const tipo = c.req.query('tipo') || '';
    const empresaClause = hasEmpresaId ? ' AND s.empresa_id = ?' : '';
    // LEFT JOIN with modelos_aeronave for canonical modelo_aeronave name.
    // LEFT JOIN with aeronaves to detect SOFT_DELETED linked aircraft.
    // Both JOINs use the current tenant's empresa_id.
    // Simuladores table is global (no empresa_id), so the JOIN provides
    // tenant-scoped aircraft model resolution without filtering simulators.
    let q = `SELECT
      s.id,
      s.nome,
      s.modelo,
      s.tipo,
      s.fabricante,
      s.localizacao,
      s.status,
      s.created_at,
      s.updated_at,
      s.aeronave_codigo,
      ma.modelo AS modelo_aeronave,
      CASE
        WHEN s.aeronave_codigo IS NULL OR TRIM(s.aeronave_codigo) = '' THEN 'UNLINKED'
        WHEN ae.id IS NOT NULL AND ae.deleted_at IS NOT NULL THEN 'SOFT_DELETED'
        WHEN ma.id IS NULL THEN 'MISSING'
        ELSE 'OK'
      END AS aeronave_vinculo_status
    FROM simuladores s
    LEFT JOIN modelos_aeronave ma
      ON ma.empresa_id = ?
      AND ma.deleted_at IS NULL
      AND (ma.codigo = s.aeronave_codigo OR ma.modelo = s.aeronave_codigo)
    LEFT JOIN aeronaves ae
      ON ae.empresa_id = ?
      AND ae.codigo = s.aeronave_codigo
    WHERE s.deleted_at IS NULL${empresaClause}`;
    let countQuery = `SELECT COUNT(*) as total FROM simuladores s WHERE s.deleted_at IS NULL${empresaClause}`;
    // JOIN params: empresaId for modelos_aeronave, empresaId for aeronaves, then optional WHERE empresa_id
    const ps: DbValue[] = [empresaId, empresaId];
    if (hasEmpresaId) ps.push(empresaId);
    const countParams: DbValue[] = hasEmpresaId ? [empresaId] : [];
    if (search) {
      q +=
        ' AND (s.nome LIKE ? OR s.modelo LIKE ? OR s.tipo LIKE ? OR s.fabricante LIKE ? OR s.localizacao LIKE ?)';
      countQuery +=
        ' AND (s.nome LIKE ? OR s.modelo LIKE ? OR s.tipo LIKE ? OR s.fabricante LIKE ? OR s.localizacao LIKE ?)';
      const searchPattern = `%${search}%`;
      ps.push(searchPattern, searchPattern, searchPattern, searchPattern, searchPattern);
      countParams.push(searchPattern, searchPattern, searchPattern, searchPattern, searchPattern);
    }
    if (status) {
      q += ' AND s.status=?';
      countQuery += ' AND s.status=?';
      ps.push(status);
      countParams.push(status);
    }
    if (tipo) {
      q += ' AND s.tipo=?';
      countQuery += ' AND s.tipo=?';
      ps.push(tipo);
      countParams.push(tipo);
    }
    q += ' ORDER BY s.nome ASC LIMIT ? OFFSET ?';
    const totalRow = await c.env.DB.prepare(countQuery)
      .bind(...countParams)
      .first<{ total: number }>();
    const r = await c.env.DB.prepare(q)
      .bind(...ps, limit, offset)
      .all();
    c.header('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate, max-age=0');
    c.header('Pragma', 'no-cache');
    c.header('Expires', '0');
    const total = Number(totalRow?.total || 0);
    return c.json({
      success: true,
      data: r.results,
      total,
      page,
      limit,
      totalPages: Math.max(Math.ceil(total / limit), 1),
    });
  } catch (error) {
    return simuladoresErrorResponse(
      c,
      error,
      'Erro ao listar simuladores',
      'SIMULADORES_LIST_ERROR',
    );
  }
});

app.post('/', requireRole('admin', 'manager'), async (c) => {
  try {
    const { empresaId } = getTenantContext(c);
    const b = await c.req.json();
    if (!b.nome || !b.tipo) {
      return c.json(
        {
          success: false,
          error: 'nome,tipo obrigatórios',
          code: 'SIMULADOR_VALIDATION_ERROR',
        },
        400,
      );
    }
    const tableInfo = await c.env.DB.prepare('PRAGMA table_info(simuladores)').all();
    const hasEmpresaId = (tableInfo.results || []).some(
      (row: Record<string, unknown>) => String(row.name || '') === 'empresa_id',
    );
    const insertSql = hasEmpresaId
      ? 'INSERT INTO simuladores(nome,modelo,tipo,fabricante,localizacao,status,observacoes,empresa_id)VALUES(?,?,?,?,?,?,?,?)'
      : 'INSERT INTO simuladores(nome,modelo,tipo,fabricante,localizacao,status,observacoes)VALUES(?,?,?,?,?,?,?)';
    const insertParams = hasEmpresaId
      ? [
          b.nome,
          b.modelo || b.tipo || null,
          b.tipo,
          b.fabricante || null,
          b.localizacao || null,
          b.status || 'ATIVO',
          b.observacoes || null,
          empresaId,
        ]
      : [
          b.nome,
          b.modelo || b.tipo || null,
          b.tipo,
          b.fabricante || null,
          b.localizacao || null,
          b.status || 'ATIVO',
          b.observacoes || null,
        ];
    const r = await c.env.DB.prepare(insertSql)
      .bind(...insertParams)
      .run();
    const id = r.meta.last_row_id;
    const createdSelectSql = hasEmpresaId
      ? 'SELECT id,nome,modelo,tipo,fabricante,localizacao,status,observacoes,deleted_at,empresa_id FROM simuladores WHERE id=? AND deleted_at IS NULL AND empresa_id = ?'
      : 'SELECT id,nome,modelo,tipo,fabricante,localizacao,status,observacoes,deleted_at FROM simuladores WHERE id=? AND deleted_at IS NULL';
    const createdSelectParams = hasEmpresaId ? [id, empresaId] : [id];
    const cr = await c.env.DB.prepare(createdSelectSql)
      .bind(...createdSelectParams)
      .first();
    await audit(c.env.DB, {
      tabela: 'simuladores',
      acao: 'INSERT',
      registro_id: id,
      dados_novos: cr,
    });
    return c.json({ success: true, data: cr }, 201);
  } catch (error) {
    return simuladoresErrorResponse(c, error, 'Erro ao criar simulador', 'SIMULADOR_CREATE_ERROR');
  }
});

// ========================================================================
// SIMULADORES - CRUD por ID (MUST be last to avoid capturing specific paths)
// ========================================================================

app.get('/:id', async (c) => {
  try {
    const { empresaId } = getTenantContext(c);
    const id = c.req.param('id');
    const tableInfo = await c.env.DB.prepare('PRAGMA table_info(simuladores)').all();
    const hasEmpresaId = (tableInfo.results || []).some(
      (row: DbRow) => String(row.name || '') === 'empresa_id',
    );
    const s = await c.env.DB.prepare(
      hasEmpresaId
        ? 'SELECT * FROM simuladores WHERE id=? AND deleted_at IS NULL AND empresa_id = ?'
        : 'SELECT * FROM simuladores WHERE id=? AND deleted_at IS NULL',
    )
      .bind(...(hasEmpresaId ? [id, empresaId] : [id]))
      .first();
    if (!s) {
      return c.json({ success: false, error: 'Não encontrado', code: 'SIMULADOR_NOT_FOUND' }, 404);
    }
    c.header('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate, max-age=0');
    c.header('Pragma', 'no-cache');
    c.header('Expires', '0');
    return c.json({ success: true, data: s });
  } catch (error) {
    return simuladoresErrorResponse(c, error, 'Erro ao buscar simulador', 'SIMULADOR_GET_ERROR');
  }
});

app.put('/:id', requireRole('admin', 'manager'), async (c) => {
  try {
    const { empresaId } = getTenantContext(c);
    const id = c.req.param('id');
    const b = await c.req.json();
    const tableInfo = await c.env.DB.prepare('PRAGMA table_info(simuladores)').all();
    const colunas = new Set(
      (tableInfo.results || []).map((row: Record<string, unknown>) => String(row.name || '')),
    );
    const hasEmpresaId = colunas.has('empresa_id');
    const a = await c.env.DB.prepare(
      hasEmpresaId
        ? 'SELECT * FROM simuladores WHERE id=? AND deleted_at IS NULL AND empresa_id = ?'
        : 'SELECT * FROM simuladores WHERE id=? AND deleted_at IS NULL',
    )
      .bind(...(hasEmpresaId ? [id, empresaId] : [id]))
      .first();
    if (!a) {
      return c.json({ success: false, error: 'Não encontrado', code: 'SIMULADOR_NOT_FOUND' }, 404);
    }

    const updates = [
      'nome=?',
      'modelo=?',
      'tipo=?',
      'fabricante=?',
      'localizacao=?',
      'status=?',
      'observacoes=?',
    ];
    const params: unknown[] = [
      b.nome || a.nome,
      b.modelo !== undefined ? b.modelo : a.modelo,
      b.tipo || a.tipo,
      b.fabricante !== undefined ? b.fabricante : a.fabricante,
      b.localizacao !== undefined ? b.localizacao : a.localizacao,
      b.status || a.status,
      b.observacoes !== undefined ? b.observacoes : a.observacoes,
    ];

    if (colunas.has('modelo_aeronave')) {
      updates.push('modelo_aeronave=?');
      params.push(
        b.modelo_aeronave !== undefined
          ? b.modelo_aeronave || null
          : (a as Record<string, unknown>).modelo_aeronave || null,
      );
    }

    updates.push("updated_at=datetime('now')");
    params.push(id);
    if (hasEmpresaId) params.push(empresaId);

    await c.env.DB.prepare(
      `UPDATE simuladores SET ${updates.join(',')} WHERE id=?${hasEmpresaId ? ' AND empresa_id = ?' : ''}`,
    )
      .bind(...params)
      .run();
    const u = await c.env.DB.prepare(
      hasEmpresaId
        ? 'SELECT * FROM simuladores WHERE id=? AND deleted_at IS NULL AND empresa_id = ?'
        : 'SELECT * FROM simuladores WHERE id=? AND deleted_at IS NULL',
    )
      .bind(...(hasEmpresaId ? [id, empresaId] : [id]))
      .first();
    await audit(c.env.DB, {
      tabela: 'simuladores',
      acao: 'UPDATE',
      registro_id: id,
      dados_anteriores: a,
      dados_novos: u,
    });
    return c.json({ success: true, data: u });
  } catch (error) {
    return simuladoresErrorResponse(
      c,
      error,
      'Erro ao atualizar simulador',
      'SIMULADOR_UPDATE_ERROR',
    );
  }
});

app.delete('/:id', requireRole('admin', 'manager'), async (c) => {
  try {
    const { empresaId } = getTenantContext(c);
    const denied = requireAdminForDelete(c);
    if (denied) return denied;

    const id = c.req.param('id');
    const tableInfo = await c.env.DB.prepare('PRAGMA table_info(simuladores)').all();
    const hasEmpresaId = (tableInfo.results || []).some(
      (row: DbRow) => String(row.name || '') === 'empresa_id',
    );
    const a = await c.env.DB.prepare(
      hasEmpresaId
        ? 'SELECT * FROM simuladores WHERE id=? AND deleted_at IS NULL AND empresa_id = ?'
        : 'SELECT * FROM simuladores WHERE id=? AND deleted_at IS NULL',
    )
      .bind(...(hasEmpresaId ? [id, empresaId] : [id]))
      .first();
    if (!a) {
      const deleted = await c.env.DB.prepare(
        hasEmpresaId
          ? 'SELECT * FROM simuladores WHERE id=? AND empresa_id = ?'
          : 'SELECT * FROM simuladores WHERE id=?',
      )
        .bind(...(hasEmpresaId ? [id, empresaId] : [id]))
        .first();
      if (deleted) {
        return c.json({ success: true, message: 'Simulador já excluído' });
      }
      return c.json({ success: false, error: 'Não encontrado', code: 'SIMULADOR_NOT_FOUND' }, 404);
    }
    await c.env.DB.prepare(
      hasEmpresaId
        ? "UPDATE simuladores SET deleted_at=datetime('now')WHERE id=? AND empresa_id = ?"
        : "UPDATE simuladores SET deleted_at=datetime('now')WHERE id=?",
    )
      .bind(...(hasEmpresaId ? [id, empresaId] : [id]))
      .run();
    await audit(c.env.DB, {
      tabela: 'simuladores',
      acao: 'DELETE',
      registro_id: id,
      dados_anteriores: a,
    });
    return c.json({ success: true, message: 'Excluído' });
  } catch (error) {
    return simuladoresErrorResponse(
      c,
      error,
      'Erro ao excluir simulador',
      'SIMULADOR_DELETE_ERROR',
    );
  }
});

export default app;
