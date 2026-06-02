/**
 * SIMULADORES — Modelos e Tipos de Sessão
 * Routes: GET/POST/PUT/DELETE /tipos-sessao, /tipos-sessao/:id,
 *         GET/POST/PUT/DELETE /modelos-sessao, /modelos-sessao/:id,
 *         GET /modelos-sessao/:id/manobras, POST /modelos-sessao/:id/manobras,
 *         POST /fix/modelos-periodicos
 */

import { Hono } from 'hono';
import type { Env } from '../types';
import { auth, optionalAuth } from '../middleware/auth';
import {
  TipoSessaoSchema,
  ModeloSessaoSchema,
  requireAdminForDelete,
  audit,
  filtrarChecksCompativeisComModelo,
  listarTiposCheckPorIds,
  normalizeModeloAeronave,
} from './simuladores-shared';

const app = new Hono<{ Bindings: Env }>();
app.use('*', async (c, next) => {
  if (c.req.method === 'GET') {
    return optionalAuth()(c, next);
  }
  return auth()(c, next);
});

async function normalizeChecksIdsModelo(
  db: D1Database,
  checksIds: number[],
  modeloAeronave: string | null | undefined,
) {
  const idsUnicos = Array.from(
    new Set(checksIds.map((id) => Number(id)).filter((id) => Number.isInteger(id) && id > 0)),
  );
  const checksEncontrados = await listarTiposCheckPorIds(db, idsUnicos);

  if (checksEncontrados.length !== idsUnicos.length) {
    const idsValidos = new Set(checksEncontrados.map((check) => Number(check.id)));
    const idsInvalidos = idsUnicos.filter((id) => !idsValidos.has(id));
    throw new Error(`Tipos de check inválidos: ${idsInvalidos.join(', ')}`);
  }

  return filtrarChecksCompativeisComModelo(
    checksEncontrados,
    normalizeModeloAeronave(modeloAeronave),
  ).map((check) => Number(check.id));
}

function buildModeloAeronaveSqlMatchExpression(expr: string): string {
  const compact = `UPPER(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(TRIM(COALESCE(${expr}, '')), ' ', ''), '-', ''), '/', ''), '.', ''), '(', ''), ')', ''))`;

  return `CASE
    WHEN ${compact} LIKE '%AW139%' THEN 'AW139'
    WHEN ${compact} LIKE '%SK76%' OR ${compact} LIKE '%S76%' THEN 'SK76'
    ELSE ${compact}
  END`;
}

// ==========================================================================
// CRUD: TIPOS DE SESSÃO
// ==========================================================================

// GET /api/simuladores/tipos-sessao - Listar tipos de sessão
app.get('/tipos-sessao', async (c) => {
  console.log('🔍 [TIPOS] GET /tipos-sessao chamado');
  try {
    const result = await c.env.DB.prepare(
      'SELECT * FROM tipos_sessao WHERE deleted_at IS NULL ORDER BY codigo',
    ).all();

    console.log('✅ [TIPOS] Retornando', result.results.length, 'registros');
    return c.json({ success: true, data: result.results });
  } catch (e: any) {
    console.error('❌ [TIPOS] Erro:', e);
    return c.json({ success: false, error: 'Erro interno do servidor' }, 500);
  }
});

// GET /api/simuladores/tipos-sessao/:id - Buscar tipo específico
app.get('/tipos-sessao/:id', async (c) => {
  try {
    const id = c.req.param('id');
    const result = await c.env.DB.prepare(
      'SELECT * FROM tipos_sessao WHERE id = ? AND deleted_at IS NULL',
    )
      .bind(id)
      .first();

    if (!result) {
      return c.json({ success: false, error: 'Tipo não encontrado' }, 404);
    }

    return c.json({ success: true, data: result });
  } catch (e: any) {
    return c.json({ success: false, error: 'Erro interno do servidor' }, 500);
  }
});

// POST /api/simuladores/tipos-sessao - Criar tipo de sessão
app.post('/tipos-sessao', async (c) => {
  try {
    const parsed = TipoSessaoSchema.safeParse(await c.req.json());
    if (!parsed.success) {
      return c.json(
        { success: false, error: parsed.error.errors[0]?.message ?? 'Dados inválidos' },
        400,
      );
    }
    const { codigo, nome, descricao } = parsed.data;

    // Verificar duplicidade
    const existe = await c.env.DB.prepare(
      'SELECT id FROM tipos_sessao WHERE codigo = ? AND deleted_at IS NULL',
    )
      .bind(codigo)
      .first();

    if (existe) {
      return c.json({ success: false, error: 'Já existe um tipo com este código' }, 400);
    }

    // Inserir
    const result = await c.env.DB.prepare(
      "INSERT INTO tipos_sessao (codigo, nome, descricao, created_at, updated_at) VALUES (?, ?, ?, datetime('now'), datetime('now'))",
    )
      .bind(codigo, nome, descricao || null)
      .run();

    await audit(c.env.DB, {
      tabela: 'tipos_sessao',
      acao: 'INSERT',
      registro_id: result.meta.last_row_id,
      dados_novos: { codigo, nome, descricao },
    });

    return c.json({
      success: true,
      data: { id: result.meta.last_row_id, codigo, nome, descricao },
    });
  } catch (e: any) {
    return c.json({ success: false, error: 'Erro interno do servidor' }, 500);
  }
});

// PUT /api/simuladores/tipos-sessao/:id - Atualizar tipo de sessão
app.put('/tipos-sessao/:id', async (c) => {
  try {
    const id = c.req.param('id');
    const parsed = TipoSessaoSchema.safeParse(await c.req.json());
    if (!parsed.success) {
      return c.json(
        { success: false, error: parsed.error.errors[0]?.message ?? 'Dados inválidos' },
        400,
      );
    }
    const { codigo, nome, descricao } = parsed.data;

    // Buscar dados anteriores
    const anterior = await c.env.DB.prepare(
      'SELECT * FROM tipos_sessao WHERE id = ? AND deleted_at IS NULL',
    )
      .bind(id)
      .first();

    if (!anterior) {
      return c.json({ success: false, error: 'Tipo não encontrado' }, 404);
    }

    // Verificar duplicidade (exceto próprio registro)
    const existe = await c.env.DB.prepare(
      'SELECT id FROM tipos_sessao WHERE codigo = ? AND id != ? AND deleted_at IS NULL',
    )
      .bind(codigo, id)
      .first();

    if (existe) {
      return c.json({ success: false, error: 'Já existe outro tipo com este código' }, 400);
    }

    // Atualizar
    await c.env.DB.prepare(
      "UPDATE tipos_sessao SET codigo = ?, nome = ?, descricao = ?, updated_at = datetime('now') WHERE id = ?",
    )
      .bind(codigo, nome, descricao || null, id)
      .run();

    await audit(c.env.DB, {
      tabela: 'tipos_sessao',
      acao: 'UPDATE',
      registro_id: id,
      dados_anteriores: anterior,
      dados_novos: { codigo, nome, descricao },
    });

    return c.json({ success: true, data: { id, codigo, nome, descricao } });
  } catch (e: any) {
    return c.json({ success: false, error: 'Erro interno do servidor' }, 500);
  }
});

