type FrmsSourceRow = {
  origem?: string | null;
  fonte_original?: string | null;
  fonte_canonica?: string | null;
};

export const FRMS_CANONICAL_OPERATIONAL_SOURCE = 'SIGVOOS' as const;

export type FrmsSourceStatus =
  | 'CANONICAL_SIGVOOS'
  | 'FONTE_NAO_CANONICA'
  | 'PENDENTE_SIGVOOS'
  | 'FIRA_NAO_OPERACIONAL'
  | 'SOURCE_INTEGRITY_WARNING';

export interface FrmsSourceDecision {
  fonte_original: string | null;
  fonte_canonica: typeof FRMS_CANONICAL_OPERATIONAL_SOURCE;
  source_status: FrmsSourceStatus;
  integridade_fonte: FrmsSourceStatus[];
  usado_no_frms_operacional: boolean;
  usado_em_alertas: boolean;
  usado_em_rolling: boolean;
}

function normalizeSource(source?: string | null): string | null {
  const normalized = String(source ?? '').trim().toUpperCase();
  return normalized || null;
}

export function isCanonicalFrmsOperationalSource(source?: string | null): boolean {
  return normalizeSource(source) === FRMS_CANONICAL_OPERATIONAL_SOURCE;
}

export function resolveFrmsSourceStatus(
  row: FrmsSourceRow,
  options: { hasCanonicalForSameDay?: boolean } = {},
): FrmsSourceDecision {
  const fonteOriginal = normalizeSource(row.fonte_original ?? row.origem);
  const hasCanonicalForSameDay = options.hasCanonicalForSameDay === true;
  const integridadeFonte: FrmsSourceStatus[] = [];

  if (isCanonicalFrmsOperationalSource(fonteOriginal)) {
    return {
      fonte_original: fonteOriginal,
      fonte_canonica: FRMS_CANONICAL_OPERATIONAL_SOURCE,
      source_status: 'CANONICAL_SIGVOOS',
      integridade_fonte: integridadeFonte,
      usado_no_frms_operacional: true,
      usado_em_alertas: true,
      usado_em_rolling: true,
    };
  }

  if (!fonteOriginal) {
    integridadeFonte.push('PENDENTE_SIGVOOS');
    return {
      fonte_original: null,
      fonte_canonica: FRMS_CANONICAL_OPERATIONAL_SOURCE,
      source_status: 'PENDENTE_SIGVOOS',
      integridade_fonte: integridadeFonte,
      usado_no_frms_operacional: false,
      usado_em_alertas: false,
      usado_em_rolling: false,
    };
  }

  if (fonteOriginal === 'FIRA') {
    integridadeFonte.push('FIRA_NAO_OPERACIONAL', 'FONTE_NAO_CANONICA');
    if (!hasCanonicalForSameDay) integridadeFonte.push('PENDENTE_SIGVOOS');
    return {
      fonte_original: fonteOriginal,
      fonte_canonica: FRMS_CANONICAL_OPERATIONAL_SOURCE,
      source_status: hasCanonicalForSameDay ? 'FIRA_NAO_OPERACIONAL' : 'PENDENTE_SIGVOOS',
      integridade_fonte: integridadeFonte,
      usado_no_frms_operacional: false,
      usado_em_alertas: false,
      usado_em_rolling: false,
    };
  }

  integridadeFonte.push('FONTE_NAO_CANONICA');
  if (fonteOriginal === 'MANUAL' || fonteOriginal === 'APUS' || fonteOriginal === 'SIMULADOR') {
    integridadeFonte.push('PENDENTE_SIGVOOS');
  }

  return {
    fonte_original: fonteOriginal,
    fonte_canonica: FRMS_CANONICAL_OPERATIONAL_SOURCE,
    source_status: 'FONTE_NAO_CANONICA',
    integridade_fonte: integridadeFonte,
    usado_no_frms_operacional: false,
    usado_em_alertas: false,
    usado_em_rolling: false,
  };
}

export function shouldUseForOperationalFrms(row: FrmsSourceRow): boolean {
  return isCanonicalFrmsOperationalSource(row.fonte_original ?? row.origem);
}

export function shouldUseForRolling(row: FrmsSourceRow): boolean {
  return shouldUseForOperationalFrms(row);
}

export function shouldUseForOperationalAlerts(row: FrmsSourceRow): boolean {
  return shouldUseForOperationalFrms(row);
}
