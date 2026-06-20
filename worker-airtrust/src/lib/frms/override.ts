import {
  buildOverrideAckNote as buildPolicyOverrideAckNote,
  parseOverrideAckNote as parsePolicyOverrideAckNote,
  sanitizeOverrideEvidenceRef as sanitizePolicyOverrideEvidenceRef,
  sanitizeOverrideJustificativa as sanitizePolicyOverrideJustificativa,
  type FrmsDecisaoOverride,
  type FrmsOverrideAckNoteV1,
} from './decision-policy';

const TECHNICAL_EVIDENCE_REF = /^[A-Za-z0-9][A-Za-z0-9._:/#-]{2,119}$/;
const UUID_V4_COMPATIBLE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const READ_ACK_EVENT_ID =
  /^frms_read_ack_[1-9]\d*_\d{4}-\d{2}-\d{2}_[1-9]\d*_(CHECKIN_PENDENTE|CHECKIN_CRITICO|DADO_ESTIMADO|DADO_INCONSISTENTE|JORNADA_SEM_FATORIZACAO|EFETIVIDADE_BAIXA|QUINZENA_INCOMPLETA|OUTRO_CONTEXTUAL)$/;
const SENSITIVE_MARKERS = [
  /(?:^|[^A-Za-z0-9])(?:email|e-mail|cpf|token|cookie|senha)(?=$|[^A-Za-z0-9])/i,
  /(?:^|[^A-Za-z0-9])(?:password|secret|authorization|bearer)(?=$|[^A-Za-z0-9])/i,
  /api[_-]?key|access[_-]?token|refresh[_-]?token|session[_-]?id/i,
];

function containsClearlySensitiveText(value: string): boolean {
  const email = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i;
  const cpf = /\b\d{3}\.?\d{3}\.?\d{3}-?\d{2}\b/;
  const jwt = /\beyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\b/;
  return (
    email.test(value) ||
    cpf.test(value) ||
    jwt.test(value) ||
    SENSITIVE_MARKERS.some((marker) => marker.test(value))
  );
}

export function isValidFrmsOverrideEventId(value: unknown): value is string {
  return typeof value === 'string' && (UUID_V4_COMPATIBLE.test(value) || READ_ACK_EVENT_ID.test(value));
}

export function sanitizeOverrideJustificativa(value: unknown): string | null {
  const sanitized = sanitizePolicyOverrideJustificativa(value);
  if (!sanitized || sanitized.length < 10 || sanitized.length > 500) return null;
  if (containsClearlySensitiveText(sanitized)) return null;
  return sanitized;
}

export function sanitizeOverrideEvidenceRef(value: unknown): string | null {
  const sanitized = sanitizePolicyOverrideEvidenceRef(value);
  if (!sanitized) return null;
  if (!TECHNICAL_EVIDENCE_REF.test(sanitized)) return null;
  if (containsClearlySensitiveText(sanitized)) return null;
  return sanitized;
}

export function buildOverrideAckNote(input: {
  responsavel_user_id: number;
  justificativa: string;
  evidencia_ref?: string | null;
  override_at: string;
}): FrmsOverrideAckNoteV1 | null {
  const justificativa = sanitizeOverrideJustificativa(input.justificativa);
  if (!justificativa) return null;

  const evidenciaRef = sanitizeOverrideEvidenceRef(input.evidencia_ref);
  if (input.evidencia_ref != null && input.evidencia_ref !== '' && !evidenciaRef) return null;

  return buildPolicyOverrideAckNote({
    ...input,
    justificativa,
    evidencia_ref: evidenciaRef,
  });
}

export function parseOverrideAckNote(value: unknown): FrmsOverrideAckNoteV1 | null {
  const parsed = parsePolicyOverrideAckNote(value);
  if (!parsed) return null;

  const justificativa = sanitizeOverrideJustificativa(parsed.justificativa);
  if (!justificativa) return null;
  const evidenciaRef = sanitizeOverrideEvidenceRef(parsed.evidencia_ref);
  if (parsed.evidencia_ref != null && parsed.evidencia_ref !== '' && !evidenciaRef) return null;

  return {
    ...parsed,
    justificativa,
    evidencia_ref: evidenciaRef,
  };
}

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
  if (
    !isValidFrmsOverrideEventId(input.eventId) ||
    input.empresaId <= 0 ||
    input.responsavelUserId <= 0
  ) {
    return null;
  }

  const justificativa = sanitizeOverrideJustificativa(input.justificativa);
  if (!justificativa) return null;

  const evidenciaRef = sanitizeOverrideEvidenceRef(input.evidenciaRef);
  if (input.evidenciaRef != null && input.evidenciaRef !== '' && !evidenciaRef) return null;
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
