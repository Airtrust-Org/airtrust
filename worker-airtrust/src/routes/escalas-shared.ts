/**
 * ESCALAS — Shared utilities, helpers, and schemas
 * Imported by escalas-core.ts and all sub-module files.
 */

import { z } from 'zod';
import { getEmpresaId } from '../middleware/tenant';
// eslint-disable-next-line @typescript-eslint/no-explicit-any
import type { Context } from 'hono';

// ================================================================
// HELPERS — empresa ID
// ================================================================

/**
 * Wrapper seguro para obter empresaId.
 * auth() seta c.set('empresaId', ...) diretamente, enquanto
 * getEmpresaId() busca via tenantContext (setado por middleware separado).
 * Este wrapper tenta ambos os caminhos.
 */
export function getEmpresaIdSafe(c: Context<any>): number {
  try {
    return getEmpresaId(c);
  } catch {
    return (c.get('empresaId' as never) as number) || 0;
  }
}

export function getEmpresaIdOptional(c: Context<any>): number | undefined {
  try {
    return getEmpresaId(c);
  } catch {
    const raw = c.get('empresaId' as never) as unknown;
    const parsed = typeof raw === 'string' ? Number(raw) : (raw as number);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : undefined;
  }
}

/**
 * Carrega escala verificando pertencimento ao tenant (IDOR guard).
 * Retorna null se não existir ou não pertencer ao empresaId.
 */
export async function getEscalaVerificada(
  db: D1Database,
  id: string,
  empresaId: number,
): Promise<Record<string, unknown> | null> {
  if (!empresaId) return null;
  return db
    .prepare(`SELECT * FROM escalas_mensais WHERE id = ? AND empresa_id = ? AND deleted_at IS NULL`)
    .bind(id, empresaId)
    .first();
}

/**
 * Carrega escala e rejeita se estiver publicada.
 * Usar em endpoints de mutação (POST/PUT/DELETE) para garantir que escalas
 * publicadas só sejam alteradas após iniciar uma nova revisão.
 */
export async function getEscalaVerificadaParaMutacao(
  db: D1Database,
  id: string,
  empresaId: number,
): Promise<{ escala: Record<string, unknown> } | { error: string; status: number }> {
  if (!empresaId) return { error: 'Empresa não identificada', status: 400 };
  const escala = await db
    .prepare(`SELECT * FROM escalas_mensais WHERE id = ? AND empresa_id = ? AND deleted_at IS NULL`)
    .bind(id, empresaId)
    .first<Record<string, unknown>>();
  if (!escala) return { error: 'Escala não encontrada', status: 404 };
  if (escala.status === 'publicada') {
    return {
      error: 'Escala publicada não pode ser modificada diretamente. Inicie uma nova revisão primeiro.',
      status: 409,
    };
  }
  return { escala };
}

// ================================================================
// HELPER: safe parse + respond
// ================================================================
export function parseBody<T>(
  schema: z.ZodSchema<T>,
  data: unknown,
): { ok: true; data: T } | { ok: false; error: string } {
  const result = schema.safeParse(data);
  if (!result.success) {
    return { ok: false, error: result.error.issues.map((i) => i.message).join(', ') };
  }
  return { ok: true, data: result.data };
}

// ================================================================
// SCHEMAS ZOD
// ================================================================

export const TIPOS_EVENTO = [
  'voo',
  'viagem',
  'treinamento_solo',
  'treinamento_simulador',
  'medico',
  'cheque',
  'reaquisi',
  'trabalho',
  'folga',
  'standby',
  'ferias',
  'licenca',
] as const;

export const EscalaMensalSchema = z.object({
  mes: z.number().min(1).max(12),
  ano: z.number().min(2024).max(2035),
  titulo: z.string().optional(),
  observacoes: z.string().optional(),
  periodo: z.enum(['primeira', 'segunda', 'personalizada']).optional(),
});

const IdCoerceSchema = z
  .union([z.string(), z.number()])
  .transform((value) => String(value).trim())
  .refine((value) => value.length > 0, 'ID inválido');

