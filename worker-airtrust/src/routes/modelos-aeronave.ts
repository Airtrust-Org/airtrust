import { Hono } from 'hono';
import type { Env } from '../types';
import { auth } from '../middleware/auth';
import { ApiError } from '../middleware/error-handler';
import { registrarAuditoria, extrairUsuarioAuditoria } from '../utils/auditoria';

const modelosAeronave = new Hono<{ Bindings: Env }>();

function normalizeModeloAeronaveValue(value: unknown): unknown {
  if (typeof value !== 'string') return value;
  const trimmed = value.trim();
  if (!trimmed) return value;
  return ['S76', 'SK76'].includes(trimmed.toUpperCase()) ? 'SK76' : value;
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
      WHERE deleted_at IS NULL
      ORDER BY modelo ASC
    `,
    )
    .all();

  return c.json({ success: true, data: result.results });
});

// GET /modelos-aeronave/:id - Busca um modelo por ID
modelosAeronave.get('/:id', auth(), async (c) => {
  const db = c.env.DB;
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
      WHERE id = ? AND deleted_at IS NULL
    `,
    )
    .bind(id)
    .first();

  if (!result) {
    throw new ApiError('Modelo de aeronave não encontrado', 404);
  }

  return c.json({ success: true, data: result });
});

// POST /modelos-aeronave - Cria um novo modelo
modelosAeronave.post('/', auth(), async (c) => {
  const db = c.env.DB;
  const body = normalizeModeloAeronavePayload((await c.req.json()) as Record<string, unknown>) as any;

  const { modelo, fabricante, tipo, categoria, descricao } = body;

  if (!modelo) {
    throw new ApiError('Modelo é obrigatório', 400);
  }

  // Verifica se o modelo já existe
  const existe = await db
    .prepare(`SELECT id FROM modelos_aeronave WHERE modelo = ? AND deleted_at IS NULL`)
    .bind(modelo)
    .first();

  if (existe) {
    throw new ApiError('Modelo já cadastrado', 409);
  }

  const result = await db
    .prepare(
      `INSERT INTO modelos_aeronave 
       (modelo, fabricante, tipo, categoria, descricao, ativo, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, 1, datetime('now'), datetime('now'))`,
    )
    .bind(modelo, fabricante, tipo, categoria, descricao)
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
modelosAeronave.put('/:id', auth(), async (c) => {
  const db = c.env.DB;
  const id = c.req.param('id');
  const body = normalizeModeloAeronavePayload((await c.req.json()) as Record<string, unknown>) as any;

  // Verifica se existe
  const existe = await db
    .prepare(`SELECT id FROM modelos_aeronave WHERE id = ? AND deleted_at IS NULL`)
    .bind(id)
    .first();

  if (!existe) {
    throw new ApiError('Modelo de aeronave não encontrado', 404);
  }

  // Monta a query dinamicamente com os campos fornecidos
  const campos: string[] = [];
  const valores: any[] = [];

  const camposPermitidos = ['modelo', 'fabricante', 'tipo', 'categoria', 'descricao', 'ativo'];

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
  valores.push(id);

  await db
    .prepare(`UPDATE modelos_aeronave SET ${campos.join(', ')} WHERE id = ?`)
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
modelosAeronave.delete('/:id', auth(), async (c) => {
  const db = c.env.DB;
  const id = c.req.param('id');

  // Verifica se existe
  const existe = await db
    .prepare(`SELECT id FROM modelos_aeronave WHERE id = ? AND deleted_at IS NULL`)
    .bind(id)
    .first();

  if (!existe) {
    throw new ApiError('Modelo de aeronave não encontrado', 404);
  }

  await db
    .prepare(`UPDATE modelos_aeronave SET deleted_at = datetime('now') WHERE id = ?`)
    .bind(id)
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
