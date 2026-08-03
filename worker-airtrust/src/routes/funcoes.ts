import { Hono } from 'hono';
import { ApiError } from '../middleware/error-handler';
import { auth } from '../middleware/auth';
import { requireRole } from '../middleware/rbac';
import type { Env } from '../types';
import { registrarAuditoria, extrairUsuarioAuditoria } from '../utils/auditoria';
import { getEmpresaId } from '../middleware/tenant';

const funcoes = new Hono<{ Bindings: Env }>();

type FuncaoPayload = {
  codigo?: unknown;
  nome?: unknown;
  descricao?: unknown;
  categoria?: unknown;
  ativo?: unknown;
};

// ===== GET /api/funcoes =====
funcoes.get('/', auth(), async (c) => {
  const db = c.env.DB;
  const empresaId = getEmpresaId(c);

  try {
    const { results } = await db
      .prepare(
        `
        SELECT id, codigo, nome, descricao, categoria, ativo, created_at, updated_at
        FROM funcoes
        WHERE deleted_at IS NULL
          AND empresa_id = ?
        ORDER BY nome ASC
        `,
      )
      .bind(empresaId)
      .all();

    return c.json({
      success: true,
      data: results || [],
    });
  } catch (error) {
    console.error('[FUNCOES] Erro ao listar:', error);
    throw new ApiError('Erro ao listar funções', 500);
  }
});

// ===== GET /api/funcoes/:id =====
funcoes.get('/:id', auth(), async (c) => {
  const db = c.env.DB;
  const id = c.req.param('id');
  const empresaId = getEmpresaId(c);

  try {
    const { results } = await db
      .prepare(
        `
        SELECT id, codigo, nome, descricao, categoria, ativo, created_at, updated_at
        FROM funcoes
        WHERE id = ? AND deleted_at IS NULL AND empresa_id = ?
        `,
      )
      .bind(id, empresaId)
      .all();

    if (!results || results.length === 0) {
      throw new ApiError('Função não encontrada', 404);
    }

    return c.json({
      success: true,
      data: results[0],
    });
  } catch (error) {
    if (error instanceof ApiError) throw error;
    console.error('[FUNCOES] Erro ao buscar:', error);
    throw new ApiError('Erro ao buscar função', 500);
  }
});

// ===== POST /api/funcoes =====
funcoes.post('/', auth(), requireRole('admin', 'manager'), async (c) => {
  const db = c.env.DB;
  const body = (await c.req.json()) as FuncaoPayload;
  const { codigo, nome, descricao, categoria } = body;

  if (!codigo || String(codigo).trim().length === 0) {
    throw new ApiError('Código da função é obrigatório', 400);
  }
  if (!nome || String(nome).trim().length === 0) {
    throw new ApiError('Nome da função é obrigatório', 400);
  }

  const empresaId = getEmpresaId(c);
  try {
    const result = await db
      .prepare(
        `INSERT INTO funcoes (codigo, nome, descricao, categoria, ativo, empresa_id, created_at, updated_at)
         VALUES (?, ?, ?, ?, 1, ?, datetime('now'), datetime('now'))`,
      )
      .bind(
        String(codigo).trim(),
        String(nome).trim(),
        descricao || null,
        categoria || null,
        empresaId,
      )
      .run();

    const newId = result.meta.last_row_id;
    const ua = extrairUsuarioAuditoria(c);
    await registrarAuditoria({
      db,
      tabela: 'funcoes',
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
          codigo: String(codigo).trim(),
          nome: String(nome).trim(),
          descricao: descricao || null,
          categoria: categoria || null,
          ativo: 1,
        },
      },
      201,
    );
  } catch (error: unknown) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    if (errorMsg.includes('UNIQUE constraint failed')) {
      throw new ApiError('Função com esse código já existe', 409);
    }
    console.error('[FUNCOES] Erro ao criar:', errorMsg);
    throw new ApiError(`Erro ao criar função: ${errorMsg}`, 500);
  }
});

