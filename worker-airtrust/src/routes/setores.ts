import { Hono } from 'hono';
import { ApiError } from '../middleware/error-handler';
import { auth } from '../middleware/auth';
import { requireRole } from '../middleware/rbac';
import type { Env } from '../types';
import { registrarAuditoria, extrairUsuarioAuditoria } from '../utils/auditoria';
import { getEmpresaId } from '../middleware/tenant';
import { createLogger, toError } from '../utils/logger';
import { getEmployeeSectorAccess } from '../services/employee-sector-access';

const setores = new Hono<{ Bindings: Env }>();

// ===== GET /api/setores =====
setores.get('/', auth(), async (c) => {
  const db = c.env.DB;
  const empresaId = getEmpresaId(c);
  const access = await getEmployeeSectorAccess(c, empresaId);

  try {
    let sql = `
      SELECT id, codigo, nome, descricao, responsavel, ativo, created_at, updated_at
      FROM setores
      WHERE deleted_at IS NULL
        AND empresa_id = ?
    `;
    const bindings: unknown[] = [empresaId];

    if (access.mode !== 'all') {
      if (access.setorIds.length === 0) {
        return c.json({ success: true, data: [] });
      }

      sql += ` AND id IN (${access.setorIds.map(() => '?').join(', ')})`;
      bindings.push(...access.setorIds);
    }

    sql += ' ORDER BY nome ASC';

    const { results } = await db
      .prepare(sql)
      .bind(...bindings)
      .all();

    return c.json({
      success: true,
      data: results || [],
    });
  } catch (error) {
    createLogger(c, 'Setores').error('Erro ao listar setores', toError(error));
    throw new ApiError('Erro ao listar setores', 500);
  }
});

// ===== GET /api/setores/:id =====
setores.get('/:id', auth(), async (c) => {
  const db = c.env.DB;
  const id = c.req.param('id');
  const empresaId = getEmpresaId(c);
  const access = await getEmployeeSectorAccess(c, empresaId);

  try {
    let sql = `
      SELECT id, codigo, nome, descricao, responsavel, ativo, created_at, updated_at
      FROM setores
      WHERE id = ? AND deleted_at IS NULL AND empresa_id = ?
    `;
    const bindings: unknown[] = [id, empresaId];

    if (access.mode !== 'all') {
      if (access.setorIds.length === 0) {
        throw new ApiError('Setor não encontrado', 404);
      }
      sql += ` AND id IN (${access.setorIds.map(() => '?').join(', ')})`;
      bindings.push(...access.setorIds);
    }

    const { results } = await db
      .prepare(sql)
      .bind(...bindings)
      .all();

    if (!results || results.length === 0) {
      throw new ApiError('Setor não encontrado', 404);
    }

    return c.json({
      success: true,
      data: results[0],
    });
  } catch (error) {
    if (error instanceof ApiError) throw error;
    createLogger(c, 'Setores').error('Erro ao buscar setor', toError(error));
    throw new ApiError('Erro ao buscar setor', 500);
  }
});

// ===== POST /api/setores =====
setores.post('/', auth(), requireRole('admin', 'manager'), async (c) => {
  const db = c.env.DB;
  const body = (await c.req.json()) as {
    codigo: string;
    nome: string;
    descricao?: string;
    responsavel?: string;
  };

  if (!body.codigo || body.codigo.trim().length === 0) {
    throw new ApiError('Código do setor é obrigatório', 400);
  }
  if (!body.nome || body.nome.trim().length === 0) {
    throw new ApiError('Nome do setor é obrigatório', 400);
  }

  try {
    const result = await db
      .prepare(
        `
        INSERT INTO setores (codigo, nome, descricao, responsavel, ativo, empresa_id, created_at, updated_at)
        VALUES (?, ?, ?, ?, 1, ?, datetime('now'), datetime('now'))
        `,
      )
      .bind(
        body.codigo.trim(),
        body.nome.trim(),
        body.descricao || null,
        body.responsavel || null,
        getEmpresaId(c),
      )
      .run();

    const newId = result.meta.last_row_id;
    const ua = extrairUsuarioAuditoria(c);
    await registrarAuditoria({
      db,
      tabela: 'setores',
      acao: 'INSERT',
      registro_id: newId,
      dados_novos: body,
      ...ua,
    });

    return c.json(
      {
        success: true,
        data: {
          id: newId,
          codigo: body.codigo.trim(),
          nome: body.nome.trim(),
          descricao: body.descricao || null,
          responsavel: body.responsavel || null,
          ativo: 1,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        },
      },
      201,
    );
  } catch (error: unknown) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    createLogger(c, 'Setores').error('Erro ao criar setor', toError(error));
    if (errorMsg.includes('UNIQUE constraint failed')) {
      throw new ApiError('Setor com esse código já existe', 409);
    }
    throw new ApiError(`Erro ao criar setor: ${errorMsg}`, 500);
  }
});

