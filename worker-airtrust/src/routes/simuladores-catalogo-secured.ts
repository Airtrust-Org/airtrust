/**
 * SIMULADORES — catálogo com gate RBAC para mutações.
 *
 * Leituras permanecem disponíveis a usuários autenticados pelo router interno.
 * Qualquer mutação do catálogo exige papel de gestor ou administrador.
 */

import { Hono } from 'hono';
import type { Env } from '../types';
import { requireRole } from '../middleware/rbac';
import catalogo from './simuladores-catalogo';

const app = new Hono<{ Bindings: Env }>();
const requireCatalogManager = requireRole('admin', 'manager');

app.use('*', async (c, next) => {
  const method = c.req.method.toUpperCase();
  if (method === 'GET' || method === 'HEAD' || method === 'OPTIONS') {
    await next();
    return;
  }

  return requireCatalogManager(c, next);
});

app.route('/', catalogo);

export default app;
