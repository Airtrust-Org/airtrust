import { Hono } from 'hono';
import { ApiError } from '../middleware/error-handler';
import { auth } from '../middleware/auth';
import { requireRole } from '../middleware/rbac';
import type { Env } from '../types';
import { getEmpresaId } from '../middleware/tenant';
import { CANCELLED_STATUS_VALUES, sqlStatusEqualsAny } from '../lib/status/status-codes';
import { classificarStatusPorVencimento, diasEntreDatas } from '../lib/status/operational-status';

const matrizTreinamento = new Hono<{ Bindings: Env }>();

matrizTreinamento.use('*', auth());

matrizTreinamento.use('/*', async (c, next) => {
  await next();
  c.header('Cache-Control', 'no-store, no-cache, must-revalidate, private');
  c.header('Pragma', 'no-cache');
  c.header('Expires', '0');
  c.header('Vary', 'Authorization');
});

function handleRouteError(route: string, fallbackMessage: string, error: unknown): never {
  console.error(`[matriz-treinamento] ${route}`, error);

  if (error instanceof ApiError) {
    throw error;
  }

  const message = error instanceof Error ? error.message : String(error || 'Erro desconhecido');
  throw new ApiError(`${fallbackMessage}: ${message}`, 500);
}

// GET /api/matriz-treinamento/registros
matrizTreinamento.get('/registros', async (c) => {
  try {
    const db = c.env.DB;
    const empresaId = getEmpresaId(c);
    const funcaoId = c.req.query('funcao_id');
    const ativo = c.req.query('ativo');

    let sql = `
      SELECT
        m.id,
        m.empresa_id,
        m.funcao_id,
        f.nome AS funcao_nome,
        f.codigo AS funcao_codigo,
        m.qualificacao_tipo_id,
        qt.nome AS qualificacao_tipo_nome,
        qt.codigo AS qualificacao_tipo_codigo,
        m.obrigatoriedade,
        m.nivel_requerido,
        m.critico_operacional,
        m.origem,
        m.observacoes,
        m.ativo,
        m.created_at,
        m.updated_at
      FROM matriz_treinamento_funcao m
      LEFT JOIN funcoes f ON f.id = m.funcao_id AND f.deleted_at IS NULL
      LEFT JOIN qualificacoes_tipos qt ON qt.id = m.qualificacao_tipo_id AND qt.deleted_at IS NULL
      WHERE m.empresa_id = ?
        AND m.deleted_at IS NULL
    `;
    const params: unknown[] = [empresaId];

    if (funcaoId) {
      sql += ' AND m.funcao_id = ?';
      params.push(Number(funcaoId));
    }
    if (ativo !== undefined) {
      sql += ' AND m.ativo = ?';
      params.push(ativo === '0' ? 0 : 1);
    }
    sql += ' ORDER BY f.nome ASC, qt.nome ASC';

    const { results } = await db
      .prepare(sql)
      .bind(...params)
      .all();
    return c.json({ success: true, data: results || [] });
  } catch (error) {
    handleRouteError('/registros', 'Erro ao listar registros da matriz', error);
  }
});