const OptionalIdCoerceSchema = z
  .union([z.string(), z.number(), z.null(), z.undefined()])
  .transform((value) => {
    if (value === null || value === undefined) return undefined;
    const normalized = String(value).trim();
    return normalized.length > 0 ? normalized : undefined;
  });

const IsoDateSchema = z.preprocess(
  (value) => {
    if (typeof value !== 'string') return value;
    const trimmed = value.trim();
    const brMatch = trimmed.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
    if (!brMatch) return trimmed;
    const [, dd, mm, yyyy] = brMatch;
    return `${yyyy}-${mm}-${dd}`;
  },
  z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Data deve estar no formato YYYY-MM-DD'),
);

export const TripulacaoSchema = z
  .object({
    pic_id: IdCoerceSchema,
    sic_id: OptionalIdCoerceSchema,
    data_inicio: IsoDateSchema,
    data_fim: IsoDateSchema,
    padrao_escala_id: OptionalIdCoerceSchema,
    aeronave_id: OptionalIdCoerceSchema,
    aeronave: z.string().optional(),
    base: z.string().optional(),
    restricoes: z.record(z.unknown()).optional(),
    observacoes: z.string().optional(),
  })
  .refine((data) => !data.sic_id || data.sic_id !== data.pic_id, {
    path: ['sic_id'],
    message: 'SIC não pode ser o mesmo piloto que o PIC',
  });

export const EventoSchema = z.object({
  tripulacao_id: z.string().optional(),
  funcionario_id: z.string(),
  tipo_evento: z.enum(TIPOS_EVENTO),
  data_inicio: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  data_fim: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  turno: z.enum(['manha', 'tarde', 'noite', 'dia_todo']).optional(),
  local: z.string().optional(),
  aeronave: z.string().optional(),
  simulador_id: z.string().optional(),
  certificacao_id: z.string().optional(),
  status: z.enum(['confirmado', 'pendente', 'cancelado']).default('confirmado'),
  observacoes: z.string().optional(),
});

export const AlterarStatusSchema = z.object({
  status: z.enum(['rascunho', 'em_revisao', 'aprovada', 'publicada', 'arquivada']),
  justificativa: z.string().optional(),
});

export const PadraoEscalaSchema = z.object({
  nome: z.string().min(1),
  dias_trabalho: z.number().min(0),
  dias_folga: z.number().min(0),
  descricao: z.string().optional(),
  ativo: z.number().min(0).max(1).default(1),
});

export const RestricaoTripulacaoSchema = z.object({
  funcionario_a_id: z.string(),
  funcionario_b_id: z.string(),
  tipo_restricao: z.enum(['nao_pode_voar_junto', 'preferencial', 'contratual']),
  motivo: z.string().optional(),
  contrato_referencia: z.string().optional(),
  data_inicio: z.string().optional(),
  data_fim: z.string().optional(),
});

// ================================================================
// gerarEventosBase — auto-fill VOO/FOL when crew assigned
// ================================================================

interface GerarEventosBaseParams {
  db: D1Database;
  empresa_id?: string | number | null;
  escala_id: string;
  tripulacao_id: string;
  funcionario_id: string;
  data_inicio: string; // YYYY-MM-DD
  data_fim: string; // YYYY-MM-DD
  padrao_escala_id?: string | null;
  aeronave?: string | null;
  base?: string | null;
  created_by: string;
}

/**
 * Generates base VOO/FOL events for a crew member for the entire month of the
 * selected allocation.
 *
 * Business rule:
 * - selected `data_inicio` → `data_fim` = VOO
 * - remaining days of the same month = FOL
 *
 * - Marks all events as gerado_automaticamente=1
 * - Skips dates where the funcionário already has manual events
 */
