/**
 * SIMULADORES — Modelos e Tipos de Sessão
 * Routes: GET/POST/PUT/DELETE /tipos-sessao, /tipos-sessao/:id,
 *         GET/POST/PUT/DELETE /modelos-sessao, /modelos-sessao/:id,
 *         GET /modelos-sessao/:id/manobras, POST /modelos-sessao/:id/manobras,
 *         POST /fix/modelos-periodicos
 */

import { Hono } from 'hono';
import type { Env } from '../types';
import { auth } from '../middleware/auth';
import { getTenantContext } from '../middleware/tenant';
import { sanitizeModeloSessaoObservacoesForStorage, validateModeloSessaoObservacoesInput } from '../../../src/shared/simuladores/modelos-sessao-observacoes';
import {
  TipoSessaoSchema,
  ModeloSessaoSchema,
  requireAdminForDelete,
  audit,
  filtrarChecksCompativeisComModelo,
  listarTiposCheckPorIds,
  normalizeModeloAeronave,
} from './simuladores-shared';
import { requireRole } from '../middleware/rbac';
import { requireOperacoes } from './simuladores-modelos-rbac';

const app = new Hono<{ Bindings: Env }>();
app.use('*', auth());

function getEmpresaIdFromRequest(c: Parameters<typeof getTenantContext>[0]): number {
  return getTenantContext(c).empresaId;
}

/**
 * Compatibility gate for additive migrations. A missing table is a supported
 * legacy schema; an unreadable schema is an operational error and must reach
 * the route handler rather than silently exposing legacy data.
 */
async function optionalTableExists(db: D1Database, tableName: string): Promise<boolean> {
  const row = await db
    .prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = ?")
    .bind(tableName)
    .first<{ name: string }>();
  return row?.name === tableName;
}

function validateObservacoesBatchInput(
  manobras: Array<{ observacoes?: unknown }>,
): { ok: true; values: Array<string | null> } | { ok: false; error: string } {
  const values: Array<string | null> = [];
  for (let index = 0; index < manobras.length; index++) {
    const validation = validateModeloSessaoObservacoesInput(manobras[index]?.observacoes);
    if (!validation.ok) {
      return {
        ok: false,
        error: `manobras[${index}].${validation.error}`,
      };
    }
    values.push(validation.value);
  }

  return { ok: true, values };
}