// GET /api/matriz-treinamento/funcoes — vista agregada por função
matrizTreinamento.get('/funcoes', async (c) => {
  try {
    const db = c.env.DB;
    const empresaId = getEmpresaId(c);
    const { results: funcoes } = await db
      .prepare(
        `SELECT id, codigo, nome
         FROM funcoes
         WHERE empresa_id = ?
           AND deleted_at IS NULL
           AND COALESCE(ativo, 1) = 1
         ORDER BY nome ASC`,
      )
      .bind(empresaId)
      .all<{ id: number; codigo: string | null; nome: string }>();

    const { results: matriz } = await db
      .prepare(
        `SELECT m.funcao_id, m.qualificacao_tipo_id, m.obrigatoriedade, m.critico_operacional, m.ativo
         FROM matriz_treinamento_funcao m
         WHERE m.empresa_id = ? AND m.deleted_at IS NULL`,
      )
      .bind(empresaId)
      .all<{
        funcao_id: number;
        qualificacao_tipo_id: number;
        obrigatoriedade: string;
        critico_operacional: number;
        ativo: number;
      }>();

    const byFuncao = new Map<
      number,
      { obrigatoria: number; recomendada: number; critica: number }
    >();
    for (const row of matriz || []) {
      const entry = byFuncao.get(row.funcao_id) || { obrigatoria: 0, recomendada: 0, critica: 0 };
      if (row.ativo) {
        if (row.obrigatoriedade === 'OBRIGATORIA') entry.obrigatoria += 1;
        else if (row.obrigatoriedade === 'RECOMENDADA') entry.recomendada += 1;
        if (row.critico_operacional) entry.critica += 1;
      }
      byFuncao.set(row.funcao_id, entry);
    }

    const data = (funcoes || []).map((f) => ({
      ...f,
      total_obrigatoria: byFuncao.get(f.id)?.obrigatoria ?? 0,
      total_recomendada: byFuncao.get(f.id)?.recomendada ?? 0,
      total_critica: byFuncao.get(f.id)?.critica ?? 0,
    }));

    return c.json({ success: true, data });
  } catch (error) {
    handleRouteError('/funcoes', 'Erro ao listar funções da matriz', error);
  }
});

// GET /api/matriz-treinamento/registros/:id
matrizTreinamento.get('/registros/:id', async (c) => {
  try {
    const db = c.env.DB;
    const empresaId = getEmpresaId(c);
    const id = Number(c.req.param('id'));
    const row = await db
      .prepare(
        `SELECT m.*, f.nome AS funcao_nome, qt.nome AS qualificacao_tipo_nome
         FROM matriz_treinamento_funcao m
         LEFT JOIN funcoes f ON f.id = m.funcao_id
         LEFT JOIN qualificacoes_tipos qt ON qt.id = m.qualificacao_tipo_id
         WHERE m.id = ? AND m.empresa_id = ? AND m.deleted_at IS NULL`,
      )
      .bind(id, empresaId)
      .first();

    if (!row) throw new ApiError('Registro não encontrado', 404);
    return c.json({ success: true, data: row });
  } catch (error) {
    handleRouteError('/registros/:id', 'Erro ao buscar registro da matriz', error);
  }
});

// POST /api/matriz-treinamento/registros
matrizTreinamento.post('/registros', requireRole('admin', 'manager'), async (c) => {
  try {
    const db = c.env.DB;
    const empresaId = getEmpresaId(c);
    const body = (await c.req.json().catch(() => ({}))) as {
      funcao_id?: number;
      qualificacao_tipo_id?: number;
      obrigatoriedade?: string;
      nivel_requerido?: number | null;
      critico_operacional?: boolean | number;
      origem?: string;
      observacoes?: string | null;
    };

    if (!body.funcao_id || !body.qualificacao_tipo_id) {
      throw new ApiError('funcao_id e qualificacao_tipo_id são obrigatórios', 400);
    }

    const obrigatoriedade = ['OBRIGATORIA', 'RECOMENDADA', 'NAO_APLICA'].includes(
      String(body.obrigatoriedade || ''),
    )
      ? body.obrigatoriedade
      : 'OBRIGATORIA';

    const origem = ['REGULATORIO', 'SGSO', 'RH', 'CLIENTE', 'OUTRO'].includes(
      String(body.origem || ''),
    )
      ? body.origem
      : 'REGULATORIO';

    const funcao = await db
      .prepare(
        `SELECT id FROM funcoes WHERE id = ? AND empresa_id = ? AND deleted_at IS NULL AND COALESCE(ativo, 1) = 1`,
      )
      .bind(body.funcao_id, empresaId)
      .first<{ id: number }>();

    if (!funcao) {
      throw new ApiError('Função inválida para a empresa atual', 400);
    }

    const tipo = await db
      .prepare(`SELECT id FROM qualificacoes_tipos WHERE id = ? AND empresa_id = ? AND deleted_at IS NULL LIMIT 1`)
      .bind(body.qualificacao_tipo_id, empresaId)
      .first<{ id: number }>();

    if (!tipo) {
      throw new ApiError('Tipo de qualificação inválido', 400);
    }

    const existing = await db
      .prepare(
        `SELECT id FROM matriz_treinamento_funcao
         WHERE empresa_id = ? AND funcao_id = ? AND qualificacao_tipo_id = ? AND ativo = 1 AND deleted_at IS NULL`,
      )
      .bind(empresaId, body.funcao_id, body.qualificacao_tipo_id)
      .first<{ id: number }>();

    if (existing) {
      throw new ApiError(
        'Já existe um registro ativo para essa combinação função × qualificação',
        409,
      );
    }

    let result: D1Result;
    try {
      result = await db
        .prepare(
          `INSERT INTO matriz_treinamento_funcao
             (empresa_id, funcao_id, qualificacao_tipo_id, obrigatoriedade, nivel_requerido, critico_operacional, origem, observacoes, ativo)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1)`,
        )
        .bind(
          empresaId,
          body.funcao_id,
          body.qualificacao_tipo_id,
          obrigatoriedade,
          body.nivel_requerido ?? null,
          body.critico_operacional ? 1 : 0,
          origem,
          body.observacoes ?? null,
        )
        .run();
    } catch (error) {
      const msg = String((error as Error)?.message || '');
      if (msg.includes('UNIQUE constraint failed')) {
        throw new ApiError('Já existe um requisito ativo para esta combinação', 409);
      }
      if (msg.includes('FOREIGN KEY constraint failed')) {
        throw new ApiError('Dados inválidos: função ou tipo de qualificação não encontrado', 400);
      }
      throw error;
    }

    return c.json({ success: true, data: { id: result.meta.last_row_id } }, 201);
  } catch (error) {
    handleRouteError('/registros [POST]', 'Erro ao salvar requisito da matriz', error);
  }
});

