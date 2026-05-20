// Import/Validation Schemas using Zod
// NOTE: zod is available in root package.json; for worker, include dependency if needed.
import { z } from 'zod';

// Normalization utilities
export const normalizeCPF = (cpf: string) => (cpf ? cpf.replace(/\D/g, '').padStart(11, '0') : '');
export const normalizeMatricula = (m: string) => (m ? m.trim().toUpperCase() : '');
export const normalizeEmail = (e: string) => (e ? e.trim().toLowerCase() : '');
export const normalizeCodigoAnac = (c: string) => (c ? c.trim().toUpperCase() : '');
export const normalizeCodigoQualificacao = (c: string) => (c ? c.trim().toUpperCase() : '');
export const normalizeISODate = (d: string) => (d ? d.trim() : ''); // assume upstream already ISO, can extend validation

// Base regexes
const cpfRegex = /^[0-9]{11}$/;
const dateRegex = /^\d{4}-\d{2}-\d{2}$/;

// Funcionarios Staging Schema
export const FuncionarioStagingSchema = z.object({
  raw_id: z.string().optional(),
  nome: z.string().min(3),
  guerra: z.string().min(2).optional().nullable(),
  cpf: z
    .string()
    .transform(normalizeCPF)
    .refine((v) => cpfRegex.test(v), 'CPF inválido'),
  matricula: z.string().transform(normalizeMatricula),
  email: z.string().email().transform(normalizeEmail),
  telefone: z.string().optional().nullable(),
  funcao: z.string().optional().nullable(),
  cargo: z.string().optional().nullable(),
  setor: z.string().optional().nullable(),
  codigo_anac: z
    .string()
    .optional()
    .nullable()
    .transform((v) => (v ? normalizeCodigoAnac(v) : v)),
  status: z.enum(['ATIVO', 'INATIVO', 'FERIAS', 'LICENCA']).optional().default('ATIVO'),
  origem: z.string().optional().default('import'),
  raw_json: z.string().optional(),
});
export type FuncionarioStagingDTO = z.infer<typeof FuncionarioStagingSchema>;

// Qualificacoes Staging Schema
export const QualificacaoStagingSchema = z.object({
  raw_id: z.string().optional(),
  funcionario_matricula: z.string().transform(normalizeMatricula),
  qualificacao_codigo: z.string().transform(normalizeCodigoQualificacao),
  data_conclusao: z
    .string()
    .optional()
    .nullable()
    .transform((v) => (v ? normalizeISODate(v) : v))
    .refine((v) => !v || dateRegex.test(v), 'Data conclusao inválida'),
  data_vencimento: z
    .string()
    .optional()
    .nullable()
    .transform((v) => (v ? normalizeISODate(v) : v))
    .refine((v) => !v || dateRegex.test(v), 'Data vencimento inválida'),
  numero_certificado: z.string().optional().nullable(),
  validade_meses: z.number().int().positive().optional().nullable(),
  categoria: z.string().optional().nullable(),
  origem: z.string().optional().default('import'),
  raw_json: z.string().optional(),
});
export type QualificacaoStagingDTO = z.infer<typeof QualificacaoStagingSchema>;

// Result after enrichment
export const EnrichedQualificacaoSchema = QualificacaoStagingSchema.extend({
  funcionario_id: z.number().int(),
  qualificacao_id: z.number().int(),
  codigo: z.string(),
  categoria_final: z.string().optional().nullable(),
});
export type EnrichedQualificacaoDTO = z.infer<typeof EnrichedQualificacaoSchema>;

// Validation batch helper
export function validateBatch<T extends z.ZodTypeAny>(
  schema: T,
  rows: unknown[],
): { ok: boolean; valid: Array<z.infer<T>>; errors: Array<{ index: number; error: string }> } {
  const valid: Array<z.infer<T>> = [];
  const errors: Array<{ index: number; error: string }> = [];
  rows.forEach((r, idx) => {
    const parse = schema.safeParse(r);
    if (parse.success) valid.push(parse.data);
    else errors.push({ index: idx, error: parse.error.message });
  });
  return { ok: errors.length === 0, valid, errors };
}
