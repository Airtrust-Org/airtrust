import { type FormEvent, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import {
  AlertTriangle,
  BookOpenCheck,
  Calculator,
  Database,
  FileWarning,
  Loader2,
  RefreshCw,
  ShieldAlert,
} from 'lucide-react';
import AppLayout from '@/react-app/components/AppLayout';
import { fetchWithAuth } from '@/react-app/config/api';
import ControleVoosPageShell from './components/ControleVoosPageShell';
import ControleVoosPageHeader from './components/ControleVoosPageHeader';
import ControleVoosBreadcrumb from './components/ControleVoosBreadcrumb';

const SHADOW_NOTICE = 'NÃO OFICIAL — PROTÓTIPO SHADOW — SEM VALOR REGULATÓRIO';

type SourceKind =
  'AIRTRUST_MANUAL' | 'AIRTRUST_CONTROL_FLIGHTS' | 'SIGVOOS' | 'MAINTENANCE_SYSTEM' | 'UNKNOWN';

type FieldSourceValue = {
  kind: SourceKind;
  reference?: string;
  observedAt?: string;
};

type FieldSource = {
  path: string;
  source: FieldSourceValue;
};

type Finding = {
  code: string;
  path: string;
};

type CrewMember = {
  personReference: string;
  displayName: string | null;
  canac: string | null;
  function: string | null;
  reportTime: string | null;
  contractualBase: string | null;
  source: FieldSourceValue;
};

type FuelQuantity = {
  value: number | null;
  unit: 'KG' | 'LB' | 'L' | null;
  source: FieldSourceValue;
};

type DraftLeg = {
  sequence: number;
  operationalDate: string;
  origin: string | null;
  destination: string | null;
  timezone: string | null;
  engineStartTime: string | null;
  takeoffTime: string | null;
  landingTime: string | null;
  engineShutdownTime: string | null;
  times: {
    blockMinutes: number | null;
    takeoffToLandingMinutes: number | null;
    dayMinutes: number | null;
    nightMinutes: number | null;
    vfrMinutes: number | null;
    ifrActualMinutes: number | null;
    ifrSimulatedMinutes: number | null;
  };
  dayLandings: number | null;
  nightLandings: number | null;
  cycles: number | null;
  fuelAtEngineStart: FuelQuantity;
  fuelAtEngineShutdown: FuelQuantity;
  fuelConsumed: FuelQuantity;
  fuelAdded: FuelQuantity;
  personsOnBoard: number | null;
  payload: number | null;
  payloadUnit: 'KG' | 'LB' | null;
  flightNatureCode: string | null;
  crew: CrewMember[];
  occurrenceSummary: string | null;
  technicalDiscrepancySummary: string | null;
  source: FieldSourceValue;
};

type ShadowDraft = {
  schemaVersion: 'edb.draft.v1';
  draftId: string;
  tenantId: number;
  status: 'shadow_draft' | 'ready_for_pic_review';
  createdAt: string;
  sourceFlightReference: string;
  operator: {
    legalName: string | null;
    legalIdentifier: string | null;
    operatingCertificate: string | null;
  };
  owner: {
    legalName: string | null;
    legalIdentifier: string | null;
  };
  aircraft: {
    manufacturer: string | null;
    model: string | null;
    serialNumber: string | null;
    registration: string | null;
  };
  volumeNumber: string | null;
  legs: DraftLeg[];
  technicalStatus: {
    lastMaintenanceIntervention: string | null;
    nextMaintenanceIntervention: string | null;
    airframeHoursRemaining: number | null;
    returnToServiceReference: string | null;
    openDiscrepancyCount: number | null;
    source: FieldSourceValue;
  };
};

type ShadowPreviewData = {
  status: 'shadow_draft' | 'ready_for_pic_review';
  classification: 'NON_OFFICIAL_SHADOW_PREVIEW';
  notices: {
    officialLogbook: false;
    replacesPaper: false;
    containsSignature: false;
    persistsRegulatedRecord: false;
  };
  draft: ShadowDraft;
  findings: Finding[];
  fieldSources: FieldSource[];
};

type ViewError =
  | 'access_denied'
  | 'not_found'
  | 'tenant_mismatch'
  | 'contract_incompatible'
  | 'draft_unavailable'
  | 'network'
  | 'internal';

type ProvenanceKind = 'transcribed' | 'calculated' | 'normalized' | 'unavailable' | 'incomplete';

type DisplayField = {
  label: string;
  value: string | number | null;
  path: string;
  source?: FieldSourceValue;
};

const SOURCE_KINDS = new Set<SourceKind>([
  'AIRTRUST_MANUAL',
  'AIRTRUST_CONTROL_FLIGHTS',
  'SIGVOOS',
  'MAINTENANCE_SYSTEM',
  'UNKNOWN',
]);

const FINDING_LABELS: Record<string, string> = {
  OPERATOR_LEGAL_NAME_REQUIRED: 'Nome legal do operador ausente',
  OPERATOR_LEGAL_IDENTIFIER_REQUIRED: 'Identificador legal do operador ausente',
  OWNER_LEGAL_NAME_REQUIRED: 'Proprietário ausente',
  OWNER_LEGAL_IDENTIFIER_REQUIRED: 'Identificador do proprietário ausente',
  AIRCRAFT_MANUFACTURER_REQUIRED: 'Fabricante da aeronave ausente',
  AIRCRAFT_MODEL_REQUIRED: 'Modelo da aeronave ausente',
  AIRCRAFT_SERIAL_NUMBER_REQUIRED: 'Número de série ausente',
  AIRCRAFT_REGISTRATION_REQUIRED: 'Matrícula ausente',
  VOLUME_NUMBER_REQUIRED: 'Volume ainda não disponível',
  LEGS_REQUIRED: 'Nenhuma etapa disponível',
  TIMEZONE_REQUIRED: 'Fuso horário ausente',
  SOURCE_CONFLICT_OPEN: 'Conflito de fonte aberto',
  CREW_WITHOUT_LEG: 'Tripulante sem etapa associada',
  CREW_LEG_NOT_FOUND: 'Etapa da tripulação não encontrada',
  CREW_ROLE_UNMAPPED: 'Função de tripulante não mapeada',
  FUEL_CONSUMPTION_UNAVAILABLE: 'Consumo de combustível indisponível',
  FUEL_UNIT_UNKNOWN: 'Unidade de combustível desconhecida',
  PAYLOAD_UNIT_UNKNOWN: 'Unidade de carga desconhecida',
  TECHNICAL_STATUS_SOURCE_UNAVAILABLE: 'Fonte canônica da situação técnica indisponível',
};

const ERROR_COPY: Record<ViewError, { title: string; message: string }> = {
  access_denied: {
    title: 'Acesso negado',
    message:
      'Seu perfil não possui a permissão existente exigida para consultar o protótipo shadow.',
  },
  not_found: {
    title: 'Voo não encontrado no tenant atual',
    message: 'O voo não existe ou não pertence ao escopo empresarial autorizado para esta sessão.',
  },
  tenant_mismatch: {
    title: 'Tenant divergente',
    message:
      'A consulta foi interrompida porque o escopo empresarial dos dados não corresponde ao tenant autenticado.',
  },
  contract_incompatible: {
    title: 'Contrato incompatível',
    message:
      'A resposta recebida não corresponde ao contrato edb.draft.v1 esperado pela interface.',
  },
  draft_unavailable: {
    title: 'Rascunho indisponível',
    message: 'O backend recusou formar o rascunho por inconsistência de escopo ou procedência.',
  },
  network: {
    title: 'Erro de rede',
    message: 'Não foi possível concluir a consulta. Nenhuma alteração foi enviada ao voo original.',
  },
  internal: {
    title: 'Erro interno',
    message:
      'O protótipo está temporariamente indisponível. O erro foi sanitizado e nenhum detalhe técnico sensível é exibido.',
  },
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isNullableString(value: unknown): value is string | null {
  return value === null || typeof value === 'string';
}

function isNullableNumber(value: unknown): value is number | null {
  return value === null || (typeof value === 'number' && Number.isFinite(value));
}

function isSourceKind(value: unknown): value is SourceKind {
  return typeof value === 'string' && SOURCE_KINDS.has(value as SourceKind);
}

function isSource(value: unknown): value is FieldSourceValue {
  return (
    isRecord(value) &&
    isSourceKind(value.kind) &&
    (value.reference === undefined || typeof value.reference === 'string') &&
    (value.observedAt === undefined || typeof value.observedAt === 'string')
  );
}

function isFuel(value: unknown): value is FuelQuantity {
  return (
    isRecord(value) &&
    isNullableNumber(value.value) &&
    (value.unit === null || value.unit === 'KG' || value.unit === 'LB' || value.unit === 'L') &&
    isSource(value.source)
  );
}

function isCrewMember(value: unknown): value is CrewMember {
  return (
    isRecord(value) &&
    typeof value.personReference === 'string' &&
    isNullableString(value.displayName) &&
    isNullableString(value.canac) &&
    isNullableString(value.function) &&
    isNullableString(value.reportTime) &&
    isNullableString(value.contractualBase) &&
    isSource(value.source)
  );
}

function isTimes(value: unknown): value is DraftLeg['times'] {
  return (
    isRecord(value) &&
    isNullableNumber(value.blockMinutes) &&
    isNullableNumber(value.takeoffToLandingMinutes) &&
    isNullableNumber(value.dayMinutes) &&
    isNullableNumber(value.nightMinutes) &&
    isNullableNumber(value.vfrMinutes) &&
    isNullableNumber(value.ifrActualMinutes) &&
    isNullableNumber(value.ifrSimulatedMinutes)
  );
}

function isLeg(value: unknown): value is DraftLeg {
  return (
    isRecord(value) &&
    typeof value.sequence === 'number' &&
    typeof value.operationalDate === 'string' &&
    isNullableString(value.origin) &&
    isNullableString(value.destination) &&
    isNullableString(value.timezone) &&
    isNullableString(value.engineStartTime) &&
    isNullableString(value.takeoffTime) &&
    isNullableString(value.landingTime) &&
    isNullableString(value.engineShutdownTime) &&
    isTimes(value.times) &&
    isNullableNumber(value.dayLandings) &&
    isNullableNumber(value.nightLandings) &&
    isNullableNumber(value.cycles) &&
    isFuel(value.fuelAtEngineStart) &&
    isFuel(value.fuelAtEngineShutdown) &&
    isFuel(value.fuelConsumed) &&
    isFuel(value.fuelAdded) &&
    isNullableNumber(value.personsOnBoard) &&
    isNullableNumber(value.payload) &&
    (value.payloadUnit === null || value.payloadUnit === 'KG' || value.payloadUnit === 'LB') &&
    isNullableString(value.flightNatureCode) &&
    Array.isArray(value.crew) &&
    value.crew.every(isCrewMember) &&
    isNullableString(value.occurrenceSummary) &&
    isNullableString(value.technicalDiscrepancySummary) &&
    isSource(value.source)
  );
}

function isDraft(value: unknown): value is ShadowDraft {
  if (!isRecord(value) || !isRecord(value.operator) || !isRecord(value.owner)) return false;
  if (!isRecord(value.aircraft) || !isRecord(value.technicalStatus)) return false;

  return (
    value.schemaVersion === 'edb.draft.v1' &&
    typeof value.draftId === 'string' &&
    typeof value.tenantId === 'number' &&
    (value.status === 'shadow_draft' || value.status === 'ready_for_pic_review') &&
    typeof value.createdAt === 'string' &&
    typeof value.sourceFlightReference === 'string' &&
    isNullableString(value.operator.legalName) &&
    isNullableString(value.operator.legalIdentifier) &&
    isNullableString(value.operator.operatingCertificate) &&
    isNullableString(value.owner.legalName) &&
    isNullableString(value.owner.legalIdentifier) &&
    isNullableString(value.aircraft.manufacturer) &&
    isNullableString(value.aircraft.model) &&
    isNullableString(value.aircraft.serialNumber) &&
    isNullableString(value.aircraft.registration) &&
    isNullableString(value.volumeNumber) &&
    Array.isArray(value.legs) &&
    value.legs.every(isLeg) &&
    isNullableString(value.technicalStatus.lastMaintenanceIntervention) &&
    isNullableString(value.technicalStatus.nextMaintenanceIntervention) &&
    isNullableNumber(value.technicalStatus.airframeHoursRemaining) &&
    isNullableString(value.technicalStatus.returnToServiceReference) &&
    isNullableNumber(value.technicalStatus.openDiscrepancyCount) &&
    isSource(value.technicalStatus.source)
  );
}

function isFinding(value: unknown): value is Finding {
  return isRecord(value) && typeof value.code === 'string' && typeof value.path === 'string';
}

function isFieldSource(value: unknown): value is FieldSource {
  return isRecord(value) && typeof value.path === 'string' && isSource(value.source);
}

function isPreviewData(value: unknown): value is ShadowPreviewData {
  return (
    isRecord(value) &&
    value.classification === 'NON_OFFICIAL_SHADOW_PREVIEW' &&
    (value.status === 'shadow_draft' || value.status === 'ready_for_pic_review') &&
    isRecord(value.notices) &&
    value.notices.officialLogbook === false &&
    value.notices.replacesPaper === false &&
    value.notices.containsSignature === false &&
    value.notices.persistsRegulatedRecord === false &&
    isDraft(value.draft) &&
    Array.isArray(value.findings) &&
    value.findings.every(isFinding) &&
    Array.isArray(value.fieldSources) &&
    value.fieldSources.every(isFieldSource)
  );
}

function parseShadowPreview(payload: unknown): ShadowPreviewData | null {
  if (!isRecord(payload) || payload.success !== true || !isPreviewData(payload.data)) return null;
  return payload.data;
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
      return 'Origem não identificada';
  }
}

function formatMinutes(value: number | null): string | null {
  if (value === null) return null;
  const hours = Math.floor(value / 60);
  const minutes = value % 60;
  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;
}

function formatQuantity(value: number | null, unit: string | null): string | null {
  if (value === null) return null;
  return unit ? `${value} ${unit}` : String(value);
}

function findingLabel(finding: Finding): string {
  return FINDING_LABELS[finding.code] || finding.code.split('_').join(' ').toLowerCase();
}

function provenanceFor(
  path: string,
  value: unknown,
  source: FieldSourceValue | undefined,
): { kind: ProvenanceKind; label: string; source?: string } {
  if (value === null || value === undefined || value === '') {
    return { kind: 'unavailable', label: 'Dado não disponível' };
  }
  if (path.endsWith('.fuelConsumed.value') || path.endsWith('.operationalDate')) {
    return {
      kind: 'calculated',
      label: 'Dado calculado',
      source: sourceLabel(source?.kind || 'UNKNOWN'),
    };
  }
  if (
    path.includes('Time') ||
    path.includes('.times.') ||
    path.endsWith('.registration') ||
    path.endsWith('.origin') ||
    path.endsWith('.destination')
  ) {
    return {
      kind: 'normalized',
      label: 'Dado normalizado',
      source: sourceLabel(source?.kind || 'UNKNOWN'),
    };
  }
  if (!source || source.kind === 'UNKNOWN') {
    return { kind: 'incomplete', label: 'Procedência incompleta' };
  }
  return {
    kind: 'transcribed',
    label: 'Dado transcrito da fonte',
    source: sourceLabel(source.kind),
  };
}

function ProvenanceBadge({
  path,
  value,
  source,
}: {
  path: string;
  value: unknown;
  source?: FieldSourceValue;
}) {
  const provenance = provenanceFor(path, value, source);
  const classes: Record<ProvenanceKind, string> = {
    transcribed:
      'border-blue-200 bg-blue-50 text-blue-700 dark:border-blue-800 dark:bg-blue-950/30 dark:text-blue-300',
    calculated:
      'border-violet-200 bg-violet-50 text-violet-700 dark:border-violet-800 dark:bg-violet-950/30 dark:text-violet-300',
    normalized:
      'border-cyan-200 bg-cyan-50 text-cyan-700 dark:border-cyan-800 dark:bg-cyan-950/30 dark:text-cyan-300',
    unavailable:
      'border-slate-200 bg-slate-50 text-slate-500 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-400',
    incomplete:
      'border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-800 dark:bg-amber-950/30 dark:text-amber-300',
  };

  return (
    <span
      className={`inline-flex max-w-full items-center rounded-full border px-2 py-0.5 text-[10px] font-semibold ${classes[provenance.kind]}`}
      title={provenance.source ? `${provenance.label} — ${provenance.source}` : provenance.label}
    >
      {provenance.label}
      {provenance.source ? ` · ${provenance.source}` : ''}
    </span>
  );
}

function Field({ label, value, path, source }: DisplayField) {
  return (
    <div className="rounded-lg border border-slate-200 p-3 dark:border-slate-700">
      <dt className="text-xs font-medium text-slate-500 dark:text-slate-400">{label}</dt>
      <dd className="mt-1 break-words text-sm font-medium text-slate-800 dark:text-slate-100">
        {value === null || value === '' ? 'Não disponível' : value}
      </dd>
      <div className="mt-2">
        <ProvenanceBadge path={path} value={value} source={source} />
      </div>
    </div>
  );
}

function FieldGrid({ fields }: { fields: DisplayField[] }) {
  return (
    <dl className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
      {fields.map((field) => (
        <Field key={field.path} {...field} />
      ))}
    </dl>
  );
}

function ShadowBanner() {
  return (
    <div
      role="status"
      className="border-y-4 border-red-600 bg-red-50 px-4 py-3 text-center text-sm font-black tracking-wide text-red-900 dark:bg-red-950/40 dark:text-red-100"
    >
      {SHADOW_NOTICE}
    </div>
  );
}

function legFields(leg: DraftLeg, index: number): DisplayField[] {
  const base = `legs.${index}`;
  return [
    { label: 'Origem', value: leg.origin, path: `${base}.origin`, source: leg.source },
    { label: 'Destino', value: leg.destination, path: `${base}.destination`, source: leg.source },
    { label: 'Fuso', value: leg.timezone, path: `${base}.timezone`, source: leg.source },
    {
      label: 'Natureza',
      value: leg.flightNatureCode,
      path: `${base}.flightNatureCode`,
      source: leg.source,
    },
    {
      label: 'Motor ligado',
      value: leg.engineStartTime,
      path: `${base}.engineStartTime`,
      source: leg.source,
    },
    { label: 'Decolagem', value: leg.takeoffTime, path: `${base}.takeoffTime`, source: leg.source },
    { label: 'Pouso', value: leg.landingTime, path: `${base}.landingTime`, source: leg.source },
    {
      label: 'Motor desligado',
      value: leg.engineShutdownTime,
      path: `${base}.engineShutdownTime`,
      source: leg.source,
    },
    {
      label: 'Tempo block',
      value: formatMinutes(leg.times.blockMinutes),
      path: `${base}.times.blockMinutes`,
      source: leg.source,
    },
    {
      label: 'Tempo de voo',
      value: formatMinutes(leg.times.takeoffToLandingMinutes),
      path: `${base}.times.takeoffToLandingMinutes`,
      source: leg.source,
    },
    {
      label: 'Diurno',
      value: formatMinutes(leg.times.dayMinutes),
      path: `${base}.times.dayMinutes`,
      source: leg.source,
    },
    {
      label: 'Noturno',
      value: formatMinutes(leg.times.nightMinutes),
      path: `${base}.times.nightMinutes`,
      source: leg.source,
    },
    {
      label: 'VFR',
      value: formatMinutes(leg.times.vfrMinutes),
      path: `${base}.times.vfrMinutes`,
      source: leg.source,
    },
    {
      label: 'IFR real',
      value: formatMinutes(leg.times.ifrActualMinutes),
      path: `${base}.times.ifrActualMinutes`,
      source: leg.source,
    },
    {
      label: 'IFR simulado',
      value: formatMinutes(leg.times.ifrSimulatedMinutes),
      path: `${base}.times.ifrSimulatedMinutes`,
      source: leg.source,
    },
    {
      label: 'Pousos diurnos',
      value: leg.dayLandings,
      path: `${base}.dayLandings`,
      source: leg.source,
    },
    {
      label: 'Pousos noturnos',
      value: leg.nightLandings,
      path: `${base}.nightLandings`,
      source: leg.source,
    },
    { label: 'Ciclos', value: leg.cycles, path: `${base}.cycles`, source: leg.source },
    {
      label: 'Combustível inicial',
      value: formatQuantity(leg.fuelAtEngineStart.value, leg.fuelAtEngineStart.unit),
      path: `${base}.fuelAtEngineStart.value`,
      source: leg.fuelAtEngineStart.source,
    },
    {
      label: 'Combustível final',
      value: formatQuantity(leg.fuelAtEngineShutdown.value, leg.fuelAtEngineShutdown.unit),
      path: `${base}.fuelAtEngineShutdown.value`,
      source: leg.fuelAtEngineShutdown.source,
    },
    {
      label: 'Combustível consumido',
      value: formatQuantity(leg.fuelConsumed.value, leg.fuelConsumed.unit),
      path: `${base}.fuelConsumed.value`,
      source: leg.fuelConsumed.source,
    },
    {
      label: 'Combustível adicionado',
      value: formatQuantity(leg.fuelAdded.value, leg.fuelAdded.unit),
      path: `${base}.fuelAdded.value`,
      source: leg.fuelAdded.source,
    },
    {
      label: 'Passageiros / POB',
      value: leg.personsOnBoard,
      path: `${base}.personsOnBoard`,
      source: leg.source,
    },
    {
      label: 'Carga',
      value: formatQuantity(leg.payload, leg.payloadUnit),
      path: `${base}.payload`,
      source: leg.source,
    },
  ];
}

export default function EdbShadowPrototype() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [flightId, setFlightId] = useState(searchParams.get('flightId') || '');
  const [preview, setPreview] = useState<ShadowPreviewData | null>(null);
  const [loading, setLoading] = useState(false);
  const [viewError, setViewError] = useState<ViewError | null>(null);

  const sourceByPath = useMemo(
    () => new Map((preview?.fieldSources || []).map((item) => [item.path, item.source])),
    [preview],
  );

  const loadPreview = async (event?: FormEvent<HTMLFormElement>) => {
    event?.preventDefault();
    const normalizedFlightId = flightId.trim();
    if (!/^\d+$/.test(normalizedFlightId) || Number(normalizedFlightId) <= 0) {
      setPreview(null);
      setViewError('not_found');
      return;
    }

    setLoading(true);
    setViewError(null);
    setPreview(null);
    setSearchParams({ 'edb-shadow': '1', flightId: normalizedFlightId });

    try {
      const response = await fetchWithAuth(`/api/edb/shadow-preview/${normalizedFlightId}`, {
        method: 'GET',
        headers: { Accept: 'application/json' },
      });
      const payload: unknown = await response.json().catch(() => null);

      if (!response.ok) {
        const code = isRecord(payload) && typeof payload.code === 'string' ? payload.code : '';
        if (response.status === 403) setViewError('access_denied');
        else if (response.status === 404) setViewError('not_found');
        else if (response.status === 409 && code.includes('TENANT_MISMATCH')) {
          setViewError('tenant_mismatch');
        } else if (response.status === 409) setViewError('draft_unavailable');
        else if (response.status >= 500) setViewError('internal');
        else setViewError('draft_unavailable');
        return;
      }

      const parsed = parseShadowPreview(payload);
      if (!parsed) {
        setViewError('contract_incompatible');
        return;
      }
      setPreview(parsed);
    } catch {
      setViewError('network');
    } finally {
      setLoading(false);
    }
  };

  const summaryFields: DisplayField[] = preview
    ? [
        {
          label: 'Operador',
          value: preview.draft.operator.legalName,
          path: 'operator.legalName',
          source: sourceByPath.get('operator.legalName'),
        },
        {
          label: 'Matrícula',
          value: preview.draft.aircraft.registration,
          path: 'aircraft.registration',
          source: sourceByPath.get('aircraft.registration'),
        },
        {
          label: 'Modelo',
          value: preview.draft.aircraft.model,
          path: 'aircraft.model',
          source: sourceByPath.get('aircraft.model'),
        },
        {
          label: 'Fabricante',
          value: preview.draft.aircraft.manufacturer,
          path: 'aircraft.manufacturer',
          source: sourceByPath.get('aircraft.manufacturer'),
        },
        {
          label: 'Data operacional',
          value: preview.draft.legs[0]?.operationalDate || null,
          path: 'legs.0.operationalDate',
          source: preview.draft.legs[0]?.source,
        },
        {
          label: 'Etapas',
          value: preview.draft.legs.length,
          path: 'legs',
          source: sourceByPath.get('legs'),
        },
        {
          label: 'Volume',
          value: preview.draft.volumeNumber,
          path: 'volumeNumber',
          source: sourceByPath.get('volumeNumber'),
        },
        {
          label: 'Criado em',
          value: preview.draft.createdAt,
          path: 'createdAt',
          source: sourceByPath.get('createdAt'),
        },
      ]
    : [];

  const technicalFields: DisplayField[] = preview
    ? [
        {
          label: 'Última intervenção',
          value: preview.draft.technicalStatus.lastMaintenanceIntervention,
          path: 'technicalStatus.lastMaintenanceIntervention',
          source: preview.draft.technicalStatus.source,
        },
        {
          label: 'Próxima intervenção',
          value: preview.draft.technicalStatus.nextMaintenanceIntervention,
          path: 'technicalStatus.nextMaintenanceIntervention',
          source: preview.draft.technicalStatus.source,
        },
        {
          label: 'Horas restantes',
          value: preview.draft.technicalStatus.airframeHoursRemaining,
          path: 'technicalStatus.airframeHoursRemaining',
          source: preview.draft.technicalStatus.source,
        },
        {
          label: 'Referência de retorno ao serviço',
          value: preview.draft.technicalStatus.returnToServiceReference,
          path: 'technicalStatus.returnToServiceReference',
          source: preview.draft.technicalStatus.source,
        },
        {
          label: 'Discrepâncias abertas',
          value: preview.draft.technicalStatus.openDiscrepancyCount,
          path: 'technicalStatus.openDiscrepancyCount',
          source: preview.draft.technicalStatus.source,
        },
      ]
    : [];

  return (
    <AppLayout>
      <div className="w-full print:bg-white">
        <ShadowBanner />
        <ControleVoosPageShell>
          <ControleVoosBreadcrumb
            items={[
              { label: 'Controle de Voos', to: '/controle-voos' },
              { label: 'Protótipo eDB Shadow' },
            ]}
          />
          <ControleVoosPageHeader
            title="Protótipo eDB — Shadow Mode"
            description="Visualização somente leitura de como o futuro eDB seria formado para um voo existente. O Controle de Voos original não é modificado."
          >
            <Link
              to="/controle-voos"
              className="text-sm font-medium text-blue-600 hover:underline dark:text-blue-400"
            >
              Voltar ao Controle de Voos
            </Link>
          </ControleVoosPageHeader>

          <section className="mb-6 rounded-xl border border-slate-200 bg-white p-5 dark:border-slate-700 dark:bg-slate-900">
            <form onSubmit={loadPreview} className="flex flex-col gap-3 sm:flex-row sm:items-end">
              <label className="flex-1 text-sm font-medium text-slate-700 dark:text-slate-200">
                Identificação do voo acessível
                <input
                  aria-label="Identificação do voo"
                  inputMode="numeric"
                  value={flightId}
                  onChange={(event) => setFlightId(event.target.value)}
                  placeholder="Ex.: 42"
                  className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-200 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100 dark:focus:ring-blue-900"
                />
              </label>
              <button
                type="submit"
                disabled={loading}
                className="inline-flex items-center justify-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {loading ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <BookOpenCheck className="h-4 w-4" />
                )}
                {loading ? 'Carregando preview…' : 'Carregar preview shadow'}
              </button>
              {preview && (
                <button
                  type="button"
                  onClick={() => void loadPreview()}
                  disabled={loading}
                  className="inline-flex items-center justify-center gap-2 rounded-lg border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-60 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800"
                >
                  <RefreshCw className="h-4 w-4" /> Atualizar consulta
                </button>
              )}
            </form>
            <p className="mt-3 text-xs text-slate-500 dark:text-slate-400">
              A interface executa apenas GET autenticado. Não há assinatura, aprovação, emissão,
              registro definitivo, retorno ao serviço ou escrita no voo.
            </p>
          </section>

          {loading && (
            <div className="mb-6 rounded-xl border border-blue-200 bg-blue-50 p-6 text-center dark:border-blue-800 dark:bg-blue-950/20">
              <Loader2 className="mx-auto h-6 w-6 animate-spin text-blue-600" />
              <p className="mt-2 text-sm text-blue-800 dark:text-blue-200">
                Carregando rascunho não oficial…
              </p>
            </div>
          )}

          {viewError && !loading && (
            <div
              role="alert"
              className="mb-6 rounded-xl border border-red-200 bg-red-50 p-5 dark:border-red-800 dark:bg-red-950/20"
            >
              <div className="flex items-start gap-3">
                <ShieldAlert className="mt-0.5 h-5 w-5 shrink-0 text-red-600" />
                <div>
                  <h2 className="font-semibold text-red-900 dark:text-red-100">
                    {ERROR_COPY[viewError].title}
                  </h2>
                  <p className="mt-1 text-sm text-red-700 dark:text-red-300">
                    {ERROR_COPY[viewError].message}
                  </p>
                </div>
              </div>
            </div>
          )}

          {preview && !loading && (
            <div className="space-y-6">
              {preview.findings.length > 0 && (
                <div className="rounded-xl border border-amber-300 bg-amber-50 p-4 dark:border-amber-700 dark:bg-amber-950/20">
                  <div className="flex items-start gap-3">
                    <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-amber-600" />
                    <div>
                      <h2 className="font-semibold text-amber-900 dark:text-amber-100">
                        Dados incompletos
                      </h2>
                      <p className="mt-1 text-sm text-amber-800 dark:text-amber-200">
                        O rascunho possui {preview.findings.length} alerta(s) ou campo(s)
                        ausente(s). Nenhum valor foi presumido.
                      </p>
                    </div>
                  </div>
                </div>
              )}

              <section className="rounded-xl border border-slate-200 bg-white p-5 dark:border-slate-700 dark:bg-slate-900">
                <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100">
                      Resumo do voo
                    </h2>
                    <p className="text-xs text-slate-500 dark:text-slate-400">
                      Contrato {preview.draft.schemaVersion} · estado {preview.draft.status} · voo
                      consultado {flightId}
                    </p>
                  </div>
                  <span className="rounded-full border border-red-300 bg-red-50 px-3 py-1 text-xs font-bold text-red-700 dark:border-red-800 dark:bg-red-950/30 dark:text-red-300">
                    Rascunho shadow
                  </span>
                </div>
                <FieldGrid fields={summaryFields} />
              </section>

              <section aria-labelledby="etapas-shadow-title" className="space-y-4">
                <h2
                  id="etapas-shadow-title"
                  className="text-lg font-semibold text-slate-900 dark:text-slate-100"
                >
                  Etapas do rascunho
                </h2>
                {preview.draft.legs.length === 0 ? (
                  <div className="rounded-xl border border-dashed border-slate-300 bg-slate-50 p-6 text-center dark:border-slate-700 dark:bg-slate-900">
                    <FileWarning className="mx-auto h-6 w-6 text-slate-400" />
                    <p className="mt-2 text-sm text-slate-600 dark:text-slate-300">
                      Nenhuma etapa disponível.
                    </p>
                  </div>
                ) : (
                  preview.draft.legs.map((leg, legIndex) => (
                    <article
                      key={`${leg.sequence}-${leg.operationalDate}`}
                      className="rounded-xl border border-slate-200 bg-white p-5 dark:border-slate-700 dark:bg-slate-900"
                    >
                      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
                        <div>
                          <h3 className="font-semibold text-slate-900 dark:text-slate-100">
                            Etapa {leg.sequence}: {leg.origin || 'Não disponível'} →{' '}
                            {leg.destination || 'Não disponível'}
                          </h3>
                          <p className="text-xs text-slate-500 dark:text-slate-400">
                            {leg.operationalDate}
                          </p>
                        </div>
                        <ProvenanceBadge
                          path={`legs.${legIndex}`}
                          value={leg.sequence}
                          source={leg.source}
                        />
                      </div>

                      <FieldGrid fields={legFields(leg, legIndex)} />

                      <div className="mt-5 grid gap-4 lg:grid-cols-2">
                        <div className="rounded-lg border border-slate-200 p-4 dark:border-slate-700">
                          <h4 className="font-semibold text-slate-800 dark:text-slate-100">
                            Tripulação por etapa
                          </h4>
                          {leg.crew.length === 0 ? (
                            <p className="mt-2 text-sm text-slate-500">Não disponível</p>
                          ) : (
                            <ul className="mt-3 space-y-3">
                              {leg.crew.map((member, crewIndex) => (
                                <li
                                  key={`${member.personReference}-${crewIndex}`}
                                  className="rounded-lg bg-slate-50 p-3 text-sm dark:bg-slate-800"
                                >
                                  <p className="font-medium text-slate-900 dark:text-slate-100">
                                    {member.displayName || 'Nome não disponível'} ·{' '}
                                    {member.function || 'Função não disponível'}
                                  </p>
                                  <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                                    CANAC: {member.canac || 'Não disponível'} · apresentação:{' '}
                                    {member.reportTime || 'Não disponível'} · base:{' '}
                                    {member.contractualBase || 'Não disponível'}
                                  </p>
                                  <div className="mt-2">
                                    <ProvenanceBadge
                                      path={`legs.${legIndex}.crew.${crewIndex}`}
                                      value={member.displayName}
                                      source={member.source}
                                    />
                                  </div>
                                </li>
                              ))}
                            </ul>
                          )}
                        </div>
                        <div className="space-y-3">
                          <div className="rounded-lg border border-slate-200 p-4 dark:border-slate-700">
                            <h4 className="font-semibold text-slate-800 dark:text-slate-100">
                              Ocorrências e observações
                            </h4>
                            <p className="mt-2 whitespace-pre-wrap text-sm text-slate-600 dark:text-slate-300">
                              {leg.occurrenceSummary || 'Não disponível'}
                            </p>
                          </div>
                          <div className="rounded-lg border border-slate-200 p-4 dark:border-slate-700">
                            <h4 className="font-semibold text-slate-800 dark:text-slate-100">
                              Discrepâncias técnicas
                            </h4>
                            <p className="mt-2 whitespace-pre-wrap text-sm text-slate-600 dark:text-slate-300">
                              {leg.technicalDiscrepancySummary || 'Não disponível'}
                            </p>
                          </div>
                        </div>
                      </div>
                    </article>
                  ))
                )}
              </section>

              <section className="grid gap-6 lg:grid-cols-2">
                <div className="rounded-xl border border-slate-200 bg-white p-5 dark:border-slate-700 dark:bg-slate-900">
                  <h2 className="flex items-center gap-2 text-lg font-semibold text-slate-900 dark:text-slate-100">
                    <FileWarning className="h-5 w-5 text-amber-600" /> Alertas e campos ausentes
                  </h2>
                  {preview.findings.length === 0 ? (
                    <p className="mt-3 text-sm text-emerald-700 dark:text-emerald-300">
                      Nenhum alerta retornado pelo backend.
                    </p>
                  ) : (
                    <ul className="mt-3 space-y-2">
                      {preview.findings.map((finding, index) => (
                        <li
                          key={`${finding.code}-${finding.path}-${index}`}
                          className="rounded-lg border border-amber-200 bg-amber-50 p-3 dark:border-amber-800 dark:bg-amber-950/20"
                        >
                          <p className="text-sm font-medium text-amber-900 dark:text-amber-100">
                            {findingLabel(finding)}
                          </p>
                          <p className="mt-1 font-mono text-xs text-amber-700 dark:text-amber-300">
                            {finding.path}
                          </p>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>

                <div className="rounded-xl border border-slate-200 bg-white p-5 dark:border-slate-700 dark:bg-slate-900">
                  <h2 className="flex items-center gap-2 text-lg font-semibold text-slate-900 dark:text-slate-100">
                    <Database className="h-5 w-5 text-blue-600" /> Procedência
                  </h2>
                  <p className="mt-2 text-sm text-slate-600 dark:text-slate-300">
                    Referências internas e identificadores de registros não são exibidos. A
                    interface apresenta apenas a categoria de origem necessária à revisão.
                  </p>
                  <div className="mt-4 grid gap-2 sm:grid-cols-2">
                    <span className="rounded-lg border border-blue-200 bg-blue-50 p-2 text-xs text-blue-700 dark:border-blue-800 dark:bg-blue-950/30 dark:text-blue-300">
                      Dado transcrito da fonte
                    </span>
                    <span className="rounded-lg border border-violet-200 bg-violet-50 p-2 text-xs text-violet-700 dark:border-violet-800 dark:bg-violet-950/30 dark:text-violet-300">
                      <Calculator className="mr-1 inline h-3.5 w-3.5" /> Dado calculado
                    </span>
                    <span className="rounded-lg border border-cyan-200 bg-cyan-50 p-2 text-xs text-cyan-700 dark:border-cyan-800 dark:bg-cyan-950/30 dark:text-cyan-300">
                      Dado normalizado
                    </span>
                    <span className="rounded-lg border border-slate-200 bg-slate-50 p-2 text-xs text-slate-500 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-400">
                      Dado não disponível
                    </span>
                    <span className="rounded-lg border border-amber-200 bg-amber-50 p-2 text-xs text-amber-700 dark:border-amber-800 dark:bg-amber-950/30 dark:text-amber-300">
                      Procedência incompleta
                    </span>
                  </div>
                </div>
              </section>

              <section className="rounded-xl border border-slate-200 bg-white p-5 dark:border-slate-700 dark:bg-slate-900">
                <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100">
                  Situação técnica — somente leitura
                </h2>
                <div className="mt-4">
                  <FieldGrid fields={technicalFields} />
                </div>
                <p className="mt-3 text-xs text-red-700 dark:text-red-300">
                  Esta seção não representa retorno ao serviço, liberação de aeronave ou situação
                  técnica oficial.
                </p>
              </section>
            </div>
          )}
        </ControleVoosPageShell>
        <div className="mt-8 print:mt-4">
          <ShadowBanner />
        </div>
      </div>
    </AppLayout>
  );
}
