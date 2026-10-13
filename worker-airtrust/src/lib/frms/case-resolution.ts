import { z } from 'zod';

const FrmsCaseTreatmentSchema = z.object({
  responsavel: z.string().trim().min(2).max(120),
  prazo: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  acao_mitigacao: z.string().trim().min(10).max(1000),
  justificativa: z.string().trim().min(10).max(1000),
  evidencia_referencia: z.string().trim().max(500).optional().nullable(),
});

const FrmsCaseResolutionSchema = FrmsCaseTreatmentSchema.extend({
  avaliacao_eficacia: z.string().trim().min(10).max(1000),
});

export type FrmsCaseTreatment = z.infer<typeof FrmsCaseTreatmentSchema>;

/** Track an intervention without falsely marking the FRMS alert as resolved. */
export function buildFrmsCaseTreatmentNotes(body: unknown, userId: string): string | null {
  const parsed = FrmsCaseTreatmentSchema.safeParse(body);
  if (!parsed.success) return null;
  return JSON.stringify({
    schema: 'FRMS_CASE_TREATMENT_V1',
    ...parsed.data,
    registrado_por: userId,
    registrado_em: new Date().toISOString(),
  });
}

/** Only a previously registered treatment can be verified and closed. */
export function readFrmsPendingTreatment(value: unknown): FrmsCaseTreatment | null {
  if (typeof value !== 'string') return null;
  try {
    const raw: unknown = JSON.parse(value);
    if (!raw || typeof raw !== 'object' ||
        (raw as { schema?: unknown }).schema !== 'FRMS_CASE_TREATMENT_V1') return null;
    const parsed = FrmsCaseTreatmentSchema.safeParse(raw);
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}

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
