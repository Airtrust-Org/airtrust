import {
  Activity,
  AlertOctagon,
  BarChart3,
  ClipboardCheck,
  Gauge,
  ShieldCheck,
  Wrench,
} from 'lucide-react';

const DIVERGENCE_SCHEMA_VERSION = 'edb.shadow-divergence.v1';
const TECHNICAL_SCHEMA_VERSION = 'edb.technical-status.shadow.v1';

const SEVERITIES = ['OBSERVATION', 'LOW', 'MEDIUM', 'HIGH', 'CRITICAL'] as const;
const DIVERGENCE_CATEGORIES = [
  'FIELD_MISSING',
  'VALUE_MISMATCH',
  'UNIT_MISMATCH',
  'TIMEZONE_MISMATCH',
  'CREW_UNRESOLVED',
  'LEG_MISSING',
  'LEG_EXTRA',
  'ROLE_UNMAPPED',
  'PROVENANCE_CONFLICT',
  'TECHNICAL_STATUS_MISMATCH',
  'TENANT_SCOPE_ERROR',
  'POSSIBLE_CRITICAL_DIVERGENCE',
  'UNKNOWN_FIELD',
] as const;
const CAUSE_CODES = [
  'SOURCE_MISSING',
  'SOURCE_CONFLICT',
  'MAPPING_ERROR',
  'TIMEZONE_ERROR',
  'UNIT_ERROR',
  'IDENTITY_ERROR',
  'TENANT_SCOPE_ERROR',
  'TECHNICAL_STATUS_STALE',
  'OFFLINE_PACKAGE_ERROR',
  'SYNC_ERROR',
  'USER_WORKFLOW_ERROR',
  'MANUAL_PROCEDURE_GAP',
  'TRAINING_GAP',
  'REGULATORY_DECISION_PENDING',
] as const;
const SOURCE_KINDS = [
  'AIRTRUST_MANUAL',
  'AIRTRUST_CONTROL_FLIGHTS',
  'SIGVOOS',
  'MAINTENANCE_SYSTEM',
  'UNKNOWN',
] as const;

const SAFE_PATH_SEGMENT = /^(?:[A-Za-z][A-Za-z0-9_-]{0,47}|\d{1,6})$/;

type Severity = (typeof SEVERITIES)[number];
type DivergenceCategory = (typeof DIVERGENCE_CATEGORIES)[number];
type CauseCode = (typeof CAUSE_CODES)[number];
type SourceKind = (typeof SOURCE_KINDS)[number];
type InformationState = 'IMPORTED' | 'DECLARED' | 'UNCONFIRMED';

type DivergenceFinding = {
  category: DivergenceCategory;
  severity: Severity;
  causeCode: CauseCode;
  field: string;
};

type DivergenceResult = {
  caseResult: 'matched' | 'divergent' | 'interrupted';
  recommendation: 'continue' | 'review' | 'stop';
  maxSeverity: 'NONE' | Severity;
  findings: DivergenceFinding[];
  countsByCategory: Record<DivergenceCategory, number>;
  countsBySeverity: Record<Severity, number>;
  causeCodes: CauseCode[];
  affectedFields: string[];
  metrics: {
    comparisonFieldCount: number;
    matchingFieldCount: number;
    divergenceCount: number;
    completenessFindingCount: number;
    projectionFindingCount: number;
    unknownFieldCount: number;
  };
  readiness: {
    score: number;
    status: 'ready' | 'review' | 'not_ready';
    fieldAgreementPercent: number;
    completenessPercent: number;
  };
};

type TechnicalFinding = {
  code: string;
  severity: Severity;
  path: string;
};

type TechnicalLimit = {
  value: number | null;
  unit: string | null;
};

type TechnicalInterventionView = {
  description: string | null;
  occurredAt: string | null;
  informationState: InformationState;
};

type TechnicalNextInterventionView = {
  description: string | null;
  remainingLimits: TechnicalLimit[];
  informationState: InformationState;
};

type TechnicalEventView = {
  eventType:
    | 'DISCREPANCY_DECLARED'
    | 'CORRECTIVE_ACTION_DECLARED'
    | 'DEFERRED_ITEM_DECLARED'
    | 'RETURN_TO_SERVICE_DECLARED'
    | 'CORRECTION_DECLARED';
  recordedAt: string;
  informationState: InformationState;
  description: string | null;
  systemCode: string | null;
  correctiveActionDescription: string | null;
  deferredReason: string | null;
  deferredDueAt: string | null;
  deferredLimits: TechnicalLimit[];
  maintenanceActKind: 'NONE' | 'DECLARED_SHADOW' | 'UNCONFIRMED' | null;
  returnToServiceState: 'NOT_DECLARED' | 'DECLARED_SHADOW' | 'UNCONFIRMED' | null;
};

type TechnicalDiscrepancyView = {
  status: 'OPEN' | 'CORRECTIVE_ACTION_DECLARED' | 'DEFERRED' | 'UNCONFIRMED';
  eventCount: number;
  latestEvent: TechnicalEventView;
};