// ===== PUT /api/setores/:id =====
setores.put('/:id', auth(), requireRole('admin', 'manager'), async (c) => {
  const db = c.env.DB;
  const id = c.req.param('id');
  const body = (await c.req.json()) as {
    codigo?: string;
    nome?: string;
    descricao?: string;
    responsavel?: string;
    ativo?: number;
  };

  if (Object.keys(body).length === 0) {
    throw new ApiError('Nenhum campo para atualizar', 400);
  }

  try {
    // Verifica se existe
    const { results: existing } = await db
      .prepare(
        'SELECT id, codigo, nome FROM setores WHERE id = ? AND deleted_at IS NULL AND empresa_id = ?',
      )
      .bind(id, getEmpresaId(c))
      .all();

    if (!existing || existing.length === 0) {
      throw new ApiError('Setor não encontrado', 404);
    }

    // Monta query dinâmica
    const fields = [];
    const values = [];

    if (body.codigo !== undefined) {
      fields.push('codigo = ?');
      values.push(body.codigo ? body.codigo.trim() : null);
    }
    if (body.nome !== undefined) {
      fields.push('nome = ?');
      values.push(body.nome ? body.nome.trim() : null);
    }
    if (body.descricao !== undefined) {
      fields.push('descricao = ?');
      values.push(body.descricao || null);
    }
    if (body.responsavel !== undefined) {
      fields.push('responsavel = ?');
      values.push(body.responsavel || null);
    }
    if (body.ativo !== undefined) {
      fields.push('ativo = ?');
      values.push(body.ativo);
    }

    fields.push('updated_at = datetime("now")');
    values.push(id, getEmpresaId(c));

    const query = `UPDATE setores SET ${fields.join(', ')} WHERE id = ? AND empresa_id = ? AND deleted_at IS NULL`;

    await db
      .prepare(query)
      .bind(...values)
      .run();

    const ua2 = extrairUsuarioAuditoria(c);
    await registrarAuditoria({
      db,
      tabela: 'setores',
      acao: 'UPDATE',
      registro_id: id,
      dados_novos: body,
      ...ua2,
    });

    return c.json({
      success: true,
      message: 'Setor atualizado com sucesso',
    });
  } catch (error) {
    if (error instanceof ApiError) throw error;
    if (error instanceof Error && error.message?.includes('UNIQUE constraint')) {
      throw new ApiError('Setor com esse código já existe', 409);
    }
    createLogger(c, 'Setores').error('Erro ao atualizar setor', toError(error));
    throw new ApiError('Erro ao atualizar setor', 500);
  }
});

// ===== DELETE /api/setores/:id =====
setores.delete('/:id', auth(), requireRole('admin'), async (c) => {
  const db = c.env.DB;
  const id = c.req.param('id');

  try {
    const { results: existing } = await db
      .prepare(
        'SELECT id, codigo, nome FROM setores WHERE id = ? AND deleted_at IS NULL AND empresa_id = ?',
      )
      .bind(id, getEmpresaId(c))
      .all();

    if (!existing || existing.length === 0) {
      throw new ApiError('Setor não encontrado', 404);
    }

    const setor = existing[0] as { codigo?: string | null; nome?: string | null };
    const emUso = await db
      .prepare(
        `SELECT COUNT(*) AS total FROM funcionarios
          WHERE empresa_id = ? AND deleted_at IS NULL
            AND UPPER(COALESCE(status, 'ATIVO')) = 'ATIVO'
            AND (
              setor_id = ?
              OR (
                NULLIF(TRIM(COALESCE(setor, '')), '') IS NOT NULL
                AND UPPER(TRIM(setor)) IN (UPPER(TRIM(?)), UPPER(TRIM(?)))
              )
            )`,
      )
      .bind(getEmpresaId(c), id, setor.nome || '', setor.codigo || '')
      .first<{ total: number }>();
    if (Number(emUso?.total || 0) > 0) {
      throw new ApiError('Setor em uso por funcionários ativos não pode ser excluído', 409);
    }

    // Soft delete
    await db
      .prepare(
        'UPDATE setores SET deleted_at = datetime("now") WHERE id = ? AND empresa_id = ? AND deleted_at IS NULL',
      )
      .bind(id, getEmpresaId(c))
      .run();

    const ua3 = extrairUsuarioAuditoria(c);
    await registrarAuditoria({ db, tabela: 'setores', acao: 'DELETE', registro_id: id, ...ua3 });

    return c.json({
      success: true,
      message: 'Setor deletado com sucesso',
    });
  } catch (error) {
    if (error instanceof ApiError) throw error;
    createLogger(c, 'Setores').error('Erro ao deletar setor', toError(error));
    throw new ApiError('Erro ao deletar setor', 500);
  }
});

export default setores;