// DELETE /api/simuladores/tipos-sessao/:id - Excluir tipo de sessão (soft delete)
app.delete('/tipos-sessao/:id', async (c) => {
  try {
    const denied = requireAdminForDelete(c);
    if (denied) return denied;

    const id = c.req.param('id');

    // Buscar dados anteriores
    const anterior = await c.env.DB.prepare(
      'SELECT * FROM tipos_sessao WHERE id = ? AND deleted_at IS NULL',
    )
      .bind(id)
      .first();

    if (!anterior) {
      return c.json({ success: false, error: 'Tipo não encontrado' }, 404);
    }

    // Soft delete
    await c.env.DB.prepare(
      "UPDATE tipos_sessao SET deleted_at = datetime('now'), updated_at = datetime('now') WHERE id = ?",
    )
      .bind(id)
      .run();

    await audit(c.env.DB, {
      tabela: 'tipos_sessao',
      acao: 'DELETE',
      registro_id: id,
      dados_anteriores: anterior,
    });

    return c.json({ success: true, message: 'Tipo excluído com sucesso' });
  } catch (e: any) {
    return c.json({ success: false, error: 'Erro interno do servidor' }, 500);
  }
});

// ========================================================================
// MODELOS DE SESSÃO - CRUD Completo
// ========================================================================

async function ensureModelosSessaoModeloAeronaveColumn(db: D1Database) {
  try {
    const col = await db.prepare('PRAGMA table_info(modelos_sessao)').all();
    const columns = (col.results || []).map((r: any) => r.name);
    let hasModeloAeronave = columns.includes('modelo_aeronave');
    const hasCodigoAeronave = columns.includes('codigo_aeronave');
    const hasTipoAeronave = columns.includes('tipo_aeronave');

    if (!hasModeloAeronave) {
      await db.prepare('ALTER TABLE modelos_sessao ADD COLUMN modelo_aeronave TEXT').run();
      hasModeloAeronave = true;
    }

    const coalesceCols = [
      hasModeloAeronave ? 'modelo_aeronave' : null,
      hasCodigoAeronave ? 'codigo_aeronave' : null,
      hasTipoAeronave ? 'tipo_aeronave' : null,
    ].filter(Boolean) as string[];

    await db
      .prepare(
        `UPDATE modelos_sessao SET modelo_aeronave = COALESCE(${coalesceCols.join(', ')}) WHERE (modelo_aeronave IS NULL OR modelo_aeronave = '')`,
      )
      .run();
    await db
      .prepare(
        'CREATE INDEX IF NOT EXISTS idx_modelos_sessao_modelo_aeronave ON modelos_sessao(modelo_aeronave)',
      )
      .run();
  } catch (e: any) {
    console.warn('[ensureModelosSessaoModeloAeronaveColumn] Falha:', e?.message || String(e));
  }
}

async function getTipoSessaoPadraoId(db: D1Database): Promise<number | null> {
  const tipoSessao = await db
    .prepare(
      `SELECT id
       FROM tipos_sessao
       WHERE deleted_at IS NULL
       ORDER BY CASE
         WHEN UPPER(COALESCE(codigo, '')) LIKE '%RECOR%' THEN 2
         ELSE 1
       END,
       id ASC
       LIMIT 1`,
    )
    .first<{ id: number }>();

  return tipoSessao?.id ? Number(tipoSessao.id) : null;
}

// GET /api/simuladores/modelos-sessao - Listar modelos de sessão
app.get('/modelos-sessao', async (c) => {
  console.log('🔍 [MODELOS] GET /modelos-sessao chamado');
  try {
    c.header('Cache-Control', 'no-store, no-cache, must-revalidate, max-age=0');
    c.header('Pragma', 'no-cache');

    await ensureModelosSessaoModeloAeronaveColumn(c.env.DB);

    const col = await c.env.DB.prepare('PRAGMA table_info(modelos_sessao)').all();
    const columns = (col.results || []).map((r: any) => r.name);
    const filtroModeloExpr = [
      columns.includes('modelo_aeronave') ? 'ms.modelo_aeronave' : null,
      columns.includes('codigo_aeronave') ? 'ms.codigo_aeronave' : null,
      columns.includes('tipo_aeronave') ? 'ms.tipo_aeronave' : null,
    ]
      .filter(Boolean)
      .join(', ');
    const modeloAeronaveExpr = filtroModeloExpr ? `COALESCE(${filtroModeloExpr}, '')` : "''";

    const tipo_sessao_id = c.req.query('tipo_sessao_id');
    const tipoSessaoCodigo = String(
      c.req.query('tipo_sessao_codigo') || c.req.query('tipo_sessao') || '',
    )
      .trim()
      .toUpperCase();
    const tipoSessaoNome = String(c.req.query('tipo_sessao_nome') || '').trim().toUpperCase();
    const tipo = c.req.query('tipo'); // SIMULADOR | AERONAVE
    const modelo_aeronave =
      c.req.query('modelo_aeronave') ||
      c.req.query('codigo_aeronave') ||
      c.req.query('tipo_aeronave');
    const modeloAeronaveNormalizado = normalizeModeloAeronave(modelo_aeronave);

    let query = `
      SELECT
        ms.*,
        ts.nome as tipo_sessao_nome,
        ts.codigo as tipo_sessao_codigo,
        qt.nome as qualificacao_tipo_nome,
        qt.codigo as qualificacao_tipo_codigo,
        (SELECT COUNT(*) FROM modelos_sessao_manobras
         WHERE modelo_id = ms.id AND deleted_at IS NULL) as total_manobras
      FROM modelos_sessao ms
      LEFT JOIN tipos_sessao ts ON ms.tipo_sessao_id = ts.id
      LEFT JOIN qualificacoes_tipos qt ON ms.qualificacao_tipo_id = qt.id
      WHERE ms.deleted_at IS NULL
    `;
    const params: any[] = [];

    if (tipo_sessao_id || tipoSessaoCodigo || tipoSessaoNome) {
      const tipoClauses: string[] = [];

      if (tipo_sessao_id) {
        tipoClauses.push('ms.tipo_sessao_id = ?');
        params.push(tipo_sessao_id);
      }

      if (tipoSessaoCodigo) {
        tipoClauses.push('UPPER(TRIM(COALESCE(ts.codigo, \'\'))) = ?');
        params.push(tipoSessaoCodigo);
      }

      if (tipoSessaoNome) {
        tipoClauses.push('UPPER(TRIM(COALESCE(ts.nome, \'\'))) = ?');
        params.push(tipoSessaoNome);
      }

      if (tipoSessaoCodigo === 'INI' || tipoSessaoCodigo === 'INICIAL' || tipoSessaoNome === 'INICIAL') {
        tipoClauses.push("UPPER(TRIM(COALESCE(ts.codigo, ''))) IN ('INI', 'INICIAL')");
        tipoClauses.push("UPPER(TRIM(COALESCE(ts.nome, ''))) = 'INICIAL'");
        tipoClauses.push("UPPER(TRIM(COALESCE(ms.tipo, ''))) = 'INICIAL'");
      }

      query += ` AND (${tipoClauses.join(' OR ')})`;
    }

    if (tipo && (tipo === 'SIMULADOR' || tipo === 'AERONAVE')) {
      if (tipo === 'AERONAVE') {
        query += " AND UPPER(TRIM(COALESCE(ms.tipo, 'SIMULADOR'))) = 'AERONAVE'";
      } else {
        query += " AND UPPER(TRIM(COALESCE(ms.tipo, 'SIMULADOR'))) != 'AERONAVE'";
      }
    }

    if (modeloAeronaveNormalizado) {
      query += ` AND ${buildModeloAeronaveSqlMatchExpression(modeloAeronaveExpr)} = ?`;
      params.push(modeloAeronaveNormalizado);
    }

    query += ' ORDER BY ms.codigo';

    const result = await c.env.DB.prepare(query)
      .bind(...params)
      .all();
    return c.json({ success: true, data: result.results });
  } catch (e: any) {
    console.error('❌ [MODELOS] Erro GET:', e.message);
    return c.json({ success: false, error: 'Erro interno do servidor' }, 500);
  }
});

