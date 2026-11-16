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

const FrmsCaseReopenSchema = z.object({
  justificativa: z.string().trim().min(10).max(1000),
});

const MAX_REOPEN_HISTORY = 20;

/**
 * Reabertura de caso encerrado: exige justificativa, preserva a resolução anterior (e as
 * anteriores a ela) e deixa o caso SEM tratamento vigente, de modo que um novo responsável,
 * prazo e medida precisem ser registrados antes de novo encerramento.
 */
export function buildFrmsCaseReopenNotes(
  body: unknown,
  userId: string,
  previousNotes: unknown,
): string | null {
  const parsed = FrmsCaseReopenSchema.safeParse(body);
  if (!parsed.success) return null;
  let previous: Record<string, unknown> | null = null;
  if (typeof previousNotes === 'string') {
    try {
      const raw: unknown = JSON.parse(previousNotes);
      if (raw && typeof raw === 'object') previous = raw as Record<string, unknown>;
    } catch {
      previous = { schema: 'LEGACY_TEXT', texto: previousNotes.slice(0, 1000) };
    }
  }
  const history: unknown[] = readFrmsCaseHistory(previousNotes);
  if (previous && previous.schema !== 'FRMS_CASE_REOPENED_V1') {
    const { historico: _carried, ...core } = previous;
    history.push(core);
  }
  return JSON.stringify({
    schema: 'FRMS_CASE_REOPENED_V1',
    justificativa: parsed.data.justificativa,
    reaberto_por: userId,
    reaberto_em: new Date().toISOString(),
    historico: history.slice(-MAX_REOPEN_HISTORY),
  });
}

/** Histórico de encerramentos anteriores carregado nas notas do caso (reaberturas). */
export function readFrmsCaseHistory(notes: unknown): unknown[] {
  if (typeof notes !== 'string') return [];
  try {
    const raw: unknown = JSON.parse(notes);
    const history = raw && typeof raw === 'object' ? (raw as { historico?: unknown }).historico : null;
    return Array.isArray(history) ? [...history] : [];
  } catch {
    return [];
  }
}

/**
 * Novas notas de tratamento/encerramento não podem apagar o histórico de reaberturas:
 * o histórico das notas anteriores é carregado para as novas.
 */
export function carryFrmsCaseHistory(previousNotes: unknown, nextNotes: string): string {
  const history = readFrmsCaseHistory(previousNotes);
  if (history.length === 0) return nextNotes;
  try {
    const next = JSON.parse(nextNotes) as Record<string, unknown>;
    return JSON.stringify({ ...next, historico: history.slice(-MAX_REOPEN_HISTORY) });
  } catch {
    return nextNotes;
  }
}
