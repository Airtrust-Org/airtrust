import { z } from 'zod';

const FrmsCaseResolutionSchema = z.object({
  responsavel: z.string().trim().min(2).max(120),
  prazo: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  acao_mitigacao: z.string().trim().min(10).max(1000),
  justificativa: z.string().trim().min(10).max(1000),
  evidencia_referencia: z.string().trim().max(500).optional().nullable(),
  avaliacao_eficacia: z.string().trim().min(10).max(1000),
});

export function buildFrmsCaseResolutionNotes(body: unknown, userId: string): string | null {
  const parsed = FrmsCaseResolutionSchema.safeParse(body);
  if (!parsed.success) return null;

  return JSON.stringify({
    schema: 'FRMS_CASE_RESOLUTION_V1',
    ...parsed.data,
    fechado_por: userId,
    fechado_em: new Date().toISOString(),
  });
}