type TechnicalStatusView = {
  createdAt: string;
  assertions: Array<{
    informationState: InformationState;
    status: 'SERVICEABLE' | 'UNSERVICEABLE' | 'RESTRICTED' | 'UNKNOWN';
    sourceKind: SourceKind;
  }>;
  lastIntervention: TechnicalInterventionView | null;
  nextIntervention: TechnicalNextInterventionView | null;
  discrepancies: TechnicalDiscrepancyView[];
  picAwareness: {
    state: 'PENDING' | 'DECLARED_SHADOW' | 'UNCONFIRMED';
    declaredAt: string | null;
  };
};

type ParsedAnalysis = {
  divergence: DivergenceResult | null;
  divergenceInvalid: boolean;
  technicalStatus: TechnicalStatusView | null;
  technicalStatusInvalid: boolean;
  technicalFindings: TechnicalFinding[];
  technicalFindingsInvalid: boolean;
};

const CATEGORY_LABELS: Record<DivergenceCategory, string> = {
  FIELD_MISSING: 'Campo ausente',
  VALUE_MISMATCH: 'Valor divergente',
  UNIT_MISMATCH: 'Unidade divergente',
  TIMEZONE_MISMATCH: 'Fuso divergente',
  CREW_UNRESOLVED: 'Tripulação não resolvida',
  LEG_MISSING: 'Etapa ausente',
  LEG_EXTRA: 'Etapa adicional',
  ROLE_UNMAPPED: 'Função não mapeada',
  PROVENANCE_CONFLICT: 'Conflito de procedência',
  TECHNICAL_STATUS_MISMATCH: 'Situação técnica divergente',
  TENANT_SCOPE_ERROR: 'Erro de escopo do tenant',
  POSSIBLE_CRITICAL_DIVERGENCE: 'Possível divergência crítica',
  UNKNOWN_FIELD: 'Campo desconhecido',
};

const SEVERITY_LABELS: Record<Severity, string> = {
  OBSERVATION: 'Observação',
  LOW: 'Baixa',
  MEDIUM: 'Média',
  HIGH: 'Alta',
  CRITICAL: 'Crítica',
};

