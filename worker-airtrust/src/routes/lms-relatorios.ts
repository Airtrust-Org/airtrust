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
import { getEmployeeSectorAccess } from '../services/employee-sector-access';

const app = new Hono<{ Bindings: Env; Variables: Variables }>();

// ── GET /relatorios/conformidade ─────────────────────────────────────────────
// Retorna % de conformidade por função (cargo), para todos os cursos vinculados a qualificação.
function resolveRelatorioSetorIds(
  access: { mode: string; setorIds: number[] },
  rawParam: string | undefined,
): number[] {
  const requested = (rawParam || '')
    .split(',')
    .map(Number)
    .filter((n) => Number.isFinite(n) && n > 0);

  if (access.mode === 'all') return requested; // admin: use explicit param or no filter
  // restricted or self: intersect requested with allowed; if none requested, use all allowed
  if (requested.length === 0) return access.setorIds;
  return requested.filter((id) => access.setorIds.includes(id));
}

app.get('/relatorios/conformidade', auth(), requireRole('admin', 'manager'), async (c) => {
  const db = c.env.DB;
  const empresaId = getEmpresaIdSafe(c);
  const access = await getEmployeeSectorAccess(c, empresaId);
  const setorIds = resolveRelatorioSetorIds(access, c.req.query('setor_ids'));

  const rows = await getConformidadeRows(db, empresaId, setorIds);

  return c.json({ success: true, data: rows });
});

// ── GET /relatorios/cursos-conformidade ──────────────────────────────────────
app.get('/relatorios/cursos-conformidade', auth(), requireRole('admin', 'manager'), async (c) => {
  const db = c.env.DB;
  const empresaId = getEmpresaIdSafe(c);
  const access = await getEmployeeSectorAccess(c, empresaId);
  const setorIds = resolveRelatorioSetorIds(access, c.req.query('setor_ids'));

  const rows = await getCursosConformidadeRows(db, empresaId, setorIds);

  return c.json({ success: true, data: rows });
});

// ── GET /relatorios/expiracoes ───────────────────────────────────────────────
app.get('/relatorios/expiracoes', auth(), requireRole('admin', 'manager'), async (c) => {
  const db = c.env.DB;
  const empresaId = getEmpresaIdSafe(c);
  const access = await getEmployeeSectorAccess(c, empresaId);
  const setorIds = resolveRelatorioSetorIds(access, c.req.query('setor_ids'));
  const dias = Math.min(Number(c.req.query('dias') ?? '30'), 180);

  const rows = await getExpiracaoRows(db, empresaId, dias, setorIds);

  return c.json({ success: true, data: rows });
});

export default app;
