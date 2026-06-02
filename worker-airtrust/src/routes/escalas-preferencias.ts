import { Hono } from 'hono';
import type { Env } from '../types';
import { auth } from '../middleware/auth';
import { getEmpresaIdSafe, parseBody } from './escalas-shared';
import { z } from 'zod';

const preferencias = new Hono<{ Bindings: Env }>();

const ExibirNomeSchema = z.object({
  valor: z.enum(['completo', 'guerra']),
});

const HoraSchema = z.string().regex(/^\d{2}:\d{2}$/);

const PreferenciasSchema = z
  .object({
    exibir_nome: z.enum(['completo', 'guerra']).optional(),
    padrao_quinzena: z.enum(['padrao', 'custom']).optional(),
    turno_a_inicio: HoraSchema.optional(),
    turno_a_fim: HoraSchema.optional(),
    turno_b_inicio: HoraSchema.optional(),
    turno_b_fim: HoraSchema.optional(),
    limite_fdp_dia: z.number().int().min(1).max(24).optional(),
    limite_fdp_noite: z.number().int().min(1).max(24).optional(),
    alerta_cma_ativo: z.boolean().optional(),
    alerta_cma_dias: z.number().int().min(1).max(365).optional(),
  })
  .refine((value) => Object.keys(value).length > 0, {
    message: 'Nenhuma preferência enviada',
  });

const PREFERENCE_KEYS = [
  'escala.exibir_nome',
  'escala.padrao_quinzena',
  'escala.turno_a_inicio',
  'escala.turno_a_fim',
  'escala.turno_b_inicio',
  'escala.turno_b_fim',
  'escala.limite_fdp_dia',
  'escala.limite_fdp_noite',
  'escala.alerta_cma_ativo',
  'escala.alerta_cma_dias',
] as const;

const DEFAULT_PREFERENCIAS = {
  exibir_nome: 'completo' as const,
  exibir_nome_guerra: false,
  padrao_quinzena: 'padrao' as const,
  turno_a_inicio: '07:00',
  turno_a_fim: '19:00',
  turno_b_inicio: '19:00',
  turno_b_fim: '07:00',
  limite_fdp_dia: 14,
  limite_fdp_noite: 11,
  alerta_cma_ativo: true,
  alerta_cma_dias: 30,
};

function getUserId(c: { get: (key: string) => unknown }): string {
  return String((c as { get: (key: string) => unknown }).get('userId') || '');
}

function parseBoolean(value: string | null | undefined, fallback: boolean): boolean {
  if (value === null || value === undefined) return fallback;
  return ['1', 'true', 'yes', 'on'].includes(String(value).trim().toLowerCase());
}

function parseNumber(value: string | null | undefined, fallback: number): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function buildPreferenciasResponse(map: Map<string, string | null>) {
  const exibirNome = map.get('escala.exibir_nome') === 'guerra' ? 'guerra' : 'completo';

  return {
    exibir_nome: exibirNome,
    exibir_nome_guerra: exibirNome === 'guerra',
    padrao_quinzena:
      map.get('escala.padrao_quinzena') === 'custom'
        ? ('custom' as const)
        : DEFAULT_PREFERENCIAS.padrao_quinzena,
    turno_a_inicio: map.get('escala.turno_a_inicio') || DEFAULT_PREFERENCIAS.turno_a_inicio,
    turno_a_fim: map.get('escala.turno_a_fim') || DEFAULT_PREFERENCIAS.turno_a_fim,
    turno_b_inicio: map.get('escala.turno_b_inicio') || DEFAULT_PREFERENCIAS.turno_b_inicio,
    turno_b_fim: map.get('escala.turno_b_fim') || DEFAULT_PREFERENCIAS.turno_b_fim,
    limite_fdp_dia: parseNumber(
      map.get('escala.limite_fdp_dia'),
      DEFAULT_PREFERENCIAS.limite_fdp_dia,
    ),
    limite_fdp_noite: parseNumber(
      map.get('escala.limite_fdp_noite'),
      DEFAULT_PREFERENCIAS.limite_fdp_noite,
    ),
    alerta_cma_ativo: parseBoolean(
      map.get('escala.alerta_cma_ativo'),
      DEFAULT_PREFERENCIAS.alerta_cma_ativo,
    ),
    alerta_cma_dias: parseNumber(
      map.get('escala.alerta_cma_dias'),
      DEFAULT_PREFERENCIAS.alerta_cma_dias,
    ),
  };
}

