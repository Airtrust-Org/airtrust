import { z } from 'zod';

function normalizeDateInput(value: unknown): unknown {
  if (typeof value !== 'string') return value;
  const trimmed = value.trim();
  if (!trimmed) return trimmed;

  const brMatch = trimmed.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (brMatch) {
    const [, dd, mm, yyyy] = brMatch;
    return `${yyyy}-${mm}-${dd}`;
  }

  return trimmed;
}

const requiredIdSchema = z
  .union([z.string(), z.number()])
  .transform((value) => String(value).trim())
  .refine((value) => value.length > 0, 'Selecione um piloto válido');

const optionalIdSchema = z
  .union([z.string(), z.number(), z.null(), z.undefined()])
  .transform((value) => {
    if (value === null || value === undefined) return undefined;
    const normalized = String(value).trim();
    return normalized.length > 0 ? normalized : undefined;
  });

const isoDateSchema = z.preprocess(
  normalizeDateInput,
  z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use uma data válida no formato YYYY-MM-DD'),
);

export const tripulacaoFormSchema = z
  .object({
    pic_id: requiredIdSchema,
    sic_id: optionalIdSchema,
    data_inicio: isoDateSchema,
    data_fim: isoDateSchema,
    padrao_escala_id: optionalIdSchema,
    aeronave_id: optionalIdSchema,
    aeronave: z.string().trim().min(1, 'Selecione a aeronave'),
    base: z.union([z.string(), z.null(), z.undefined()]).transform((value) => {
      if (value === null || value === undefined) return undefined;
      const normalized = value.trim();
      return normalized.length > 0 ? normalized : undefined;
    }),
    observacoes: z.union([z.string(), z.null(), z.undefined()]).transform((value) => {
      if (value === null || value === undefined) return undefined;
      const normalized = value.trim();
      return normalized.length > 0 ? normalized : undefined;
    }),
  })
  .refine((data) => data.data_fim >= data.data_inicio, {
    path: ['data_fim'],
    message: 'Data fim deve ser posterior ao início',
  })
  .refine((data) => !data.sic_id || data.sic_id !== data.pic_id, {
    path: ['sic_id'],
    message: 'SIC não pode ser o mesmo piloto que o PIC',
  });

export type TripulacaoFormBody = z.infer<typeof tripulacaoFormSchema>;
