/**
 * SIMULADORES — Catálogo (categorias e manobras)
 * Routes: GET/POST /categorias, PUT/DELETE /categorias/:id,
 *         GET/POST /manobras, PUT/DELETE /manobras/:id
 */

import { Hono } from 'hono';
import type { Env } from '../types';
import { auth } from '../middleware/auth';
import { getEmpresaId } from '../middleware/tenant';
import { requireRole } from '../middleware/rbac';
import {
  CategoriaSimuladoresSchema,
  ManobraSchema,
  requireAdminForDelete,
  audit,
} from './simuladores-shared';

const app = new Hono<{ Bindings: Env }>();
app.use('*', auth());

const MANOBRA_CATEGORIA_SELECT =
  'id, empresa_id, codigo, nome, descricao, cor, icone, ordem, ativo, created_at, updated_at, deleted_at';
const MANOBRA_SELECT =
  'id, empresa_id, codigo, nome, descricao, categoria, tipo_sessao, tipo_aeronave, ordem, nivel_dificuldade, tempo_estimado, pontuacao_minima, created_at, updated_at, deleted_at';

// ==========================================================================
// CRUD: CATEGORIAS DE MANOBRAS
// ==========================================================================

// GET /api/simuladores/categorias - Listar categorias
app.get('/categorias', async (c) => {
  try {
    const empresaId = getEmpresaId(c);
    const result = await c.env.DB
      .prepare(
        `SELECT ${MANOBRA_CATEGORIA_SELECT}
         FROM manobras_categorias
         WHERE empresa_id = ? AND deleted_at IS NULL
         ORDER BY ordem, nome`,
      )
      .bind(empresaId)
      .all();
    return c.json({ success: true, data: result.results });
  } catch (e: any) {
    return c.json({ success: false, error: 'Erro interno do servidor' }, 500);
  }
});

// POST /api/simuladores/categorias - Criar categoria
app.post('/categorias', requireRole('admin', 'manager'), async (c) => {
  try {
    const empresaId = getEmpresaId(c);
    const parsed = CategoriaSimuladoresSchema.safeParse(await c.req.json());
    if (!parsed.success) {
      return c.json(
        { success: false, error: parsed.error.errors[0]?.message ?? 'Dados inválidos' },
        400,
      );
    }
    const { nome, descricao, cor } = parsed.data;
    // Gerar código a partir do nome se não fornecido
    const codigo = parsed.data.codigo || nome.toUpperCase().replace(/[^A-Z0-9]/g, '_');

    const existing = await c.env.DB
      .prepare(
        `SELECT id
         FROM manobras_categorias
         WHERE empresa_id = ?
           AND deleted_at IS NULL
           AND (
             UPPER(TRIM(codigo)) = UPPER(TRIM(?))
             OR UPPER(TRIM(nome)) = UPPER(TRIM(?))
           )
         LIMIT 1`,
      )
      .bind(empresaId, codigo, nome)
      .first();

    if (existing) {
      return c.json({ success: false, error: 'Categoria já cadastrada para esta empresa' }, 409);
    }

    const result = await c.env.DB.prepare(
      `INSERT INTO manobras_categorias (
         empresa_id,
         codigo,
         nome,
         descricao,
         cor,
         created_at,
         updated_at
       ) VALUES (?, ?, ?, ?, ?, datetime('now'), datetime('now'))`,
    )
      .bind(empresaId, codigo, nome, descricao, cor)
      .run();

    return c.json({ success: true, data: { ...parsed.data, id: result.meta.last_row_id } });
  } catch (e: any) {
    return c.json({ success: false, error: 'Erro interno do servidor' }, 500);
  }
});