// PUT /api/matriz-treinamento/registros/:id
// POST /api/matriz-treinamento/registros/bulk
matrizTreinamento.post('/registros/bulk', requireRole('admin', 'manager'), async (c) => {
  try {
    const db = c.env.DB;
    const empresaId = getEmpresaId(c);
    const body = (await c.req.json().catch(() => ({}))) as {
      funcao_id?: number;
      qualificacao_tipo_ids?: number[];
      obrigatoriedade?: string;
      critico_operacional?: boolean | number;
      origem?: string;
      observacoes?: string | null;
    };

    if (
      !body.funcao_id ||
      !Array.isArray(body.qualificacao_tipo_ids) ||
      body.qualificacao_tipo_ids.length === 0
    ) {
      throw new ApiError('funcao_id e qualificacao_tipo_ids[] são obrigatórios', 400);
    }

    const obrigatoriedade = ['OBRIGATORIA', 'RECOMENDADA', 'NAO_APLICA'].includes(
      String(body.obrigatoriedade || ''),
    )
      ? body.obrigatoriedade
      : 'OBRIGATORIA';

    const origem = ['REGULATORIO', 'SGSO', 'RH', 'CLIENTE', 'OUTRO'].includes(
      String(body.origem || ''),
    )
      ? body.origem
      : 'REGULATORIO';

    const funcao = await db
      .prepare(
        `SELECT id FROM funcoes WHERE id = ? AND empresa_id = ? AND deleted_at IS NULL AND COALESCE(ativo, 1) = 1`,
      )
      .bind(body.funcao_id, empresaId)
      .first<{ id: number }>();

    if (!funcao) {
      throw new ApiError('Função inválida para a empresa atual', 400);
    }

    const inserted: number[] = [];
    const skipped: number[] = [];

    for (const tipoId of body.qualificacao_tipo_ids) {
      const tipo = await db
        .prepare(`SELECT id FROM qualificacoes_tipos WHERE id = ? AND empresa_id = ? AND deleted_at IS NULL LIMIT 1`)
        .bind(tipoId, empresaId)
        .first<{ id: number }>();
      if (!tipo) {
        skipped.push(tipoId);
        continue;
      }

      const existing = await db
        .prepare(
          `SELECT id FROM matriz_treinamento_funcao
           WHERE empresa_id = ? AND funcao_id = ? AND qualificacao_tipo_id = ? AND ativo = 1 AND deleted_at IS NULL`,
        )
        .bind(empresaId, body.funcao_id, tipoId)
        .first<{ id: number }>();

      if (existing) {
        skipped.push(tipoId);
        continue;
      }

      try {
        const r = await db
          .prepare(
            `INSERT INTO matriz_treinamento_funcao
               (empresa_id, funcao_id, qualificacao_tipo_id, obrigatoriedade, critico_operacional, origem, observacoes, ativo)
             VALUES (?, ?, ?, ?, ?, ?, ?, 1)`,
          )
          .bind(
            empresaId,
            body.funcao_id,
            tipoId,
            obrigatoriedade,
            body.critico_operacional ? 1 : 0,
            origem,
            body.observacoes ?? null,
          )
          .run();
        inserted.push(Number(r.meta.last_row_id));
      } catch {
        skipped.push(tipoId);
      }
    }

    return c.json(
      {
        success: true,
        data: { inserted: inserted.length, skipped: skipped.length, ids: inserted },
      },
      201,
    );
  } catch (error) {
    handleRouteError(
      '/registros/bulk [POST]',
      'Erro ao salvar requisitos em lote da matriz',
      error,
    );
  }
});

