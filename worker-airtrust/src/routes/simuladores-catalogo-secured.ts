/**
 * SIMULADORES — catálogo com gate RBAC para mutações.
 *
 * Leituras permanecem disponíveis a usuários autenticados pelo router interno.
 * Qualquer mutação do catálogo exige papel de gestor ou administrador.
 */

import { Hono } from 'hono';
import type { Env } from '../types';
import { requirePermission } from '../middleware/rbac';
import catalogo from './simuladores-catalogo';

const app = new Hono<{ Bindings: Env }>();
const requireCatalogPermission = (method: string) => {
  if (method === 'DELETE') return requirePermission('simuladores', 'deletar', 'admin', 'manager');
  if (method === 'POST') return requirePermission('simuladores', 'criar', 'admin', 'manager');
  return requirePermission('simuladores', 'editar', 'admin', 'manager');
};

app.use('*', async (c, next) => {
  const method = c.req.method.toUpperCase();
  if (method === 'GET' || method === 'HEAD' || method === 'OPTIONS') {
    await next();
    return;
  }

  return requireCatalogPermission(method)(c, next);
});

app.route('/', catalogo);

export default app;