// PUT /api/simuladores/categorias/:id - Atualizar categoria
app.put('/categorias/:id', requireRole('admin', 'manager'), async (c) => {
  try {
    const empresaId = getEmpresaId(c);
    const id = c.req.param('id');
    const parsed = CategoriaSimuladoresSchema.partial().safeParse(await c.req.json());
    if (!parsed.success) {
      return c.json(
        { success: false, error: parsed.error.errors[0]?.message ?? 'Dados inválidos' },
        400,
      );
    }

    const atual = await c.env.DB
      .prepare(
        `SELECT ${MANOBRA_CATEGORIA_SELECT}
         FROM manobras_categorias
         WHERE id = ? AND empresa_id = ? AND deleted_at IS NULL`,
      )
      .bind(id, empresaId)
      .first<any>();

    if (!atual) {
      return c.json({ success: false, error: 'Categoria não encontrada' }, 404);
    }

    const nome = parsed.data.nome ?? atual.nome;
    const descricao = parsed.data.descricao ?? atual.descricao;
    const cor = parsed.data.cor ?? atual.cor;
    const codigo = parsed.data.codigo
      || (parsed.data.nome ? parsed.data.nome.toUpperCase().replace(/[^A-Z0-9]/g, '_') : atual.codigo);

    const duplicate = await c.env.DB
      .prepare(
        `SELECT id
         FROM manobras_categorias
         WHERE empresa_id = ?
           AND id <> ?
           AND deleted_at IS NULL
           AND (
             UPPER(TRIM(codigo)) = UPPER(TRIM(?))
             OR UPPER(TRIM(nome)) = UPPER(TRIM(?))
           )
         LIMIT 1`,
      )
      .bind(empresaId, id, codigo, nome)
      .first();

    if (duplicate) {
      return c.json({ success: false, error: 'Categoria já cadastrada para esta empresa' }, 409);
    }

    await c.env.DB
      .prepare(
        `UPDATE manobras_categorias
         SET codigo = ?, nome = ?, descricao = ?, cor = ?, updated_at = datetime('now')
         WHERE id = ? AND empresa_id = ?`,
      )
      .bind(codigo, nome, descricao, cor, id, empresaId)
      .run();

    // Busca a categoria atualizada
    const { results: categoriaAtualizada } = await c.env.DB.prepare(
      `SELECT ${MANOBRA_CATEGORIA_SELECT}
       FROM manobras_categorias
       WHERE id = ? AND empresa_id = ? AND deleted_at IS NULL`,
    )
      .bind(id, empresaId)
      .all();

    return c.json({
      success: true,
      data: categoriaAtualizada && categoriaAtualizada.length > 0 ? categoriaAtualizada[0] : null,
    });
  } catch (e: any) {
    return c.json({ success: false, error: 'Erro interno do servidor' }, 500);
  }
});

// DELETE /api/simuladores/categorias/:id - Excluir categoria
app.delete('/categorias/:id', requireRole('admin', 'manager'), async (c) => {
  try {
    const denied = requireAdminForDelete(c);
    if (denied) return denied;

    const empresaId = getEmpresaId(c);
    const id = c.req.param('id');
    const result = await c.env.DB.prepare(
      "UPDATE manobras_categorias SET deleted_at = datetime('now'), updated_at = datetime('now') WHERE id = ? AND empresa_id = ? AND deleted_at IS NULL",
    )
      .bind(id, empresaId)
      .run();
    if (!result.meta.changes) {
      return c.json({ success: false, error: 'Categoria não encontrada' }, 404);
    }
    return c.json({ success: true, message: 'Categoria excluída' });
  } catch (e: any) {
    return c.json({ success: false, error: 'Erro interno do servidor' }, 500);
  }
});

// ==========================================================================
// CRUD: MANOBRAS
// ==========================================================================

app.get('/manobras', async (c) => {
  try {
    const empresaId = getEmpresaId(c);
    const ts = c.req.query('tipo_sessao') || '';
    const ta = c.req.query('tipo_aeronave') || c.req.query('modelo_aeronave') || '';
    const cat = c.req.query('categoria') || '';
    let q = `SELECT ${MANOBRA_SELECT} FROM manobras WHERE empresa_id = ? AND deleted_at IS NULL`;
    const ps: any[] = [empresaId];
    if (ts) {
      q += ' AND tipo_sessao=?';
      ps.push(ts);
    }
    if (ta) {
      q += ' AND tipo_aeronave=?';
      ps.push(ta);
    }
    if (cat) {
      q += ' AND categoria=?';
      ps.push(cat);
    }
    q += ' ORDER BY ordem,codigo';
    const r = await c.env.DB.prepare(q)
      .bind(...ps)
      .all();
    return c.json({ success: true, data: r.results });
  } catch (e: any) {
    return c.json({ success: false, error: 'Erro interno do servidor' }, 500);
  }
});

app.post('/manobras', requireRole('admin', 'manager'), async (c) => {
  try {
    const empresaId = getEmpresaId(c);
    const parsed = ManobraSchema.safeParse(await c.req.json());
    if (!parsed.success) {
      return c.json(
        { success: false, error: parsed.error.errors[0]?.message ?? 'Dados inválidos' },
        400,
      );
    }
    const b = parsed.data;
    const duplicate = await c.env.DB
      .prepare(
        `SELECT id
         FROM manobras
         WHERE empresa_id = ?
           AND deleted_at IS NULL
           AND UPPER(TRIM(codigo)) = UPPER(TRIM(?))
         LIMIT 1`,
      )
      .bind(empresaId, b.codigo)
      .first();
    if (duplicate) {
      return c.json({ success: false, error: 'Código já cadastrado para esta empresa' }, 409);
    }
    const r = await c.env.DB.prepare(
      'INSERT INTO manobras(empresa_id,codigo,nome,descricao,categoria,tipo_sessao,tipo_aeronave,ordem)VALUES(?,?,?,?,?,?,?,?)',
    )
      .bind(
        empresaId,
        b.codigo,
        b.nome,
        b.descricao || null,
        b.categoria || 'NORMAL',
        b.tipo_sessao || 'TREINAMENTO',
        b.tipo_aeronave || 'AW139',
        b.ordem || 1,
      )
      .run();
    const m = await c.env.DB.prepare(
      `SELECT ${MANOBRA_SELECT}
       FROM manobras
       WHERE id=? AND empresa_id = ? AND deleted_at IS NULL`,
    )
      .bind(r.meta.last_row_id, empresaId)
      .first();
    return c.json({ success: true, data: m }, 201);
  } catch (e: any) {
    return c.json({ success: false, error: 'Erro interno do servidor' }, 500);
  }
});

