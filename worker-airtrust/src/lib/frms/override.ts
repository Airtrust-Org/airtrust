import {
  buildOverrideAckNote,
  parseOverrideAckNote,
  sanitizeOverrideEvidenceRef,
  sanitizeOverrideJustificativa,
  type FrmsDecisaoOverride,
  type FrmsOverrideAckNoteV1,
} from './decision-policy';

export interface BuildFrmsOverrideInput {
  eventId: string;
  empresaId: number;
  responsavelUserId: number;
  justificativa: unknown;
  evidenciaRef?: unknown;
  overrideAt: string;
}

export interface FrmsOverrideStoragePayload {
  override: FrmsDecisaoOverride;
  ackNote: FrmsOverrideAckNoteV1;
  ackNoteJson: string;
}

export function buildFrmsOverridePayload(
  input: BuildFrmsOverrideInput,
): FrmsOverrideStoragePayload | null {
  if (!input.eventId || input.empresaId <= 0 || input.responsavelUserId <= 0) return null;

  const justificativa = sanitizeOverrideJustificativa(input.justificativa);
  if (!justificativa) return null;

  const evidenciaRef = sanitizeOverrideEvidenceRef(input.evidenciaRef);
  const ackNote = buildOverrideAckNote({
    responsavel_user_id: input.responsavelUserId,
    justificativa,
    evidencia_ref: evidenciaRef,
    override_at: input.overrideAt,
  });
  if (!ackNote) return null;

  return {
    override: {
      event_id: input.eventId,
      empresa_id: input.empresaId,
      responsavel_user_id: input.responsavelUserId,
      justificativa,
      evidencia_ref: evidenciaRef,
      timestamp: input.overrideAt,
    },
    ackNote,
    ackNoteJson: JSON.stringify(ackNote),
  };
}

export function parseStoredOverrideAckNote(value: unknown): FrmsOverrideAckNoteV1 | null {
  return parseOverrideAckNote(value);
}

export {
  buildOverrideAckNote,
  parseOverrideAckNote,
  sanitizeOverrideEvidenceRef,
  sanitizeOverrideJustificativa,
};