export async function gerarEventosBase(params: GerarEventosBaseParams): Promise<number> {
  const {
    db,
    empresa_id,
    escala_id,
    tripulacao_id,
    funcionario_id,
    data_inicio,
    data_fim,
    padrao_escala_id,
    aeronave,
    base,
    created_by,
  } = params;
  const now = new Date().toISOString();

  const padraoLabel = padrao_escala_id ? ` (padrão ${padrao_escala_id})` : '';

  // Get existing manual events for this funcionário in this escala (so we skip those dates)
  const existingRows = await db
    .prepare(
      `SELECT data_inicio, data_fim FROM escala_eventos
       WHERE escala_id = ? AND funcionario_id = ?
         AND gerado_automaticamente = 0 AND deleted_at IS NULL
         AND (? IS NULL OR EXISTS (
           SELECT 1 FROM escalas_mensais em
            WHERE em.id = escala_eventos.escala_id AND em.empresa_id = ? AND em.deleted_at IS NULL
         ))`,
    )
    .bind(escala_id, funcionario_id, empresa_id ?? null, empresa_id ?? null)
    .all<{ data_inicio: string; data_fim: string }>();

  const manualDates = new Set<string>();
  for (const row of existingRows.results || []) {
    // Mark all dates covered by manual events
    const s = new Date(row.data_inicio + 'T00:00:00Z');
    const e = new Date(row.data_fim + 'T00:00:00Z');
    for (let d = new Date(s); d <= e; d.setUTCDate(d.getUTCDate() + 1)) {
      manualDates.add(d.toISOString().slice(0, 10));
    }
  }

  // Generate month-wide day-by-day plan
  const start = new Date(`${data_inicio}T12:00:00Z`);
  const end = new Date(`${data_fim}T12:00:00Z`);
  const monthStart = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth(), 1, 12, 0, 0));
  const monthEnd = new Date(Date.UTC(end.getUTCFullYear(), end.getUTCMonth() + 1, 0, 12, 0, 0));

  const stmts: D1PreparedStatement[] = [];
  for (let d = new Date(monthStart); d <= monthEnd; d.setUTCDate(d.getUTCDate() + 1)) {
    const dateStr = d.toISOString().slice(0, 10);

    // Skip if there's already a manual event on this date
    if (manualDates.has(dateStr)) {
      continue;
    }

    const dentroDaAlocacao = dateStr >= data_inicio && dateStr <= data_fim;
    const tipoEvento = dentroDaAlocacao ? 'voo' : 'folga';
    const motivo = dentroDaAlocacao
      ? `Auto-gerado — VOO dentro do período alocado${padraoLabel}`
      : `Auto-gerado — FOL fora do período alocado${padraoLabel}`;

    const eventId = crypto.randomUUID();
    stmts.push(
      db
        .prepare(
          `INSERT INTO escala_eventos
         (id, escala_id, tripulacao_id, funcionario_id, tipo_evento, data_inicio, data_fim,
          turno, local, aeronave, gerado_automaticamente, motivo_automatico, status,
          origem, created_by, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, 'dia_todo', ?, ?, 1, ?, 'confirmado', 'auto_quinzena', ?, ?, ?)`,
        )
        .bind(
          eventId,
          escala_id,
          tripulacao_id,
          funcionario_id,
          tipoEvento,
          dateStr,
          dateStr,
          base || null,
          aeronave || null,
          motivo,
          created_by,
          now,
          now,
        ),
    );
  }

  // Execute in batch
  if (stmts.length > 0) {
    await db.batch(stmts);
  }
  return stmts.length;
}

/**
 * Removes all auto-generated events for a specific tripulação.
 * Called before regenerating or when tripulação is deleted.
 */
export async function removerEventosAutoGerados(
  db: D1Database,
  escala_id: string,
  tripulacao_id: string,
): Promise<number> {
  const now = new Date().toISOString();
  const result = await db
    .prepare(
      `UPDATE escala_eventos SET deleted_at = ?
       WHERE escala_id = ? AND tripulacao_id = ? AND gerado_automaticamente = 1 AND deleted_at IS NULL`,
    )
    .bind(now, escala_id, tripulacao_id)
    .run();
  return result.meta?.changes ?? 0;
}
