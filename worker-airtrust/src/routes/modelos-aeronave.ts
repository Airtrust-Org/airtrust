import { Hono } from 'hono';
import type { Env } from '../types';
import { auth } from '../middleware/auth';
import { getEmpresaId } from '../middleware/tenant';
import { requireRole } from '../middleware/rbac';
import { ApiError } from '../middleware/error-handler';
import { registrarAuditoria, extrairUsuarioAuditoria } from '../utils/auditoria';

const modelosAeronave = new Hono<{ Bindings: Env }>();

type ModeloAeronavePayload = Record<string, unknown> & {
  codigo?: unknown;
  nome?: unknown;
  modelo?: unknown;
  fabricante?: unknown;
  tipo?: unknown;
  categoria?: unknown;
  descricao?: unknown;
  ativo?: unknown;
};

type ModeloAeronaveRow = ModeloAeronavePayload & {
  id?: string | number;
};

function normalizeModeloAeronaveValue(value: unknown): unknown {
  if (typeof value !== 'string') return value;
  const trimmed = value.trim();
  if (!trimmed) return value;
  return ['S76', 'SK76'].includes(trimmed.toUpperCase()) ? 'SK76' : trimmed;
}

function normalizeModeloAeronavePayload<T extends Record<string, unknown>>(payload: T): T {
  return {
    ...payload,
    codigo: normalizeModeloAeronaveValue(payload.codigo),
    nome: normalizeModeloAeronaveValue(payload.nome),
    modelo: normalizeModeloAeronaveValue(payload.modelo),
  };
}

// GET /modelos-aeronave - Lista todos os modelos
modelosAeronave.get('/', auth(), async (c) => {
  const db = c.env.DB;
  const empresaId = getEmpresaId(c);

  const result = await db
    .prepare(
      `
      SELECT
        id,
        CASE WHEN UPPER(TRIM(COALESCE(codigo, ''))) IN ('S76', 'SK76') THEN 'SK76' ELSE codigo END AS codigo,
        CASE WHEN UPPER(TRIM(COALESCE(nome, ''))) IN ('S76', 'SK76') THEN 'SK76' ELSE nome END AS nome,
        CASE WHEN UPPER(TRIM(COALESCE(modelo, ''))) IN ('S76', 'SK76') THEN 'SK76' ELSE modelo END AS modelo,
        fabricante,
        tipo,
        categoria,
        descricao,
        ativo,
        created_at,
        updated_at,
        deleted_at
      FROM modelos_aeronave
      WHERE empresa_id = ? AND deleted_at IS NULL
      ORDER BY COALESCE(modelo, codigo, nome) ASC
    `,
    )
    .bind(empresaId)
    .all();

  return c.json({ success: true, data: result.results });
});

// GET /modelos-aeronave/:id - Busca um modelo por ID
modelosAeronave.get('/:id', auth(), async (c) => {
  const db = c.env.DB;
  const empresaId = getEmpresaId(c);
  const id = c.req.param('id');

  const result = await db
    .prepare(
      `
      SELECT
        id,
        CASE WHEN UPPER(TRIM(COALESCE(codigo, ''))) IN ('S76', 'SK76') THEN 'SK76' ELSE codigo END AS codigo,
        CASE WHEN UPPER(TRIM(COALESCE(nome, ''))) IN ('S76', 'SK76') THEN 'SK76' ELSE nome END AS nome,
        CASE WHEN UPPER(TRIM(COALESCE(modelo, ''))) IN ('S76', 'SK76') THEN 'SK76' ELSE modelo END AS modelo,
        fabricante,
        tipo,
        categoria,
        descricao,
        ativo,
        created_at,
        updated_at,
        deleted_at
      FROM modelos_aeronave
      WHERE id = ? AND empresa_id = ? AND deleted_at IS NULL
    `,
    )
    .bind(id, empresaId)
    .first();

  if (!result) {
    throw new ApiError('Modelo de aeronave não encontrado', 404);
  }

  return c.json({ success: true, data: result });
});

// POST /modelos-aeronave - Cria um novo modelo
modelosAeronave.post('/', auth(), requireRole('admin'), async (c) => {
  const db = c.env.DB;
  const empresaId = getEmpresaId(c);
  const body = normalizeModeloAeronavePayload((await c.req.json()) as ModeloAeronavePayload);

  const { fabricante, tipo, categoria, descricao } = body;
  const modeloInput = body.modelo ?? body.codigo ?? body.nome;

  if (!modeloInput || !String(modeloInput).trim()) {
    throw new ApiError('Modelo é obrigatório', 400);
  }

  const modeloNormalizado = String(modeloInput).trim();
  const codigoNormalizado = String(body.codigo ?? modeloNormalizado).trim();
  const nomeNormalizado = String(body.nome ?? modeloNormalizado).trim();

  // Verifica se o modelo já existe
  const existe = await db
    .prepare(
      `SELECT id
       FROM modelos_aeronave
       WHERE empresa_id = ?
         AND deleted_at IS NULL
         AND UPPER(TRIM(COALESCE(modelo, codigo, nome))) = UPPER(TRIM(?))
       LIMIT 1`,
    )
    .bind(empresaId, modeloNormalizado)
    .first();

  if (existe) {
    throw new ApiError('Modelo já cadastrado', 409);
  }

  const result = await db
    .prepare(
      `INSERT INTO modelos_aeronave 
       (empresa_id, codigo, nome, modelo, fabricante, tipo, categoria, descricao, ativo, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1, datetime('now'), datetime('now'))`,
    )
    .bind(
      empresaId,
      codigoNormalizado,
      nomeNormalizado,
      modeloNormalizado,
      fabricante ?? null,
      tipo ?? null,
      categoria ?? null,
      descricao ?? null,
    )
    .run();

  const newId = result.meta.last_row_id;
  const ua = extrairUsuarioAuditoria(c);
  await registrarAuditoria({
    db,
    tabela: 'modelos_aeronave',
    acao: 'INSERT',
    registro_id: newId,
    dados_novos: body,
    ...ua,
  });

  return c.json({ success: true, data: { id: newId } }, 201);
});

