import { Hono } from 'hono';
import { z } from 'zod';
import type { Context } from 'hono';
import type { Env } from '../types';
import { requireRole } from '../middleware/rbac';
import { getEmpresaIdSafe } from './escalas-shared';
import {
  ensureSigvoosTables,
  getSigvoosConfig,
  listSigvoosPendencias,
  listSigvoosManualMappings,
  listSigvoosEventos,
  listSigvoosUnmappedTripulantes,
  mapearSigvoosPendenciaERreprocessar,
  reprocessarPreviewsSigvoosSemTripulante,
  sanitizeSigvoosConfig,
  syncSigvoosForFrms,
  upsertSigvoosManualMapping,
  upsertSigvoosConfig,
} from '../services/sigvoos-frms';

const sigvoosRouter = new Hono<{ Bindings: Env; Variables: { userId?: string } }>();

async function secureCompare(a: string, b: string): Promise<boolean> {
  const encoder = new TextEncoder();
  const [aHash, bHash] = await Promise.all([
    crypto.subtle.digest('SHA-256', encoder.encode(a)),
    crypto.subtle.digest('SHA-256', encoder.encode(b)),
  ]);
  return crypto.subtle.timingSafeEqual(aHash, bHash);
}

async function isLocalMaintenanceRequest(
  c: Context<{ Bindings: Env; Variables: { userId?: string } }>,
): Promise<boolean> {
  const maintenanceSecret = c.env.MAINTENANCE_SECRET;
  const providedHeader = c.req.header('x-maintenance-secret');
  if (maintenanceSecret && providedHeader && (await secureCompare(providedHeader, maintenanceSecret))) {
    return true;
  }
  const url = new URL(c.req.url);
  const hostname = url.hostname.toLowerCase();
  const hostHeader = (c.req.header('host') || '').toLowerCase();
  return (
    hostname === 'localhost' ||
    hostname === '127.0.0.1' ||
    hostHeader.startsWith('localhost:') ||
    hostHeader.startsWith('127.0.0.1:') ||
    hostHeader === 'localhost' ||
    hostHeader === '127.0.0.1' ||
    c.env.ENABLE_DEV_AUTH_BYPASS === 'true'
  );
}

sigvoosRouter.use('*', async (c, next) => {
  const pathname = new URL(c.req.url).pathname;
  if (pathname.endsWith('/maintenance/sincronizar-frms')) {
    await next();
    return;
  }
  return requireRole('admin', 'manager')(c as any, next);
});

const ConfigSchema = z.object({
  username: z.string().min(1).optional(),
  password: z.string().min(1).optional(),
  system: z.string().min(1).optional(),
  base_url: z.string().url().optional(),
  auto_sync_enabled: z.boolean().optional(),
  auto_sync_hora_utc: z.number().int().min(0).max(23).optional(),
  notificar_falha_email: z.string().trim().email().optional().nullable(),
});

const SyncSchema = z.object({
  from: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional(),
  to: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional(),
  pageSize: z.number().int().min(1).max(500).optional(),
  maxPages: z.number().int().min(1).max(500).optional(),
  clearExisting: z.boolean().optional(),
  username: z.string().min(1).optional(),
  password: z.string().min(1).optional(),
  system: z.string().min(1).optional(),
  baseUrl: z.string().url().optional(),
  chunkDays: z.number().int().min(1).max(7).optional(),
  retryAttempts: z.number().int().min(0).max(3).optional(),
});

const MaintenanceSyncSchema = SyncSchema.extend({
  empresaId: z.number().int().positive().optional(),
});

const ReconcileSchema = z.object({
  from: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional(),
  to: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional(),
  pageSize: z.number().int().min(1).max(500).optional(),
  maxPages: z.number().int().min(1).max(500).optional(),
  username: z.string().min(1).optional(),
  password: z.string().min(1).optional(),
  system: z.string().min(1).optional(),
  baseUrl: z.string().url().optional(),
  chunkDays: z.number().int().min(1).max(7).optional(),
  retryAttempts: z.number().int().min(0).max(3).optional(),
  maxWindows: z.number().int().min(1).max(90).optional(),
});

const ManualMappingSchema = z.object({
  nome_sigvoos: z.string().min(1),
  canac_sigvoos: z.string().trim().optional().nullable(),
  funcionario_id: z.union([z.string(), z.number()]),
});