// ===== PUT /api/funcoes/:id =====
funcoes.put('/:id', auth(), requireRole('admin', 'manager'), async (c) => {
  const db = c.env.DB;
  const id = c.req.param('id');
  const body = (await c.req.json()) as FuncaoPayload;
  const empresaId = getEmpresaId(c);

  if (Object.keys(body).length === 0) {
    throw new ApiError('Nenhum campo para atualizar', 400);
  }

  try {
    const { results: existing } = await db
      .prepare(
        'SELECT id, codigo, nome FROM funcoes WHERE id = ? AND deleted_at IS NULL AND empresa_id = ?',
      )
      .bind(id, empresaId)
      .all();

    if (!existing || existing.length === 0) {
      throw new ApiError('Função não encontrada', 404);
    }

    const fields = [];
    const values = [];

    if (body.codigo !== undefined) {
      fields.push('codigo = ?');
      values.push(body.codigo ? String(body.codigo).trim() : null);
    }
    if (body.nome !== undefined) {
      fields.push('nome = ?');
      values.push(body.nome ? String(body.nome).trim() : null);
    }
    if (body.descricao !== undefined) {
      fields.push('descricao = ?');
      values.push(body.descricao || null);
    }
    if (body.categoria !== undefined) {
      fields.push('categoria = ?');
      values.push(body.categoria || null);
    }
    if (body.ativo !== undefined) {
      fields.push('ativo = ?');
      values.push(body.ativo ? 1 : 0);
    }

    fields.push('updated_at = datetime("now")');
    values.push(id);

    values.push(empresaId);

    const statements = [
      db
        .prepare(
          `UPDATE funcoes SET ${fields.join(', ')} WHERE id = ? AND empresa_id = ? AND deleted_at IS NULL`,
        )
        .bind(...values),
    ];
    if (body.nome !== undefined || body.codigo !== undefined) {
      const anterior = existing[0] as { nome?: string | null; codigo?: string | null };
      const novoRotulo = String(
        body.nome ?? anterior.nome ?? body.codigo ?? anterior.codigo ?? '',
      ).trim();
      statements.push(
        db
          .prepare(
            `UPDATE funcionarios SET funcao = ?, updated_at = datetime('now')
              WHERE empresa_id = ? AND deleted_at IS NULL
                AND NULLIF(TRIM(COALESCE(funcao, '')), '') IS NOT NULL
                AND UPPER(TRIM(funcao)) IN (UPPER(TRIM(?)), UPPER(TRIM(?)))`,
          )
          .bind(novoRotulo, empresaId, anterior.nome || '', anterior.codigo || ''),
      );
    }
    await db.batch(statements);

    const ua2 = extrairUsuarioAuditoria(c);
    await registrarAuditoria({
      db,
      tabela: 'funcoes',
      acao: 'UPDATE',
      registro_id: id,
      dados_novos: body,
      ...ua2,
    });

    return c.json({
      success: true,
      message: 'Função atualizada com sucesso',
    });
  } catch (error) {
    if (error instanceof ApiError) throw error;
    const errorMsg = error instanceof Error ? error.message : String(error);
    if (errorMsg.includes('UNIQUE constraint')) {
      throw new ApiError('Função com esse código já existe', 409);
    }
    console.error('[FUNCOES] Erro ao atualizar:', error);
    throw new ApiError('Erro ao atualizar função', 500);
  }
});

// ===== DELETE /api/funcoes/:id =====
funcoes.delete('/:id', auth(), requireRole('admin'), async (c) => {
  const db = c.env.DB;
  const id = c.req.param('id');
  const empresaId = getEmpresaId(c);

  try {
    const { results: existing } = await db
      .prepare(
        'SELECT id, codigo, nome FROM funcoes WHERE id = ? AND deleted_at IS NULL AND empresa_id = ?',
      )
      .bind(id, empresaId)
      .all();

    if (!existing || existing.length === 0) {
      throw new ApiError('Função não encontrada', 404);
    }

    const funcao = existing[0] as { codigo?: string | null; nome?: string | null };
    const emUso = await db
      .prepare(
        `SELECT COUNT(*) AS total FROM funcionarios
          WHERE empresa_id = ? AND deleted_at IS NULL
            AND UPPER(COALESCE(status, 'ATIVO')) = 'ATIVO'
            AND NULLIF(TRIM(COALESCE(funcao, '')), '') IS NOT NULL
            AND UPPER(TRIM(funcao)) IN (UPPER(TRIM(?)), UPPER(TRIM(?)))`,
      )
      .bind(empresaId, funcao.nome || '', funcao.codigo || '')
      .first<{ total: number }>();
    if (Number(emUso?.total || 0) > 0) {
      throw new ApiError('Função em uso por funcionários ativos não pode ser excluída', 409);
    }

    await db
      .prepare(
        'UPDATE funcoes SET deleted_at = datetime("now") WHERE id = ? AND empresa_id = ? AND deleted_at IS NULL',
      )
      .bind(id, empresaId)
      .run();

    const ua3 = extrairUsuarioAuditoria(c);
    await registrarAuditoria({ db, tabela: 'funcoes', acao: 'DELETE', registro_id: id, ...ua3 });

    return c.json({
      success: true,
      message: 'Função deletada com sucesso',
    });
  } catch (error) {
    if (error instanceof ApiError) throw error;
    console.error('[FUNCOES] Erro ao deletar:', error);
    throw new ApiError('Erro ao deletar função', 500);
  }
});

export default funcoes;