// PUT /modelos-aeronave/:id - Atualiza um modelo
modelosAeronave.put('/:id', auth(), requireRole('admin'), async (c) => {
  const db = c.env.DB;
  const empresaId = getEmpresaId(c);
  const id = c.req.param('id');
  const body = normalizeModeloAeronavePayload((await c.req.json()) as ModeloAeronavePayload);

  // Verifica se existe
  const existe = await db
    .prepare(
      `SELECT * FROM modelos_aeronave WHERE id = ? AND empresa_id = ? AND deleted_at IS NULL`,
    )
    .bind(id, empresaId)
    .first<ModeloAeronaveRow>();

  if (!existe) {
    throw new ApiError('Modelo de aeronave não encontrado', 404);
  }

  const canonicalInput = body.modelo ?? body.codigo ?? body.nome;
  if (canonicalInput !== undefined) {
    const modeloNormalizado = String(canonicalInput).trim();
    if (!modeloNormalizado) throw new ApiError('Modelo é obrigatório', 400);
    const duplicate = await db
      .prepare(
        `SELECT id
         FROM modelos_aeronave
         WHERE empresa_id = ?
           AND id <> ?
           AND deleted_at IS NULL
           AND UPPER(TRIM(COALESCE(modelo, codigo, nome))) = UPPER(TRIM(?))
         LIMIT 1`,
      )
      .bind(empresaId, id, modeloNormalizado)
      .first();
    if (duplicate) {
      throw new ApiError('Modelo já cadastrado', 409);
    }
    // `modelo` é a chave canônica histórica (backfill 0183 priorizou codigo),
    // enquanto `nome` continua sendo o rótulo amigável informado pela UI.
    body.modelo = modeloNormalizado;
    if (body.codigo !== undefined) body.codigo = String(body.codigo).trim();
    if (body.nome !== undefined) body.nome = String(body.nome).trim();
  }

  // Monta a query dinamicamente com os campos fornecidos
  const campos: string[] = [];
  const valores: unknown[] = [];

  const camposPermitidos = [
    'codigo',
    'nome',
    'modelo',
    'fabricante',
    'tipo',
    'categoria',
    'descricao',
    'ativo',
  ];

  camposPermitidos.forEach((campo) => {
    if (body[campo] !== undefined) {
      campos.push(`${campo} = ?`);
      valores.push(body[campo]);
    }
  });

  if (campos.length === 0) {
    throw new ApiError('Nenhum campo para atualizar', 400);
  }

  campos.push('updated_at = datetime("now")');
  valores.push(id, empresaId);

  await db
    .prepare(`UPDATE modelos_aeronave SET ${campos.join(', ')} WHERE id = ? AND empresa_id = ?`)
    .bind(...valores)
    .run();

  const ua2 = extrairUsuarioAuditoria(c);
  await registrarAuditoria({
    db,
    tabela: 'modelos_aeronave',
    acao: 'UPDATE',
    registro_id: id,
    dados_novos: body,
    ...ua2,
  });

  return c.json({ success: true, data: { id } });
});

// DELETE /modelos-aeronave/:id - Soft delete
modelosAeronave.delete('/:id', auth(), requireRole('admin'), async (c) => {
  const db = c.env.DB;
  const empresaId = getEmpresaId(c);
  const id = c.req.param('id');

  // Verifica se existe
  const existe = await db
    .prepare(
      `SELECT id, codigo, nome, modelo FROM modelos_aeronave
        WHERE id = ? AND empresa_id = ? AND deleted_at IS NULL`,
    )
    .bind(id, empresaId)
    .first();

  if (!existe) {
    throw new ApiError('Modelo de aeronave não encontrado', 404);
  }

  const modelo = existe as { codigo?: string | null; nome?: string | null; modelo?: string | null };
  const emUso = await db
    .prepare(
      `SELECT
         (SELECT COUNT(*) FROM funcionarios
           WHERE empresa_id = ? AND deleted_at IS NULL
             AND UPPER(COALESCE(status, 'ATIVO')) = 'ATIVO'
             AND CAST(modelo_aeronave_id AS TEXT) = CAST(? AS TEXT)) +
         (SELECT COUNT(*) FROM modelos_sessao
           WHERE empresa_id = ? AND deleted_at IS NULL AND ativo = 1
             AND NULLIF(TRIM(COALESCE(modelo_aeronave, '')), '') IS NOT NULL
             AND UPPER(TRIM(modelo_aeronave)) IN (UPPER(TRIM(?)), UPPER(TRIM(?)), UPPER(TRIM(?))))
         AS total`,
    )
    .bind(empresaId, id, empresaId, modelo.modelo || '', modelo.codigo || '', modelo.nome || '')
    .first<{ total: number }>();
  if (Number(emUso?.total || 0) > 0) {
    throw new ApiError(
      'Modelo em uso por funcionários ou sessões ativas não pode ser excluído',
      409,
    );
  }

  await db
    .prepare(
      `UPDATE modelos_aeronave SET deleted_at = datetime('now') WHERE id = ? AND empresa_id = ?`,
    )
    .bind(id, empresaId)
    .run();

  const ua3 = extrairUsuarioAuditoria(c);
  await registrarAuditoria({
    db,
    tabela: 'modelos_aeronave',
    acao: 'DELETE',
    registro_id: id,
    ...ua3,
  });

  return c.json({ success: true, message: 'Modelo excluído com sucesso' });
});

export default modelosAeronave;