type SigvoosSyncResult = Awaited<ReturnType<typeof syncSigvoosForFrms>>;

function isWorkerExternalRequestLimitError(errorMessage: string): boolean {
  return errorMessage.includes('Too many API requests by single Worker invocation');
}

function addIsoDays(value: string, days: number): string {
  const parsed = new Date(`${value}T00:00:00Z`);
  if (Number.isNaN(parsed.getTime())) return value;
  parsed.setUTCDate(parsed.getUTCDate() + days);
  return parsed.toISOString().slice(0, 10);
}

function buildDateWindows(
  from: string,
  to: string,
  chunkDays: number,
): Array<{ from: string; to: string }> {
  const windows: Array<{ from: string; to: string }> = [];
  let cursor = from;

  while (cursor <= to) {
    const windowTo = addIsoDays(cursor, chunkDays - 1);
    windows.push({ from: cursor, to: windowTo > to ? to : windowTo });
    cursor = addIsoDays(windowTo, 1);
  }

  return windows;
}

function parseIsoDayToMs(value?: string | null): number | null {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const parsed = Date.parse(`${value}T00:00:00Z`);
  return Number.isFinite(parsed) ? parsed : null;
}

function pickDate(value: unknown): string | null {
  return typeof value === 'string' ? value : null;
}

function mergeIntervals(
  intervals: Array<{ from: number; to: number }>,
): Array<{ from: number; to: number }> {
  if (intervals.length === 0) return [];
  const sorted = [...intervals].sort((a, b) => a.from - b.from);
  const merged: Array<{ from: number; to: number }> = [sorted[0]];

  for (let index = 1; index < sorted.length; index++) {
    const current = sorted[index];
    const last = merged[merged.length - 1];
    if (current.from <= last.to + 86400000) {
      last.to = Math.max(last.to, current.to);
    } else {
      merged.push({ ...current });
    }
  }

  return merged;
}

function buildUnresolvedErrorWindows(
  eventos: Array<{ status: string; payload_json: string | null }>,
): Array<{ from: string; to: string }> {
  const successIntervals = mergeIntervals(
    eventos
      .filter((item) => item.status === 'SUCESSO')
      .map((item) => {
        let payload: Record<string, unknown> = {};
        try {
          payload = item.payload_json
            ? (JSON.parse(item.payload_json) as Record<string, unknown>)
            : {};
        } catch {
          payload = {};
        }
        const from = parseIsoDayToMs(pickDate(payload.from));
        const to = parseIsoDayToMs(pickDate(payload.to));
        if (from == null || to == null || from > to) return null;
        return { from, to };
      })
      .filter((value): value is { from: number; to: number } => Boolean(value)),
  );

  const unresolved: Array<{ from: string; to: string }> = [];
  for (const item of eventos) {
    if (item.status !== 'ERRO') continue;
    let payload: Record<string, unknown> = {};
    try {
      payload = item.payload_json ? (JSON.parse(item.payload_json) as Record<string, unknown>) : {};
    } catch {
      payload = {};
    }
    const from = parseIsoDayToMs(pickDate(payload.from));
    const to = parseIsoDayToMs(pickDate(payload.to));
    if (from == null || to == null || from > to) continue;

    let cursor = from;
    let covered = false;
    for (const interval of successIntervals) {
      if (interval.to < cursor) continue;
      if (interval.from > cursor) break;
      cursor = Math.max(cursor, interval.to + 86400000);
      if (cursor > to) {
        covered = true;
        break;
      }
    }

    if (!covered) {
      const fromValue = pickDate(payload.from);
      const toValue = pickDate(payload.to);
      if (fromValue && toValue) {
        unresolved.push({ from: fromValue, to: toValue });
      }
    }
  }

  return unresolved;
}

