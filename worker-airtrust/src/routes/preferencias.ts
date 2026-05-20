import { Hono } from 'hono';
import type { Env } from '../types';
import { auth } from '../middleware/auth';
import { getEmpresaIdSafe } from './escalas-shared';

const preferencias = new Hono<{ Bindings: Env }>();

async function ensureUsuarioPreferenciasTable(db: D1Database): Promise<void> {
  await db
    .prepare(
      `CREATE TABLE IF NOT EXISTS usuario_preferencias (
        id TEXT PRIMARY KEY,
        usuario_id TEXT NOT NULL,
        empresa_id INTEGER NOT NULL,
        chave TEXT NOT NULL,
        valor TEXT,
        created_at TEXT DEFAULT (datetime('now')),
        updated_at TEXT DEFAULT (datetime('now')),
        deleted_at TEXT,
        UNIQUE(usuario_id, empresa_id, chave)
      )`,
    )
    .run();

  await db
    .prepare(
      `CREATE INDEX IF NOT EXISTS idx_usuario_preferencias_lookup
       ON usuario_preferencias(usuario_id, empresa_id, chave)`,
    )
    .run();
}

function getUserId(c: { get: (key: string) => unknown }): string {
  return String(c.get('userId') || '');
}

preferencias.get('/', auth(), async (c) => {
  const db = c.env.DB;
  const empresaId = getEmpresaIdSafe(c);
  const userId = getUserId(c);

  await ensureUsuarioPreferenciasTable(db);

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

  await ensureUsuarioPreferenciasTable(db);

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

export default preferencias;