// GET /api/simuladores/modelos-sessao/:id - Buscar modelo específico
app.get('/modelos-sessao/:id', async (c) => {
  console.log('🔍 [MODELOS] GET /modelos-sessao/:id chamado');
  try {
    const id = c.req.param('id');
    const result = await c.env.DB.prepare(
      `SELECT 
        ms.*,
        ts.nome as tipo_sessao_nome,
        ts.codigo as tipo_sessao_codigo,
        qt.nome as qualificacao_tipo_nome,
        qt.codigo as qualificacao_tipo_codigo
      FROM modelos_sessao ms
      LEFT JOIN tipos_sessao ts ON ms.tipo_sessao_id = ts.id
      LEFT JOIN qualificacoes_tipos qt ON ms.qualificacao_tipo_id = qt.id
      WHERE ms.id = ? AND ms.deleted_at IS NULL`,
    )
      .bind(id)
      .first();

    if (!result) {
      return c.json({ success: false, error: 'Modelo não encontrado' }, 404);
    }

    // Buscar checks FAP padrão do modelo
    const checksResult = await c.env.DB.prepare(
      `SELECT msc.qualificacao_tipo_id, qt.codigo, qt.nome, qt.descricao
       FROM modelos_sessao_checks msc
       INNER JOIN qualificacoes_tipos qt ON msc.qualificacao_tipo_id = qt.id
       WHERE msc.modelo_id = ? AND msc.deleted_at IS NULL
       ORDER BY qt.codigo`,
    )
      .bind(id)
      .all();

    return c.json({ success: true, data: { ...result, checks: checksResult.results || [] } });
  } catch (e: any) {
    console.error('❌ [MODELOS] Erro GET/:id:', e.message);
    return c.json({ success: false, error: 'Erro interno do servidor' }, 500);
  }
});

// GET /api/simuladores/modelos-sessao/:id/checks - Listar checks FAP padrão do modelo
app.get('/modelos-sessao/:id/checks', async (c) => {
  try {
    const id = c.req.param('id');
    const result = await c.env.DB.prepare(
      `SELECT msc.qualificacao_tipo_id as id, qt.codigo, qt.nome, qt.descricao
       FROM modelos_sessao_checks msc
       INNER JOIN qualificacoes_tipos qt ON msc.qualificacao_tipo_id = qt.id
       WHERE msc.modelo_id = ? AND msc.deleted_at IS NULL
       ORDER BY qt.codigo`,
    )
      .bind(id)
      .all();
    return c.json({ success: true, data: result.results || [] });
  } catch (e: any) {
    return c.json({ success: false, error: 'Erro interno do servidor' }, 500);
  }
});

// GET /api/simuladores/modelos-sessao/:id/manobras - Listar manobras do modelo
app.get('/modelos-sessao/:id/manobras', async (c) => {
  console.log('🔍 [MODELOS] GET /modelos-sessao/:id/manobras chamado');
  try {
    const id = c.req.param('id');
    const result = await c.env.DB.prepare(
      `SELECT 
        msm.id,
        msm.ordem,
        msm.obrigatoria,
        msm.observacoes,
        COALESCE(msm.tripulante, 'AB') as tripulante,
        m.id as manobra_id,
        m.codigo as manobra_codigo,
        m.nome as manobra_nome,
        COALESCE(m.nome, m.descricao, m.codigo) as manobra_descricao,
        m.categoria as manobra_categoria,
        m.nivel_dificuldade,
        m.tempo_estimado
      FROM modelos_sessao_manobras msm
      INNER JOIN manobras m ON msm.manobra_id = m.id
      WHERE msm.modelo_id = ? AND msm.deleted_at IS NULL
      ORDER BY msm.ordem ASC`,
    )
      .bind(id)
      .all();

    return c.json({ success: true, data: result.results });
  } catch (e: any) {
    console.error('❌ [MODELOS] Erro GET manobras:', e.message);
    return c.json({ success: false, error: 'Erro interno do servidor' }, 500);
  }
});

// PUT /api/simuladores/modelos-sessao/:id/manobras/reordenar - Reordenar manobras do modelo
app.put('/modelos-sessao/:id/manobras/reordenar', async (c) => {
  try {
    const id = c.req.param('id');
    const body = await c.req.json();
    const manobras = Array.isArray(body?.manobras) ? body.manobras : [];

    if (manobras.length === 0) {
      return c.json({ success: false, error: 'Lista de manobras é obrigatória' }, 400);
    }

    const modelo = await c.env.DB.prepare(
      'SELECT id FROM modelos_sessao WHERE id = ? AND deleted_at IS NULL',
    )
      .bind(id)
      .first();

    if (!modelo) {
      return c.json({ success: false, error: 'Modelo não encontrado' }, 404);
    }

    for (const item of manobras) {
      const relacaoId = Number(item?.id);
      const ordem = Number(item?.ordem);

      if (
        !Number.isInteger(relacaoId) ||
        relacaoId <= 0 ||
        !Number.isInteger(ordem) ||
        ordem <= 0
      ) {
        continue;
      }

      await c.env.DB.prepare(
        `UPDATE modelos_sessao_manobras
         SET ordem = ?, updated_at = datetime('now')
         WHERE id = ? AND modelo_id = ? AND deleted_at IS NULL`,
      )
        .bind(ordem, relacaoId, id)
        .run();
    }

    await audit(c.env.DB, {
      tabela: 'modelos_sessao_manobras',
      acao: 'REORDER',
      registro_id: id,
      dados_novos: { total: manobras.length },
    });

    return c.json({ success: true, message: 'Ordem atualizada com sucesso' });
  } catch (e: any) {
    console.error('❌ [MODELOS] Erro PUT reordenar manobras:', e.message);
    return c.json({ success: false, error: 'Erro interno do servidor' }, 500);
  }
});

