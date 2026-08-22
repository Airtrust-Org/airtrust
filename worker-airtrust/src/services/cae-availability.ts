export const CAE_AVAILABILITY_SCHEMA_VERSION = 'airtrust.cae_availability.v1' as const;

export type CaeAvailabilityEquipment = 'AW139' | 'SK76';
export type CaeAvailabilitySourceKind = 'PDF' | 'EMAIL' | 'IMAGE' | 'XLSX' | 'TEXT' | 'UNKNOWN';
export type CaeAvailabilitySlotState = 'OFFERED' | 'CONFIRMED' | 'HELD' | 'UNKNOWN';

export type CaeAvailabilitySource = {
  kind: CaeAvailabilitySourceKind;
  filename?: string | null;
  received_at?: string | null;
  extracted_at?: string | null;
};

export type CaeAvailabilitySourceRef = {
  page?: number | null;
  section?: string | null;
  raw_text?: string | null;
};

export type CaeAvailabilitySlotV1 = {
  external_ref?: string | null;
  equipment: CaeAvailabilityEquipment;
  date: string;
  start_time: string;
  end_date: string;
  end_time: string;
  duration_minutes: number;
  state: CaeAvailabilitySlotState;
  company?: string | null;
  participants_mentioned?: string[];
  source_ref?: CaeAvailabilitySourceRef | null;
  confidence: number;
};

export type CaeAvailabilityDocumentV1 = {
  schema_version: typeof CAE_AVAILABILITY_SCHEMA_VERSION;
  provider: 'CAE';
  source: CaeAvailabilitySource;
  slots: CaeAvailabilitySlotV1[];
  warnings: string[];
};

export type CaeAvailabilityValidationIssue = {
  path: string;
  code: string;
  message: string;
};

export type CaeAvailabilityValidationResult =
  | {
      ok: true;
      data: CaeAvailabilityDocumentV1;
      errors: [];
      warnings: CaeAvailabilityValidationIssue[];
    }
  | {
      ok: false;
      data: null;
      errors: CaeAvailabilityValidationIssue[];
      warnings: CaeAvailabilityValidationIssue[];
    };

const SOURCE_KINDS = new Set<CaeAvailabilitySourceKind>([
  'PDF',
  'EMAIL',
  'IMAGE',
  'XLSX',
  'TEXT',
  'UNKNOWN',
]);
const SLOT_STATES = new Set<CaeAvailabilitySlotState>([
  'OFFERED',
  'CONFIRMED',
  'HELD',
  'UNKNOWN',
]);

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function normalizeText(value: unknown): string {
  return String(value ?? '').trim();
}

export function normalizeCaeEquipment(value: unknown): CaeAvailabilityEquipment | null {
  const normalized = normalizeText(value)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '');

  if (normalized.includes('AW139') || normalized === 'A139') return 'AW139';
  if (
    normalized.includes('SK76') ||
    normalized.includes('S76') ||
    normalized.includes('SIKORSKY76')
  ) {
    return 'SK76';
  }
  return null;
}

function isIsoDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

function isIsoDateTime(value: string): boolean {
  if (!value) return true;
  const date = new Date(value);
  return !Number.isNaN(date.getTime());
}

function isTime(value: string): boolean {
  if (!/^\d{2}:\d{2}$/.test(value)) return false;
  const [hour, minute] = value.split(':').map(Number);
  return hour >= 0 && hour <= 23 && minute >= 0 && minute <= 59;
}

