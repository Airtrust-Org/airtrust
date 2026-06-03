/**
 * lms-relatorios.ts
 * Relatórios de conformidade LMS — por função, base e status de matrículas.
 */
import { Hono } from 'hono';
import { auth } from '../middleware/auth';
import { getEmpresaIdSafe } from './escalas-shared';
import { requireRole } from '../middleware/rbac';
import type { Env, Variables } from '../types';
import {
  getConformidadeRows,
  getCursosConformidadeRows,
  getExpiracaoRows,
} from '../repositories/lmsRelatoriosRepository';

const app = new Hono<{ Bindings: Env; Variables: Variables }>();

// ── GET /relatorios/conformidade ─────────────────────────────────────────────
// Retorna % de conformidade por função (cargo), para todos os cursos vinculados a qualificação.
app.get('/relatorios/conformidade', auth(), requireRole('admin', 'manager'), async (c) => {
  const db = c.env.DB;
  const empresaId = getEmpresaIdSafe(c);

  // Para cada função (cargo), calcula % de funcionários com todas as qualificações EAD em dia
  const rows = await getConformidadeRows(db, empresaId);

  return c.json({ success: true, data: rows });
});

// ── GET /relatorios/cursos-conformidade ──────────────────────────────────────
// Por curso: conformidade por função (qual % de cada função concluiu aquele curso)
app.get('/relatorios/cursos-conformidade', auth(), requireRole('admin', 'manager'), async (c) => {
  const db = c.env.DB;
  const empresaId = getEmpresaIdSafe(c);

  const rows = await getCursosConformidadeRows(db, empresaId);

  return c.json({ success: true, data: rows });
});

// ── GET /relatorios/expiracoes ───────────────────────────────────────────────
// Matrículas próximas do prazo ou expiradas
app.get('/relatorios/expiracoes', auth(), requireRole('admin', 'manager'), async (c) => {
  const db = c.env.DB;
  const empresaId = getEmpresaIdSafe(c);
  const dias = Math.min(Number(c.req.query('dias') ?? '30'), 180);

  const rows = await getExpiracaoRows(db, empresaId, dias);

  return c.json({ success: true, data: rows });
});

export default app;