async function runSegmentedSync(
  db: D1Database,
  empresaId: number | null | undefined,
  operadorId: string,
  input: z.infer<typeof SyncSchema>,
  runtimeEnv: Env,
): Promise<{
  summary: SigvoosSyncResult;
  windows: Array<{ from: string; to: string; success: boolean; error?: string }>;
}> {
  const chunkDays = input.chunkDays ?? 1;
  const retryAttempts = input.retryAttempts ?? 1;
  const windows = buildDateWindows(String(input.from), String(input.to), chunkDays);

  const merged: SigvoosSyncResult = {
    periodo: { from: String(input.from), to: String(input.to) },
    resetExecutado: Boolean(input.clearExisting),
    totalRegistrosBrutos: 0,
    totalRegistrosNormalizados: 0,
    totalDiasAgrupados: 0,
    totalImportacoes: 0,
    totalImportados: 0,
    totalSubstituidos: 0,
    totalIgnorados: 0,
    totalErros: 0,
    camposDetectados: [],
    exemplosNormalizados: [],
    exemplosBrutos: [],
    importacoes: [],
  };

  const execution: Array<{ from: string; to: string; success: boolean; error?: string }> = [];

  for (let index = 0; index < windows.length; index++) {
    const window = windows[index];
    let lastError = '';
    let result: SigvoosSyncResult | null = null;

    for (let attempt = 0; attempt <= retryAttempts; attempt++) {
      try {
        result = await syncSigvoosForFrms(db, empresaId, operadorId, {
          ...input,
          from: window.from,
          to: window.to,
          clearExisting: Boolean(input.clearExisting && index === 0 && attempt === 0),
        }, runtimeEnv);
        break;
      } catch (error) {
        lastError = error instanceof Error ? error.message : String(error ?? 'SIGVOOS_SYNC_FAILED');
      }
    }

    if (!result) {
      execution.push({ from: window.from, to: window.to, success: false, error: lastError });
      continue;
    }

    execution.push({ from: window.from, to: window.to, success: true });
    merged.totalRegistrosBrutos += Number(result.totalRegistrosBrutos || 0);
    merged.totalRegistrosNormalizados += Number(result.totalRegistrosNormalizados || 0);
    merged.totalDiasAgrupados += Number(result.totalDiasAgrupados || 0);
    merged.totalImportacoes += Number(result.totalImportacoes || 0);
    merged.totalImportados += Number(result.totalImportados || 0);
    merged.totalSubstituidos += Number(result.totalSubstituidos || 0);
    merged.totalIgnorados += Number(result.totalIgnorados || 0);
    merged.totalErros += Number(result.totalErros || 0);
    merged.camposDetectados = [
      ...new Set([...merged.camposDetectados, ...(result.camposDetectados || [])]),
    ].sort();
    merged.importacoes.push(...(result.importacoes || []));
  }

  return { summary: merged, windows: execution };
}

function formatSigvoosSyncError(error: unknown): {
  status: number;
  code: string;
  message: string;
} {
  const raw = error instanceof Error ? error.message : String(error ?? 'SIGVOOS_SYNC_FAILED');

  if (raw === 'SIGVOOS_INVALID_SYNC_RANGE') {
    return {
      status: 400,
      code: 'SIGVOOS_INVALID_SYNC_RANGE',
      message: 'Periodo invalido: a data inicial deve ser menor ou igual a data final.',
    };
  }

  if (raw === 'SIGVOOS_CREDENTIALS_MISSING') {
    return {
      status: 400,
      code: 'SIGVOOS_CREDENTIALS_MISSING',
      message: 'Credenciais SIGVOOS ausentes. Informe usuario e senha antes de sincronizar.',
    };
  }

  if (raw.startsWith('SIGVOOS_HTTP_401') || raw.startsWith('SIGVOOS_HTTP_403')) {
    return {
      status: 401,
      code: 'SIGVOOS_AUTH_FAILED',
      message: 'SIGVOOS rejeitou as credenciais informadas.',
    };
  }

  if (raw.startsWith('SIGVOOS_HTTP_')) {
    return {
      status: 502,
      code: 'SIGVOOS_PROVIDER_ERROR',
      message: 'SIGVOOS retornou erro ao consultar os voos para o periodo solicitado.',
    };
  }

  if (raw.startsWith('SIGVOOS_AUTH_INVALID_RESPONSE')) {
    return {
      status: 502,
      code: 'SIGVOOS_AUTH_INVALID_RESPONSE',
      message: 'Resposta de autenticacao do SIGVOOS veio em formato inesperado.',
    };
  }

  return {
    status: 500,
    code: 'SIGVOOS_SYNC_ERROR',
    message: 'Erro ao sincronizar SIGVOOS. Consulte o historico para detalhes da execucao.',
  };
}