const EVENT_LABELS: Record<TechnicalEventView['eventType'], string> = {
  DISCREPANCY_DECLARED: 'Discrepância declarada',
  CORRECTIVE_ACTION_DECLARED: 'Ação corretiva declarada',
  DEFERRED_ITEM_DECLARED: 'Item retardado declarado',
  RETURN_TO_SERVICE_DECLARED: 'Retorno ao serviço declarado em shadow',
  CORRECTION_DECLARED: 'Correção declarada',
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

function isNonNegativeInteger(value: unknown): value is number {
  return Number.isInteger(value) && Number(value) >= 0;
}

function isNullableString(value: unknown): value is string | null {
  return value === null || typeof value === 'string';
}

function isEnumValue<T extends readonly string[]>(values: T, value: unknown): value is T[number] {
  return typeof value === 'string' && values.includes(value as T[number]);
}

function isInformationState(value: unknown): value is InformationState {
  return value === 'IMPORTED' || value === 'DECLARED' || value === 'UNCONFIRMED';
}

function isSafePath(path: unknown): path is string {
  if (typeof path !== 'string' || path.length === 0 || path.length > 180) return false;
  const segments = path.split('.');
  return segments.length <= 16 && segments.every((segment) => SAFE_PATH_SEGMENT.test(segment));
}

function parseCountRecord<T extends readonly string[]>(
  value: unknown,
  keys: T,
): Record<T[number], number> | null {
  if (!isRecord(value)) return null;
  const parsed = {} as Record<T[number], number>;
  for (const key of keys) {
    if (!isNonNegativeInteger(value[key])) return null;
    parsed[key] = Number(value[key]);
  }
  return parsed;
}

function parseDivergence(value: unknown): DivergenceResult | null {
  if (!isRecord(value) || value.schemaVersion !== DIVERGENCE_SCHEMA_VERSION) return null;
  if (
    value.caseResult !== 'matched' &&
    value.caseResult !== 'divergent' &&
    value.caseResult !== 'interrupted'
  ) {
    return null;
  }
  if (
    value.recommendation !== 'continue' &&
    value.recommendation !== 'review' &&
    value.recommendation !== 'stop'
  ) {
    return null;
  }
  if (value.maxSeverity !== 'NONE' && !isEnumValue(SEVERITIES, value.maxSeverity)) return null;
  if (!Array.isArray(value.findings) || !Array.isArray(value.causeCodes)) return null;
  if (!Array.isArray(value.affectedFields) || !isRecord(value.metrics) || !isRecord(value.readiness)) {
    return null;
  }

  const findings: DivergenceFinding[] = [];
  for (const finding of value.findings) {
    if (
      !isRecord(finding) ||
      !isEnumValue(DIVERGENCE_CATEGORIES, finding.category) ||
      !isEnumValue(SEVERITIES, finding.severity) ||
      !isEnumValue(CAUSE_CODES, finding.causeCode) ||
      !isSafePath(finding.field)
    ) {
      return null;
    }
    findings.push({
      category: finding.category,
      severity: finding.severity,
      causeCode: finding.causeCode,
      field: finding.field,
    });
  }

  const causeCodes: CauseCode[] = [];
  for (const code of value.causeCodes) {
    if (!isEnumValue(CAUSE_CODES, code)) return null;
    causeCodes.push(code);
  }

  const affectedFields: string[] = [];
  for (const field of value.affectedFields) {
    if (!isSafePath(field)) return null;
    affectedFields.push(field);
  }

  const countsByCategory = parseCountRecord(value.countsByCategory, DIVERGENCE_CATEGORIES);
  const countsBySeverity = parseCountRecord(value.countsBySeverity, SEVERITIES);
  if (!countsByCategory || !countsBySeverity) return null;

  const metricKeys = [
    'comparisonFieldCount',
    'matchingFieldCount',
    'divergenceCount',
    'completenessFindingCount',
    'projectionFindingCount',
    'unknownFieldCount',
  ] as const;
  for (const key of metricKeys) {
    if (!isNonNegativeInteger(value.metrics[key])) return null;
  }

  if (
    !isFiniteNumber(value.readiness.score) ||
    value.readiness.score < 0 ||
    value.readiness.score > 100 ||
    !isFiniteNumber(value.readiness.fieldAgreementPercent) ||
    value.readiness.fieldAgreementPercent < 0 ||
    value.readiness.fieldAgreementPercent > 100 ||
    !isFiniteNumber(value.readiness.completenessPercent) ||
    value.readiness.completenessPercent < 0 ||
    value.readiness.completenessPercent > 100 ||
    (value.readiness.status !== 'ready' &&
      value.readiness.status !== 'review' &&
      value.readiness.status !== 'not_ready')
  ) {
    return null;
  }

  return {
    caseResult: value.caseResult,
    recommendation: value.recommendation,
    maxSeverity: value.maxSeverity,
    findings,
    countsByCategory,
    countsBySeverity,
    causeCodes,
    affectedFields,
    metrics: {
      comparisonFieldCount: Number(value.metrics.comparisonFieldCount),
      matchingFieldCount: Number(value.metrics.matchingFieldCount),
      divergenceCount: Number(value.metrics.divergenceCount),
      completenessFindingCount: Number(value.metrics.completenessFindingCount),
      projectionFindingCount: Number(value.metrics.projectionFindingCount),
      unknownFieldCount: Number(value.metrics.unknownFieldCount),
    },
    readiness: {
      score: value.readiness.score,
      status: value.readiness.status,
      fieldAgreementPercent: value.readiness.fieldAgreementPercent,
      completenessPercent: value.readiness.completenessPercent,
    },
  };
}

function parseLimit(value: unknown): TechnicalLimit | null {
  if (!isRecord(value) || !isNullableString(value.unit)) return null;
  if (value.value !== null && !isFiniteNumber(value.value)) return null;
  return { value: value.value as number | null, unit: value.unit };
}

function parseLimits(value: unknown): TechnicalLimit[] | null {
  if (!Array.isArray(value)) return null;
  const limits: TechnicalLimit[] = [];
  for (const item of value) {
    const parsed = parseLimit(item);
    if (!parsed) return null;
    limits.push(parsed);
  }
  return limits;
}

function parseTechnicalEvent(value: unknown): TechnicalEventView | null {
  if (!isRecord(value) || !isInformationState(value.informationState)) return null;
  if (
    value.eventType !== 'DISCREPANCY_DECLARED' &&
    value.eventType !== 'CORRECTIVE_ACTION_DECLARED' &&
    value.eventType !== 'DEFERRED_ITEM_DECLARED' &&
    value.eventType !== 'RETURN_TO_SERVICE_DECLARED' &&
    value.eventType !== 'CORRECTION_DECLARED'
  ) {
    return null;
  }
  if (typeof value.recordedAt !== 'string' || !isNullableString(value.description)) return null;
  if (!isNullableString(value.systemCode)) return null;

  let correctiveActionDescription: string | null = null;
  if (value.correctiveAction !== null) {
    if (!isRecord(value.correctiveAction) || !isNullableString(value.correctiveAction.description)) {
      return null;
    }
    correctiveActionDescription = value.correctiveAction.description;
  }

  let deferredReason: string | null = null;
  let deferredDueAt: string | null = null;
  let deferredLimits: TechnicalLimit[] = [];
  if (value.deferredItem !== null) {
    if (
      !isRecord(value.deferredItem) ||
      !isNullableString(value.deferredItem.reason) ||
      !isNullableString(value.deferredItem.dueAt)
    ) {
      return null;
    }
    const limits = parseLimits(value.deferredItem.remainingLimits);
    if (!limits) return null;
    deferredReason = value.deferredItem.reason;
    deferredDueAt = value.deferredItem.dueAt;
    deferredLimits = limits;
  }

  let maintenanceActKind: TechnicalEventView['maintenanceActKind'] = null;
  if (value.maintenanceAct !== null) {
    if (!isRecord(value.maintenanceAct)) return null;
    if (
      value.maintenanceAct.kind !== 'NONE' &&
      value.maintenanceAct.kind !== 'DECLARED_SHADOW' &&
      value.maintenanceAct.kind !== 'UNCONFIRMED'
    ) {
      return null;
    }
    maintenanceActKind = value.maintenanceAct.kind;
  }

  let returnToServiceState: TechnicalEventView['returnToServiceState'] = null;
  if (value.returnToService !== null) {
    if (!isRecord(value.returnToService) || value.returnToService.officialEffect !== 'NONE') {
      return null;
    }
    if (
      value.returnToService.state !== 'NOT_DECLARED' &&
      value.returnToService.state !== 'DECLARED_SHADOW' &&
      value.returnToService.state !== 'UNCONFIRMED'
    ) {
      return null;
    }
    returnToServiceState = value.returnToService.state;
  }

  return {
    eventType: value.eventType,
    recordedAt: value.recordedAt,
    informationState: value.informationState,
    description: value.description,
    systemCode: value.systemCode,
    correctiveActionDescription,
    deferredReason,
    deferredDueAt,
    deferredLimits,
    maintenanceActKind,
    returnToServiceState,
  };
}

function parseTechnicalStatus(value: unknown): TechnicalStatusView | null {
  if (
    !isRecord(value) ||
    value.schemaVersion !== TECHNICAL_SCHEMA_VERSION ||
    value.officialEffect !== 'NONE' ||
    typeof value.createdAt !== 'string' ||
    !Array.isArray(value.statusAssertions) ||
    !Array.isArray(value.discrepancies) ||
    !isRecord(value.picAwareness)
  ) {
    return null;
  }

  const assertions: TechnicalStatusView['assertions'] = [];
  for (const assertion of value.statusAssertions) {
    if (
      !isRecord(assertion) ||
      !isInformationState(assertion.informationState) ||
      (assertion.status !== 'SERVICEABLE' &&
        assertion.status !== 'UNSERVICEABLE' &&
        assertion.status !== 'RESTRICTED' &&
        assertion.status !== 'UNKNOWN') ||
      !isRecord(assertion.source) ||
      !isEnumValue(SOURCE_KINDS, assertion.source.kind)
    ) {
      return null;
    }
    assertions.push({
      informationState: assertion.informationState,
      status: assertion.status,
      sourceKind: assertion.source.kind,
    });
  }

  let lastIntervention: TechnicalInterventionView | null = null;
  if (value.lastIntervention !== null) {
    if (
      !isRecord(value.lastIntervention) ||
      !isNullableString(value.lastIntervention.description) ||
      !isNullableString(value.lastIntervention.occurredAt) ||
      !isInformationState(value.lastIntervention.informationState)
    ) {
      return null;
    }
    lastIntervention = {
      description: value.lastIntervention.description,
      occurredAt: value.lastIntervention.occurredAt,
      informationState: value.lastIntervention.informationState,
    };
  }

  let nextIntervention: TechnicalNextInterventionView | null = null;
  if (value.nextIntervention !== null) {
    if (
      !isRecord(value.nextIntervention) ||
      !isNullableString(value.nextIntervention.description) ||
      !isInformationState(value.nextIntervention.informationState)
    ) {
      return null;
    }
    const limits = parseLimits(value.nextIntervention.remainingLimits);
    if (!limits) return null;
    nextIntervention = {
      description: value.nextIntervention.description,
      remainingLimits: limits,
      informationState: value.nextIntervention.informationState,
    };
  }

  const discrepancies: TechnicalDiscrepancyView[] = [];
  for (const discrepancy of value.discrepancies) {
    if (!isRecord(discrepancy) || !Array.isArray(discrepancy.events) || discrepancy.events.length === 0) {
      return null;
    }
    if (
      discrepancy.status !== 'OPEN' &&
      discrepancy.status !== 'CORRECTIVE_ACTION_DECLARED' &&
      discrepancy.status !== 'DEFERRED' &&
      discrepancy.status !== 'UNCONFIRMED'
    ) {
      return null;
    }
    const parsedEvents: TechnicalEventView[] = [];
    for (const event of discrepancy.events) {
      const parsed = parseTechnicalEvent(event);
      if (!parsed) return null;
      parsedEvents.push(parsed);
    }
    discrepancies.push({
      status: discrepancy.status,
      eventCount: parsedEvents.length,
      latestEvent: parsedEvents.at(-1) as TechnicalEventView,
    });
  }

  if (
    value.picAwareness.state !== 'PENDING' &&
    value.picAwareness.state !== 'DECLARED_SHADOW' &&
    value.picAwareness.state !== 'UNCONFIRMED'
  ) {
    return null;
  }
  if (!isNullableString(value.picAwareness.declaredAt)) return null;

  return {
    createdAt: value.createdAt,
    assertions,
    lastIntervention,
    nextIntervention,
    discrepancies,
    picAwareness: {
      state: value.picAwareness.state,
      declaredAt: value.picAwareness.declaredAt,
    },
  };
}

function parseTechnicalFindings(value: unknown): TechnicalFinding[] | null {
  if (value === undefined) return [];
  if (!Array.isArray(value)) return null;
  const findings: TechnicalFinding[] = [];
  for (const finding of value) {
    if (
      !isRecord(finding) ||
      typeof finding.code !== 'string' ||
      finding.code.length === 0 ||
      finding.code.length > 96 ||
      !isEnumValue(SEVERITIES, finding.severity) ||
      !isSafePath(finding.path)
    ) {
      return null;
    }
    findings.push({ code: finding.code, severity: finding.severity, path: finding.path });
  }
  return findings;
}

function parseAnalysis(rawPreviewData: unknown): ParsedAnalysis {
  if (!isRecord(rawPreviewData)) {
    return {
      divergence: null,
      divergenceInvalid: false,
      technicalStatus: null,
      technicalStatusInvalid: false,
      technicalFindings: [],
      technicalFindingsInvalid: false,
    };
  }

  const divergenceDeclared = Object.hasOwn(rawPreviewData, 'shadowDivergence');
  const technicalDeclared = Object.hasOwn(rawPreviewData, 'technicalStatusShadow');
  const findingsDeclared = Object.hasOwn(rawPreviewData, 'technicalStatusFindings');
  const divergence = divergenceDeclared ? parseDivergence(rawPreviewData.shadowDivergence) : null;
  const technicalStatus = technicalDeclared
    ? parseTechnicalStatus(rawPreviewData.technicalStatusShadow)
    : null;
  const parsedFindings = findingsDeclared
    ? parseTechnicalFindings(rawPreviewData.technicalStatusFindings)
    : [];

  return {
    divergence,
    divergenceInvalid: divergenceDeclared && divergence === null,
    technicalStatus,
    technicalStatusInvalid: technicalDeclared && technicalStatus === null,
    technicalFindings: parsedFindings || [],
    technicalFindingsInvalid: findingsDeclared && parsedFindings === null,
  };
}

function sourceLabel(kind: SourceKind): string {
  switch (kind) {
    case 'SIGVOOS':
      return 'SIGVOOS';
    case 'AIRTRUST_CONTROL_FLIGHTS':
      return 'Controle de Voos AirTrust';
    case 'AIRTRUST_MANUAL':
      return 'Entrada manual AirTrust';
    case 'MAINTENANCE_SYSTEM':
      return 'Sistema de manutenção';
    default:
      return 'Origem não confirmada';
  }
}

function formatLimit(limit: TechnicalLimit): string {
  if (limit.value === null) return 'Limite não disponível';
  return limit.unit ? `${limit.value} ${limit.unit}` : String(limit.value);
}

function recommendationCopy(recommendation: DivergenceResult['recommendation']): {
  label: string;
  className: string;
} {
  if (recommendation === 'stop') {
    return {
      label: 'Interromper revisão shadow',
      className:
        'border-red-300 bg-red-50 text-red-800 dark:border-red-800 dark:bg-red-950/30 dark:text-red-200',
    };
  }
  if (recommendation === 'review') {
    return {
      label: 'Revisão humana necessária',
      className:
        'border-amber-300 bg-amber-50 text-amber-800 dark:border-amber-800 dark:bg-amber-950/30 dark:text-amber-200',
    };
  }
  return {
    label: 'Pode continuar em shadow',
    className:
      'border-emerald-300 bg-emerald-50 text-emerald-800 dark:border-emerald-800 dark:bg-emerald-950/30 dark:text-emerald-200',
  };
}

function MetricCard({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-lg border border-slate-200 bg-slate-50 p-3 dark:border-slate-700 dark:bg-slate-800">
      <p className="text-xs font-medium text-slate-500 dark:text-slate-400">{label}</p>
      <p className="mt-1 text-xl font-bold text-slate-900 dark:text-slate-100">{value}</p>
    </div>
  );
}

function ContractUnavailable({ invalid, subject }: { invalid: boolean; subject: string }) {
  return (
    <div
      role={invalid ? 'alert' : 'status'}
      className={`rounded-lg border p-4 text-sm ${
        invalid
          ? 'border-red-300 bg-red-50 text-red-800 dark:border-red-800 dark:bg-red-950/30 dark:text-red-200'
          : 'border-slate-200 bg-slate-50 text-slate-600 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300'
      }`}
    >
      {invalid
        ? `O ${subject} recebido não corresponde ao contrato sanitizado esperado.`
        : `O backend ainda não forneceu ${subject} para este preview. Nenhuma avaliação foi presumida pela interface.`}
    </div>
  );
}

function DivergencePanel({ parsed }: { parsed: ParsedAnalysis }) {
  const divergence = parsed.divergence;
  if (!divergence) {
    return (
      <section
        aria-labelledby="edb-divergence-title"
        className="rounded-xl border border-slate-200 bg-white p-5 dark:border-slate-700 dark:bg-slate-900"
      >
        <h2
          id="edb-divergence-title"
          className="flex items-center gap-2 text-lg font-semibold text-slate-900 dark:text-slate-100"
        >
          <Gauge className="h-5 w-5 text-violet-600" /> Divergências e prontidão
        </h2>
        <p className="mb-4 mt-2 text-sm text-slate-600 dark:text-slate-300">
          A interface aceita somente o resultado agregado e sanitizado do contrato
          `edb.shadow-divergence.v1`. Valores comparados não são exibidos.
        </p>
        <ContractUnavailable
          invalid={parsed.divergenceInvalid}
          subject="uma análise de divergências e prontidão"
        />
      </section>
    );
  }

  const recommendation = recommendationCopy(divergence.recommendation);
  const categories = DIVERGENCE_CATEGORIES.filter(
    (category) => divergence.countsByCategory[category] > 0,
  );
  const severities = SEVERITIES.filter((severity) => divergence.countsBySeverity[severity] > 0);

  return (
    <section
      aria-labelledby="edb-divergence-title"
      className="rounded-xl border border-slate-200 bg-white p-5 dark:border-slate-700 dark:bg-slate-900"
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2
            id="edb-divergence-title"
            className="flex items-center gap-2 text-lg font-semibold text-slate-900 dark:text-slate-100"
          >
            <Gauge className="h-5 w-5 text-violet-600" /> Divergências e prontidão
          </h2>
          <p className="mt-2 text-sm text-slate-600 dark:text-slate-300">
            Métricas agregadas do contrato `edb.shadow-divergence.v1`, sem valores comparados ou
            dados pessoais.
          </p>
        </div>
        <span className={`rounded-full border px-3 py-1 text-xs font-bold ${recommendation.className}`}>
          {recommendation.label}
        </span>
      </div>

      <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <MetricCard label="Prontidão" value={`${divergence.readiness.score}%`} />
        <MetricCard label="Concordância de campos" value={`${divergence.readiness.fieldAgreementPercent}%`} />
        <MetricCard label="Completude" value={`${divergence.readiness.completenessPercent}%`} />
        <MetricCard label="Severidade máxima" value={divergence.maxSeverity === 'NONE' ? 'Nenhuma' : SEVERITY_LABELS[divergence.maxSeverity]} />
        <MetricCard label="Campos comparados" value={divergence.metrics.comparisonFieldCount} />
        <MetricCard label="Campos concordantes" value={divergence.metrics.matchingFieldCount} />
        <MetricCard label="Divergências" value={divergence.metrics.divergenceCount} />
        <MetricCard label="Achados de completude" value={divergence.metrics.completenessFindingCount} />
      </div>

      <div className="mt-5 grid gap-5 lg:grid-cols-2">
        <div>
          <h3 className="flex items-center gap-2 font-semibold text-slate-900 dark:text-slate-100">
            <BarChart3 className="h-4 w-4 text-violet-600" /> Distribuição agregada
          </h3>
          {categories.length === 0 && severities.length === 0 ? (
            <p className="mt-3 text-sm text-emerald-700 dark:text-emerald-300">
              Nenhuma divergência agregada registrada.
            </p>
          ) : (
            <div className="mt-3 space-y-3">
              {categories.length > 0 && (
                <div className="flex flex-wrap gap-2">
                  {categories.map((category) => (
                    <span
                      key={category}
                      className="rounded-full border border-violet-200 bg-violet-50 px-2.5 py-1 text-xs text-violet-700 dark:border-violet-800 dark:bg-violet-950/30 dark:text-violet-300"
                    >
                      {CATEGORY_LABELS[category]}: {divergence.countsByCategory[category]}
                    </span>
                  ))}
                </div>
              )}
              {severities.length > 0 && (
                <div className="flex flex-wrap gap-2">
                  {severities.map((severity) => (
                    <span
                      key={severity}
                      className="rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-xs text-slate-700 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300"
                    >
                      {SEVERITY_LABELS[severity]}: {divergence.countsBySeverity[severity]}
                    </span>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        <div>
          <h3 className="flex items-center gap-2 font-semibold text-slate-900 dark:text-slate-100">
            <Activity className="h-4 w-4 text-violet-600" /> Campos afetados
          </h3>
          {divergence.affectedFields.length === 0 ? (
            <p className="mt-3 text-sm text-emerald-700 dark:text-emerald-300">
              Nenhum caminho afetado.
            </p>
          ) : (
            <ul className="mt-3 grid gap-2 sm:grid-cols-2">
              {divergence.affectedFields.map((field) => (
                <li
                  key={field}
                  className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 font-mono text-xs text-slate-600 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300"
                >
                  {field}
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      <p className="mt-4 text-xs text-slate-500 dark:text-slate-400">
        Resultado do caso: {divergence.caseResult} · estado de prontidão:{' '}
        {divergence.readiness.status}. A interface não resolve divergências automaticamente.
      </p>
    </section>
  );
}

function TechnicalPanel({ parsed }: { parsed: ParsedAnalysis }) {
  const technicalStatus = parsed.technicalStatus;
  if (!technicalStatus) {
    return (
      <section
        aria-labelledby="edb-technical-shadow-title"
        className="rounded-xl border border-slate-200 bg-white p-5 dark:border-slate-700 dark:bg-slate-900"
      >
        <h2
          id="edb-technical-shadow-title"
          className="flex items-center gap-2 text-lg font-semibold text-slate-900 dark:text-slate-100"
        >
          <Wrench className="h-5 w-5 text-cyan-600" /> Situação técnica shadow e discrepâncias
        </h2>
        <p className="mb-4 mt-2 text-sm text-slate-600 dark:text-slate-300">
          Esta seção aceita somente o contrato não oficial `edb.technical-status.shadow.v1`.
        </p>
        <ContractUnavailable
          invalid={parsed.technicalStatusInvalid}
          subject="uma situação técnica shadow detalhada"
        />
      </section>
    );
  }

  return (
    <section
      aria-labelledby="edb-technical-shadow-title"
      className="rounded-xl border border-slate-200 bg-white p-5 dark:border-slate-700 dark:bg-slate-900"
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2
            id="edb-technical-shadow-title"
            className="flex items-center gap-2 text-lg font-semibold text-slate-900 dark:text-slate-100"
          >
            <Wrench className="h-5 w-5 text-cyan-600" /> Situação técnica shadow e discrepâncias
          </h2>
          <p className="mt-2 text-sm text-slate-600 dark:text-slate-300">
            Contrato `edb.technical-status.shadow.v1` · criado em {technicalStatus.createdAt}.
          </p>
        </div>
        <span className="rounded-full border border-red-300 bg-red-50 px-3 py-1 text-xs font-bold text-red-700 dark:border-red-800 dark:bg-red-950/30 dark:text-red-300">
          Sem efeito oficial
        </span>
      </div>

      <div className="mt-5 grid gap-4 lg:grid-cols-3">
        <div className="rounded-lg border border-slate-200 p-4 dark:border-slate-700">
          <h3 className="font-semibold text-slate-900 dark:text-slate-100">Asserções de estado</h3>
          {technicalStatus.assertions.length === 0 ? (
            <p className="mt-2 text-sm text-slate-500">Nenhuma asserção disponível.</p>
          ) : (
            <ul className="mt-3 space-y-2">
              {technicalStatus.assertions.map((assertion, index) => (
                <li
                  key={`${assertion.status}-${assertion.informationState}-${index}`}
                  className="rounded-lg bg-slate-50 p-3 text-sm dark:bg-slate-800"
                >
                  <p className="font-medium text-slate-900 dark:text-slate-100">
                    {assertion.status}
                  </p>
                  <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                    {assertion.informationState} · {sourceLabel(assertion.sourceKind)}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="rounded-lg border border-slate-200 p-4 dark:border-slate-700">
          <h3 className="font-semibold text-slate-900 dark:text-slate-100">Intervenções</h3>
          <div className="mt-3 space-y-3 text-sm">
            <div>
              <p className="text-xs font-medium text-slate-500 dark:text-slate-400">Última intervenção</p>
              <p className="mt-1 text-slate-800 dark:text-slate-200">
                {technicalStatus.lastIntervention?.description || 'Não disponível'}
              </p>
              {technicalStatus.lastIntervention && (
                <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                  {technicalStatus.lastIntervention.informationState} ·{' '}
                  {technicalStatus.lastIntervention.occurredAt || 'data não disponível'}
                </p>
              )}
            </div>
            <div>
              <p className="text-xs font-medium text-slate-500 dark:text-slate-400">Próxima intervenção</p>
              <p className="mt-1 text-slate-800 dark:text-slate-200">
                {technicalStatus.nextIntervention?.description || 'Não disponível'}
              </p>
              {technicalStatus.nextIntervention && (
                <div className="mt-2 flex flex-wrap gap-2">
                  {technicalStatus.nextIntervention.remainingLimits.map((limit, index) => (
                    <span
                      key={`${limit.value}-${limit.unit}-${index}`}
                      className="rounded-full border border-cyan-200 bg-cyan-50 px-2.5 py-1 text-xs text-cyan-700 dark:border-cyan-800 dark:bg-cyan-950/30 dark:text-cyan-300"
                    >
                      {formatLimit(limit)}
                    </span>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>

        <div className="rounded-lg border border-slate-200 p-4 dark:border-slate-700">
          <h3 className="flex items-center gap-2 font-semibold text-slate-900 dark:text-slate-100">
            <ClipboardCheck className="h-4 w-4 text-cyan-600" /> Ciência futura do PIC
          </h3>
          <p className="mt-3 text-lg font-bold text-slate-900 dark:text-slate-100">
            {technicalStatus.picAwareness.state}
          </p>
          <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
            {technicalStatus.picAwareness.declaredAt || 'Nenhuma declaração registrada em shadow'}
          </p>
          <p className="mt-3 text-xs text-red-700 dark:text-red-300">
            Não é assinatura, ciência oficial nem aprovação operacional.
          </p>
        </div>
      </div>

      <div className="mt-5">
        <h3 className="flex items-center gap-2 font-semibold text-slate-900 dark:text-slate-100">
          <AlertOctagon className="h-4 w-4 text-cyan-600" /> Discrepâncias declaradas
        </h3>
        {technicalStatus.discrepancies.length === 0 ? (
          <p className="mt-3 text-sm text-emerald-700 dark:text-emerald-300">
            Nenhuma discrepância no contrato shadow recebido.
          </p>
        ) : (
          <div className="mt-3 grid gap-4 lg:grid-cols-2">
            {technicalStatus.discrepancies.map((discrepancy, index) => {
              const event = discrepancy.latestEvent;
              return (
                <article
                  key={`${discrepancy.status}-${event.recordedAt}-${index}`}
                  className="rounded-lg border border-cyan-200 bg-cyan-50/50 p-4 dark:border-cyan-800 dark:bg-cyan-950/20"
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <h4 className="font-semibold text-cyan-950 dark:text-cyan-100">
                      {EVENT_LABELS[event.eventType]}
                    </h4>
                    <span className="rounded-full border border-cyan-300 px-2.5 py-1 text-xs font-bold text-cyan-800 dark:border-cyan-700 dark:text-cyan-200">
                      {discrepancy.status}
                    </span>
                  </div>
                  <p className="mt-2 whitespace-pre-wrap text-sm text-cyan-900 dark:text-cyan-100">
                    {event.description || 'Descrição não disponível'}
                  </p>
                  <div className="mt-3 space-y-1 text-xs text-cyan-800 dark:text-cyan-200">
                    <p>
                      Estado da informação: {event.informationState} · eventos no histórico:{' '}
                      {discrepancy.eventCount}
                    </p>
                    {event.systemCode && <p>Sistema: {event.systemCode}</p>}
                    {event.correctiveActionDescription && (
                      <p>Ação corretiva: {event.correctiveActionDescription}</p>
                    )}
                    {event.deferredReason && <p>Motivo do retardo: {event.deferredReason}</p>}
                    {event.deferredDueAt && <p>Prazo declarado: {event.deferredDueAt}</p>}
                    {event.deferredLimits.length > 0 && (
                      <p>
                        Limites restantes:{' '}
                        {event.deferredLimits.map(formatLimit).join(' · ')}
                      </p>
                    )}
                    {event.maintenanceActKind && (
                      <p>Ato de manutenção: {event.maintenanceActKind}</p>
                    )}
                    {event.returnToServiceState && (
                      <p>
                        Retorno ao serviço: {event.returnToServiceState} · efeito oficial: NENHUM
                      </p>
                    )}
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </div>

      {parsed.technicalFindingsInvalid ? (
        <div className="mt-5">
          <ContractUnavailable invalid subject="achados técnicos sanitizados" />
        </div>
      ) : parsed.technicalFindings.length > 0 ? (
        <div className="mt-5">
          <h3 className="flex items-center gap-2 font-semibold text-slate-900 dark:text-slate-100">
            <ShieldCheck className="h-4 w-4 text-cyan-600" /> Achados técnicos sanitizados
          </h3>
          <ul className="mt-3 grid gap-2 lg:grid-cols-2">
            {parsed.technicalFindings.map((finding, index) => (
              <li
                key={`${finding.code}-${finding.path}-${index}`}
                className="rounded-lg border border-slate-200 bg-slate-50 p-3 dark:border-slate-700 dark:bg-slate-800"
              >
                <p className="text-sm font-medium text-slate-900 dark:text-slate-100">
                  {finding.code}
                </p>
                <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                  {SEVERITY_LABELS[finding.severity]} · {finding.path}
                </p>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      <p className="mt-5 text-xs text-red-700 dark:text-red-300">
        Nenhum item desta seção representa liberação de aeronave, retorno oficial ao serviço,
        assinatura, aprovação de manutenção ou substituição do Diário de Bordo em papel.
      </p>
    </section>
  );
}

export default function EdbShadowAnalysisPanels({ rawPreviewData }: { rawPreviewData: unknown }) {
  const parsed = parseAnalysis(rawPreviewData);

  return (
    <div className="space-y-6">
      <DivergencePanel parsed={parsed} />
      <TechnicalPanel parsed={parsed} />
    </div>
  );
}
