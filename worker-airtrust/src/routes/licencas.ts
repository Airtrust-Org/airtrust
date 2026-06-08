/**
 * Rotas de Licenças
 * Gerenciamento de licenças dos funcionários (PP, PC, PLA, CMA, etc.)
 */

import { Hono } from 'hono';
import type { Env, ApiResponse } from '../types';
import { notFound, badRequest } from '../middleware/error-handler';
import { registrarAuditoria } from '../utils/auditoria';
import { auth } from '../middleware/auth';
import { requireRole } from '../middleware/rbac';
import { getEmpresaId } from '../middleware/tenant';

const app = new Hono<{ Bindings: Env }>();

app.use('*', auth());

interface Licenca {
  id: number;
  funcionario_id: number;
  empresa_id?: number;
  tipo: string;
  numero: string;
  data_emissao: string;
  data_vencimento: string;
  observacoes?: string;
  created_at: string;
  updated_at: string;
  deleted_at?: string;
  funcionario_nome?: string;
  funcionario_matricula?: string;
}

async function findFuncionarioDaEmpresa(
  db: D1Database,
  funcionarioId: number,
  empresaId: number,
) {
  return db
    .prepare('SELECT id, empresa_id FROM funcionarios WHERE id = ? AND empresa_id = ? AND deleted_at IS NULL')
    .bind(funcionarioId, empresaId)
    .first<{ id: number; empresa_id: number } | null>();
}

/**
 * GET /api/licencas
 * Lista todas as licenças (ou filtradas por funcionário)
 * Query params:
 * - funcionario_id: filtra por funcionário específico
 * - tipo: filtra por tipo de licença (PP, PC, PLA, etc.)
 * - status: filtra por status (valida, a_vencer, vencida)
 */
app.get('/', async (c) => {
  const db = c.env.DB;
  const empresaId = getEmpresaId(c);
  const funcionario_id = c.req.query('funcionario_id');
  const tipo = c.req.query('tipo');
  const status = c.req.query('status');

  let query = `
    SELECT 
      l.id, l.funcionario_id, l.tipo, l.numero,
      l.empresa_id, l.data_emissao, l.data_vencimento, l.observacoes,
      l.created_at, l.updated_at,
      f.nome as funcionario_nome,
      f.matricula as funcionario_matricula
    FROM licencas l
    INNER JOIN funcionarios f ON l.funcionario_id = f.id AND f.deleted_at IS NULL AND f.empresa_id = ?
    WHERE l.deleted_at IS NULL
      AND l.empresa_id = ?
  `;

  const bindings: unknown[] = [empresaId, empresaId];

  if (funcionario_id) {
    query += ' AND l.funcionario_id = ?';
    bindings.push(parseInt(funcionario_id));
  }

  if (tipo) {
    query += ' AND l.tipo = ?';
    bindings.push(tipo.toUpperCase());
  }

  // Filtro por status (calculado)
  if (status === 'vencida') {
    query += " AND date(l.data_vencimento) < date('now')";
  } else if (status === 'a_vencer') {
    query += " AND date(l.data_vencimento) BETWEEN date('now') AND date('now', '+30 days')";
  } else if (status === 'valida') {
    query += " AND date(l.data_vencimento) > date('now', '+30 days')";
  }

  query += ' ORDER BY l.data_vencimento ASC';

  const result = await db
    .prepare(query)
    .bind(...bindings)
    .all();

  const response: ApiResponse = {
    success: true,
    data: result.results || [],
  };

  return c.json(response);
});

/**
 * GET /api/licencas/:id
 * Busca licença por ID
 */
app.get('/:id', async (c) => {
  const db = c.env.DB;
  const empresaId = getEmpresaId(c);
  const id = parseInt(c.req.param('id'));

  if (isNaN(id)) {
    return badRequest('ID inválido');
  }

  const licenca = await db
    .prepare(
      `
    SELECT 
      l.*,
      f.nome as funcionario_nome,
      f.matricula as funcionario_matricula
    FROM licencas l
    INNER JOIN funcionarios f ON l.funcionario_id = f.id AND f.deleted_at IS NULL AND f.empresa_id = ?
    WHERE l.id = ? AND l.empresa_id = ? AND l.deleted_at IS NULL
  `,
    )
    .bind(empresaId, id, empresaId)
    .first();

  if (!licenca) {
    return notFound('Licença não encontrada');
  }

  const response: ApiResponse = {
    success: true,
    data: licenca,
  };

  return c.json(response);
});