// DELETE /api/simuladores/modelos-sessao/:id/manobras/:manobraId - Remover vínculo de manobra
app.delete('/modelos-sessao/:id/manobras/:manobraId', async (c) => {
  try {
    const id = c.req.param('id');
    const manobraId = c.req.param('manobraId');

    const result = await c.env.DB.prepare(
      `UPDATE modelos_sessao_manobras
       SET deleted_at = datetime('now'), updated_at = datetime('now')
       WHERE modelo_id = ? AND manobra_id = ? AND deleted_at IS NULL`,
    )
      .bind(id, manobraId)
      .run();

    if (!result.meta.changes) {
      return c.json({ success: false, error: 'Vínculo de manobra não encontrado' }, 404);
    }

    await audit(c.env.DB, {
      tabela: 'modelos_sessao_manobras',
      acao: 'DELETE',
      registro_id: id,
      dados_novos: { manobra_id: manobraId },
    });

    return c.json({ success: true, message: 'Manobra removida com sucesso' });
  } catch (e: any) {
    console.error('❌ [MODELOS] Erro DELETE manobra:', e.message);
    return c.json({ success: false, error: 'Erro interno do servidor' }, 500);
  }
});

// POST /api/simuladores/modelos-sessao - Criar novo modelo
app.post('/modelos-sessao', async (c) => {
  console.log('🔍 [MODELOS] POST /modelos-sessao chamado');
  try {
    await ensureModelosSessaoModeloAeronaveColumn(c.env.DB);

    const parsed = ModeloSessaoSchema.safeParse(await c.req.json());
    if (!parsed.success) {
      return c.json(
        { success: false, error: parsed.error.errors[0]?.message ?? 'Dados inválidos' },
        400,
      );
    }
    const {
      codigo,
      nome,
      tipo_sessao_id,
      tipo,
      modelo_aeronave,
      descricao,
      duracao_estimada,
      gera_qualificacao,
      qualificacao_tipo_id,
      checks_ids,
      manobras,
    } = parsed.data;
    let checksIdsNormalizados: number[] = [];
    try {
      checksIdsNormalizados = await normalizeChecksIdsModelo(c.env.DB, checks_ids, modelo_aeronave);
    } catch (error: any) {
      return c.json({ success: false, error: 'Checks inválidos' }, 400);
    }

    // Verificar duplicidade de código
    const existe = await c.env.DB.prepare(
      'SELECT id FROM modelos_sessao WHERE codigo = ? AND deleted_at IS NULL',
    )
      .bind(codigo)
      .first();

    if (existe) {
      return c.json({ success: false, error: `Já existe um modelo com o código "${codigo}"` }, 409);
    }

    // Verificar se a coluna tipo já existe (adicionada pela migration 0363)
    const colInfo = await c.env.DB.prepare('PRAGMA table_info(modelos_sessao)').all();
    const hasTipoCol = (colInfo.results || []).some((r: any) => r.name === 'tipo');

    // Inserir modelo
    const insertSql = hasTipoCol
      ? `INSERT INTO modelos_sessao
         (codigo, nome, tipo_sessao_id, tipo, modelo_aeronave, descricao, duracao_estimada, gera_qualificacao, qualificacao_tipo_id, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))`
      : `INSERT INTO modelos_sessao
         (codigo, nome, tipo_sessao_id, modelo_aeronave, descricao, duracao_estimada, gera_qualificacao, qualificacao_tipo_id, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))`;

    const insertBinds = hasTipoCol
      ? [codigo, nome, tipo_sessao_id, tipo || 'SIMULADOR', modelo_aeronave, descricao || null, duracao_estimada || 120, gera_qualificacao || 0, qualificacao_tipo_id || null]
      : [codigo, nome, tipo_sessao_id, modelo_aeronave, descricao || null, duracao_estimada || 120, gera_qualificacao || 0, qualificacao_tipo_id || null];

    const result = await c.env.DB.prepare(insertSql)
      .bind(...insertBinds)
      .run();

    const modeloId = result.meta.last_row_id;

    // Sincronizar checks FAP padrão
    if (checksIdsNormalizados.length > 0) {
      for (const qtId of checksIdsNormalizados) {
        await c.env.DB.prepare(
          `INSERT OR IGNORE INTO modelos_sessao_checks(modelo_id, qualificacao_tipo_id) VALUES (?, ?)`,
        )
          .bind(modeloId, qtId)
          .run();
      }
    }

    // Se tiver manobras, inserir
    if (manobras && Array.isArray(manobras) && manobras.length > 0) {
      for (let i = 0; i < manobras.length; i++) {
        const m = manobras[i];
        await c.env.DB.prepare(
          `INSERT INTO modelos_sessao_manobras 
           (modelo_id, manobra_id, ordem, obrigatoria, observacoes, created_at)
           VALUES (?, ?, ?, ?, ?, datetime('now'))`,
        )
          .bind(
            modeloId,
            m.manobra_id,
            m.ordem || i + 1,
            m.obrigatoria !== undefined ? m.obrigatoria : 1,
            m.observacoes || null,
          )
          .run();
      }
    }

    // Auditoria
    await audit(c.env.DB, {
      tabela: 'modelos_sessao',
      acao: 'INSERT',
      registro_id: modeloId,
      dados_novos: { codigo, nome, tipo_sessao_id, total_manobras: manobras?.length || 0 },
    });

    return c.json({ success: true, data: { id: modeloId, codigo, nome } }, 201);
  } catch (e: any) {
    console.error('❌ [MODELOS] Erro POST:', e.message);
    return c.json({ success: false, error: 'Erro interno do servidor' }, 500);
  }
});