async function upsertPreferencia(
  db: D1Database,
  params: { usuarioId: string; empresaId: number; chave: string; valor: string; now: string },
) {
  await db
    .prepare(
      `INSERT INTO usuario_preferencias (id, usuario_id, empresa_id, chave, valor, created_at, updated_at, deleted_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, NULL)
       ON CONFLICT(usuario_id, empresa_id, chave)
       DO UPDATE SET valor = excluded.valor, updated_at = excluded.updated_at, deleted_at = NULL`,
    )
    .bind(
      crypto.randomUUID(),
      params.usuarioId,
      params.empresaId,
      params.chave,
      params.valor,
      params.now,
      params.now,
    )
    .run();
}

preferencias.get('/', auth(), async (c) => {
  const db = c.env.DB;
  const empresaId = getEmpresaIdSafe(c);
  const userId = getUserId(c);

  if (!userId) {
    return c.json({ success: false, error: 'Usuário não autenticado' }, 401);
  }

  const rows = await db
    .prepare(
      `SELECT chave, valor
         FROM usuario_preferencias
        WHERE usuario_id = ?
          AND empresa_id = ?
          AND deleted_at IS NULL
          AND chave IN (${PREFERENCE_KEYS.map(() => '?').join(', ')})`,
    )
    .bind(userId, empresaId, ...PREFERENCE_KEYS)
    .all<{ chave: string; valor: string | null }>();

  const map = new Map((rows.results || []).map((row) => [row.chave, row.valor]));

  return c.json({
    success: true,
    data: buildPreferenciasResponse(map),
  });
});

preferencias.put('/', auth(), async (c) => {
  const db = c.env.DB;
  const empresaId = getEmpresaIdSafe(c);
  const userId = getUserId(c);
  const body = await c.req.json().catch(() => ({}));
  const parsed = parseBody(PreferenciasSchema, body);

  if (!parsed.ok) {
    return c.json({ success: false, error: parsed.error }, 400);
  }

  if (!userId) {
    return c.json({ success: false, error: 'Usuário não autenticado' }, 401);
  }

  const now = new Date().toISOString();
  const updates = Object.entries(parsed.data).map(([key, value]) => {
    const dbKey = key === 'exibir_nome' ? 'escala.exibir_nome' : `escala.${key}`;
    const serialized = typeof value === 'boolean' ? String(value) : String(value);
    return upsertPreferencia(db, {
      usuarioId: userId,
      empresaId,
      chave: dbKey,
      valor: serialized,
      now,
    });
  });

  await Promise.all(updates);

  const rows = await db
    .prepare(
      `SELECT chave, valor
         FROM usuario_preferencias
        WHERE usuario_id = ?
          AND empresa_id = ?
          AND deleted_at IS NULL
          AND chave IN (${PREFERENCE_KEYS.map(() => '?').join(', ')})`,
    )
    .bind(userId, empresaId, ...PREFERENCE_KEYS)
    .all<{ chave: string; valor: string | null }>();

  return c.json({
    success: true,
    data: buildPreferenciasResponse(
      new Map((rows.results || []).map((row) => [row.chave, row.valor])),
    ),
  });
});

preferencias.put('/exibir-nome', auth(), async (c) => {
  const db = c.env.DB;
  const empresaId = getEmpresaIdSafe(c);
  const userId = getUserId(c);
  const body = await c.req.json().catch(() => ({}));
  const parsed = parseBody(ExibirNomeSchema, body);

  if (!parsed.ok) {
    return c.json({ success: false, error: parsed.error }, 400);
  }

  if (!userId) {
    return c.json({ success: false, error: 'Usuário não autenticado' }, 401);
  }

  const now = new Date().toISOString();
  await upsertPreferencia(db, {
    usuarioId: userId,
    empresaId,
    chave: 'escala.exibir_nome',
    valor: parsed.data.valor,
    now,
  });

  return c.json({
    success: true,
    data: {
      exibir_nome: parsed.data.valor,
      exibir_nome_guerra: parsed.data.valor === 'guerra',
    },
  });
});

export default preferencias;