/**
 * POST /api/licencas
 * Cria nova licença
 */
app.post('/', requireRole('admin', 'manager'), async (c) => {
  const db = c.env.DB;
  const empresaId = getEmpresaId(c);
  const body = await c.req.json();

  // Validações
  if (
    !body.funcionario_id ||
    !body.tipo ||
    !body.numero ||
    !body.data_emissao ||
    !body.data_vencimento
  ) {
    return badRequest(
      'Campos obrigatórios: funcionario_id, tipo, numero, data_emissao, data_vencimento',
    );
  }

  // Verificar se funcionário existe
  const funcionarioExiste = await findFuncionarioDaEmpresa(db, Number(body.funcionario_id), empresaId);

  if (!funcionarioExiste) {
    return badRequest('Funcionário não encontrado');
  }

  // Verificar duplicata (mesmo funcionário + tipo + número)
  const duplicata = await db
    .prepare(
      'SELECT id FROM licencas WHERE funcionario_id = ? AND empresa_id = ? AND tipo = ? AND numero = ? AND deleted_at IS NULL',
    )
    .bind(body.funcionario_id, empresaId, body.tipo.toUpperCase(), body.numero)
    .first();

  if (duplicata) {
    return badRequest('Licença já cadastrada para este funcionário');
  }

  // Inserir
  const result = await db
    .prepare(
      `
    INSERT INTO licencas (
      funcionario_id, empresa_id, tipo, numero, data_emissao, data_vencimento, observacoes
    ) VALUES (?, ?, ?, ?, ?, ?, ?)
  `,
    )
    .bind(
      body.funcionario_id,
      empresaId,
      body.tipo.toUpperCase(),
      body.numero,
      body.data_emissao,
      body.data_vencimento,
      body.observacoes || null,
    )
    .run();

  const id = result.meta.last_row_id;

  // Buscar licença criada para auditoria
  const created = await db
    .prepare('SELECT * FROM licencas WHERE id = ? AND empresa_id = ?')
    .bind(id, empresaId)
    .first();

  // Registrar auditoria
  await registrarAuditoria({
    db,
    tabela: 'licencas',
    acao: 'INSERT',
    registro_id: id.toString(),
    dados_novos: created,
  });

  const response: ApiResponse<{ id: number }> = {
    success: true,
    data: { id },
    message: 'Licença criada com sucesso',
  };

  return c.json(response, 201);
});

/**
 * PUT /api/licencas/:id
 * Atualiza licença existente
 */
app.put('/:id', requireRole('admin', 'manager'), async (c) => {
  const db = c.env.DB;
  const empresaId = getEmpresaId(c);
  const id = parseInt(c.req.param('id'));
  const body = await c.req.json();

  if (isNaN(id)) {
    return badRequest('ID inválido');
  }

  // Verificar se licença existe
  const licencaExistente = await db
    .prepare('SELECT * FROM licencas WHERE id = ? AND empresa_id = ? AND deleted_at IS NULL')
    .bind(id, empresaId)
    .first();

  if (!licencaExistente) {
    return notFound('Licença não encontrada');
  }

  // Construir UPDATE dinâmico
  const updates: string[] = [];
  const bindings: unknown[] = [];

  if (body.tipo !== undefined) {
    updates.push('tipo = ?');
    bindings.push(body.tipo ? body.tipo.toUpperCase() : null);
  }

  if (body.numero !== undefined) {
    updates.push('numero = ?');
    bindings.push(body.numero);
  }

  if (body.data_emissao !== undefined) {
    updates.push('data_emissao = ?');
    bindings.push(body.data_emissao);
  }

  if (body.data_vencimento !== undefined) {
    updates.push('data_vencimento = ?');
    bindings.push(body.data_vencimento);
  }

  if (body.observacoes !== undefined) {
    updates.push('observacoes = ?');
    bindings.push(body.observacoes);
  }

  if (updates.length === 0) {
    return badRequest('Nenhum campo para atualizar');
  }

  updates.push("updated_at = datetime('now')");

  const query = `UPDATE licencas SET ${updates.join(', ')} WHERE id = ? AND empresa_id = ?`;

  await db
    .prepare(query)
    .bind(...bindings, id, empresaId)
    .run();

  // Buscar licença atualizada para auditoria
  const updated = await db
    .prepare('SELECT * FROM licencas WHERE id = ? AND empresa_id = ?')
    .bind(id, empresaId)
    .first();

  // Registrar auditoria
  await registrarAuditoria({
    db,
    tabela: 'licencas',
    acao: 'UPDATE',
    registro_id: id.toString(),
    dados_anteriores: licencaExistente,
    dados_novos: updated,
  });

  const response: ApiResponse = {
    success: true,
    message: 'Licença atualizada com sucesso',
  };

  return c.json(response);
});

