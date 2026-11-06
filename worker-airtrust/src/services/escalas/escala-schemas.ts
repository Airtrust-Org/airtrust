/**
 * ESCALAS — schemas Zod e parse de body do domínio.
 * Movido de routes/escalas-shared.ts; a rota continua reexportando estes símbolos.
 */

import { z } from 'zod';

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