app.put('/manobras/:id', requireRole('admin', 'manager'), async (c) => {
  try {
    const empresaId = getEmpresaId(c);
    const id = c.req.param('id');
    const b = await c.req.json();
    const ant = await c.env.DB.prepare(
      `SELECT ${MANOBRA_SELECT}
       FROM manobras
       WHERE id=? AND empresa_id = ? AND deleted_at IS NULL`,
    )
      .bind(id, empresaId)
      .first();
    if (!ant) return c.json({ success: false, error: 'Não encontrada' }, 404);
    const nextCodigo = b.codigo !== undefined ? b.codigo : ant.codigo;
    if (String(nextCodigo).trim().toUpperCase() !== String(ant.codigo).trim().toUpperCase()) {
      const duplicate = await c.env.DB
        .prepare(
          `SELECT id
           FROM manobras
           WHERE empresa_id = ?
             AND id <> ?
             AND deleted_at IS NULL
             AND UPPER(TRIM(codigo)) = UPPER(TRIM(?))
           LIMIT 1`,
        )
        .bind(empresaId, id, nextCodigo)
        .first();
      if (duplicate) {
        return c.json({ success: false, error: 'Código já cadastrado para esta empresa' }, 409);
      }
    }
    await c.env.DB.prepare(
      'UPDATE manobras SET codigo=?,nome=?,descricao=?,categoria=?,tipo_sessao=?,tipo_aeronave=?,ordem=?,nivel_dificuldade=?,tempo_estimado=?,pontuacao_minima=?,updated_at=datetime("now") WHERE id=? AND empresa_id = ?',
    )
      .bind(
        nextCodigo,
        b.nome !== undefined ? b.nome : ant.nome,
        b.descricao !== undefined ? b.descricao : ant.descricao,
        b.categoria !== undefined ? b.categoria : ant.categoria,
        b.tipo_sessao !== undefined ? b.tipo_sessao : ant.tipo_sessao,
        b.tipo_aeronave !== undefined ? b.tipo_aeronave : ant.tipo_aeronave,
        b.ordem !== undefined ? b.ordem : ant.ordem,
        b.nivel_dificuldade !== undefined ? b.nivel_dificuldade : ant.nivel_dificuldade,
        b.tempo_estimado !== undefined ? b.tempo_estimado : ant.tempo_estimado,
        b.pontuacao_minima !== undefined ? b.pontuacao_minima : ant.pontuacao_minima,
        id,
        empresaId,
      )
      .run();
    const atu = await c.env.DB.prepare(
      `SELECT ${MANOBRA_SELECT}
       FROM manobras
       WHERE id=? AND empresa_id = ? AND deleted_at IS NULL`,
    )
      .bind(id, empresaId)
      .first();
    await audit(c.env.DB, {
      tabela: 'manobras',
      acao: 'UPDATE',
      registro_id: id,
      dados_anteriores: ant,
      dados_novos: atu,
    });
    return c.json({ success: true, data: atu });
  } catch (e: any) {
    return c.json({ success: false, error: 'Erro interno do servidor' }, 500);
  }
});

app.delete('/manobras/:id', requireRole('admin', 'manager'), async (c) => {
  try {
    const denied = requireAdminForDelete(c);
    if (denied) return denied;

    const empresaId = getEmpresaId(c);
    const id = c.req.param('id');
    const result = await c.env.DB
      .prepare('UPDATE manobras SET deleted_at=datetime("now"), updated_at=datetime("now") WHERE id=? AND empresa_id = ? AND deleted_at IS NULL')
      .bind(id, empresaId)
      .run();
    if (!result.meta.changes) {
      return c.json({ success: false, error: 'Não encontrada' }, 404);
    }
    return c.json({ success: true, message: 'Manobra excluída' });
  } catch (e: any) {
    return c.json({ success: false, error: 'Erro interno do servidor' }, 500);
  }
});

export default app;