// POST /api/simuladores/modelos-sessao/:id/manobras - Adicionar manobras em lote
app.post('/modelos-sessao/:id/manobras', async (c) => {
  console.log('🔍 [MODELOS] POST /modelos-sessao/:id/manobras chamado');
  try {
    const id = c.req.param('id');
    const body = await c.req.json();
    const { manobras, substituir } = body;

    if (!Array.isArray(manobras) || manobras.length === 0) {
      return c.json({ success: false, error: 'Lista de manobras é obrigatória' }, 400);
    }

    // Verificar se modelo existe
    const modelo = await c.env.DB.prepare(
      'SELECT id FROM modelos_sessao WHERE id = ? AND deleted_at IS NULL',
    )
      .bind(id)
      .first();

    if (!modelo) {
      return c.json({ success: false, error: 'Modelo não encontrado' }, 404);
    }

    // Se substituir=true, deletar manobras antigas (soft delete)
    if (substituir) {
      await c.env.DB.prepare(
        `UPDATE modelos_sessao_manobras 
         SET deleted_at = datetime('now') 
         WHERE modelo_id = ? AND deleted_at IS NULL`,
      )
        .bind(id)
        .run();
    }

    // Inserir novas manobras
    let inseridas = 0;
    for (let i = 0; i < manobras.length; i++) {
      const m = manobras[i];

      // Validar se manobra existe
      const manobraExiste = await c.env.DB.prepare(
        'SELECT id FROM manobras WHERE id = ? AND deleted_at IS NULL',
      )
        .bind(m.manobra_id)
        .first();

      if (!manobraExiste) {
        console.warn(`⚠️ Manobra ID ${m.manobra_id} não encontrada, ignorando`);
        continue;
      }

      const tripulanteVal = ['A', 'B', 'AB'].includes(String(m.tripulante || '').toUpperCase())
        ? String(m.tripulante).toUpperCase()
        : 'AB';
      await c.env.DB.prepare(
        `INSERT INTO modelos_sessao_manobras
         (modelo_id, manobra_id, ordem, obrigatoria, observacoes, tripulante, created_at)
         VALUES (?, ?, ?, ?, ?, ?, datetime('now'))`,
      )
        .bind(
          id,
          m.manobra_id,
          m.ordem || i + 1,
          m.obrigatoria !== undefined ? m.obrigatoria : 1,
          m.observacoes || null,
          tripulanteVal,
        )
        .run();

      inseridas++;
    }

    // Auditoria
    await audit(c.env.DB, {
      tabela: 'modelos_sessao_manobras',
      acao: 'INSERT_BATCH',
      registro_id: id,
      dados_novos: { total_inseridas: inseridas, substituir },
    });

    return c.json({ success: true, data: { inseridas } }, 201);
  } catch (e: any) {
    console.error('❌ [MODELOS] Erro POST manobras:', e.message);
    return c.json({ success: false, error: 'Erro interno do servidor' }, 500);
  }
});

// POST /api/simuladores/modelos-sessao/:id/clonar - Clonar modelo com checks e manobras
app.post('/modelos-sessao/:id/clonar', async (c) => {
  try {
    const id = c.req.param('id');

    const modeloOriginal = await c.env.DB.prepare(
      'SELECT * FROM modelos_sessao WHERE id = ? AND deleted_at IS NULL',
    )
      .bind(id)
      .first<any>();

    if (!modeloOriginal) {
      return c.json({ success: false, error: 'Modelo não encontrado' }, 404);
    }

    let cloneCodigoBase = `${String(modeloOriginal.codigo || 'MODELO').trim()}-CLONE`;
    let cloneCodigo = cloneCodigoBase;
    let suffix = 2;

    while (
      await c.env.DB.prepare(
        'SELECT id FROM modelos_sessao WHERE codigo = ? AND deleted_at IS NULL LIMIT 1',
      )
        .bind(cloneCodigo)
        .first()
    ) {
      cloneCodigo = `${cloneCodigoBase}-${suffix}`;
      suffix++;
    }

    const cloneNome = `${String(modeloOriginal.nome || 'Modelo').trim()} (Cópia)`;

    const colInfoClone = await c.env.DB.prepare('PRAGMA table_info(modelos_sessao)').all();
    const hasTipoColClone = (colInfoClone.results || []).some((r: any) => r.name === 'tipo');

    const cloneSql = hasTipoColClone
      ? `INSERT INTO modelos_sessao (
           codigo, nome, tipo_sessao_id, tipo, modelo_aeronave, descricao,
           duracao_estimada, gera_qualificacao, qualificacao_tipo_id, created_at, updated_at
         ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))`
      : `INSERT INTO modelos_sessao (
           codigo, nome, tipo_sessao_id, modelo_aeronave, descricao,
           duracao_estimada, gera_qualificacao, qualificacao_tipo_id, created_at, updated_at
         ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))`;

    const cloneBinds = hasTipoColClone
      ? [
          cloneCodigo,
          cloneNome,
          modeloOriginal.tipo_sessao_id || null,
          modeloOriginal.tipo || 'SIMULADOR',
          modeloOriginal.modelo_aeronave || null,
          modeloOriginal.descricao || null,
          modeloOriginal.duracao_estimada || 120,
          modeloOriginal.gera_qualificacao || 0,
          modeloOriginal.qualificacao_tipo_id || null,
        ]
      : [
          cloneCodigo,
          cloneNome,
          modeloOriginal.tipo_sessao_id || null,
          modeloOriginal.modelo_aeronave || null,
          modeloOriginal.descricao || null,
          modeloOriginal.duracao_estimada || 120,
          modeloOriginal.gera_qualificacao || 0,
          modeloOriginal.qualificacao_tipo_id || null,
        ];

    const cloneResult = await c.env.DB.prepare(cloneSql)
      .bind(...cloneBinds)
      .run();

    const novoModeloId = Number(cloneResult.meta.last_row_id || 0);

    const checks = await c.env.DB.prepare(
      `SELECT qualificacao_tipo_id
       FROM modelos_sessao_checks
       WHERE modelo_id = ? AND deleted_at IS NULL`,
    )
      .bind(id)
      .all<{ qualificacao_tipo_id: number }>();

    for (const check of checks.results || []) {
      await c.env.DB.prepare(
        `INSERT OR IGNORE INTO modelos_sessao_checks(modelo_id, qualificacao_tipo_id)
         VALUES (?, ?)`,
      )
        .bind(novoModeloId, check.qualificacao_tipo_id)
        .run();
    }

    const manobras = await c.env.DB.prepare(
      `SELECT manobra_id, ordem, obrigatoria, observacoes, tripulante
       FROM modelos_sessao_manobras
       WHERE modelo_id = ? AND deleted_at IS NULL
       ORDER BY ordem ASC`,
    )
      .bind(id)
      .all<any>();

    for (const manobra of manobras.results || []) {
      await c.env.DB.prepare(
        `INSERT INTO modelos_sessao_manobras (
          modelo_id, manobra_id, ordem, obrigatoria, observacoes, tripulante, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))`,
      )
        .bind(
          novoModeloId,
          manobra.manobra_id,
          manobra.ordem,
          manobra.obrigatoria,
          manobra.observacoes || null,
          manobra.tripulante || 'AB',
        )
        .run();
    }

    await audit(c.env.DB, {
      tabela: 'modelos_sessao',
      acao: 'CLONE',
      registro_id: novoModeloId,
      dados_anteriores: { origem_id: id, origem_codigo: modeloOriginal.codigo },
      dados_novos: { codigo: cloneCodigo, nome: cloneNome },
    });

    return c.json({
      success: true,
      data: { id: novoModeloId, codigo: cloneCodigo, nome: cloneNome },
    });
  } catch (e: any) {
    console.error('❌ [MODELOS] Erro POST clonar:', e.message);
    return c.json({ success: false, error: 'Erro interno do servidor' }, 500);
  }
});

