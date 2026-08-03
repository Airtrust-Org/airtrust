/**
 * lms-relatorios.ts
 * Relatórios de conformidade LMS — por função, base e status de matrículas.
 */
import { Hono } from 'hono';
import { auth } from '../middleware/auth';
import { ApiError } from '../middleware/error-handler';
import { getEmpresaIdSafe } from './escalas-shared';
import { requireRole } from '../middleware/rbac';
import type { Env, Variables } from '../types';
import {
  getConformidadeRows,
  getCursosConformidadeRows,
  getExpiracaoRows,
  getScormConclusaoInconsistenteRows,
} from '../repositories/lmsRelatoriosRepository';
import { getEmployeeSectorAccess } from '../services/employee-sector-access';

const app = new Hono<{ Bindings: Env; Variables: Variables }>();

app.use('*', async (c, next) => {
  await next();
  c.header('Cache-Control', 'private, no-store, no-cache, must-revalidate, max-age=0');
  c.header('Pragma', 'no-cache');
  c.header('Expires', '0');
});

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

function resolveScormReportLimit(raw: string | undefined): number | undefined {
  if (raw == null || raw === '') return undefined;
  const parsed = Number(raw);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new ApiError('Limite de paginação inválido', 400);
  }
  return Math.min(parsed, 200);
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

app.get(
  '/relatorios/conclusoes-inconsistentes',
  auth(),
  requireRole('admin', 'manager'),
  async (c) => {
    const db = c.env.DB;
    const empresaId = getEmpresaIdSafe(c);
    const access = await getEmployeeSectorAccess(c, empresaId);
    const setorIds = resolveRelatorioSetorIds(access, c.req.query('setor_ids'));
    const rawCursor = c.req.query('cursor');
    const rawLimit = c.req.query('limit');
    const limit = resolveScormReportLimit(rawLimit);

    try {
      // Preserve the existing call shape for requests without pagination params;
      // the repository still enforces its safe default limit.
      const result =
        rawCursor || rawLimit
          ? await getScormConclusaoInconsistenteRows(db, empresaId, setorIds, {
              limit,
              cursor: rawCursor,
            })
          : await getScormConclusaoInconsistenteRows(db, empresaId, setorIds);
      // Compatibility with existing repository mocks while keeping the public
      // response body unchanged: { success, data: [] }.
      const page = Array.isArray(result) ? { rows: result, nextCursor: null } : result;
      if (page.nextCursor) c.header('X-Next-Cursor', page.nextCursor);

      return c.json({ success: true, data: page.rows });
    } catch (error) {
      if ((error as { code?: string }).code === 'INVALID_SCORM_CURSOR') {
        throw new ApiError('Cursor de paginação inválido', 400);
      }
      throw error;
    }
  },
);

export default app;