// PUT /api/matriz-treinamento/registros/:id
matrizTreinamento.put('/registros/:id', requireRole('admin', 'manager'), async (c) => {
  try {
    const db = c.env.DB;
    const empresaId = getEmpresaId(c);
    const id = Number(c.req.param('id'));
    const existing = await db
      .prepare(
        `SELECT id FROM matriz_treinamento_funcao WHERE id = ? AND empresa_id = ? AND deleted_at IS NULL`,
      )
      .bind(id, empresaId)
      .first<{ id: number }>();

    if (!existing) throw new ApiError('Registro não encontrado', 404);

    const body = (await c.req.json().catch(() => ({}))) as {
      obrigatoriedade?: string;
      nivel_requerido?: number | null;
      critico_operacional?: boolean | number;
      origem?: string;
      observacoes?: string | null;
      ativo?: boolean | number;
    };

    const obrigatoriedade = ['OBRIGATORIA', 'RECOMENDADA', 'NAO_APLICA'].includes(
      String(body.obrigatoriedade || ''),
    )
      ? body.obrigatoriedade
      : null;

    const origem = ['REGULATORIO', 'SGSO', 'RH', 'CLIENTE', 'OUTRO'].includes(
      String(body.origem || ''),
    )
      ? body.origem
      : null;

    await db
      .prepare(
        `UPDATE matriz_treinamento_funcao SET
           obrigatoriedade = COALESCE(?, obrigatoriedade),
           nivel_requerido = COALESCE(?, nivel_requerido),
           critico_operacional = COALESCE(?, critico_operacional),
           origem = COALESCE(?, origem),
           observacoes = COALESCE(?, observacoes),
           ativo = COALESCE(?, ativo),
           updated_at = datetime('now')
         WHERE id = ? AND empresa_id = ?`,
      )
      .bind(
        obrigatoriedade ?? null,
        body.nivel_requerido !== undefined ? body.nivel_requerido : null,
        body.critico_operacional !== undefined ? (body.critico_operacional ? 1 : 0) : null,
        origem ?? null,
        body.observacoes !== undefined ? (body.observacoes ?? null) : null,
        body.ativo !== undefined ? (body.ativo ? 1 : 0) : null,
        id,
        empresaId,
      )
      .run();

    return c.json({ success: true });
  } catch (error) {
    handleRouteError('/registros/:id [PUT]', 'Erro ao atualizar requisito da matriz', error);
  }
});

