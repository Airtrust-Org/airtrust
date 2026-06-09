import { Hono } from 'hono';
import { AppError } from '../utils/errors';
import type { Env } from '../types';
import { auth } from '../middleware/auth';
import { getEmpresaId } from '../middleware/tenant';

export const lookup = new Hono<{ Bindings: Env }>();

// Auth específico por rota (rotas montadas em /api não podem ter use('*') global)
lookup.use('/funcoes', auth());
lookup.use('/funcoes/:id', auth());
lookup.use('/setores', auth());
lookup.use('/setores/:id', auth());
lookup.use('/aeronaves', auth());
lookup.use('/aeronaves/:id', auth());

/**
 * GET /api/funcoes
 * Retorna lista de todas as funções cadastradas
 */
lookup.get('/funcoes', async (c) => {
  const db = c.env.DB;
  const empresaId = getEmpresaId(c);

  try {
    const query = `
      SELECT id, nome, descricao, ativo
      FROM funcoes
      WHERE deleted_at IS NULL
        AND empresa_id = ?
      ORDER BY nome ASC
    `;

    const { results } = await db.prepare(query).bind(empresaId).all();

    return c.json({
      success: true,
      data: results || [],
    });
  } catch (error) {
    console.error('[LOOKUP] Erro ao carregar funções:', error);
    throw new AppError('Erro ao carregar funções', 500);
  }
});

/**
 * POST /api/funcoes
 * Criar nova função
 */
lookup.post('/funcoes', async (c) => {
  const db = c.env.DB;
  const body = (await c.req.json()) as { nome: string; descricao?: string };

  if (!body.nome) {
    throw new AppError('Nome da função é obrigatório', 400);
  }

  try {
    const query = `
      INSERT INTO funcoes (nome, descricao, ativo, empresa_id, created_at, updated_at)
      VALUES (?, ?, 1, ?, datetime('now'), datetime('now'))
    `;

    const result = await db
      .prepare(query)
      .bind(body.nome, body.descricao || null, getEmpresaId(c))
      .run();

    return c.json({
      success: true,
      data: {
        id: result.meta.last_row_id,
        nome: body.nome,
        descricao: body.descricao || null,
        ativo: 1,
      },
    });
  } catch (error: unknown) {
    if (error instanceof Error && error.message?.includes('UNIQUE constraint failed')) {
      throw new AppError('Função já existe', 409);
    }
    console.error('[LOOKUP] Erro ao criar função:', error);
    throw new AppError('Erro ao criar função', 500);
  }
});

/**
 * GET /api/setores
 * Retorna lista de todos os setores cadastrados
 */
lookup.get('/setores', async (c) => {
  const db = c.env.DB;
  const empresaId = getEmpresaId(c);

  try {
    const query = `
      SELECT id, nome, descricao, ativo
      FROM setores
      WHERE deleted_at IS NULL
        AND empresa_id = ?
      ORDER BY nome ASC
    `;

    const { results } = await db.prepare(query).bind(empresaId).all();

    return c.json({
      success: true,
      data: results || [],
    });
  } catch (error) {
    console.error('[LOOKUP] Erro ao carregar setores:', error);
    throw new AppError('Erro ao carregar setores', 500);
  }
});

/**
 * POST /api/setores
 * Criar novo setor
 */
lookup.post('/setores', async (c) => {
  const db = c.env.DB;
  const body = (await c.req.json()) as { nome: string; descricao?: string };

  if (!body.nome) {
    throw new AppError('Nome do setor é obrigatório', 400);
  }

  try {
    const query = `
      INSERT INTO setores (nome, descricao, ativo, empresa_id, created_at, updated_at)
      VALUES (?, ?, 1, ?, datetime('now'), datetime('now'))
    `;

    const result = await db
      .prepare(query)
      .bind(body.nome, body.descricao || null, getEmpresaId(c))
      .run();

    return c.json({
      success: true,
      data: {
        id: result.meta.last_row_id,
        nome: body.nome,
        descricao: body.descricao || null,
        ativo: 1,
      },
    });
  } catch (error: unknown) {
    if (error instanceof Error && error.message?.includes('UNIQUE constraint failed')) {
      throw new AppError('Setor já existe', 409);
    }
    console.error('[LOOKUP] Erro ao criar setor:', error);
    throw new AppError('Erro ao criar setor', 500);
  }
});