sigvoosRouter.get('/ping', async (c) => {
  await ensureSigvoosTables(c.env.DB);
  return c.json({ success: true, data: { provider: 'sigvoos', status: 'ready' } });
});

sigvoosRouter.get('/config', async (c) => {
  const empresaId = getEmpresaIdSafe(c);
  const config = await getSigvoosConfig(c.env.DB, empresaId, undefined, c.env);
  return c.json({ success: true, data: sanitizeSigvoosConfig(config) });
});

sigvoosRouter.put('/config', async (c) => {
  const empresaId = getEmpresaIdSafe(c);
  const body = await c.req.json();
  const parsed = ConfigSchema.safeParse(body);
  if (!parsed.success) {
    return c.json(
      {
        success: false,
        error: 'Dados invalidos',
        code: 'VALIDATION_ERROR',
        details: parsed.error.flatten(),
      },
      400,
    );
  }

  if (parsed.data.username !== undefined) {
    await upsertSigvoosConfig(c.env.DB, 'username', parsed.data.username, empresaId, c.env);
  }
  if (parsed.data.password !== undefined) {
    await upsertSigvoosConfig(c.env.DB, 'password', parsed.data.password, empresaId, c.env);
  }
  if (parsed.data.system !== undefined) {
    await upsertSigvoosConfig(c.env.DB, 'system', parsed.data.system, empresaId, c.env);
  }
  if (parsed.data.base_url !== undefined) {
    await upsertSigvoosConfig(c.env.DB, 'base_url', parsed.data.base_url, empresaId, c.env);
  }
  if (parsed.data.auto_sync_enabled !== undefined) {
    await upsertSigvoosConfig(
      c.env.DB,
      'auto_sync_enabled',
      String(parsed.data.auto_sync_enabled),
      empresaId,
      c.env,
    );
  }
  if (parsed.data.auto_sync_hora_utc !== undefined) {
    await upsertSigvoosConfig(
      c.env.DB,
      'auto_sync_hora_utc',
      String(parsed.data.auto_sync_hora_utc),
      empresaId,
      c.env,
    );
  }
  if (parsed.data.notificar_falha_email !== undefined) {
    const normalized = parsed.data.notificar_falha_email
      ? parsed.data.notificar_falha_email.trim().toLowerCase()
      : null;
    await upsertSigvoosConfig(c.env.DB, 'notificar_falha_email', normalized, empresaId, c.env);
  }

  const config = await getSigvoosConfig(c.env.DB, empresaId, undefined, c.env);
  return c.json({ success: true, data: sanitizeSigvoosConfig(config) });
});

sigvoosRouter.get('/historico', async (c) => {
  const empresaId = getEmpresaIdSafe(c);
  const limit = Math.max(1, Math.min(100, Number(c.req.query('limit') || '50')));
  const eventos = await listSigvoosEventos(c.env.DB, empresaId, limit);
  return c.json({ success: true, data: eventos });
});