// POST /api/simuladores/modelos-sessao/importar-relacoes - Importar relações modelo-manobra
app.post('/modelos-sessao/importar-relacoes', async (c) => {
  try {
    await ensureModelosSessaoModeloAeronaveColumn(c.env.DB);

    const body = await c.req.json();
    const dados = Array.isArray(body?.dados) ? body.dados : [];
    const autoCriar = body?.auto_criar !== false;

    if (dados.length === 0) {
      return c.json(
        {
          sucesso: false,
          resumo: {
            total_linhas: 0,
            relacoes_criadas: 0,
            modelos_auto_criados: 0,
            manobras_auto_criadas: 0,
            erros: 1,
          },
          detalhes: {
            modelos_criados: [],
            manobras_criadas: [],
            erros: [{ linha: 1, motivo: 'Nenhum dado informado para importação' }],
          },
        },
        400,
      );
    }

    const tipoSessaoPadraoId = await getTipoSessaoPadraoId(c.env.DB);

    const resultado = {
      sucesso: true,
      resumo: {
        total_linhas: dados.length,
        relacoes_criadas: 0,
        modelos_auto_criados: 0,
        manobras_auto_criadas: 0,
        erros: 0,
      },
      detalhes: {
        modelos_criados: [] as Array<{ codigo: string; nome: string; linha: number }>,
        manobras_criadas: [] as Array<{ codigo: string; nome: string; linha: number }>,
        erros: [] as Array<{ linha: number; motivo: string }>,
      },
    };

    const normalizeCode = (value: unknown) =>
      String(value || '')
        .trim()
        .toUpperCase();
    const normalizeText = (value: unknown) => {
      const text = String(value || '').trim();
      return text ? text : null;
    };
    const normalizeFlag = (value: unknown) => {
      const normalized = String(value || '')
        .trim()
        .toUpperCase();
      return ['1', 'SIM', 'S', 'TRUE', 'YES', 'Y'].includes(normalized) ? 1 : 0;
    };

    for (let index = 0; index < dados.length; index++) {
      const linha = index + 2;
      const row = dados[index] as Record<string, unknown>;

      const modeloCodigo = normalizeCode(row.modelo_codigo);
      const manobraCodigo = normalizeCode(row.manobra_codigo);
      const ordem = Number(row.ordem || index + 1);

      if (!modeloCodigo || !manobraCodigo) {
        resultado.resumo.erros++;
        resultado.detalhes.erros.push({
          linha,
          motivo: 'Campos obrigatórios ausentes: modelo_codigo e manobra_codigo',
        });
        continue;
      }

      if (!Number.isInteger(ordem) || ordem <= 0) {
        resultado.resumo.erros++;
        resultado.detalhes.erros.push({
          linha,
          motivo: 'Campo ordem inválido. Informe um inteiro maior que zero.',
        });
        continue;
      }

      let modelo = await c.env.DB.prepare(
        `SELECT id, codigo, nome
         FROM modelos_sessao
         WHERE UPPER(TRIM(codigo)) = ? AND deleted_at IS NULL
         LIMIT 1`,
      )
        .bind(modeloCodigo)
        .first<any>();

      if (!modelo) {
        if (!autoCriar) {
          resultado.resumo.erros++;
          resultado.detalhes.erros.push({
            linha,
            motivo: `Modelo ${modeloCodigo} não encontrado`,
          });
          continue;
        }

        const modeloNome = normalizeText(row.modelo_nome) || `Modelo ${modeloCodigo}`;
        const modeloAeronave = normalizeText(row.modelo_aeronave) || normalizeText(row.modelo_tipo);
        const duracaoEstimada = Number(row.modelo_duracao || row.duracao_estimada || 120);

        const insertModelo = await c.env.DB.prepare(
          `INSERT INTO modelos_sessao (
            codigo, nome, tipo_sessao_id, modelo_aeronave, descricao,
            duracao_estimada, gera_qualificacao, created_at, updated_at
          ) VALUES (?, ?, ?, ?, ?, ?, 0, datetime('now'), datetime('now'))`,
        )
          .bind(
            modeloCodigo,
            modeloNome,
            tipoSessaoPadraoId,
            modeloAeronave,
            'Importado automaticamente via planilha de relações modelo-manobra',
            Number.isFinite(duracaoEstimada) && duracaoEstimada > 0 ? duracaoEstimada : 120,
          )
          .run();

        modelo = {
          id: Number(insertModelo.meta.last_row_id || 0),
          codigo: modeloCodigo,
          nome: modeloNome,
        };
        resultado.resumo.modelos_auto_criados++;
        resultado.detalhes.modelos_criados.push({
          codigo: modeloCodigo,
          nome: modeloNome,
          linha,
        });
      }

      let manobra = await c.env.DB.prepare(
        `SELECT id, codigo, nome
         FROM manobras
         WHERE UPPER(TRIM(codigo)) = ? AND deleted_at IS NULL
         LIMIT 1`,
      )
        .bind(manobraCodigo)
        .first<any>();

      if (!manobra) {
        if (!autoCriar) {
          resultado.resumo.erros++;
          resultado.detalhes.erros.push({
            linha,
            motivo: `Manobra ${manobraCodigo} não encontrada`,
          });
          continue;
        }

        const manobraNome = normalizeText(row.manobra_nome) || `Manobra ${manobraCodigo}`;
        const manobraDescricao = normalizeText(row.manobra_descricao) || manobraNome;
        const categoria = normalizeText(row.manobra_categoria) || 'GERAL';
        const tempoEstimado = Number(row.tempo_estimado_min || row.tempo_estimado || 0);

        const insertManobra = await c.env.DB.prepare(
          `INSERT INTO manobras (
            codigo, nome, descricao, categoria, tipo_sessao, tempo_estimado, created_at, updated_at
          ) VALUES (?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))`,
        )
          .bind(
            manobraCodigo,
            manobraNome,
            manobraDescricao,
            categoria,
            normalizeText(row.manobra_tipo),
            Number.isFinite(tempoEstimado) && tempoEstimado > 0 ? tempoEstimado : null,
          )
          .run();

        manobra = {
          id: Number(insertManobra.meta.last_row_id || 0),
          codigo: manobraCodigo,
          nome: manobraNome,
        };
        resultado.resumo.manobras_auto_criadas++;
        resultado.detalhes.manobras_criadas.push({
          codigo: manobraCodigo,
          nome: manobraNome,
          linha,
        });
      }

      const relacaoAtiva = await c.env.DB.prepare(
        `SELECT id
         FROM modelos_sessao_manobras
         WHERE modelo_id = ? AND manobra_id = ? AND deleted_at IS NULL
         LIMIT 1`,
      )
        .bind(modelo.id, manobra.id)
        .first<{ id: number }>();

      const observacoes = normalizeText(row.observacoes);
      const tripulante = ['A', 'B', 'AB'].includes(String(row.tripulante || '').toUpperCase())
        ? String(row.tripulante).toUpperCase()
        : 'AB';
      const obrigatoria = normalizeFlag(row.obrigatoria);

      if (relacaoAtiva) {
        await c.env.DB.prepare(
          `UPDATE modelos_sessao_manobras
           SET ordem = ?, obrigatoria = ?, observacoes = ?, tripulante = ?, updated_at = datetime('now')
           WHERE id = ?`,
        )
          .bind(ordem, obrigatoria, observacoes, tripulante, relacaoAtiva.id)
          .run();
        continue;
      }

      const relacaoSoftDeleted = await c.env.DB.prepare(
        `SELECT id
         FROM modelos_sessao_manobras
         WHERE modelo_id = ? AND manobra_id = ? AND deleted_at IS NOT NULL
         ORDER BY id DESC
         LIMIT 1`,
      )
        .bind(modelo.id, manobra.id)
        .first<{ id: number }>();

      if (relacaoSoftDeleted) {
        await c.env.DB.prepare(
          `UPDATE modelos_sessao_manobras
           SET deleted_at = NULL,
               ordem = ?,
               obrigatoria = ?,
               observacoes = ?,
               tripulante = ?,
               updated_at = datetime('now')
           WHERE id = ?`,
        )
          .bind(ordem, obrigatoria, observacoes, tripulante, relacaoSoftDeleted.id)
          .run();

        resultado.resumo.relacoes_criadas++;
        continue;
      }

      await c.env.DB.prepare(
        `INSERT INTO modelos_sessao_manobras (
          modelo_id, manobra_id, ordem, obrigatoria, observacoes, tripulante, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))`,
      )
        .bind(modelo.id, manobra.id, ordem, obrigatoria, observacoes, tripulante)
        .run();

      resultado.resumo.relacoes_criadas++;
    }

    resultado.sucesso = resultado.resumo.erros === 0;

    await audit(c.env.DB, {
      tabela: 'modelos_sessao_manobras',
      acao: 'IMPORT',
      registro_id: 0,
      dados_novos: resultado.resumo,
    });

    return c.json(resultado, resultado.sucesso ? 200 : 207);
  } catch (e: any) {
    console.error('❌ [MODELOS] Erro POST importar relações:', e.message);
    return c.json(
      {
        sucesso: false,
        resumo: {
          total_linhas: 0,
          relacoes_criadas: 0,
          modelos_auto_criados: 0,
          manobras_auto_criadas: 0,
          erros: 1,
        },
        detalhes: {
          modelos_criados: [],
          manobras_criadas: [],
          erros: [{ linha: 0, motivo: e.message }],
        },
      },
      500,
    );
  }
});

