import { z } from 'zod';

// Schema para criação/atualização de histórico de qualificação
export const HistoricoQualificacaoSchema = z.object({
  funcionario_cpf: z.string().min(11, 'CPF obrigatório'),
  qualificacao_codigo: z.string().min(1, 'Código da qualificação obrigatório'),
  tipo_treinamento: z
    .enum(['INICIAL', 'RECORRENTE', 'SEMESTRAL', 'UPGRADE', 'ESPECIFICO'])
    .optional(),
  data_conclusao: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, 'data_conclusao deve estar em formato YYYY-MM-DD'),
  data_vencimento: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, 'data_vencimento deve estar em formato YYYY-MM-DD')
    .nullable()
    .optional(),
  instrutor_id: z.number().positive('Instrutor inválido').nullable().optional(), // SECURITY: Use ID for FK validation
  observacoes: z.string().max(500).nullable().optional(),
});

export type HistoricoQualificacaoInput = z.infer<typeof HistoricoQualificacaoSchema>;

// Schema para tipos de qualificação (template)
export const TipoQualificacaoSchema = z.object({
  id: z.union([z.string(), z.number()]).optional(),
  nome: z.string().min(2).max(200),
  codigo: z.string().min(2).max(50),
  categoria: z.string().min(2).max(120),
  validade: z.number().int().positive().max(120).nullable().optional(),
  observacoes: z.string().max(1000).nullable().optional(),
  descricao: z.string().max(1000).nullable().optional(),
  ativo: z.number().int().min(0).max(1).optional(),
});
export type TipoQualificacaoInput = z.infer<typeof TipoQualificacaoSchema>;

// Error formatting helper
export function formatZodError(err: unknown): string {
  if (err && typeof err === 'object' && 'issues' in (err as any)) {
    return (err as any).issues.map((i: any) => `${i.path.join('.')}: ${i.message}`).join('; ');
  }
  return 'Erro de validação';
}