sigvoosRouter.get('/mapeamento-manual', async (c) => {
  const empresaId = getEmpresaIdSafe(c);
  // Sequential to avoid concurrent DDL locks (ensureSigvoosTables in each)
  try {
    const mapeamentos = await listSigvoosManualMappings(c.env.DB, empresaId);
    const naoMapeados = await listSigvoosUnmappedTripulantes(c.env.DB, empresaId);
    return c.json({
      success: true,
      data: {
        mapeamentos,
        naoMapeados,
      },
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err ?? 'unknown');
    console.error('[sigvoos] mapeamento-manual 500:', msg);
    return c.json({ success: false, error: msg, code: 'INTERNAL_ERROR' }, 500);
  }
});

sigvoosRouter.get('/pendentes', async (c) => {
  const empresaId = getEmpresaIdSafe(c);
  const limit = Math.max(1, Math.min(500, Number(c.req.query('limit') || '200')));
  const pendentes = await listSigvoosPendencias(c.env.DB, empresaId, limit);
  return c.json({ success: true, data: pendentes });
});

sigvoosRouter.post('/mapeamento-manual', async (c) => {
  const empresaId = getEmpresaIdSafe(c);
  const body = await c.req.json().catch(() => ({}));
  const parsed = ManualMappingSchema.safeParse(body);

  if (!parsed.success) {
    return c.json(
      {
        success: false,
        error: 'Dados invalidos',
        code: 'VALIDATION_ERROR',
        details: parsed.error.flatten(),
      },
      400,
    );
  }

  const mapping = await upsertSigvoosManualMapping(c.env.DB, empresaId, {
    nomeSigvoos: parsed.data.nome_sigvoos,
    canacSigvoos: parsed.data.canac_sigvoos,
    funcionarioId: parsed.data.funcionario_id,
  });

  return c.json({ success: true, data: mapping });
});

sigvoosRouter.post('/mapear', async (c) => {
  const empresaId = getEmpresaIdSafe(c);
  const operadorId = String(c.get('userId') || '0');
  const body = await c.req.json().catch(() => ({}));
  const parsed = ManualMappingSchema.safeParse(body);

  if (!parsed.success) {
    return c.json(
      {
        success: false,
        error: 'Dados invalidos',
        code: 'VALIDATION_ERROR',
        details: parsed.error.flatten(),
      },
      400,
    );
  }

  try {
    const result = await mapearSigvoosPendenciaERreprocessar(
      c.env.DB,
      empresaId,
      {
        nomeSigvoos: parsed.data.nome_sigvoos,
        canacSigvoos: parsed.data.canac_sigvoos,
        funcionarioId: parsed.data.funcionario_id,
      },
      operadorId,
    );
    return c.json({ success: true, data: result });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err ?? 'unknown');
    console.error('[sigvoos] /mapear error:', msg);
    return c.json({ success: false, error: msg, code: 'INTERNAL_ERROR' }, 500);
  }
});

sigvoosRouter.post('/sincronizar-frms', async (c) => {
  const empresaId = getEmpresaIdSafe(c);
  const operadorId = String(c.get('userId') || '0');
  const body = await c.req.json();
  const parsed = SyncSchema.safeParse(body);

  if (!parsed.success) {
    return c.json(
      {
        success: false,
        error: 'Dados invalidos',
        code: 'VALIDATION_ERROR',
        details: parsed.error.flatten(),
      },
      400,
    );
  }

  try {
    const shouldChunk = Boolean(
      parsed.data.chunkDays && parsed.data.chunkDays > 0 && parsed.data.from && parsed.data.to,
    );
    if (shouldChunk) {
      const { summary, windows } = await runSegmentedSync(
        c.env.DB,
        empresaId,
        operadorId,
        parsed.data,
        c.env,
      );
      return c.json({ success: true, data: summary, windows });
    }

    const result = await syncSigvoosForFrms(c.env.DB, empresaId, operadorId, parsed.data, c.env);
    return c.json({ success: true, data: result });
  } catch (error) {
    const formatted = formatSigvoosSyncError(error);
    const safeInput = {
      ...parsed.data,
      ...(parsed.data.password ? { password: '__REDACTED__' } : {}),
    };
    console.error('[sigvoos] sync error:', {
      empresaId,
      operadorId,
      input: safeInput,
      error,
    });

    return c.json(
      {
        success: false,
        error: formatted.message,
        code: formatted.code,
      },
      formatted.status as 400 | 401 | 500 | 502,
    );
  }
});

sigvoosRouter.post('/reprocessar-previews', async (c) => {
  const empresaId = getEmpresaIdSafe(c);
  const operadorId = String(c.get('userId') || '0');
  await ensureSigvoosTables(c.env.DB);
  const result = await reprocessarPreviewsSigvoosSemTripulante(c.env.DB, empresaId, operadorId);
  return c.json({ success: true, data: result });
});