/**
 * DELETE /api/licencas/:id
 * Remove licença (soft delete)
 */
app.delete('/:id', requireRole('admin', 'manager'), async (c) => {
  const db = c.env.DB;
  const empresaId = getEmpresaId(c);
  const id = parseInt(c.req.param('id'));

  if (isNaN(id)) {
    return badRequest('ID inválido');
  }

  // Buscar licença antes de deletar para auditoria
  const antiga = await db
    .prepare('SELECT * FROM licencas WHERE id = ? AND empresa_id = ? AND deleted_at IS NULL')
    .bind(id, empresaId)
    .first();

  if (!antiga) {
    return notFound('Licença não encontrada');
  }

  const result = await db
    .prepare(
      "UPDATE licencas SET deleted_at = datetime('now') WHERE id = ? AND empresa_id = ? AND deleted_at IS NULL",
    )
    .bind(id, empresaId)
    .run();

  if (result.meta.changes === 0) {
    return notFound('Licença não encontrada');
  }

  // Registrar auditoria
  await registrarAuditoria({
    db,
    tabela: 'licencas',
    acao: 'DELETE',
    registro_id: id.toString(),
    dados_anteriores: antiga,
  });

  const response: ApiResponse = {
    success: true,
    message: 'Licença removida com sucesso',
  };

  return c.json(response);
});

/**
 * GET /api/dashboard/licencas
 * Retorna métricas e estatísticas de licenças
 */
app.get('/dashboard/licencas', async (c) => {
  const db = c.env.DB;
  const empresaId = getEmpresaId(c);

  try {
    // Total ativas
    const totalAtivas = await db
      .prepare('SELECT COUNT(*) as total FROM licencas WHERE empresa_id = ? AND deleted_at IS NULL')
      .bind(empresaId)
      .first();

    // Vencidas
    const vencidas = await db
      .prepare(
        `
        SELECT COUNT(*) as total
        FROM licencas
        WHERE date(data_vencimento) < date('now')
        AND empresa_id = ?
        AND deleted_at IS NULL
      `,
      )
      .bind(empresaId)
      .first();

    // A vencer em 60 dias
    const aVencer60 = await db
      .prepare(
        `
        SELECT COUNT(*) as total
        FROM licencas
        WHERE date(data_vencimento) BETWEEN date('now') AND date('now', '+60 days')
        AND empresa_id = ?
        AND deleted_at IS NULL
      `,
      )
      .bind(empresaId)
      .first();

    // Válidas (mais de 60 dias)
    const validas = await db
      .prepare(
        `
        SELECT COUNT(*) as total
        FROM licencas
        WHERE date(data_vencimento) > date('now', '+60 days')
        AND empresa_id = ?
        AND deleted_at IS NULL
      `,
      )
      .bind(empresaId)
      .first();

    // Por tipo
    const porTipo = await db
      .prepare(
        `
        SELECT tipo, COUNT(*) as total
        FROM licencas
        WHERE deleted_at IS NULL
          AND empresa_id = ?
        GROUP BY tipo
        ORDER BY total DESC
      `,
      )
      .bind(empresaId)
      .all();

    const response: ApiResponse = {
      success: true,
      data: {
        total_ativas: (totalAtivas as { total: number })?.total ?? 0,
        vencidas: (vencidas as { total: number })?.total ?? 0,
        a_vencer_60_dias: (aVencer60 as { total: number })?.total ?? 0,
        validas: (validas as { total: number })?.total ?? 0,
        por_tipo: porTipo.results,
      },
    };

    return c.json(response);
  } catch (error) {
    console.error('Erro ao buscar dashboard de licenças:', error);
    return c.json(
      {
        success: false,
        error: 'Erro ao carregar dashboard',
      },
      500,
    );
  }
});

export default app;