// PUT /api/simuladores/modelos-sessao/:id - Atualizar modelo
app.put('/modelos-sessao/:id', async (c) => {
  console.log('🔍 [MODELOS] PUT /modelos-sessao/:id chamado');
  try {
    await ensureModelosSessaoModeloAeronaveColumn(c.env.DB);

    const id = c.req.param('id');
    const body = await c.req.json();
    const {
      codigo,
      nome,
      tipo_sessao_id,
      tipo,
      modelo_aeronave,
      descricao,
      duracao_estimada,
      gera_qualificacao,
      qualificacao_tipo_id,
      checks_ids,
    } = body;

    // Buscar modelo atual
    const anterior = await c.env.DB.prepare(
      'SELECT * FROM modelos_sessao WHERE id = ? AND deleted_at IS NULL',
    )
      .bind(id)
      .first();

    if (!anterior) {
      return c.json({ success: false, error: 'Modelo não encontrado' }, 404);
    }

    // Verificar duplicidade de código (se mudou)
    if (codigo && codigo !== anterior.codigo) {
      const existe = await c.env.DB.prepare(
        'SELECT id FROM modelos_sessao WHERE codigo = ? AND id != ? AND deleted_at IS NULL',
      )
        .bind(codigo, id)
        .first();

      if (existe) {
        return c.json(
          { success: false, error: `Já existe outro modelo com o código "${codigo}"` },
          409,
        );
      }
    }

    const modeloAeronaveFinal =
      modelo_aeronave !== undefined ? modelo_aeronave : (anterior as any).modelo_aeronave;
    let checksIdsNormalizados: number[] | undefined;
    if (Array.isArray(checks_ids)) {
      try {
        checksIdsNormalizados = await normalizeChecksIdsModelo(
          c.env.DB,
          checks_ids,
          modeloAeronaveFinal,
        );
      } catch (error: any) {
        return c.json({ success: false, error: 'Checks inválidos' }, 400);
      }
    }
    const newQualifTipoId =
      qualificacao_tipo_id !== undefined
        ? qualificacao_tipo_id
        : (anterior as any).qualificacao_tipo_id;

    // Verificar se a coluna tipo já existe (adicionada pela migration 0363)
    const colInfoPut = await c.env.DB.prepare('PRAGMA table_info(modelos_sessao)').all();
    const hasTipoColPut = (colInfoPut.results || []).some((r: any) => r.name === 'tipo');

    // Atualizar
    const updateSql = hasTipoColPut
      ? `UPDATE modelos_sessao
         SET codigo = ?, nome = ?, tipo_sessao_id = ?, tipo = ?, modelo_aeronave = ?, descricao = ?,
             duracao_estimada = ?, gera_qualificacao = ?, qualificacao_tipo_id = ?, updated_at = datetime('now')
         WHERE id = ?`
      : `UPDATE modelos_sessao
         SET codigo = ?, nome = ?, tipo_sessao_id = ?, modelo_aeronave = ?, descricao = ?,
             duracao_estimada = ?, gera_qualificacao = ?, qualificacao_tipo_id = ?, updated_at = datetime('now')
         WHERE id = ?`;

    const tipoFinal =
      tipo !== undefined
        ? tipo
        : (anterior as any).tipo || 'SIMULADOR';

    const updateBinds = hasTipoColPut
      ? [
          codigo || anterior.codigo,
          nome || anterior.nome,
          tipo_sessao_id || anterior.tipo_sessao_id,
          tipoFinal,
          modelo_aeronave !== undefined ? modelo_aeronave : anterior.modelo_aeronave,
          descricao !== undefined ? descricao : anterior.descricao,
          duracao_estimada !== undefined ? duracao_estimada : anterior.duracao_estimada,
          gera_qualificacao !== undefined ? gera_qualificacao : (anterior as any).gera_qualificacao || 0,
          newQualifTipoId || null,
          id,
        ]
      : [
          codigo || anterior.codigo,
          nome || anterior.nome,
          tipo_sessao_id || anterior.tipo_sessao_id,
          modelo_aeronave !== undefined ? modelo_aeronave : anterior.modelo_aeronave,
          descricao !== undefined ? descricao : anterior.descricao,
          duracao_estimada !== undefined ? duracao_estimada : anterior.duracao_estimada,
          gera_qualificacao !== undefined ? gera_qualificacao : (anterior as any).gera_qualificacao || 0,
          newQualifTipoId || null,
          id,
        ];

    await c.env.DB.prepare(updateSql)
      .bind(...updateBinds)
      .run();

    // Sincronizar checks FAP padrão se enviados
    if (Array.isArray(checks_ids)) {
      // Soft-delete todos os checks atuais
      await c.env.DB.prepare(
        `UPDATE modelos_sessao_checks SET deleted_at = datetime('now') WHERE modelo_id = ? AND deleted_at IS NULL`,
      )
        .bind(id)
        .run();
      // Reinserir os selecionados
      for (const qtId of checksIdsNormalizados || []) {
        await c.env.DB.prepare(
          `INSERT INTO modelos_sessao_checks(modelo_id, qualificacao_tipo_id) VALUES (?, ?)
           ON CONFLICT(modelo_id, qualificacao_tipo_id) DO UPDATE SET deleted_at = NULL, updated_at = datetime('now')`,
        )
          .bind(id, qtId)
          .run();
      }
    }

    // Auditoria
    await audit(c.env.DB, {
      tabela: 'modelos_sessao',
      acao: 'UPDATE',
      registro_id: id,
      dados_anteriores: anterior,
      dados_novos: { codigo, nome, tipo_sessao_id, descricao, duracao_estimada, gera_qualificacao },
    });

    // Busca o registro atualizado
    const { results: atualizado } = await c.env.DB.prepare(
      'SELECT * FROM modelos_sessao WHERE id = ? AND deleted_at IS NULL',
    )
      .bind(id)
      .all();

    return c.json({
      success: true,
      data: atualizado && atualizado.length > 0 ? atualizado[0] : null,
    });
  } catch (e: any) {
    console.error('❌ [MODELOS] Erro PUT:', e.message);
    return c.json({ success: false, error: 'Erro interno do servidor' }, 500);
  }
});