sigvoosRouter.post('/reconciliar-pendencias', async (c) => {
  const empresaId = getEmpresaIdSafe(c);
  const operadorId = String(c.get('userId') || '0');
  const body = await c.req.json().catch(() => ({}));
  const parsed = ReconcileSchema.safeParse(body);

  if (!parsed.success) {
    return c.json(
      {
        success: false,
        error: 'Dados invalidos',
        code: 'VALIDATION_ERROR',
        details: parsed.error.flatten(),
      },
      400,
    );
  }

  const eventos = await listSigvoosEventos(c.env.DB, empresaId, 300);
  const unresolved = buildUnresolvedErrorWindows(eventos as { status: string; payload_json: string | null }[]);
  const withRange = unresolved.filter((item) => {
    if (!parsed.data.from || !parsed.data.to) return true;
    return !(item.to < parsed.data.from || item.from > parsed.data.to);
  });

  if (withRange.length === 0) {
    return c.json({
      success: true,
      data: {
        totalPendencias: 0,
        totalJanelasExecutadas: 0,
        windows: [],
      },
    });
  }

  const chunkDays = parsed.data.chunkDays ?? 1;
  const retryAttempts = parsed.data.retryAttempts ?? 1;
  const maxWindows = parsed.data.maxWindows ?? 3;
  const windows = withRange
    .flatMap((range) => buildDateWindows(range.from, range.to, chunkDays))
    .slice(0, maxWindows);

  const execution: Array<{ from: string; to: string; success: boolean; error?: string }> = [];
  let totalImportados = 0;
  let totalErros = 0;

  for (const window of windows) {
    let result: SigvoosSyncResult | null = null;
    let lastError = '';
    for (let attempt = 0; attempt <= retryAttempts; attempt++) {
      try {
        result = await syncSigvoosForFrms(c.env.DB, empresaId, operadorId, {
          ...parsed.data,
          from: window.from,
          to: window.to,
          clearExisting: false,
        }, c.env);
        break;
      } catch (error) {
        lastError = error instanceof Error ? error.message : String(error ?? 'SIGVOOS_SYNC_FAILED');
      }
    }

    if (!result) {
      execution.push({ from: window.from, to: window.to, success: false, error: lastError });
      if (isWorkerExternalRequestLimitError(lastError)) {
        break;
      }
      continue;
    }

    totalImportados += Number(result.totalImportados || 0);
    totalErros += Number(result.totalErros || 0);
    execution.push({ from: window.from, to: window.to, success: true });
  }

  const eventosAtualizados = await listSigvoosEventos(c.env.DB, empresaId, 300);
  const pendenciasRestantes = buildUnresolvedErrorWindows(eventosAtualizados as { status: string; payload_json: string | null }[]).filter((item) => {
    if (!parsed.data.from || !parsed.data.to) return true;
    return !(item.to < parsed.data.from || item.from > parsed.data.to);
  });

  return c.json({
    success: true,
    data: {
      totalPendencias: withRange.length,
      totalPendenciasRestantes: pendenciasRestantes.length,
      totalJanelasExecutadas: execution.length,
      totalImportados,
      totalErros,
      windows: execution,
    },
  });
});

sigvoosRouter.post('/maintenance/sincronizar-frms', async (c) => {
  if (!(await isLocalMaintenanceRequest(c))) {
    return c.json({ success: false, error: 'Rota disponivel apenas em localhost.' }, 403);
  }

  const maintenanceSecret = c.env.MAINTENANCE_SECRET;
  if (!maintenanceSecret) {
    return c.json({ success: false, error: 'Maintenance endpoint not configured.' }, 503);
  }
  const providedToken =
    c.req.header('x-airtrust-maintenance') ?? c.req.header('x-maintenance-secret') ?? '';
  if (!providedToken || !(await secureCompare(providedToken, maintenanceSecret))) {
    console.warn('[sigvoos-maintenance] Invalid secret attempt from', c.req.header('CF-Connecting-IP'));
    return c.json({ success: false, error: 'Token de manutencao invalido.' }, 403);
  }

  const body = await c.req.json();
  const parsed = MaintenanceSyncSchema.safeParse(body);
  if (!parsed.success) {
    return c.json(
      {
        success: false,
        error: 'Dados invalidos',
        code: 'VALIDATION_ERROR',
        details: parsed.error.flatten(),
      },
      400,
    );
  }

  const empresaId = parsed.data.empresaId ?? 1;
  try {
    const result = await syncSigvoosForFrms(c.env.DB, empresaId, '0', parsed.data, c.env);
    return c.json({ success: true, data: result });
  } catch (err) {
    console.error('[sigvoos-maintenance] sync error:', err);
    return c.json(
      { success: false, error: 'Erro ao sincronizar SIGVOOS', code: 'SYNC_ERROR' },
      500,
    );
  }
});

export { sigvoosRouter };
