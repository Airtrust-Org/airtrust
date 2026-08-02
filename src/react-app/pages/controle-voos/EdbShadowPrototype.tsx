import { FormEvent, useMemo, useState } from 'react';
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
  | 'AIRTRUST_MANUAL'
  | 'AIRTRUST_CONTROL_FLIGHTS'
  | 'SIGVOOS'
  | 'MAINTENANCE_SYSTEM'
  | 'UNKNOWN';

type FieldSource = {
  path: string;
  source: {
    kind: SourceKind;
    reference?: string;
    observedAt?: string;
  };
};

type Finding = {
  code: string;
  path: string;
};

type FieldSourceValue = {
  kind: SourceKind;
  reference?: string;
  observedAt?: string;
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

type ApiErrorBody = {
  success?: false;
  error?: string;
  code?: string;
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
    message: 'Seu perfil não possui a permissão existente exigida para consultar o protótipo shadow.',
  },
  not_found: {
    title: 'Voo não encontrado no tenant atual',
    message: 'O voo não existe ou não pertence ao escopo empresarial autorizado para esta sessão.',
  },
  tenant_mismatch: {
    title: 'Tenant divergente',
    message: 'A consulta foi interrompida porque o escopo empresarial dos dados não corresponde ao tenant autenticado.',
  },
  contract_incompatible: {
    title: 'Contrato incompatível',
    message: 'A resposta recebida não corresponde ao contrato edb.draft.v1 esperado pela interface.',
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
    message: 'O protótipo está temporariamente indisponível. O erro foi sanitizado e nenhum detalhe técnico sensível é exibido.',
  },
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function parseShadowPreview(payload: unknown): ShadowPreviewData | null {
  if (!isRecord(payload) || payload.success !== true || !isRecord(payload.data)) return null;
  const data = payload.data;
  if (
    data.classification !== 'NON_OFFICIAL_SHADOW_PREVIEW' ||
    !isRecord(data.draft) ||
    data.draft.schemaVersion !== 'edb.draft.v1' ||
    (data.draft.status !== 'shadow_draft' && data.draft.status !== 'ready_for_pic_review') ||
    !Array.isArray(data.draft.legs) ||
    !Array.isArray(data.findings) ||
    !Array.isArray(data.fieldSources)
  ) {
    return null;
  }
  return data as unknown as ShadowPreviewData;
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
  return FINDING_LABELS[finding.code] || finding.code.replaceAll('_', ' ').toLowerCase();
}

function provenanceFor(
  path: string,
  value: unknown,
  fieldSource: FieldSourceValue | undefined,
  explicitSource: FieldSourceValue | undefined,
): { kind: ProvenanceKind; label: string; source?: string } {
  if (value === null || value === undefined || value === '') {
    return { kind: 'unavailable', label: 'Dado não disponível' };
  }

  if (path.endsWith('.fuelConsumed.value') || path.endsWith('.operationalDate')) {
    return {
      kind: 'calculated',
      label: 'Dado calculado',
      source: sourceLabel((fieldSource || explicitSource)?.kind || 'UNKNOWN'),
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
      source: sourceLabel((fieldSource || explicitSource)?.kind || 'UNKNOWN'),
    };
  }

  const source = fieldSource || explicitSource;
  if (!source || source.kind === 'UNKNOWN') {
    return { kind: 'incomplete', label: 'Procedência incompleta' };
  }

  return { kind: 'transcribed', label: 'Dado transcrito da fonte', source: sourceLabel(source.kind) };
}

function ProvenanceBadge({
  path,
  value,
  source,
  fieldSources,
}: {
  path: string;
  value: unknown;
  source?: FieldSourceValue;
  fieldSources: Map<string, FieldSourceValue>;
}) {
  const provenance = provenanceFor(path, value, fieldSources.get(path), source);
  const classes: Record<ProvenanceKind, string> = {
    transcribed: 'border-blue-200 bg-blue-50 text-blue-700 dark:border-blue-800 dark:bg-blue-950/30 dark:text-blue-300',
    calculated: 'border-violet-200 bg-violet-50 text-violet-700 dark:border-violet-800 dark:bg-violet-950/30 dark:text-violet-300',
    normalized: 'border-cyan-200 bg-cyan-50 text-cyan-700 dark:border-cyan-800 dark:bg-cyan-950/30 dark:text-cyan-300',
    unavailable: 'border-slate-200 bg-slate-50 text-slate-500 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-400',
    incomplete: 'border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-800 dark:bg-amber-950/30 dark:text-amber-300',
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

function Field({
  label,
  value,
  path,
  source,
  fieldSources,
}: {
  label: string;
  value: string | number | null;
  path: string;
  source?: FieldSourceValue;
  fieldSources: Map<string, FieldSourceValue>;
}) {
  return (
    <div className="rounded-lg border border-slate-200 p-3 dark:border-slate-700">
      <dt className="text-xs font-medium text-slate-500 dark:text-slate-400">{label}</dt>
      <dd className="mt-1 break-words text-sm font-medium text-slate-800 dark:text-slate-100">
        {value === null || value === '' ? 'Não disponível' : value}
      </dd>
      <div className="mt-2">
        <ProvenanceBadge path={path} value={value} source={source} fieldSources={fieldSources} />
      </div>
    </div>
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

export default function EdbShadowPrototype() {
  const [searchParams, setSearchParams] = useSearchParams();
  const initialFlightId = searchParams.get('flightId') || '';
  const [flightId, setFlightId] = useState(initialFlightId);
  const [preview, setPreview] = useState<ShadowPreviewData | null>(null);
  const [loading, setLoading] = useState(false);
  const [viewError, setViewError] = useState<ViewError | null>(null);

  const fieldSources = useMemo(
    () => new Map((preview?.fieldSources || []).map((item) => [item.path, item.source])),
    [preview],
  );

  const loadPreview = async (event?: FormEvent) => {
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
      const payload = (await response.json().catch(() => null)) as unknown;

      if (!response.ok) {
        const body = isRecord(payload) ? (payload as ApiErrorBody) : {};
        const code = typeof body.code === 'string' ? body.code : '';
        if (response.status === 403) setViewError('access_denied');
        else if (response.status === 404) setViewError('not_found');
        else if (response.status === 409 && code.includes('TENANT_MISMATCH')) setViewError('tenant_mismatch');
        else if (response.status === 409) setViewError('draft_unavailable');
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

  const hasIncompleteData = Boolean(preview && preview.findings.length > 0);

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
                {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <BookOpenCheck className="h-4 w-4" />}
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
              A interface executa apenas GET autenticado. Não há assinatura, aprovação, emissão, registro definitivo, retorno ao serviço ou escrita no voo.
            </p>
          </section>

          {loading && (
            <div className="mb-6 rounded-xl border border-blue-200 bg-blue-50 p-6 text-center dark:border-blue-800 dark:bg-blue-950/20">
              <Loader2 className="mx-auto h-6 w-6 animate-spin text-blue-600" />
              <p className="mt-2 text-sm text-blue-800 dark:text-blue-200">Carregando rascunho não oficial…</p>
            </div>
          )}

          {viewError && !loading && (
            <div role="alert" className="mb-6 rounded-xl border border-red-200 bg-red-50 p-5 dark:border-red-800 dark:bg-red-950/20">
              <div className="flex items-start gap-3">
                <ShieldAlert className="mt-0.5 h-5 w-5 shrink-0 text-red-600" />
                <div>
                  <h2 className="font-semibold text-red-900 dark:text-red-100">{ERROR_COPY[viewError].title}</h2>
                  <p className="mt-1 text-sm text-red-700 dark:text-red-300">{ERROR_COPY[viewError].message}</p>
                </div>
              </div>
            </div>
          )}

          {preview && !loading && (
            <div className="space-y-6">
              {hasIncompleteData && (
                <div className="rounded-xl border border-amber-300 bg-amber-50 p-4 dark:border-amber-700 dark:bg-amber-950/20">
                  <div className="flex items-start gap-3">
                    <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-amber-600" />
                    <div>
                      <h2 className="font-semibold text-amber-900 dark:text-amber-100">Dados incompletos</h2>
                      <p className="mt-1 text-sm text-amber-800 dark:text-amber-200">
                        O rascunho foi formado, mas possui {preview.findings.length} alerta(s) ou campo(s) ausente(s). Nenhum valor foi presumido.
                      </p>
                    </div>
                  </div>
                </div>
              )}

              <section className="rounded-xl border border-slate-200 bg-white p-5 dark:border-slate-700 dark:bg-slate-900">
                <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100">Resumo do voo</h2>
                    <p className="text-xs text-slate-500 dark:text-slate-400">
                      Contrato {preview.draft.schemaVersion} · estado {preview.draft.status} · voo consultado {flightId}
                    </p>
                  </div>
                  <span className="rounded-full border border-red-300 bg-red-50 px-3 py-1 text-xs font-bold text-red-700 dark:border-red-800 dark:bg-red-950/30 dark:text-red-300">
                    Rascunho shadow
                  </span>
                </div>
                <dl className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                  <Field label="Operador" value={preview.draft.operator.legalName} path="operator.legalName" fieldSources={fieldSources} />
                  <Field label="Matrícula" value={preview.draft.aircraft.registration} path="aircraft.registration" fieldSources={fieldSources} />
                  <Field label="Modelo" value={preview.draft.aircraft.model} path="aircraft.model" fieldSources={fieldSources} />
                  <Field label="Fabricante" value={preview.draft.aircraft.manufacturer} path="aircraft.manufacturer" fieldSources={fieldSources} />
                  <Field label="Data operacional" value={preview.draft.legs[0]?.operationalDate || null} path="legs.0.operationalDate" source={preview.draft.legs[0]?.source} fieldSources={fieldSources} />
                  <Field label="Etapas" value={preview.draft.legs.length} path="legs" fieldSources={fieldSources} />
                  <Field label="Volume" value={preview.draft.volumeNumber} path="volumeNumber" fieldSources={fieldSources} />
                  <Field label="Criado em" value={preview.draft.createdAt} path="createdAt" fieldSources={fieldSources} />
                </dl>
              </section>

              <section aria-labelledby="etapas-shadow-title" className="space-y-4">
                <h2 id="etapas-shadow-title" className="text-lg font-semibold text-slate-900 dark:text-slate-100">Etapas do rascunho</h2>
                {preview.draft.legs.length === 0 ? (
                  <div className="rounded-xl border border-dashed border-slate-300 bg-slate-50 p-6 text-center dark:border-slate-700 dark:bg-slate-900">
                    <FileWarning className="mx-auto h-6 w-6 text-slate-400" />
                    <p className="mt-2 text-sm text-slate-600 dark:text-slate-300">Nenhuma etapa disponível.</p>
                  </div>
                ) : (
                  preview.draft.legs.map((leg, legIndex) => {
                    const basePath = `legs.${legIndex}`;
                    return (
                      <article key={`${leg.sequence}-${leg.operationalDate}`} className="rounded-xl border border-slate-200 bg-white p-5 dark:border-slate-700 dark:bg-slate-900">
                        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
                          <div>
                            <h3 className="font-semibold text-slate-900 dark:text-slate-100">
                              Etapa {leg.sequence}: {leg.origin || 'Não disponível'} → {leg.destination || 'Não disponível'}
                            </h3>
                            <p className="text-xs text-slate-500 dark:text-slate-400">{leg.operationalDate}</p>
                          </div>
                          <ProvenanceBadge path={basePath} value={leg.sequence} source={leg.source} fieldSources={fieldSources} />
                        </div>

                        <dl className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                          <Field label="Origem" value={leg.origin} path={`${basePath}.origin`} source={leg.source} fieldSources={fieldSources} />
                          <Field label="Destino" value={leg.destination} path={`${basePath}.destination`} source={leg.source} fieldSources={fieldSources} />
                          <Field label="Fuso" value={leg.timezone} path={`${basePath}.timezone`} source={leg.source} fieldSources={fieldSources} />
                          <Field label="Natureza" value={leg.flightNatureCode} path={`${basePath}.flightNatureCode`} source={leg.source} fieldSources={fieldSources} />
                          <Field label="Motor ligado" value={leg.engineStartTime} path={`${basePath}.engineStartTime`} source={leg.source} fieldSources={fieldSources} />
                          <Field label="Decolagem" value={leg.takeoffTime} path={`${basePath}.takeoffTime`} source={leg.source} fieldSources={fieldSources} />
                          <Field label="Pouso" value={leg.landingTime} path={`${basePath}.landingTime`} source={leg.source} fieldSources={fieldSources} />
                          <Field label="Motor desligado" value={leg.engineShutdownTime} path={`${basePath}.engineShutdownTime`} source={leg.source} fieldSources={fieldSources} />
                          <Field label="Tempo block" value={formatMinutes(leg.times.blockMinutes)} path={`${basePath}.times.blockMinutes`} source={leg.source} fieldSources={fieldSources} />
                          <Field label="Tempo de voo" value={formatMinutes(leg.times.takeoffToLandingMinutes)} path={`${basePath}.times.takeoffToLandingMinutes`} source={leg.source} fieldSources={fieldSources} />
                          <Field label="Diurno" value={formatMinutes(leg.times.dayMinutes)} path={`${basePath}.times.dayMinutes`} source={leg.source} fieldSources={fieldSources} />
                          <Field label="Noturno" value={formatMinutes(leg.times.nightMinutes)} path={`${basePath}.times.nightMinutes`} source={leg.source} fieldSources={fieldSources} />
                          <Field label="VFR" value={formatMinutes(leg.times.vfrMinutes)} path={`${basePath}.times.vfrMinutes`} source={leg.source} fieldSources={fieldSources} />
                          <Field label="IFR real" value={formatMinutes(leg.times.ifrActualMinutes)} path={`${basePath}.times.ifrActualMinutes`} source={leg.source} fieldSources={fieldSources} />
                          <Field label="IFR simulado" value={formatMinutes(leg.times.ifrSimulatedMinutes)} path={`${basePath}.times.ifrSimulatedMinutes`} source={leg.source} fieldSources={fieldSources} />
                          <Field label="Pousos diurnos" value={leg.dayLandings} path={`${basePath}.dayLandings`} source={leg.source} fieldSources={fieldSources} />
                          <Field label="Pousos noturnos" value={leg.nightLandings} path={`${basePath}.nightLandings`} source={leg.source} fieldSources={fieldSources} />
                          <Field label="Ciclos" value={leg.cycles} path={`${basePath}.cycles`} source={leg.source} fieldSources={fieldSources} />
                          <Field label="Combustível inicial" value={formatQuantity(leg.fuelAtEngineStart.value, leg.fuelAtEngineStart.unit)} path={`${basePath}.fuelAtEngineStart.value`} source={leg.fuelAtEngineStart.source} fieldSources={fieldSources} />
                          <Field label="Combustível final" value={formatQuantity(leg.fuelAtEngineShutdown.value, leg.fuelAtEngineShutdown.unit)} path={`${basePath}.fuelAtEngineShutdown.value`} source={leg.fuelAtEngineShutdown.source} fieldSources={fieldSources} />
                          <Field label="Combustível consumido" value={formatQuantity(leg.fuelConsumed.value, leg.fuelConsumed.unit)} path={`${basePath}.fuelConsumed.value`} source={leg.fuelConsumed.source} fieldSources={fieldSources} />
                          <Field label="Combustível adicionado" value={formatQuantity(leg.fuelAdded.value, leg.fuelAdded.unit)} path={`${basePath}.fuelAdded.value`} source={leg.fuelAdded.source} fieldSources={fieldSources} />
                          <Field label="Passageiros / POB" value={leg.personsOnBoard} path={`${basePath}.personsOnBoard`} source={leg.source} fieldSources={fieldSources} />
                          <Field label="Carga" value={formatQuantity(leg.payload, leg.payloadUnit)} path={`${basePath}.payload`} source={leg.source} fieldSources={fieldSources} />
                        </dl>

                        <div className="mt-5 grid gap-4 lg:grid-cols-2">
                          <div className="rounded-lg border border-slate-200 p-4 dark:border-slate-700">
                            <h4 className="font-semibold text-slate-800 dark:text-slate-100">Tripulação por etapa</h4>
                            {leg.crew.length === 0 ? (
                              <p className="mt-2 text-sm text-slate-500">Não disponível</p>
                            ) : (
                              <ul className="mt-3 space-y-3">
                                {leg.crew.map((member, crewIndex) => (
                                  <li key={`${member.personReference}-${crewIndex}`} className="rounded-lg bg-slate-50 p-3 text-sm dark:bg-slate-800">
                                    <p className="font-medium text-slate-900 dark:text-slate-100">
                                      {member.displayName || 'Nome não disponível'} · {member.function || 'Função não disponível'}
                                    </p>
                                    <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                                      CANAC: {member.canac || 'Não disponível'} · apresentação: {member.reportTime || 'Não disponível'} · base: {member.contractualBase || 'Não disponível'}
                                    </p>
                                    <div className="mt-2">
                                      <ProvenanceBadge path={`${basePath}.crew.${crewIndex}`} value={member.displayName} source={member.source} fieldSources={fieldSources} />
                                    </div>
                                  </li>
                                ))}
                              </ul>
                            )}
                          </div>
                          <div className="space-y-3">
                            <div className="rounded-lg border border-slate-200 p-4 dark:border-slate-700">
                              <h4 className="font-semibold text-slate-800 dark:text-slate-100">Ocorrências e observações</h4>
                              <p className="mt-2 whitespace-pre-wrap text-sm text-slate-600 dark:text-slate-300">{leg.occurrenceSummary || 'Não disponível'}</p>
                            </div>
                            <div className="rounded-lg border border-slate-200 p-4 dark:border-slate-700">
                              <h4 className="font-semibold text-slate-800 dark:text-slate-100">Discrepâncias técnicas</h4>
                              <p className="mt-2 whitespace-pre-wrap text-sm text-slate-600 dark:text-slate-300">{leg.technicalDiscrepancySummary || 'Não disponível'}</p>
                            </div>
                          </div>
                        </div>
                      </article>
                    );
                  })
                )}
              </section>

              <section className="grid gap-6 lg:grid-cols-2">
                <div className="rounded-xl border border-slate-200 bg-white p-5 dark:border-slate-700 dark:bg-slate-900">
                  <h2 className="flex items-center gap-2 text-lg font-semibold text-slate-900 dark:text-slate-100">
                    <FileWarning className="h-5 w-5 text-amber-600" /> Alertas e campos ausentes
                  </h2>
                  {preview.findings.length === 0 ? (
                    <p className="mt-3 text-sm text-emerald-700 dark:text-emerald-300">Nenhum alerta retornado pelo backend.</p>
                  ) : (
                    <ul className="mt-3 space-y-2">
                      {preview.findings.map((finding, index) => (
                        <li key={`${finding.code}-${finding.path}-${index}`} className="rounded-lg border border-amber-200 bg-amber-50 p-3 dark:border-amber-800 dark:bg-amber-950/20">
                          <p className="text-sm font-medium text-amber-900 dark:text-amber-100">{findingLabel(finding)}</p>
                          <p className="mt-1 font-mono text-xs text-amber-700 dark:text-amber-300">{finding.path}</p>
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
                    Referências internas e identificadores de registros não são exibidos. A interface apresenta apenas a categoria de origem necessária à revisão.
                  </p>
                  <div className="mt-4 grid gap-2 sm:grid-cols-2">
                    <span className="rounded-lg border border-blue-200 bg-blue-50 p-2 text-xs text-blue-700 dark:border-blue-800 dark:bg-blue-950/30 dark:text-blue-300">Dado transcrito da fonte</span>
                    <span className="rounded-lg border border-violet-200 bg-violet-50 p-2 text-xs text-violet-700 dark:border-violet-800 dark:bg-violet-950/30 dark:text-violet-300"><Calculator className="mr-1 inline h-3.5 w-3.5" />Dado calculado</span>
                    <span className="rounded-lg border border-cyan-200 bg-cyan-50 p-2 text-xs text-cyan-700 dark:border-cyan-800 dark:bg-cyan-950/30 dark:text-cyan-300">Dado normalizado</span>
                    <span className="rounded-lg border border-slate-200 bg-slate-50 p-2 text-xs text-slate-500 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-400">Dado não disponível</span>
                    <span className="rounded-lg border border-amber-200 bg-amber-50 p-2 text-xs text-amber-700 dark:border-amber-800 dark:bg-amber-950/30 dark:text-amber-300">Procedência incompleta</span>
                  </div>
                </div>
              </section>

              <section className="rounded-xl border border-slate-200 bg-white p-5 dark:border-slate-700 dark:bg-slate-900">
                <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100">Situação técnica — somente leitura</h2>
                <dl className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
                  <Field label="Última intervenção" value={preview.draft.technicalStatus.lastMaintenanceIntervention} path="technicalStatus.lastMaintenanceIntervention" source={preview.draft.technicalStatus.source} fieldSources={fieldSources} />
                  <Field label="Próxima intervenção" value={preview.draft.technicalStatus.nextMaintenanceIntervention} path="technicalStatus.nextMaintenanceIntervention" source={preview.draft.technicalStatus.source} fieldSources={fieldSources} />
                  <Field label="Horas restantes" value={preview.draft.technicalStatus.airframeHoursRemaining} path="technicalStatus.airframeHoursRemaining" source={preview.draft.technicalStatus.source} fieldSources={fieldSources} />
                  <Field label="Referência de retorno ao serviço" value={preview.draft.technicalStatus.returnToServiceReference} path="technicalStatus.returnToServiceReference" source={preview.draft.technicalStatus.source} fieldSources={fieldSources} />
                  <Field label="Discrepâncias abertas" value={preview.draft.technicalStatus.openDiscrepancyCount} path="technicalStatus.openDiscrepancyCount" source={preview.draft.technicalStatus.source} fieldSources={fieldSources} />
                </dl>
                <p className="mt-3 text-xs text-red-700 dark:text-red-300">
                  Esta seção não representa retorno ao serviço, liberação de aeronave ou situação técnica oficial.
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