// DELETE /api/simuladores/modelos-sessao/:id - Excluir modelo (soft delete)
app.delete('/modelos-sessao/:id', async (c) => {
  console.log('🔍 [MODELOS] DELETE /modelos-sessao/:id chamado');
  try {
    const denied = requireAdminForDelete(c);
    if (denied) return denied;

    const id = c.req.param('id');

    // Verificar se existe
    const modelo = await c.env.DB.prepare(
      'SELECT * FROM modelos_sessao WHERE id = ? AND deleted_at IS NULL',
    )
      .bind(id)
      .first();

    if (!modelo) {
      return c.json({ success: false, error: 'Modelo não encontrado' }, 404);
    }

    // Soft delete
    await c.env.DB.prepare(`UPDATE modelos_sessao SET deleted_at = datetime('now') WHERE id = ?`)
      .bind(id)
      .run();

    // Soft delete das manobras associadas
    await c.env.DB.prepare(
      `UPDATE modelos_sessao_manobras 
       SET deleted_at = datetime('now') 
       WHERE modelo_id = ? AND deleted_at IS NULL`,
    )
      .bind(id)
      .run();

    // Auditoria
    await audit(c.env.DB, {
      tabela: 'modelos_sessao',
      acao: 'DELETE',
      registro_id: id,
      dados_anteriores: modelo,
    });

    return c.json({ success: true, message: 'Modelo excluído com sucesso' });
  } catch (e: any) {
    console.error('❌ [MODELOS] Erro DELETE:', e.message);
    return c.json({ success: false, error: 'Erro interno do servidor' }, 500);
  }
});

// ==========================================================================
// MANUTENÇÃO
// ==========================================================================

// POST /api/simuladores/fix/modelos-periodicos - Repair: Atualizar modelo_aeronave
app.post('/fix/modelos-periodicos', async (c) => {
  try {
    console.log('🔧 [FIX] Iniciando reparo de modelos periódicos...');

    // 1. Atualizar modelos periódicos AW139 SEM modelo_aeronave
    const result1 = await c.env.DB.prepare(
      `UPDATE modelos_sessao 
       SET modelo_aeronave = 'AW139'
       WHERE tipo_sessao_id = 9
         AND tipo_aeronave = 'AW139'
         AND (modelo_aeronave IS NULL OR modelo_aeronave = '')
         AND deleted_at IS NULL`,
    ).run();

    // 2. Atualizar modelos periódicos SEM tipo_aeronave (CHECK FINAL) - defaultar para AW139
    const result2 = await c.env.DB.prepare(
      `UPDATE modelos_sessao 
       SET modelo_aeronave = 'AW139', tipo_aeronave = 'AW139'
       WHERE tipo_sessao_id = 9
         AND (tipo_aeronave IS NULL OR tipo_aeronave = '')
         AND deleted_at IS NULL`,
    ).run();

    console.log(`✅ [FIX] Atualizado batch 1: ${result1.meta.changes} registros`);
    console.log(`✅ [FIX] Atualizado batch 2: ${result2.meta.changes} registros`);

    // Verificar resultados
    const verificacao = await c.env.DB.prepare(
      `SELECT COUNT(*) as total, 
              COUNT(CASE WHEN modelo_aeronave = 'AW139' THEN 1 END) as com_codigo
       FROM modelos_sessao
       WHERE tipo_sessao_id = 9
         AND deleted_at IS NULL`,
    ).first();

    return c.json({
      success: true,
      message: 'Modelos periódicos reparados com sucesso',
      changes: (result1.meta.changes || 0) + (result2.meta.changes || 0),
      verification: verificacao,
    });
  } catch (e: any) {
    console.error('❌ [FIX] Erro:', e.message);
    return c.json({ success: false, error: 'Erro interno do servidor' }, 500);
  }
});

export default app;