async function normalizeChecksIdsModelo(
  db: D1Database,
  empresaId: number,
  checksIds: number[],
  modeloAeronave: string | null | undefined,
) {
  const idsUnicos = Array.from(
    new Set(checksIds.map((id) => Number(id)).filter((id) => Number.isInteger(id) && id > 0)),
  );
  const checksEncontrados = await listarTiposCheckPorIds(db, idsUnicos, empresaId);

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

function normalizeTipoSessaoToken(value: unknown): string {
  const normalized = String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .toUpperCase();
  const compact = normalized.replace(/[^A-Z0-9]/g, '');
  if (!compact) return '';
  if (compact === 'INI' || compact.includes('INICIAL')) return 'INI';
  if (compact === 'PER' || compact.includes('PERIOD') || compact.includes('RECORR')) return 'PER';
  if (compact === 'OPC' || compact.includes('PROFICIENCY') || compact.includes('CHECK')) return 'OPC';
  if (compact === 'SEM' || compact.includes('SEMEST')) return 'SEM';
  if (compact === 'EXA' || compact.includes('EXAM')) return 'EXA';
  if (compact === 'INS' || compact.includes('INSTR')) return 'INS';
  return compact;
}

function buildTipoSessaoFallbackSql(
  tipoSessaoCodigo: string,
  tipoSessaoNome: string,
): { clauses: string[]; params: any[] } {
  const canonical = normalizeTipoSessaoToken(tipoSessaoCodigo || tipoSessaoNome);
  if (!canonical) return { clauses: [], params: [] };

  const clauses: string[] = [];
  const params: any[] = [];
  const compactExprTsCodigo =
    "REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(UPPER(TRIM(COALESCE(ts.codigo, ''))), ' ', ''), '-', ''), '_', ''), '/', ''), '.', '')";
  const compactExprTsNome =
    "REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(UPPER(TRIM(COALESCE(ts.nome, ''))), ' ', ''), '-', ''), '_', ''), '/', ''), '.', '')";
  const compactExprMsTipo =
    "REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(UPPER(TRIM(COALESCE(ms.tipo, ''))), ' ', ''), '-', ''), '_', ''), '/', ''), '.', '')";

  const addCompactMatches = (values: string[]) => {
    values.forEach((value) => {
      clauses.push(`${compactExprTsCodigo} = ?`);
      params.push(value);
      clauses.push(`${compactExprTsNome} = ?`);
      params.push(value);
      clauses.push(`${compactExprMsTipo} = ?`);
      params.push(value);
    });
  };

  const addLikeMatches = (patterns: string[]) => {
    patterns.forEach((pattern) => {
      clauses.push("UPPER(TRIM(COALESCE(ts.nome, ''))) LIKE ?");
      params.push(pattern);
      clauses.push("UPPER(TRIM(COALESCE(ms.tipo, ''))) LIKE ?");
      params.push(pattern);
    });
  };

  switch (canonical) {
    case 'INI':
      addCompactMatches(['INI', 'INICIAL', 'TREINAMENTOINICIAL']);
      addLikeMatches(['INI%', '%INICIAL%']);
      break;
    case 'PER':
      addCompactMatches(['PER', 'PERIODICO', 'RECORRENTE', 'RECURRENTE']);
      addLikeMatches(['PER%', '%PERIOD%', 'RECORR%']);
      break;
    case 'OPC':
      addCompactMatches(['OPC', 'PROFICIENCYCHECK']);
      addLikeMatches(['OPC%', '%PROFICIENCY%', '%CHECK%']);
      break;
    case 'SEM':
      addCompactMatches(['SEM', 'SEMESTRAL']);
      addLikeMatches(['SEM%', '%SEMEST%']);
      break;
    case 'EXA':
      addCompactMatches(['EXA', 'EXAMINADOR', 'EXAME']);
      addLikeMatches(['EXA%', '%EXAM%']);
      break;
    case 'INS':
      addCompactMatches(['INS', 'INSTRUTOR', 'INSTRUCAO']);
      addLikeMatches(['INS%', '%INSTR%']);
      break;
    default:
      addCompactMatches([canonical]);
      break;
  }

  return { clauses, params };
}

// ==========================================================================
// CRUD: TIPOS DE SESSÃO
// ==========================================================================

// GET /api/simuladores/tipos-sessao - Listar tipos de sessão
app.get('/tipos-sessao', async (c) => {
  console.log('🔍 [TIPOS] GET /tipos-sessao chamado');
  try {
    const empresaId = getEmpresaIdFromRequest(c);
    const result = await c.env.DB.prepare(
      'SELECT * FROM tipos_sessao WHERE deleted_at IS NULL AND empresa_id = ? ORDER BY codigo',
    )
      .bind(empresaId)
      .all();

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
    const empresaId = getEmpresaIdFromRequest(c);
    const id = c.req.param('id');
    const result = await c.env.DB.prepare(
      'SELECT * FROM tipos_sessao WHERE id = ? AND deleted_at IS NULL AND empresa_id = ?',
    )
      .bind(id, empresaId)
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
app.post('/tipos-sessao', requireRole('admin', 'manager'), requireOperacoes('create'), async (c) => {
  try {
    const empresaId = getEmpresaIdFromRequest(c);
    const parsed = TipoSessaoSchema.safeParse(await c.req.json());
    if (!parsed.success) {
      return c.json(
        { success: false, error: parsed.error.errors[0]?.message ?? 'Dados inválidos' },
        400,
      );
    }
    const { codigo, nome, descricao, cor } = parsed.data;
    const tiposCols = await c.env.DB.prepare('PRAGMA table_info(tipos_sessao)').all();
    const hasCorCol = (tiposCols.results || []).some((row: any) => String(row?.name || '') === 'cor');

    // Verificar duplicidade
    const existe = await c.env.DB.prepare(
      'SELECT id FROM tipos_sessao WHERE codigo = ? AND deleted_at IS NULL AND empresa_id = ?',
    )
      .bind(codigo, empresaId)
      .first();

    if (existe) {
      return c.json({ success: false, error: 'Já existe um tipo com este código' }, 400);
    }

    // Inserir
    const result = hasCorCol
      ? await c.env.DB.prepare(
          "INSERT INTO tipos_sessao (codigo, nome, descricao, cor, empresa_id, created_at, updated_at) VALUES (?, ?, ?, ?, ?, datetime('now'), datetime('now'))",
        )
          .bind(codigo, nome, descricao || null, cor || null, empresaId)
          .run()
      : await c.env.DB.prepare(
          "INSERT INTO tipos_sessao (codigo, nome, descricao, empresa_id, created_at, updated_at) VALUES (?, ?, ?, ?, datetime('now'), datetime('now'))",
        )
          .bind(codigo, nome, descricao || null, empresaId)
          .run();

    await audit(c.env.DB, {
      tabela: 'tipos_sessao',
      acao: 'INSERT',
      registro_id: result.meta.last_row_id,
      dados_novos: { codigo, nome, descricao, cor: cor || null },
    });

    return c.json({
      success: true,
      data: { id: result.meta.last_row_id, codigo, nome, descricao, cor: cor || null },
    });
  } catch (e: any) {
    return c.json({ success: false, error: 'Erro interno do servidor' }, 500);
  }
});

// PUT /api/simuladores/tipos-sessao/:id - Atualizar tipo de sessão
app.put('/tipos-sessao/:id', requireRole('admin', 'manager'), requireOperacoes('update'), async (c) => {
  try {
    const empresaId = getEmpresaIdFromRequest(c);
    const id = c.req.param('id');
    const parsed = TipoSessaoSchema.safeParse(await c.req.json());
    if (!parsed.success) {
      return c.json(
        { success: false, error: parsed.error.errors[0]?.message ?? 'Dados inválidos' },
        400,
      );
    }
    const { codigo, nome, descricao, cor } = parsed.data;
    const tiposCols = await c.env.DB.prepare('PRAGMA table_info(tipos_sessao)').all();
    const hasCorCol = (tiposCols.results || []).some((row: any) => String(row?.name || '') === 'cor');

    // Buscar dados anteriores
    const anterior = await c.env.DB.prepare(
      'SELECT * FROM tipos_sessao WHERE id = ? AND deleted_at IS NULL AND empresa_id = ?',
    )
      .bind(id, empresaId)
      .first();

    if (!anterior) {
      return c.json({ success: false, error: 'Tipo não encontrado' }, 404);
    }

    // Verificar duplicidade (exceto próprio registro)
    const existe = await c.env.DB.prepare(
      'SELECT id FROM tipos_sessao WHERE codigo = ? AND id != ? AND deleted_at IS NULL AND empresa_id = ?',
    )
      .bind(codigo, id, empresaId)
      .first();

    if (existe) {
      return c.json({ success: false, error: 'Já existe outro tipo com este código' }, 400);
    }

    // Atualizar
    if (hasCorCol) {
      await c.env.DB.prepare(
        "UPDATE tipos_sessao SET codigo = ?, nome = ?, descricao = ?, cor = ?, updated_at = datetime('now') WHERE id = ? AND empresa_id = ?",
      )
        .bind(codigo, nome, descricao || null, cor || null, id, empresaId)
        .run();
    } else {
      await c.env.DB.prepare(
        "UPDATE tipos_sessao SET codigo = ?, nome = ?, descricao = ?, updated_at = datetime('now') WHERE id = ? AND empresa_id = ?",
      )
        .bind(codigo, nome, descricao || null, id, empresaId)
        .run();
    }

    await audit(c.env.DB, {
      tabela: 'tipos_sessao',
      acao: 'UPDATE',
      registro_id: id,
      dados_anteriores: anterior,
      dados_novos: { codigo, nome, descricao, cor: cor || null },
    });

    return c.json({ success: true, data: { id, codigo, nome, descricao, cor: cor || null } });
  } catch (e: any) {
    return c.json({ success: false, error: 'Erro interno do servidor' }, 500);
  }
});

// DELETE /api/simuladores/tipos-sessao/:id - Excluir tipo de sessão (soft delete)
app.delete('/tipos-sessao/:id', requireRole('admin', 'manager'), requireOperacoes('delete'), async (c) => {
  try {
    const empresaId = getEmpresaIdFromRequest(c);
    const denied = requireAdminForDelete(c);
    if (denied) return denied;

    const id = c.req.param('id');

    // Buscar dados anteriores
    const anterior = await c.env.DB.prepare(
      'SELECT * FROM tipos_sessao WHERE id = ? AND deleted_at IS NULL AND empresa_id = ?',
    )
      .bind(id, empresaId)
      .first();

    if (!anterior) {
      return c.json({ success: false, error: 'Tipo não encontrado' }, 404);
    }

    // Soft delete
    await c.env.DB.prepare(
      "UPDATE tipos_sessao SET deleted_at = datetime('now'), updated_at = datetime('now') WHERE id = ? AND empresa_id = ?",
    )
      .bind(id, empresaId)
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

async function normalizeModelosSessaoModeloAeronave(db: D1Database, empresaId: number) {
  try {
    const col = await db.prepare('PRAGMA table_info(modelos_sessao)').all();
    const columns = (col.results || []).map((r: any) => r.name);
    const hasModeloAeronave = columns.includes('modelo_aeronave');
    const hasCodigoAeronave = columns.includes('codigo_aeronave');
    const hasTipoAeronave = columns.includes('tipo_aeronave');

    if (!hasModeloAeronave) return;

    const coalesceCols = [
      hasModeloAeronave ? 'modelo_aeronave' : null,
      hasCodigoAeronave ? 'codigo_aeronave' : null,
      hasTipoAeronave ? 'tipo_aeronave' : null,
    ].filter(Boolean) as string[];

    await db
      .prepare(
        `UPDATE modelos_sessao
         SET modelo_aeronave = COALESCE(${coalesceCols.join(', ')})
         WHERE empresa_id = ?
           AND (modelo_aeronave IS NULL OR modelo_aeronave = '')`,
      )
      .bind(empresaId)
      .run();
  } catch (e: any) {
    console.warn('[normalizeModelosSessaoModeloAeronave] Falha:', e?.message || String(e));
  }
}

async function getTipoSessaoPadraoId(db: D1Database, empresaId: number): Promise<number | null> {
  const tipoSessao = await db
    .prepare(
      `SELECT id
       FROM tipos_sessao
       WHERE deleted_at IS NULL
         AND empresa_id = ?
       ORDER BY CASE
         WHEN UPPER(COALESCE(codigo, '')) LIKE '%RECOR%' THEN 2
         ELSE 1
       END,
       id ASC
       LIMIT 1`,
    )
    .bind(empresaId)
    .first<{ id: number }>();

  return tipoSessao?.id ? Number(tipoSessao.id) : null;
}

async function ensureTipoSessaoBelongsToEmpresa(
  db: D1Database,
  tipoSessaoId: number | null | undefined,
  empresaId: number,
): Promise<boolean> {
  if (!tipoSessaoId) return true;
  const result = await db
    .prepare(
      'SELECT id FROM tipos_sessao WHERE id = ? AND deleted_at IS NULL AND empresa_id = ? LIMIT 1',
    )
    .bind(tipoSessaoId, empresaId)
    .first();
  return Boolean(result);
}

async function ensureQualificacaoTipoBelongsToEmpresa(
  db: D1Database,
  qualificacaoTipoId: number | null | undefined,
  empresaId: number,
): Promise<boolean> {
  if (!qualificacaoTipoId) return true;
  const result = await db
    .prepare(
      `SELECT id
       FROM qualificacoes_tipos
       WHERE id = ?
         AND deleted_at IS NULL
         AND empresa_id = ?
       LIMIT 1`,
    )
    .bind(qualificacaoTipoId, empresaId)
    .first();
  return Boolean(result);
}

// GET /api/simuladores/modelos-sessao - Listar modelos de sessão
app.get('/modelos-sessao', async (c) => {
  console.log('🔍 [MODELOS] GET /modelos-sessao chamado');
  try {
    const empresaId = getEmpresaIdFromRequest(c);
    c.header('Cache-Control', 'no-store, no-cache, must-revalidate, max-age=0');
    c.header('Pragma', 'no-cache');

    await normalizeModelosSessaoModeloAeronave(c.env.DB, empresaId);

    const col = await c.env.DB.prepare('PRAGMA table_info(modelos_sessao)').all();
    const columns = (col.results || []).map((r: any) => r.name);
    const hasQualificacaoTipoId = columns.includes('qualificacao_tipo_id');
    const hasVersioningTable = await optionalTableExists(c.env.DB, 'modelos_sessao_versionamento');
    const versioningJoin = hasVersioningTable
      ? 'INNER JOIN modelos_sessao_versionamento msv ON msv.modelo_id = ms.id AND msv.empresa_id = ms.empresa_id AND msv.is_current = 1'
      : '';
    const versioningSelect = hasVersioningTable
      ? ', msv.codigo_canonico, msv.versao_matriz, msv.versao_numero, msv.efetivo_em, msv.efetivo_ate'
      : ', ms.codigo as codigo_canonico, NULL as versao_matriz, NULL as versao_numero, NULL as efetivo_em, NULL as efetivo_ate';
    const filtroModeloExpr = [
      columns.includes('modelo_aeronave') ? 'ms.modelo_aeronave' : null,
      columns.includes('codigo_aeronave') ? 'ms.codigo_aeronave' : null,
      columns.includes('tipo_aeronave') ? 'ms.tipo_aeronave' : null,
    ]
      .filter(Boolean)
      .join(', ');
    const modeloAeronaveExpr = filtroModeloExpr ? `COALESCE(${filtroModeloExpr}, '')` : "''";

    // Tenant columns are security invariants, not optional compatibility hints.
    // If schema introspection fails or either column is absent, let the route fail
    // closed instead of silently dropping tenant predicates from the JOINs.
    const qtCol = await c.env.DB.prepare('PRAGMA table_info(qualificacoes_tipos)').all();
    const hasQualificacoesEmpresaId = (qtCol.results || []).some(
      (r: { name?: unknown }) => String(r.name || '') === 'empresa_id',
    );
    const tsCol = await c.env.DB.prepare('PRAGMA table_info(tipos_sessao)').all();
    const hasTiposEmpresaId = (tsCol.results || []).some(
      (r: { name?: unknown }) => String(r.name || '') === 'empresa_id',
    );
    if (!hasQualificacoesEmpresaId || !hasTiposEmpresaId) {
      throw new Error('SIMULADORES_TENANT_SCHEMA_REQUIRED');
    }

    const tiposJoinOn = 'ms.tipo_sessao_id = ts.id AND ts.empresa_id = ?';
    const qualificacaoJoin = hasQualificacaoTipoId
      ? 'LEFT JOIN qualificacoes_tipos qt ON ms.qualificacao_tipo_id = qt.id AND qt.empresa_id = ?'
      : '';
    const qualificacaoSelect = hasQualificacaoTipoId
      ? `,
        qt.nome as qualificacao_tipo_nome,
        qt.codigo as qualificacao_tipo_codigo`
      : `,
        NULL as qualificacao_tipo_nome,
        NULL as qualificacao_tipo_codigo`;

    const tipo_sessao_id = c.req.query('tipo_sessao_id');
    const tipoSessaoCodigo = String(
      c.req.query('tipo_sessao_codigo') || c.req.query('tipo_sessao') || '',
    )
      .trim()
      .toUpperCase();
    const tipoSessaoNome = String(c.req.query('tipo_sessao_nome') || '').trim().toUpperCase();
    const tipo = c.req.query('tipo'); // SIMULADOR | AERONAVE
    const ativo = c.req.query('ativo');
    const qualificacaoTipoIdRaw = c.req.query('qualificacao_tipo_id');
    const qualificacaoTipoId = qualificacaoTipoIdRaw
      ? Number(qualificacaoTipoIdRaw)
      : null;
    if (
      qualificacaoTipoIdRaw &&
      (!Number.isInteger(qualificacaoTipoId) || Number(qualificacaoTipoId) <= 0)
    ) {
      return c.json({ success: false, error: 'qualificacao_tipo_id inválido' }, 400);
    }
    const modelo_aeronave =
      c.req.query('modelo_aeronave') ||
      c.req.query('codigo_aeronave') ||
      c.req.query('tipo_aeronave');
    const modeloAeronaveNormalizado = normalizeModeloAeronave(modelo_aeronave);

    let query = `
      SELECT
        ms.*,
        ts.nome as tipo_sessao_nome,
        ts.codigo as tipo_sessao_codigo${qualificacaoSelect}${versioningSelect},
        (SELECT COUNT(*) FROM modelos_sessao_manobras
         WHERE modelo_id = ms.id AND deleted_at IS NULL) as total_manobras
      FROM modelos_sessao ms
      ${versioningJoin}
      LEFT JOIN tipos_sessao ts ON ${tiposJoinOn}
      ${qualificacaoJoin}
      WHERE ms.deleted_at IS NULL
        AND ms.empresa_id = ?
    `;
    const params: any[] = [];
    // Both tenant columns are mandatory above.
    params.push(empresaId);
    if (hasQualificacaoTipoId) params.push(empresaId);
    // ms.empresa_id (always present per query WHERE)
    params.push(empresaId);

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

      const fallbackTipo = buildTipoSessaoFallbackSql(tipoSessaoCodigo, tipoSessaoNome);
      if (fallbackTipo.clauses.length > 0) {
        tipoClauses.push(
          `(
            ms.tipo_sessao_id IS NULL AND
            (${fallbackTipo.clauses.join(' OR ')})
          )`,
        );
        params.push(...fallbackTipo.params);
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
      // A model with no aircraft column set at all (modelo_aeronave/codigo_aeronave/
      // tipo_aeronave all NULL/empty) is universal — applicable to any equipment,
      // mirroring the write-time acceptance rule in assertEntityOwnership (which
      // never rejects a universal model for equipment incompatibility). Without
      // this OR clause, universal models like EXA-V01..V04 would silently vanish
      // from every equipment-filtered listing.
      query += ` AND (${buildModeloAeronaveSqlMatchExpression(modeloAeronaveExpr)} = ? OR ${modeloAeronaveExpr} = '')`;
      params.push(modeloAeronaveNormalizado);
    }

    if (qualificacaoTipoId) {
      if (hasQualificacaoTipoId) {
        query += ' AND ms.qualificacao_tipo_id = ?';
        params.push(qualificacaoTipoId);
      } else {
        query += ' AND 1 = 0';
      }
    }

    if (ativo === '1') {
      query += ' AND COALESCE(ms.ativo, 1) = 1';
    } else if (ativo === '0') {
      query += ' AND COALESCE(ms.ativo, 1) = 0';
    }

    query += ' ORDER BY ms.codigo';

    const result = await c.env.DB.prepare(query)
      .bind(...params)
      .all();
    return c.json({ success: true, data: result.results });
  } catch (e: any) {
    console.error('❌ [MODELOS] Erro GET:', e.message, e.cause);
    return c.json({ success: false, error: 'Erro interno do servidor', debug: e.message }, 500);
  }
});

// GET /api/simuladores/modelos-sessao/:id - Buscar modelo específico
app.get('/modelos-sessao/:id', async (c) => {
  console.log('🔍 [MODELOS] GET /modelos-sessao/:id chamado');
  try {
    const empresaId = getEmpresaIdFromRequest(c);
    const id = c.req.param('id');
    const result = await c.env.DB.prepare(
      `SELECT 
        ms.*,
        ts.nome as tipo_sessao_nome,
        ts.codigo as tipo_sessao_codigo,
        qt.nome as qualificacao_tipo_nome,
        qt.codigo as qualificacao_tipo_codigo
      FROM modelos_sessao ms
      LEFT JOIN tipos_sessao ts ON ms.tipo_sessao_id = ts.id AND ts.empresa_id = ?
      LEFT JOIN qualificacoes_tipos qt ON ms.qualificacao_tipo_id = qt.id AND qt.empresa_id = ?
      WHERE ms.id = ? AND ms.deleted_at IS NULL AND ms.empresa_id = ?`,
    )
      .bind(empresaId, empresaId, id, empresaId)
      .first();

    if (!result) {
      return c.json({ success: false, error: 'Modelo não encontrado' }, 404);
    }

    // Buscar checks FAP padrão do modelo
    const checksResult = await c.env.DB.prepare(
      `SELECT msc.qualificacao_tipo_id, qt.codigo, qt.nome, qt.descricao
       FROM modelos_sessao_checks msc
       INNER JOIN modelos_sessao ms
         ON ms.id = msc.modelo_id
        AND ms.deleted_at IS NULL
        AND ms.empresa_id = ?
       INNER JOIN qualificacoes_tipos qt ON msc.qualificacao_tipo_id = qt.id
       WHERE msc.modelo_id = ?
         AND msc.deleted_at IS NULL
         AND qt.deleted_at IS NULL
         AND qt.empresa_id = ?
       ORDER BY qt.codigo`,
    )
      .bind(empresaId, id, empresaId)
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
    const empresaId = getEmpresaIdFromRequest(c);
    const id = c.req.param('id');
    const result = await c.env.DB.prepare(
      `SELECT msc.qualificacao_tipo_id as id, qt.codigo, qt.nome, qt.descricao
       FROM modelos_sessao_checks msc
       INNER JOIN modelos_sessao ms
         ON ms.id = msc.modelo_id
        AND ms.deleted_at IS NULL
        AND ms.empresa_id = ?
       INNER JOIN qualificacoes_tipos qt ON msc.qualificacao_tipo_id = qt.id
       WHERE msc.modelo_id = ?
         AND msc.deleted_at IS NULL
         AND qt.deleted_at IS NULL
         AND qt.empresa_id = ?
       ORDER BY qt.codigo`,
    )
      .bind(empresaId, id, empresaId)
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
    const empresaId = getEmpresaIdFromRequest(c);
    const id = c.req.param('id');
    const hasContextTable = await optionalTableExists(c.env.DB, 'modelos_sessao_manobras_contexto');
    const contextJoin = hasContextTable
      ? 'LEFT JOIN modelos_sessao_manobras_contexto msmc ON msmc.modelo_manobra_id = msm.id AND msmc.empresa_id = ms.empresa_id'
      : '';
    const contextSelect = hasContextTable
      ? `, msmc.metadados_json as metadados_contextuais
        , json_extract(msmc.metadados_json, '$.fase_voo') as contexto_fase_voo
        , json_extract(msmc.metadados_json, '$.tipo_conteudo') as contexto_tipo_conteudo
        , json_extract(msmc.metadados_json, '$.execucao_pf') as contexto_execucao_pf
        , json_extract(msmc.metadados_json, '$.codigo_manobra') as contexto_codigo_manobra
        , json_extract(msmc.metadados_json, '$.nome') as contexto_nome`
      : `, NULL as metadados_contextuais
        , NULL as contexto_fase_voo
        , NULL as contexto_tipo_conteudo
        , NULL as contexto_execucao_pf
        , NULL as contexto_codigo_manobra
        , NULL as contexto_nome`;
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
        m.tempo_estimado${contextSelect}
      FROM modelos_sessao_manobras msm
      INNER JOIN modelos_sessao ms
        ON ms.id = msm.modelo_id
       AND ms.deleted_at IS NULL
       AND ms.empresa_id = ?
      INNER JOIN manobras m
        ON msm.manobra_id = m.id
       AND m.deleted_at IS NULL
       AND m.empresa_id = ?
      ${contextJoin}
      WHERE msm.modelo_id = ? AND msm.deleted_at IS NULL
      ORDER BY msm.ordem ASC`,
    )
      .bind(empresaId, empresaId, id)
      .all();

    type ManobraRow = {
      metadados_contextuais?: string | null;
      contexto_fase_voo?: string | null;
      contexto_tipo_conteudo?: string | null;
      contexto_execucao_pf?: string | null;
      contexto_codigo_manobra?: string | null;
      contexto_nome?: string | null;
      manobra_categoria?: string | null;
      tripulante?: string | null;
      manobra_codigo?: string | null;
      manobra_nome?: string | null;
      [key: string]: unknown;
    };
    const data = ((result.results || []) as ManobraRow[]).map((row) => {
      const legacyFallback = !row.metadados_contextuais;
      return {
        ...row,
        contexto: {
          fase_voo: row.contexto_fase_voo ?? (legacyFallback ? row.manobra_categoria : null),
          tipo_conteudo: row.contexto_tipo_conteudo ?? null,
          execucao_pf: row.contexto_execucao_pf ?? row.tripulante ?? null,
          codigo_manobra: row.contexto_codigo_manobra ?? row.manobra_codigo ?? null,
          nome: row.contexto_nome ?? row.manobra_nome ?? null,
          fonte: row.metadados_contextuais ? 'CONTEXTO_VERSAO' : 'LEGACY_MANOBRA',
        },
      };
    });

    return c.json({ success: true, data });
  } catch (e: any) {
    console.error('❌ [MODELOS] Erro GET manobras:', e.message);
    return c.json({ success: false, error: 'Erro interno do servidor' }, 500);
  }
});

// PUT /api/simuladores/modelos-sessao/:id/manobras/reordenar - Reordenar manobras do modelo
app.put('/modelos-sessao/:id/manobras/reordenar', requireRole('admin', 'manager'), requireOperacoes('update'), async (c) => {
  try {
    const empresaId = getEmpresaIdFromRequest(c);
    const id = c.req.param('id');
    const body = await c.req.json();
    const manobras = Array.isArray(body?.manobras) ? body.manobras : [];

    if (manobras.length === 0) {
      return c.json({ success: false, error: 'Lista de manobras é obrigatória' }, 400);
    }

    const modelo = await c.env.DB.prepare(
      'SELECT id FROM modelos_sessao WHERE id = ? AND deleted_at IS NULL AND empresa_id = ?',
    )
      .bind(id, empresaId)
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
app.delete('/modelos-sessao/:id/manobras/:manobraId', requireRole('admin', 'manager'), requireOperacoes('delete'), async (c) => {
  try {
    const empresaId = getEmpresaIdFromRequest(c);
    const id = c.req.param('id');
    const manobraId = c.req.param('manobraId');

    const modelo = await c.env.DB.prepare(
      'SELECT id FROM modelos_sessao WHERE id = ? AND deleted_at IS NULL AND empresa_id = ?',
    )
      .bind(id, empresaId)
      .first();

    if (!modelo) {
      return c.json({ success: false, error: 'Modelo não encontrado' }, 404);
    }

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
app.post('/modelos-sessao', requireRole('admin', 'manager'), requireOperacoes('create'), async (c) => {
  console.log('🔍 [MODELOS] POST /modelos-sessao chamado');
  try {
    const empresaId = getEmpresaIdFromRequest(c);
    await normalizeModelosSessaoModeloAeronave(c.env.DB, empresaId);

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
    const observacoesValidation = validateObservacoesBatchInput(
      manobras as Array<{ observacoes?: unknown }>,
    );
    if (!observacoesValidation.ok) {
      return c.json({ success: false, error: observacoesValidation.error }, 400);
    }
    let checksIdsNormalizados: number[] = [];
    try {
      checksIdsNormalizados = await normalizeChecksIdsModelo(
        c.env.DB,
        empresaId,
        checks_ids,
        modelo_aeronave,
      );
    } catch (error: any) {
      return c.json({ success: false, error: 'Checks inválidos' }, 422);
    }

    if (!(await ensureTipoSessaoBelongsToEmpresa(c.env.DB, tipo_sessao_id, empresaId))) {
      return c.json({ success: false, error: 'Tipo de sessão inválido para a empresa' }, 400);
    }

    let qualifTipoIdToSave = qualificacao_tipo_id || null;
    if (gera_qualificacao === 1) {
      if (!qualifTipoIdToSave) {
        return c.json({ success: false, error: 'Qualificação gerada é obrigatória' }, 422);
      }
      const qValid = await c.env.DB.prepare(
        `SELECT qt.id 
         FROM qualificacoes_tipos qt 
         JOIN qualificacoes_categorias qc ON qt.categoria_id = qc.id 
         WHERE qt.id = ? 
           AND qt.deleted_at IS NULL 
           AND qt.ativo = 1 
           AND qt.empresa_id = ? 
           AND qc.empresa_id = qt.empresa_id 
           AND qc.deleted_at IS NULL 
           AND qc.ativo = 1 
           AND UPPER(COALESCE(qc.codigo, '')) = 'VOO' 
         LIMIT 1`
      ).bind(qualifTipoIdToSave, empresaId).first();
      if (!qValid) {
        return c.json(
          { success: false, error: 'Tipo de qualificação de voo inválido para a empresa' },
          422,
        );
      }
    } else {
      qualifTipoIdToSave = null;
    }

    // Verificar duplicidade de código
    const existe = await c.env.DB.prepare(
      'SELECT id FROM modelos_sessao WHERE codigo = ? AND deleted_at IS NULL AND empresa_id = ?',
    )
      .bind(codigo, empresaId)
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
         (codigo, nome, tipo_sessao_id, tipo, modelo_aeronave, descricao, duracao_estimada, gera_qualificacao, qualificacao_tipo_id, empresa_id, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))`
      : `INSERT INTO modelos_sessao
         (codigo, nome, tipo_sessao_id, modelo_aeronave, descricao, duracao_estimada, gera_qualificacao, qualificacao_tipo_id, empresa_id, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))`;

    const insertBinds = hasTipoCol
      ? [
          codigo,
          nome,
          tipo_sessao_id,
          tipo || 'SIMULADOR',
          modelo_aeronave,
          descricao || null,
          duracao_estimada || 120,
          gera_qualificacao || 0,
          qualifTipoIdToSave,
          empresaId,
        ]
      : [
          codigo,
          nome,
          tipo_sessao_id,
          modelo_aeronave,
          descricao || null,
          duracao_estimada || 120,
          gera_qualificacao || 0,
          qualifTipoIdToSave,
          empresaId,
        ];

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
            observacoesValidation.values[i] ?? null,
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
app.post('/modelos-sessao/:id/manobras', requireRole('admin', 'manager'), requireOperacoes('create'), async (c) => {
  console.log('🔍 [MODELOS] POST /modelos-sessao/:id/manobras chamado');
  try {
    const empresaId = getEmpresaIdFromRequest(c);
    const id = c.req.param('id');
    const body = await c.req.json();
    const { manobras, substituir } = body;

    if (!Array.isArray(manobras) || manobras.length === 0) {
      return c.json({ success: false, error: 'Lista de manobras é obrigatória' }, 400);
    }

    // Verificar se modelo existe
    const modelo = await c.env.DB.prepare(
      'SELECT id FROM modelos_sessao WHERE id = ? AND deleted_at IS NULL AND empresa_id = ?',
    )
      .bind(id, empresaId)
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
    const observacoesValidation = validateObservacoesBatchInput(
      manobras as Array<{ observacoes?: unknown }>,
    );
    if (!observacoesValidation.ok) {
      return c.json({ success: false, error: observacoesValidation.error }, 400);
    }

    let inseridas = 0;
    for (let i = 0; i < manobras.length; i++) {
      const m = manobras[i];

      // Validar se manobra existe
      const manobraExiste = await c.env.DB.prepare(
        'SELECT id FROM manobras WHERE id = ? AND empresa_id = ? AND deleted_at IS NULL',
      )
        .bind(m.manobra_id, empresaId)
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
          observacoesValidation.values[i] ?? null,
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
app.post('/modelos-sessao/:id/clonar', requireRole('admin', 'manager'), requireOperacoes('create'), async (c) => {
  try {
    const empresaId = getEmpresaIdFromRequest(c);
    const id = c.req.param('id');

    const modeloOriginal = await c.env.DB.prepare(
      'SELECT * FROM modelos_sessao WHERE id = ? AND deleted_at IS NULL AND empresa_id = ?',
    )
      .bind(id, empresaId)
      .first<any>();

    if (!modeloOriginal) {
      return c.json({ success: false, error: 'Modelo não encontrado' }, 404);
    }

    let cloneCodigoBase = `${String(modeloOriginal.codigo || 'MODELO').trim()}-CLONE`;
    let cloneCodigo = cloneCodigoBase;
    let suffix = 2;

    while (
      await c.env.DB.prepare(
        'SELECT id FROM modelos_sessao WHERE codigo = ? AND deleted_at IS NULL AND empresa_id = ? LIMIT 1',
      )
        .bind(cloneCodigo, empresaId)
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
           duracao_estimada, gera_qualificacao, qualificacao_tipo_id, empresa_id, created_at, updated_at
         ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))`
      : `INSERT INTO modelos_sessao (
           codigo, nome, tipo_sessao_id, modelo_aeronave, descricao,
           duracao_estimada, gera_qualificacao, qualificacao_tipo_id, empresa_id, created_at, updated_at
         ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))`;

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
          empresaId,
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
          empresaId,
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
          sanitizeModeloSessaoObservacoesForStorage(manobra.observacoes),
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
app.post('/modelos-sessao/importar-relacoes', requireRole('admin', 'manager'), requireOperacoes('import'), async (c) => {
  try {
    const empresaId = getEmpresaIdFromRequest(c);
    await normalizeModelosSessaoModeloAeronave(c.env.DB, empresaId);

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

    const tipoSessaoPadraoId = await getTipoSessaoPadraoId(c.env.DB, empresaId);

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

    const modeloCodigosSet = new Set<string>();
    const manobraCodigosSet = new Set<string>();
    for (const row of dados) {
      const mc = normalizeCode((row as any).modelo_codigo);
      if (mc) modeloCodigosSet.add(mc);
      const manc = normalizeCode((row as any).manobra_codigo);
      if (manc) manobraCodigosSet.add(manc);
    }
    const modeloCodigos = [...modeloCodigosSet];
    const manobraCodigos = [...manobraCodigosSet];

    const modelosMap = new Map<string, any>();
    if (modeloCodigos.length > 0) {
      for (let i = 0; i < modeloCodigos.length; i += 100) {
        const chunk = modeloCodigos.slice(i, i + 100);
        const placeholders = chunk.map(() => '?').join(',');
        const rows = await c.env.DB.prepare(
          `SELECT id, codigo, nome FROM modelos_sessao WHERE deleted_at IS NULL AND empresa_id = ? AND UPPER(TRIM(codigo)) IN (${placeholders})`
        ).bind(empresaId, ...chunk).all();
        for (const row of rows.results || []) {
          modelosMap.set(String(row.codigo).toUpperCase().trim(), row);
        }
      }
    }

    const manobrasMap = new Map<string, any>();
    if (manobraCodigos.length > 0) {
      for (let i = 0; i < manobraCodigos.length; i += 100) {
        const chunk = manobraCodigos.slice(i, i + 100);
        const placeholders = chunk.map(() => '?').join(',');
        const rows = await c.env.DB.prepare(
          `SELECT id, codigo, nome FROM manobras WHERE deleted_at IS NULL AND empresa_id = ? AND UPPER(TRIM(codigo)) IN (${placeholders})`
        ).bind(empresaId, ...chunk).all();
        for (const row of rows.results || []) {
          manobrasMap.set(String(row.codigo).toUpperCase().trim(), row);
        }
      }
    }

    const relacoesMap = new Map<string, any>();
    if (modelosMap.size > 0) {
      const mIds = [...modelosMap.values()].map(m => m.id);
      for (let i = 0; i < mIds.length; i += 100) {
        const chunk = mIds.slice(i, i + 100);
        const placeholders = chunk.map(() => '?').join(',');
        const rows = await c.env.DB.prepare(
          `SELECT id, modelo_id, manobra_id, deleted_at FROM modelos_sessao_manobras WHERE modelo_id IN (${placeholders}) ORDER BY id DESC`
        ).bind(...chunk).all();
        for (const row of rows.results || []) {
          const key = `${row.modelo_id}_${row.manobra_id}`;
          if (!relacoesMap.has(key)) relacoesMap.set(key, row);
        }
      }
    }

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

      let modelo = modelosMap.get(modeloCodigo);

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
            duracao_estimada, gera_qualificacao, empresa_id, created_at, updated_at
          ) VALUES (?, ?, ?, ?, ?, ?, 0, ?, datetime('now'), datetime('now'))`,
        )
          .bind(
            modeloCodigo,
            modeloNome,
            tipoSessaoPadraoId,
            modeloAeronave,
            'Importado automaticamente via planilha de relações modelo-manobra',
            Number.isFinite(duracaoEstimada) && duracaoEstimada > 0 ? duracaoEstimada : 120,
            empresaId,
          )
          .run();

        modelo = {
          id: Number(insertModelo.meta.last_row_id || 0),
          codigo: modeloCodigo,
          nome: modeloNome,
        };
        modelosMap.set(modeloCodigo, modelo);
        resultado.resumo.modelos_auto_criados++;
        resultado.detalhes.modelos_criados.push({
          codigo: modeloCodigo,
          nome: modeloNome,
          linha,
        });
      }

      let manobra = manobrasMap.get(manobraCodigo);

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
            empresa_id, codigo, nome, descricao, categoria, tipo_sessao, tempo_estimado, created_at, updated_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))`,
        )
          .bind(
            empresaId,
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
        manobrasMap.set(manobraCodigo, manobra);
        resultado.resumo.manobras_auto_criadas++;
        resultado.detalhes.manobras_criadas.push({
          codigo: manobraCodigo,
          nome: manobraNome,
          linha,
        });
      }

      const relacaoKey = `${modelo.id}_${manobra.id}`;
      const cachedRelacao = relacoesMap.get(relacaoKey);
      const relacaoAtiva = cachedRelacao && cachedRelacao.deleted_at === null ? cachedRelacao : null;

      const observacoesValidation = validateModeloSessaoObservacoesInput(row.observacoes);
      if (!observacoesValidation.ok) {
        resultado.resumo.erros++;
        resultado.detalhes.erros.push({
          linha,
          motivo: observacoesValidation.error,
        });
        continue;
      }

      const observacoes = observacoesValidation.value;
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

      const relacaoSoftDeleted = cachedRelacao && cachedRelacao.deleted_at !== null ? cachedRelacao : null;

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
app.put('/modelos-sessao/:id', requireRole('admin', 'manager'), requireOperacoes('update'), async (c) => {
  console.log('🔍 [MODELOS] PUT /modelos-sessao/:id chamado');
  try {
    const empresaId = getEmpresaIdFromRequest(c);
    await normalizeModelosSessaoModeloAeronave(c.env.DB, empresaId);

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
      'SELECT * FROM modelos_sessao WHERE id = ? AND deleted_at IS NULL AND empresa_id = ?',
    )
      .bind(id, empresaId)
      .first();

    if (!anterior) {
      return c.json({ success: false, error: 'Modelo não encontrado' }, 404);
    }

    // Verificar duplicidade de código (se mudou)
    if (codigo && codigo !== anterior.codigo) {
      const existe = await c.env.DB.prepare(
        'SELECT id FROM modelos_sessao WHERE codigo = ? AND id != ? AND deleted_at IS NULL AND empresa_id = ?',
      )
        .bind(codigo, id, empresaId)
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
          empresaId,
          checks_ids,
          modeloAeronaveFinal,
        );
      } catch (error: any) {
        return c.json({ success: false, error: 'Checks inválidos' }, 422);
      }
    }
    let newQualifTipoId =
      qualificacao_tipo_id !== undefined
        ? qualificacao_tipo_id
        : (anterior as any).qualificacao_tipo_id;

    if (!(await ensureTipoSessaoBelongsToEmpresa(c.env.DB, tipo_sessao_id, empresaId))) {
      return c.json({ success: false, error: 'Tipo de sessão inválido para a empresa' }, 400);
    }

    const newGeraQualificacao =
      gera_qualificacao !== undefined
        ? gera_qualificacao
        : (anterior as { gera_qualificacao?: number }).gera_qualificacao || 0;

    if (newGeraQualificacao === 1) {
      if (!newQualifTipoId) {
        return c.json({ success: false, error: 'Qualificação gerada é obrigatória' }, 422);
      }
      const qValid = await c.env.DB.prepare(
        `SELECT qt.id 
         FROM qualificacoes_tipos qt 
         JOIN qualificacoes_categorias qc ON qt.categoria_id = qc.id 
         WHERE qt.id = ? 
           AND qt.deleted_at IS NULL 
           AND qt.ativo = 1 
           AND qt.empresa_id = ? 
           AND qc.empresa_id = qt.empresa_id 
           AND qc.deleted_at IS NULL 
           AND qc.ativo = 1 
           AND UPPER(COALESCE(qc.codigo, '')) = 'VOO' 
         LIMIT 1`
      ).bind(newQualifTipoId, empresaId).first();
      if (!qValid) {
        return c.json(
          { success: false, error: 'Tipo de qualificação de voo inválido para a empresa' },
          422,
        );
      }
    } else {
      newQualifTipoId = null;
    }

    // Verificar se a coluna tipo já existe (adicionada pela migration 0363)
    const colInfoPut = await c.env.DB.prepare('PRAGMA table_info(modelos_sessao)').all();
    const hasTipoColPut = (colInfoPut.results || []).some((r: any) => r.name === 'tipo');

    // Atualizar
    const updateSql = hasTipoColPut
      ? `UPDATE modelos_sessao
         SET codigo = ?, nome = ?, tipo_sessao_id = ?, tipo = ?, modelo_aeronave = ?, descricao = ?,
             duracao_estimada = ?, gera_qualificacao = ?, qualificacao_tipo_id = ?, updated_at = datetime('now')
         WHERE id = ? AND empresa_id = ?`
      : `UPDATE modelos_sessao
         SET codigo = ?, nome = ?, tipo_sessao_id = ?, modelo_aeronave = ?, descricao = ?,
             duracao_estimada = ?, gera_qualificacao = ?, qualificacao_tipo_id = ?, updated_at = datetime('now')
         WHERE id = ? AND empresa_id = ?`;

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
          empresaId,
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
          empresaId,
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
      'SELECT * FROM modelos_sessao WHERE id = ? AND deleted_at IS NULL AND empresa_id = ?',
    )
      .bind(id, empresaId)
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
app.delete('/modelos-sessao/:id', requireRole('admin', 'manager'), requireOperacoes('delete'), async (c) => {
  console.log('🔍 [MODELOS] DELETE /modelos-sessao/:id chamado');
  try {
    const empresaId = getEmpresaIdFromRequest(c);
    const denied = requireAdminForDelete(c);
    if (denied) return denied;

    const id = c.req.param('id');

    // Verificar se existe
    const modelo = await c.env.DB.prepare(
      'SELECT * FROM modelos_sessao WHERE id = ? AND deleted_at IS NULL AND empresa_id = ?',
    )
      .bind(id, empresaId)
      .first();

    if (!modelo) {
      return c.json({ success: false, error: 'Modelo não encontrado' }, 404);
    }

    // Soft delete
    await c.env.DB.prepare(
      `UPDATE modelos_sessao SET deleted_at = datetime('now') WHERE id = ? AND empresa_id = ?`,
    )
      .bind(id, empresaId)
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
    const empresaId = getEmpresaIdFromRequest(c);
    console.log('🔧 [FIX] Iniciando reparo de modelos periódicos...');

    // 1. Atualizar modelos periódicos AW139 SEM modelo_aeronave
    const result1 = await c.env.DB.prepare(
      `UPDATE modelos_sessao 
       SET modelo_aeronave = 'AW139'
       WHERE tipo_sessao_id = 9
         AND empresa_id = ?
         AND tipo_aeronave = 'AW139'
         AND (modelo_aeronave IS NULL OR modelo_aeronave = '')
         AND deleted_at IS NULL`,
    )
      .bind(empresaId)
      .run();

    // 2. Atualizar modelos periódicos SEM tipo_aeronave (CHECK FINAL) - defaultar para AW139
    const result2 = await c.env.DB.prepare(
      `UPDATE modelos_sessao 
       SET modelo_aeronave = 'AW139', tipo_aeronave = 'AW139'
       WHERE tipo_sessao_id = 9
         AND empresa_id = ?
         AND (tipo_aeronave IS NULL OR tipo_aeronave = '')
         AND deleted_at IS NULL`,
    )
      .bind(empresaId)
      .run();

    console.log(`✅ [FIX] Atualizado batch 1: ${result1.meta.changes} registros`);
    console.log(`✅ [FIX] Atualizado batch 2: ${result2.meta.changes} registros`);

    // Verificar resultados
    const verificacao = await c.env.DB.prepare(
      `SELECT COUNT(*) as total, 
              COUNT(CASE WHEN modelo_aeronave = 'AW139' THEN 1 END) as com_codigo
       FROM modelos_sessao
       WHERE tipo_sessao_id = 9
         AND empresa_id = ?
         AND deleted_at IS NULL`,
    )
      .bind(empresaId)
      .first();

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