/**
 * GET /api/aeronaves
 * Retorna lista de todas as aeronaves cadastradas
 */
lookup.get('/aeronaves', async (c) => {
  const db = c.env.DB;

  try {
    const query = `
      SELECT id, modelo, prefixo
      FROM aeronaves
      WHERE deleted_at IS NULL
      ORDER BY modelo ASC
    `;

    const { results } = await db.prepare(query).all();

    return c.json({
      success: true,
      data: results || [],
    });
  } catch (error) {
    console.error('[LOOKUP] Erro ao carregar aeronaves:', error);
    throw new AppError('Erro ao carregar aeronaves', 500);
  }
});

/**
 * POST /api/aeronaves
 * Criar nova aeronave
 */
lookup.post('/aeronaves', async (c) => {
  const db = c.env.DB;
  const body = (await c.req.json()) as {
    modelo: string;
    prefixo?: string;
  };

  if (!body.modelo) {
    throw new AppError('Modelo da aeronave é obrigatório', 400);
  }

  try {
    const empresaId = getEmpresaId(c);
    const query = `
      INSERT INTO aeronaves (modelo, prefixo, empresa_id, created_at, updated_at)
      VALUES (?, ?, ?, datetime('now'), datetime('now'))
    `;

    const result = await db
      .prepare(query)
      .bind(body.modelo, body.prefixo || null, empresaId)
      .run();

    return c.json({
      success: true,
      data: {
        id: result.meta.last_row_id,
        modelo: body.modelo,
        prefixo: body.prefixo || null,
      },
    });
  } catch (error: unknown) {
    if (error instanceof Error && error.message?.includes('UNIQUE constraint failed')) {
      throw new AppError('Aeronave com esse prefixo já existe', 409);
    }
    console.error('[LOOKUP] Erro ao criar aeronave:', error);
    throw new AppError('Erro ao criar aeronave', 500);
  }
});

/**
 * DELETE /api/funcoes/:id
 * Soft-delete de uma função
 */
lookup.delete('/funcoes/:id', async (c) => {
  const db = c.env.DB;
  const id = c.req.param('id');

  try {
    const query = `UPDATE funcoes SET deleted_at = datetime('now') WHERE id = ? AND empresa_id = ?`;
    await db.prepare(query).bind(id, getEmpresaId(c)).run();

    return c.json({
      success: true,
      message: 'Função deletada com sucesso',
    });
  } catch (error) {
    console.error('[LOOKUP] Erro ao deletar função:', error);
    throw new AppError('Erro ao deletar função', 500);
  }
});

/**
 * DELETE /api/setores/:id
 * Soft-delete de um setor
 */
lookup.delete('/setores/:id', async (c) => {
  const db = c.env.DB;
  const id = c.req.param('id');

  try {
    const query = `UPDATE setores SET deleted_at = datetime('now') WHERE id = ? AND empresa_id = ?`;
    await db.prepare(query).bind(id, getEmpresaId(c)).run();

    return c.json({
      success: true,
      message: 'Setor deletado com sucesso',
    });
  } catch (error) {
    console.error('[LOOKUP] Erro ao deletar setor:', error);
    throw new AppError('Erro ao deletar setor', 500);
  }
});

/**
 * DELETE /api/aeronaves/:id
 * Soft-delete de uma aeronave
 */
lookup.delete('/aeronaves/:id', async (c) => {
  const db = c.env.DB;
  const id = c.req.param('id');

  try {
    const query = `UPDATE aeronaves SET deleted_at = datetime('now') WHERE id = ?`;
    await db.prepare(query).bind(id).run();

    return c.json({
      success: true,
      message: 'Aeronave deletada com sucesso',
    });
  } catch (error) {
    console.error('[LOOKUP] Erro ao deletar aeronave:', error);
    throw new AppError('Erro ao deletar aeronave', 500);
  }
});
