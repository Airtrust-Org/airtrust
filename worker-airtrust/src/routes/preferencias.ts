import { Hono } from 'hono';
import type { Env } from '../types';
import { auth } from '../middleware/auth';
import { getEmpresaIdSafe } from './escalas-shared';

const preferencias = new Hono<{ Bindings: Env }>();

function getUserId(c: { get: (key: string) => unknown }): string {
  return String(c.get('userId') || '');
}

function sanitizeTablePreferenceKey(raw: string): string | null {
  const decoded = decodeURIComponent(String(raw || '')).trim();
  if (!decoded) return null;
  if (!/^[a-z0-9._-]+$/i.test(decoded)) return null;
  return decoded;
}

preferencias.get('/', auth(), async (c) => {
  const db = c.env.DB;
  const empresaId = getEmpresaIdSafe(c);
  const userId = getUserId(c);

  if (!userId) {
    return c.json({ success: false, error: 'Usuário não autenticado' }, 401);
  }

  const row = await db
    .prepare(
      `SELECT valor
         FROM usuario_preferencias
        WHERE usuario_id = ?
          AND empresa_id = ?
          AND chave = 'escala.exibir_nome'
          AND deleted_at IS NULL
        LIMIT 1`,
    )
    .bind(userId, empresaId)
    .first<{ valor: string | null }>();

  const exibirNome = row?.valor === 'guerra' ? 'guerra' : 'completo';

  return c.json({
    success: true,
    data: {
      exibir_nome: exibirNome,
      exibir_nome_guerra: exibirNome === 'guerra',
    },
  });
});

preferencias.put('/', auth(), async (c) => {
  const db = c.env.DB;
  const empresaId = getEmpresaIdSafe(c);
  const userId = getUserId(c);
  const body = (await c.req.json().catch(() => ({}))) as { exibir_nome_guerra?: unknown };

  if (!userId) {
    return c.json({ success: false, error: 'Usuário não autenticado' }, 401);
  }

  const exibirNomeGuerra =
    String(body.exibir_nome_guerra ?? '') === 'true' || body.exibir_nome_guerra === true;
  const valor = exibirNomeGuerra ? 'guerra' : 'completo';
  const now = new Date().toISOString();

  await db
    .prepare(
      `INSERT INTO usuario_preferencias (id, usuario_id, empresa_id, chave, valor, created_at, updated_at, deleted_at)
       VALUES (?, ?, ?, 'escala.exibir_nome', ?, ?, ?, NULL)
       ON CONFLICT(usuario_id, empresa_id, chave)
       DO UPDATE SET valor = excluded.valor, updated_at = excluded.updated_at, deleted_at = NULL`,
    )
    .bind(crypto.randomUUID(), userId, empresaId, valor, now, now)
    .run();

  return c.json({
    success: true,
    data: {
      exibir_nome: valor,
      exibir_nome_guerra: exibirNomeGuerra,
    },
  });
});

preferencias.get('/tabela/:chave', auth(), async (c) => {
  const db = c.env.DB;
  const empresaId = getEmpresaIdSafe(c);
  const userId = getUserId(c);
  const chave = sanitizeTablePreferenceKey(c.req.param('chave'));

  if (!userId) {
    return c.json({ success: false, error: 'Usuário não autenticado' }, 401);
  }

  if (!chave) {
    return c.json({ success: false, error: 'Chave de preferência inválida' }, 400);
  }

  const row = await db
    .prepare(
      `SELECT valor
         FROM usuario_preferencias
        WHERE usuario_id = ?
          AND empresa_id = ?
          AND chave = ?
          AND deleted_at IS NULL
        LIMIT 1`,
    )
    .bind(userId, empresaId, chave)
    .first<{ valor: string | null }>();

  return c.json({
    success: true,
    data: row?.valor ? JSON.parse(row.valor) : null,
  });
});

preferencias.put('/tabela/:chave', auth(), async (c) => {
  const db = c.env.DB;
  const empresaId = getEmpresaIdSafe(c);
  const userId = getUserId(c);
  const chave = sanitizeTablePreferenceKey(c.req.param('chave'));
  const body = (await c.req.json().catch(() => ({}))) as { valor?: unknown };

  if (!userId) {
    return c.json({ success: false, error: 'Usuário não autenticado' }, 401);
  }

  if (!chave) {
    return c.json({ success: false, error: 'Chave de preferência inválida' }, 400);
  }

  if (body.valor === undefined) {
    return c.json({ success: false, error: 'Campo valor é obrigatório' }, 400);
  }

  const now = new Date().toISOString();
  await db
    .prepare(
      `INSERT INTO usuario_preferencias (id, usuario_id, empresa_id, chave, valor, created_at, updated_at, deleted_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, NULL)
       ON CONFLICT(usuario_id, empresa_id, chave)
       DO UPDATE SET valor = excluded.valor, updated_at = excluded.updated_at, deleted_at = NULL`,
    )
    .bind(crypto.randomUUID(), userId, empresaId, chave, JSON.stringify(body.valor), now, now)
    .run();

  return c.json({
    success: true,
    data: body.valor,
  });
});

export default preferencias;