// DELETE /api/matriz-treinamento/registros/:id (soft delete)
matrizTreinamento.delete('/registros/:id', requireRole('admin', 'manager'), async (c) => {
  try {
    const db = c.env.DB;
    const empresaId = getEmpresaId(c);
    const id = Number(c.req.param('id'));
    const existing = await db
      .prepare(
        `SELECT id FROM matriz_treinamento_funcao WHERE id = ? AND empresa_id = ? AND deleted_at IS NULL`,
      )
      .bind(id, empresaId)
      .first<{ id: number }>();

    if (!existing) throw new ApiError('Registro não encontrado', 404);

    await db
      .prepare(
        `UPDATE matriz_treinamento_funcao SET ativo = 0, deleted_at = datetime('now') WHERE id = ? AND empresa_id = ?`,
      )
      .bind(id, empresaId)
      .run();

    return c.json({ success: true });
  } catch (error) {
    handleRouteError('/registros/:id [DELETE]', 'Erro ao remover requisito da matriz', error);
  }
});

// GET /api/matriz-treinamento/requisitos/:funcionario_id
// Retorna requisitos da função atual do funcionário com status calculado
matrizTreinamento.get('/requisitos/:funcionario_id', async (c) => {
  try {
    const db = c.env.DB;
    const empresaId = getEmpresaId(c);
    const funcionarioId = Number(c.req.param('funcionario_id'));
    // Pega função atual do funcionário (compatível com schema legado: funcao textual)
    const funcCols = await db.prepare(`PRAGMA table_info('funcionarios')`).all<{ name: string }>();
    const funcColSet = new Set((funcCols.results || []).map((c) => String(c.name || '')));
    const hasFuncaoId = funcColSet.has('funcao_id');
    const hasFuncaoTexto = funcColSet.has('funcao');

    const funcionario = await db
      .prepare(
        `SELECT id, nome,
                ${hasFuncaoId ? 'funcao_id' : 'NULL AS funcao_id'},
                ${hasFuncaoTexto ? 'funcao' : 'NULL AS funcao'}
           FROM funcionarios
          WHERE id = ? AND empresa_id = ? AND deleted_at IS NULL`,
      )
      .bind(funcionarioId, empresaId)
      .first<{ id: number; nome: string; funcao_id: number | null; funcao: string | null }>();

    if (!funcionario) throw new ApiError('Funcionário não encontrado', 404);

    let funcaoId = funcionario.funcao_id ?? null;
    let funcaoNome: string | null = null;

    if (!funcaoId && funcionario.funcao) {
      const funcaoMap = await db
        .prepare(
          `SELECT id, nome
             FROM funcoes
            WHERE empresa_id = ?
              AND deleted_at IS NULL
              AND LOWER(TRIM(nome)) = LOWER(TRIM(?))
            LIMIT 1`,
        )
        .bind(empresaId, funcionario.funcao)
        .first<{ id: number; nome: string }>();
      if (funcaoMap) {
        funcaoId = funcaoMap.id;
        funcaoNome = funcaoMap.nome;
      }
    }

    if (!funcaoId) {
      return c.json({
        success: true,
        data: [],
        meta: {
          funcao_id: null,
          funcao_nome: funcionario.funcao ?? null,
          funcionario_nome: funcionario.nome,
        },
      });
    }

    // `validade_meses` foi adicionada a qualificacoes_tipos depois de tenants
    // legados já existentes. A matriz é somente leitura e pode calcular o
    // status por data_vencimento quando essa coluna ainda não existir.
    const tipoCols = await db.prepare(`PRAGMA table_info('qualificacoes_tipos')`).all<{
      name: string;
    }>();
    const tipoColSet = new Set((tipoCols.results || []).map((column) => String(column.name || '')));
    const validadeMesesExpr = tipoColSet.has('validade_meses')
      ? 'qt.validade_meses'
      : 'NULL AS validade_meses';

    // Requisitos da matriz para essa função
    const { results: requisitos } = await db
      .prepare(
        `SELECT
         m.id AS matriz_id,
         m.qualificacao_tipo_id,
         qt.nome AS qualificacao_tipo_nome,
         qt.codigo AS qualificacao_tipo_codigo,
         ${validadeMesesExpr},
         m.obrigatoriedade,
         m.critico_operacional,
         m.origem,
         m.observacoes
       FROM matriz_treinamento_funcao m
       LEFT JOIN qualificacoes_tipos qt ON qt.id = m.qualificacao_tipo_id AND qt.deleted_at IS NULL
       WHERE m.empresa_id = ? AND m.funcao_id = ? AND m.ativo = 1 AND m.deleted_at IS NULL
       ORDER BY m.obrigatoriedade ASC, qt.nome ASC`,
      )
      .bind(empresaId, funcaoId)
      .all<{
        matriz_id: number;
        qualificacao_tipo_id: number;
        qualificacao_tipo_nome: string | null;
        qualificacao_tipo_codigo: string | null;
        validade_meses: number | null;
        obrigatoriedade: string;
        critico_operacional: number;
        origem: string;
        observacoes: string | null;
      }>();

    if (!requisitos || requisitos.length === 0) {
      return c.json({
        success: true,
        data: [],
        meta: { funcao_id: funcaoId, funcao_nome: funcaoNome, funcionario_nome: funcionario.nome },
      });
    }

    // Última qualificação ativa por tipo para este funcionário
    const histCols = await db.prepare(`PRAGMA table_info('qualificacoes_historico')`).all<{
      name: string;
    }>();
    const histColSet = new Set((histCols.results || []).map((c) => String(c.name || '')));
    const tipoCol = histColSet.has('tipo_qualificacao_id')
      ? 'tipo_qualificacao_id'
      : histColSet.has('qualificacao_id')
        ? 'qualificacao_id'
        : 'tipo_id';
    const dataInicioCol = histColSet.has('data_realizacao')
      ? 'data_realizacao'
      : histColSet.has('data_conclusao')
        ? 'data_conclusao'
        : 'data_conclusao';
    const dataFimCol = histColSet.has('data_vencimento')
      ? 'data_vencimento'
      : histColSet.has('data_validade')
        ? 'data_validade'
        : 'data_vencimento';
    const statusExpr = histColSet.has('status') ? "UPPER(COALESCE(qh.status, ''))" : "''";
    const empresaExpr = histColSet.has('empresa_id') ? 'AND qh.empresa_id = ?' : '';

    const tipoIds = requisitos.map((r) => r.qualificacao_tipo_id);
    const placeholders = tipoIds.map(() => '?').join(',');
    const historicoBind = histColSet.has('empresa_id')
      ? [funcionarioId, empresaId, ...tipoIds]
      : [funcionarioId, ...tipoIds];
    const { results: historico } = await db
      .prepare(
        `WITH historico_ativo AS (
           SELECT
             qh.${tipoCol} AS tipo_id,
             qh.${dataInicioCol} AS ultima_data,
             qh.${dataFimCol} AS data_vencimento,
             ROW_NUMBER() OVER (
               PARTITION BY qh.${tipoCol}
               ORDER BY datetime(COALESCE(qh.${dataFimCol}, qh.${dataInicioCol}, qh.updated_at, qh.created_at)) DESC,
                        qh.id DESC
             ) AS rn
           FROM qualificacoes_historico qh
           WHERE qh.funcionario_id = ?
             ${empresaExpr}
             AND qh.deleted_at IS NULL
             AND NOT (${sqlStatusEqualsAny(statusExpr, CANCELLED_STATUS_VALUES)})
             AND qh.${tipoCol} IN (${placeholders})
         )
         SELECT tipo_id, ultima_data, data_vencimento
         FROM historico_ativo
         WHERE rn = 1`,
      )
      .bind(...historicoBind)
      .all<{ tipo_id: number; ultima_data: string | null; data_vencimento: string | null }>();

    const historicoMap = new Map<
      number,
      { ultima_data: string | null; data_vencimento: string | null }
    >();
    for (const h of historico || []) {
      if (h.tipo_id) historicoMap.set(h.tipo_id, h);
    }

    const today = new Date().toISOString().split('T')[0];

    const data = requisitos.map((r) => {
      const hist = historicoMap.get(r.qualificacao_tipo_id);
      let status: 'EM_DIA' | 'VENCIDO' | 'EM_FALTA' = 'EM_FALTA';
      let data_validade: string | null = null;
      let dias_para_vencer: number | null = null;

      if (hist?.ultima_data) {
        // Calcular data_validade com base na validade_meses do tipo ou data salva
        if (hist.data_vencimento) {
          data_validade = hist.data_vencimento.slice(0, 10);
        } else if (r.validade_meses) {
          const base = new Date(hist.ultima_data);
          base.setMonth(base.getMonth() + r.validade_meses);
          data_validade = base.toISOString().split('T')[0];
        }

        if (data_validade) {
          const classificacao = classificarStatusPorVencimento(data_validade, today);
          dias_para_vencer = diasEntreDatas(data_validade, today);
          // Matriz de treinamento ainda não expõe um status intermediário de
          // "vencendo" (ver relatório de auditoria); VALIDA e VENCENDO_30 são
          // ambos reportados como EM_DIA para preservar o contrato atual.
          status = classificacao === 'VENCIDA' ? 'VENCIDO' : 'EM_DIA';
        } else {
          // Sem validade definida, assumir EM_DIA se tem histórico
          status = 'EM_DIA';
        }
      }

      return {
        matriz_id: r.matriz_id,
        qualificacao_tipo_id: r.qualificacao_tipo_id,
        qualificacao_tipo_nome: r.qualificacao_tipo_nome,
        qualificacao_tipo_codigo: r.qualificacao_tipo_codigo,
        obrigatoriedade: r.obrigatoriedade,
        critico_operacional: Boolean(r.critico_operacional),
        origem: r.origem,
        observacoes: r.observacoes,
        ultima_data: hist?.ultima_data ?? null,
        data_validade,
        status,
        dias_para_vencer,
      };
    });

    const funcao = await db
      .prepare(
        `SELECT nome FROM funcoes WHERE id = ? AND empresa_id = ? AND deleted_at IS NULL LIMIT 1`,
      )
      .bind(funcaoId, empresaId)
      .first<{ nome: string }>();

    if (!funcaoNome) {
      funcaoNome = funcao?.nome ?? funcionario.funcao ?? null;
    }

    return c.json({
      success: true,
      data,
      meta: {
        funcao_id: funcaoId,
        funcao_nome: funcaoNome,
        funcionario_nome: funcionario.nome,
        total: data.length,
        em_dia: data.filter((d) => d.status === 'EM_DIA').length,
        vencido: data.filter((d) => d.status === 'VENCIDO').length,
        em_falta: data.filter((d) => d.status === 'EM_FALTA').length,
      },
    });
  } catch (error) {
    if (error instanceof ApiError) {
      return c.json(
        { success: false, error: error.message },
        error.statusCode as 400 | 401 | 403 | 404 | 500,
      );
    }
    console.error('[matriz-treinamento] /requisitos/:funcionario_id failed', error);
    return c.json(
      {
        success: false,
        error: 'MATRIZ_TREINAMENTO_FAILED',
        message: 'Erro interno ao carregar requisitos da matriz de treinamento',
      },
      500,
    );
  }
});

// GET /api/matriz-treinamento/resumo — aderência por função/empresa
matrizTreinamento.get('/resumo', async (c) => {
  try {
    const db = c.env.DB;
    const empresaId = getEmpresaId(c);
    const { results: funcoes } = await db
      .prepare(
        `SELECT f.id, f.nome,
           COUNT(DISTINCT m.qualificacao_tipo_id) AS total_requisitos,
           COUNT(DISTINCT CASE WHEN m.obrigatoriedade = 'OBRIGATORIA' THEN m.qualificacao_tipo_id END) AS total_obrigatorios
         FROM funcoes f
         LEFT JOIN matriz_treinamento_funcao m ON m.funcao_id = f.id AND m.empresa_id = ? AND m.ativo = 1 AND m.deleted_at IS NULL
         WHERE f.empresa_id = ? AND f.deleted_at IS NULL AND COALESCE(f.ativo, 1) = 1
         GROUP BY f.id, f.nome
         ORDER BY f.nome ASC`,
      )
      .bind(empresaId, empresaId)
      .all();

    return c.json({ success: true, data: funcoes || [] });
  } catch (error) {
    handleRouteError('/resumo', 'Erro ao gerar resumo da matriz', error);
  }
});

export default matrizTreinamento;