function addDaysIso(value: string, days: number): string {
  const date = new Date(`${value}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function minutesBetween(params: {
  date: string;
  startTime: string;
  endDate: string;
  endTime: string;
}): number {
  const start = Date.parse(`${params.date}T${params.startTime}:00Z`);
  const end = Date.parse(`${params.endDate}T${params.endTime}:00Z`);
  return Math.round((end - start) / 60_000);
}

function pushIssue(
  issues: CaeAvailabilityValidationIssue[],
  path: string,
  code: string,
  message: string,
) {
  issues.push({ path, code, message });
}

function normalizeOptionalString(value: unknown): string | null {
  if (value === undefined || value === null) return null;
  const text = normalizeText(value);
  return text || null;
}

function normalizeStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return [...new Set(value.map(normalizeText).filter(Boolean))];
}

export function validateAndNormalizeCaeAvailability(
  input: unknown,
): CaeAvailabilityValidationResult {
  const errors: CaeAvailabilityValidationIssue[] = [];
  const warnings: CaeAvailabilityValidationIssue[] = [];

  if (!isRecord(input)) {
    return {
      ok: false,
      data: null,
      errors: [{ path: '$', code: 'INVALID_DOCUMENT', message: 'Documento deve ser um objeto JSON.' }],
      warnings,
    };
  }

  if (input.schema_version !== CAE_AVAILABILITY_SCHEMA_VERSION) {
    pushIssue(
      errors,
      '$.schema_version',
      'UNSUPPORTED_SCHEMA_VERSION',
      `schema_version deve ser ${CAE_AVAILABILITY_SCHEMA_VERSION}.`,
    );
  }
  if (normalizeText(input.provider).toUpperCase() !== 'CAE') {
    pushIssue(errors, '$.provider', 'INVALID_PROVIDER', 'provider deve ser CAE.');
  }

  const sourceInput = isRecord(input.source) ? input.source : {};
  const sourceKind = normalizeText(sourceInput.kind).toUpperCase() as CaeAvailabilitySourceKind;
  if (!SOURCE_KINDS.has(sourceKind)) {
    pushIssue(errors, '$.source.kind', 'INVALID_SOURCE_KIND', 'Tipo de fonte inválido.');
  }
  const receivedAt = normalizeOptionalString(sourceInput.received_at);
  const extractedAt = normalizeOptionalString(sourceInput.extracted_at);
  if (receivedAt && !isIsoDateTime(receivedAt)) {
    pushIssue(errors, '$.source.received_at', 'INVALID_DATETIME', 'received_at inválido.');
  }
  if (extractedAt && !isIsoDateTime(extractedAt)) {
    pushIssue(errors, '$.source.extracted_at', 'INVALID_DATETIME', 'extracted_at inválido.');
  }

  if (!Array.isArray(input.slots) || input.slots.length === 0) {
    pushIssue(errors, '$.slots', 'EMPTY_SLOTS', 'Informe ao menos um slot da CAE.');
  }

  const normalizedSlots: CaeAvailabilitySlotV1[] = [];
  const seen = new Set<string>();

  for (const [index, rawSlot] of (Array.isArray(input.slots) ? input.slots : []).entries()) {
    const basePath = `$.slots[${index}]`;
    if (!isRecord(rawSlot)) {
      pushIssue(errors, basePath, 'INVALID_SLOT', 'Slot deve ser um objeto.');
      continue;
    }

    const equipment = normalizeCaeEquipment(rawSlot.equipment);
    if (!equipment) {
      pushIssue(errors, `${basePath}.equipment`, 'UNKNOWN_EQUIPMENT', 'Equipamento deve ser AW139 ou SK76/S76.');
    }

    const date = normalizeText(rawSlot.date);
    const startTime = normalizeText(rawSlot.start_time);
    const endTime = normalizeText(rawSlot.end_time);
    if (!isIsoDate(date)) {
      pushIssue(errors, `${basePath}.date`, 'INVALID_DATE', 'Data deve usar YYYY-MM-DD.');
    }
    if (!isTime(startTime)) {
      pushIssue(errors, `${basePath}.start_time`, 'INVALID_TIME', 'start_time deve usar HH:mm.');
    }
    if (!isTime(endTime)) {
      pushIssue(errors, `${basePath}.end_time`, 'INVALID_TIME', 'end_time deve usar HH:mm.');
    }

    let endDate = normalizeText(rawSlot.end_date);
    if (!endDate && isIsoDate(date) && isTime(startTime) && isTime(endTime)) {
      endDate = endTime <= startTime ? addDaysIso(date, 1) : date;
    }
    if (!isIsoDate(endDate)) {
      pushIssue(errors, `${basePath}.end_date`, 'INVALID_DATE', 'end_date deve usar YYYY-MM-DD.');
    }

    const stateText = normalizeText(rawSlot.state || 'OFFERED').toUpperCase() as CaeAvailabilitySlotState;
    if (!SLOT_STATES.has(stateText)) {
      pushIssue(errors, `${basePath}.state`, 'INVALID_STATE', 'Estado do slot inválido.');
    }

    const confidence = Number(rawSlot.confidence);
    if (!Number.isFinite(confidence) || confidence < 0 || confidence > 1) {
      pushIssue(errors, `${basePath}.confidence`, 'INVALID_CONFIDENCE', 'confidence deve estar entre 0 e 1.');
    } else if (confidence < 0.8) {
      pushIssue(
        warnings,
        `${basePath}.confidence`,
        'LOW_CONFIDENCE',
        'Slot com confiança inferior a 0,80 requer revisão humana.',
      );
    }

    let computedDuration: number | null = null;
    if (isIsoDate(date) && isIsoDate(endDate) && isTime(startTime) && isTime(endTime)) {
      computedDuration = minutesBetween({ date, startTime, endDate, endTime });
      if (computedDuration <= 0 || computedDuration > 24 * 60) {
        pushIssue(errors, `${basePath}.duration_minutes`, 'INVALID_DURATION', 'Duração deve ser maior que zero e no máximo 24 horas.');
      }
    }

    const informedDuration =
      rawSlot.duration_minutes === undefined || rawSlot.duration_minutes === null
        ? null
        : Number(rawSlot.duration_minutes);
    if (informedDuration !== null && (!Number.isInteger(informedDuration) || informedDuration <= 0)) {
      pushIssue(errors, `${basePath}.duration_minutes`, 'INVALID_DURATION', 'duration_minutes deve ser inteiro positivo.');
    }
    if (
      computedDuration !== null &&
      informedDuration !== null &&
      informedDuration !== computedDuration
    ) {
      pushIssue(
        errors,
        `${basePath}.duration_minutes`,
        'DURATION_MISMATCH',
        `Duração informada (${informedDuration}) diverge da calculada (${computedDuration}).`,
      );
    }

    const sourceRefInput = isRecord(rawSlot.source_ref) ? rawSlot.source_ref : null;
    const sourceRef: CaeAvailabilitySourceRef | null = sourceRefInput
      ? {
          page:
            sourceRefInput.page === undefined || sourceRefInput.page === null
              ? null
              : Number(sourceRefInput.page),
          section: normalizeOptionalString(sourceRefInput.section),
          raw_text: normalizeOptionalString(sourceRefInput.raw_text),
        }
      : null;
    if (
      sourceRef?.page !== null &&
      sourceRef?.page !== undefined &&
      (!Number.isInteger(sourceRef.page) || sourceRef.page <= 0)
    ) {
      pushIssue(errors, `${basePath}.source_ref.page`, 'INVALID_PAGE', 'Página deve ser inteiro positivo.');
    }

    if (
      equipment &&
      isIsoDate(date) &&
      isIsoDate(endDate) &&
      isTime(startTime) &&
      isTime(endTime) &&
      computedDuration !== null &&
      computedDuration > 0 &&
      computedDuration <= 24 * 60 &&
      SLOT_STATES.has(stateText) &&
      Number.isFinite(confidence) &&
      confidence >= 0 &&
      confidence <= 1
    ) {
      const duplicateKey = [equipment, date, startTime, endDate, endTime].join('|');
      if (seen.has(duplicateKey)) {
        pushIssue(errors, basePath, 'DUPLICATE_SLOT', 'Slot duplicado no mesmo documento.');
      } else {
        seen.add(duplicateKey);
      }

      normalizedSlots.push({
        external_ref: normalizeOptionalString(rawSlot.external_ref),
        equipment,
        date,
        start_time: startTime,
        end_date: endDate,
        end_time: endTime,
        duration_minutes: computedDuration,
        state: stateText,
        company: normalizeOptionalString(rawSlot.company),
        participants_mentioned: normalizeStringArray(rawSlot.participants_mentioned),
        source_ref: sourceRef,
        confidence,
      });
    }
  }

  if (errors.length > 0) return { ok: false, data: null, errors, warnings };

  const documentWarnings = normalizeStringArray(input.warnings);
  return {
    ok: true,
    data: {
      schema_version: CAE_AVAILABILITY_SCHEMA_VERSION,
      provider: 'CAE',
      source: {
        kind: sourceKind,
        filename: normalizeOptionalString(sourceInput.filename),
        received_at: receivedAt,
        extracted_at: extractedAt,
      },
      slots: normalizedSlots.sort((left, right) =>
        [left.date, left.start_time, left.equipment].join('|').localeCompare(
          [right.date, right.start_time, right.equipment].join('|'),
        ),
      ),
      warnings: documentWarnings,
    },
    errors: [],
    warnings,
  };
}
