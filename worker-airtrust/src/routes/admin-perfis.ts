/**
 * ADMIN PERFIS PERMISSÕES ROUTES
 *
 * Gerenciamento de permissões por perfil (GESTOR, INSTRUTOR, ALUNO) por módulo.
 * Apenas ADMINISTRADOR pode alterar configurações de permissão.
 *
 * Endpoints:
 *   GET  /api/admin/perfis/permissoes  - Listar permissões configuradas
 *   POST /api/admin/perfis/permissoes  - Salvar permissões (batch upsert)
 */

import { Hono } from 'hono';
import type { Context } from 'hono';
import type { Env } from '../types';
import { auth } from '../middleware/auth';
import { getTenantContext } from '../middleware/tenant';
import { badRequest, forbidden } from '../middleware/error-handler';
import { createLogger } from '../utils/logger';

type PerfisVars = {
  userId: number | string;
  userEmail: string;
  userRole: string;
  empresaId?: number | string;
};

const adminPerfisRoutes = new Hono<{ Bindings: Env; Variables: PerfisVars }>();

adminPerfisRoutes.use('/*', auth());
adminPerfisRoutes.use('/*', async (c, next) => {
  await next();
  c.header('Cache-Control', 'no-store, no-cache, must-revalidate, private');
});

function requireAdmin(role: string, action?: string): void {
  const normalized = role?.toUpperCase();
  if (normalized !== 'ADMINISTRADOR' && normalized !== 'ADMIN') {
    throw forbidden(
      action ? `Apenas ADMINISTRADOR pode ${action}` : 'Acesso restrito a ADMINISTRADOR',
      'INSUFFICIENT_ROLE',
    );
  }
}

// Módulos válidos para controle de acesso
const MODULOS_VALIDOS = [
  'qualificacoes',
  'escalas',
  'lms',
  'certificados',
  'frms',
  'simuladores',
  'funcionarios',
  'relatorios',
  'agendamentos',
] as const;

const ACOES_VALIDAS = ['visualizar', 'editar', 'criar', 'deletar'] as const;
const PERFIS_VALIDOS = ['GESTOR', 'INSTRUTOR', 'ALUNO'] as const;

type PermissaoRow = {
  perfil: string;
  modulo: string;
  acao: string;
  permitido: number;
};

async function savePerfisPermissoes(c: Context) {
  const { empresaId, role } = getTenantContext(c as any);
  const callerId = (c as any).get('userId');
  requireAdmin(role, 'atualizar permissões de perfis');

  const logger = createLogger(c, 'AdminPerfis.salvar');

  const body = await c.req.json<unknown>().catch(() => null);

  if (!Array.isArray(body)) {
    throw badRequest('O corpo da requisição deve ser um array de permissões', 'INVALID_PAYLOAD');
  }

  if (body.length > 500) {
    throw badRequest('Máximo de 500 permissões por requisição', 'TOO_MANY_ITEMS');
  }

  type PermBody = { perfil: string; modulo: string; acao: string; permitido: boolean };
  const items: PermBody[] = [];

  for (const item of body) {
    if (!item || typeof item !== 'object') {
      throw badRequest('Item inválido no array', 'INVALID_ITEM');
    }
    const { perfil, modulo, acao, permitido } = item as Record<string, unknown>;

    if (typeof perfil !== 'string' || !(PERFIS_VALIDOS as readonly string[]).includes(perfil)) {
      throw badRequest(`Perfil inválido: ${perfil}`, 'INVALID_PERFIL');
    }
    if (typeof modulo !== 'string' || !(MODULOS_VALIDOS as readonly string[]).includes(modulo)) {
      throw badRequest(`Módulo inválido: ${modulo}`, 'INVALID_MODULO');
    }
    if (typeof acao !== 'string' || !(ACOES_VALIDAS as readonly string[]).includes(acao)) {
      throw badRequest(`Ação inválida: ${acao}`, 'INVALID_ACAO');
    }
    if (typeof permitido !== 'boolean') {
      throw badRequest(`Campo 'permitido' deve ser boolean`, 'INVALID_PERMITIDO');
    }

    items.push({ perfil, modulo, acao, permitido });
  }

  const db = c.env.DB;

  for (const item of items) {
    await db
      .prepare(
        `INSERT INTO perfis_permissoes (empresa_id, perfil, modulo, acao, permitido, updated_at)
         VALUES (?, ?, ?, ?, ?, datetime('now'))
         ON CONFLICT(empresa_id, perfil, modulo, acao) DO UPDATE SET
           permitido = excluded.permitido,
           updated_at = excluded.updated_at`,
      )
      .bind(empresaId, item.perfil, item.modulo, item.acao, item.permitido ? 1 : 0)
      .run();
  }

  logger.info(
    `Admin id=${callerId} atualizou ${items.length} permissões de perfis empresa_id=${empresaId}`,
  );

  return c.json({ success: true, message: `${items.length} permissões atualizadas` });
}

// ---------------------------------------------------------------------------
// GET /api/admin/perfis/permissoes
// ---------------------------------------------------------------------------
adminPerfisRoutes.get('/permissoes', async (c) => {
  const { empresaId, role } = getTenantContext(c);
  requireAdmin(role, 'listar permissões de perfis');

  const logger = createLogger(c, 'AdminPerfis.listar');

  const { results } = await c.env.DB.prepare(
    `SELECT perfil, modulo, acao, permitido
     FROM perfis_permissoes
     WHERE empresa_id = ?
     ORDER BY perfil, modulo, acao`,
  )
    .bind(empresaId)
    .all<PermissaoRow>();

  logger.info(`Permissões de perfis listadas empresa_id=${empresaId}`);

  return c.json({ success: true, data: results ?? [] });
});

// ---------------------------------------------------------------------------
// POST|PUT /api/admin/perfis/permissoes
// ---------------------------------------------------------------------------
adminPerfisRoutes.post('/permissoes', savePerfisPermissoes);
adminPerfisRoutes.put('/permissoes', savePerfisPermissoes);

export { adminPerfisRoutes };
