import { useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  AlertTriangle,
  CheckCircle2,
  ClipboardCheck,
  Plane,
  RefreshCw,
  Search,
  ShieldAlert,
  UserRound,
} from 'lucide-react';
import AppLayout from '@/react-app/components/AppLayout';
import Button from '@/react-app/components/Button';
import {
  useFrmsReadAckEvents,
  type FrmsReadAckEvent,
  type FrmsReadAckQueryStatus,
} from '@/react-app/hooks/useFrmsReadAckEvents';
import {
  type FrmsOperationalSnapshotAlertCode,
  type FrmsOperationalSnapshotFilters,
  type FrmsOperationalSnapshotItem,
  type FrmsOperationalSnapshotStatus,
  useFrmsOperationalSnapshot,
} from '@/react-app/hooks/useFrmsOperationalSnapshot';

type ControlFilters = FrmsOperationalSnapshotFilters & {
  tripulante_query?: string;
};

type OperationalBucket = 'escalado' | 'checkin_sem_escala' | 'jornada_sem_escala' | 'sem_atividade';

function getTodayLocalIsoDate(): string {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

const STATUS_OPTIONS: Array<{ value: FrmsOperationalSnapshotStatus | ''; label: string }> = [
  { value: '', label: 'Todos' },
  { value: 'CRITICO', label: 'Critico' },
  { value: 'INCOMPLETO', label: 'Incompleto' },
  { value: 'ATENCAO', label: 'Atencao' },
  { value: 'OK', label: 'OK' },
];

const READ_ACK_STATUS_OPTIONS: Array<{ value: FrmsReadAckQueryStatus; label: string }> = [
  { value: 'PENDING', label: 'Pendentes' },
  { value: 'ACKED', label: 'Cientes' },
  { value: 'STALE', label: 'Antigos' },
  { value: 'ALL', label: 'Todos' },
];

const READ_ACK_EVENT_TYPE_OPTIONS: Array<{ value: string; label: string }> = [
  { value: '', label: 'Todos os tipos' },
  { value: 'CHECKIN_PENDENTE', label: 'Check-in pendente' },
  { value: 'CHECKIN_CRITICO', label: 'Check-in critico' },
  { value: 'DADO_ESTIMADO', label: 'Dado estimado' },
  { value: 'DADO_INCONSISTENTE', label: 'Dado inconsistente' },
  { value: 'JORNADA_SEM_FATORIZACAO', label: 'Jornada sem fatorizacao' },
  { value: 'EFETIVIDADE_BAIXA', label: 'Indice de efetividade baixo' },
  { value: 'OUTRO_CONTEXTUAL', label: 'Contexto operacional' },
];

const READ_ACK_SEVERITY_OPTIONS: Array<{ value: string; label: string }> = [
  { value: '', label: 'Todas' },
  { value: 'INFO', label: 'Info' },
  { value: 'ATENCAO', label: 'Atencao' },
  { value: 'CRITICO', label: 'Critico' },
  { value: 'INCOMPLETO', label: 'Incompleto' },
];

const ALERT_LABELS: Record<FrmsOperationalSnapshotAlertCode, string> = {
  CHECKIN_PENDENTE: 'Check-in pendente',
  CHECKIN_CRITICO: 'Check-in critico',
  SONO_ESTIMADO: 'Sono estimado',
  SONO_INSUFICIENTE: 'Sono insuficiente',
  KSS_ALTO: 'KSS alto',
  EFETIVIDADE_BAIXA: 'Indice de efetividade baixo',
  JORNADA_SEM_FATORIZACAO: 'Sem fatorizacao',
  ESCALADO_SEM_JORNADA_FRMS: 'Escalado sem jornada FRMS',
  JORNADA_FRMS_SEM_ESCALA: 'Jornada FRMS sem escala',
  DADO_INCONSISTENTE: 'Dado inconsistente',
};

const READ_ACK_EVENT_LABELS: Record<string, string> = {
  CHECKIN_PENDENTE: 'Check-in pendente',
  CHECKIN_CRITICO: 'Check-in critico',
  DADO_ESTIMADO: 'Dado estimado',
  DADO_INCONSISTENTE: 'Dado inconsistente',
  JORNADA_SEM_FATORIZACAO: 'Jornada sem fatorizacao',
  EFETIVIDADE_BAIXA: 'Indice de efetividade baixo',
  QUINZENA_INCOMPLETA: 'Quinzena incompleta',
  OUTRO_CONTEXTUAL: 'Contexto operacional',
};

const SOURCE_LABELS: Record<string, string> = {
  REAL: 'Real',
  ESTIMADO: 'Estimado',
  AUSENTE: 'Ausente',
  INCONSISTENTE: 'Inconsistente',
  MANUAL: 'Manual',
  DERIVADO: 'Derivado',
  INCOMPLETO: 'Incompleto',
};

function normalizeSearch(value: unknown): string {
  return String(value ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .toUpperCase();
}

function uniqueSorted(values: Array<string | null | undefined>): string[] {
  return [...new Set(values.map((value) => value?.trim()).filter((value): value is string => Boolean(value)))]
    .sort((left, right) => left.localeCompare(right, 'pt-BR'));
}

function statusLabel(status: FrmsOperationalSnapshotStatus): string {
  if (status === 'ATENCAO') return 'Atencao';
  if (status === 'CRITICO') return 'Critico';
  if (status === 'INCOMPLETO') return 'Incompleto';
  return 'OK';
}

function sourceLabel(value: string): string {
  return SOURCE_LABELS[value] || value;
}

function toneBySnapshotStatus(status: FrmsOperationalSnapshotStatus): string {
  if (status === 'CRITICO') return 'border-red-200 bg-red-50 text-red-700';
  if (status === 'ATENCAO') return 'border-amber-200 bg-amber-50 text-amber-700';
  if (status === 'INCOMPLETO') return 'border-violet-200 bg-violet-50 text-violet-700';
  return 'border-emerald-200 bg-emerald-50 text-emerald-700';
}

function toneByCheckinStatus(status: string): string {
  if (status === 'RECEBIDO') return 'border-emerald-200 bg-emerald-50 text-emerald-700';
  if (status === 'PENDENTE') return 'border-amber-200 bg-amber-50 text-amber-700';
  if (status === 'AUSENTE') return 'border-rose-200 bg-rose-50 text-rose-700';
  return 'border-slate-200 bg-slate-100 text-slate-700';
}

function toneBySource(value: string): string {
  if (value === 'REAL') return 'border-emerald-200 bg-emerald-50 text-emerald-700';
  if (value === 'ESTIMADO') return 'border-amber-200 bg-amber-50 text-amber-700';
  if (value === 'INCONSISTENTE') return 'border-rose-200 bg-rose-50 text-rose-700';
  if (value === 'MANUAL') return 'border-sky-200 bg-sky-50 text-sky-700';
  return 'border-slate-200 bg-slate-100 text-slate-700';
}

function toneByReadAckSeverity(severity: FrmsReadAckEvent['severity']): string {
  if (severity === 'CRITICO') return 'border-red-200 bg-red-50 text-red-700';
  if (severity === 'ATENCAO') return 'border-amber-200 bg-amber-50 text-amber-700';
  if (severity === 'INCOMPLETO') return 'border-violet-200 bg-violet-50 text-violet-700';
  return 'border-slate-200 bg-slate-100 text-slate-700';
}

function formatPercentage(value: number | null): string {
  if (value == null || !Number.isFinite(value)) return '-';
  return `${value.toFixed(1)}%`;
}

function formatSleep(value: number | null): string {
  if (value == null || !Number.isFinite(value)) return '-';
  return `${value.toFixed(1)}h`;
}

function formatNumber(value: number | null): string {
  if (value == null || !Number.isFinite(value)) return '-';
  return String(value);
}

function formatDisplayDate(isoDate: string | null | undefined): string {
  if (!isoDate) return '-';
  // Parse ISO date YYYY-MM-DD manually to avoid timezone offset issues
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(isoDate);
  if (!match) return isoDate;
  return `${match[3]}/${match[2]}/${match[1]}`;
}

function formatMinutesAsHours(value: number | null): string {
  if (value == null || !Number.isFinite(value)) return '-';
  return `${(value / 60).toFixed(1)}h`;
}

function formatTripulante(item: FrmsOperationalSnapshotItem): string {
  return item.nome_guerra || item.nome || `ID ${item.funcionario_id}`;
}

function formatFortnightLabel(indicator: FrmsFortnightIndicator | null): string {
  if (!indicator) return 'Quinzena sem indicador';
  const statusMap: Record<string, string> = {
    OK: 'completa',
    ATENCAO: 'com atencao',
    CRITICO: 'critica',
    INCOMPLETO: 'incompleta',
  };
  const statusLabel = statusMap[indicator.status_quinzena] || indicator.status_quinzena.toLowerCase();
  const dutyText = indicator.duty_time_periodo_min != null && Number.isFinite(indicator.duty_time_periodo_min)
    ? ` · jornada ${formatMinutesAsHours(indicator.duty_time_periodo_min)}`
    : '';
  return `Quinzena ${statusLabel}${dutyText}`;
}

const FORTNIGHT_STATUS_LABELS: Record<string, string> = {
  OK: 'Quinzena completa',
  ATENCAO: 'Quinzena com atencao',
  CRITICO: 'Quinzena critica',
  INCOMPLETO: 'Quinzena incompleta',
};

function operationalBucket(item: FrmsOperationalSnapshotItem): OperationalBucket {
  if (item.escalado) return 'escalado';
  if (item.checkin_status === 'RECEBIDO') return 'checkin_sem_escala';
  if (item.teve_jornada) return 'jornada_sem_escala';
  return 'sem_atividade';
}

function hasAnyEscalaData(items: FrmsOperationalSnapshotItem[]): boolean {
  return items.some((item) => item.escalado);
}

function operationalBucketLabel(item: FrmsOperationalSnapshotItem, escalaAvailable: boolean): string {
  const bucket = operationalBucket(item);
  if (bucket === 'escalado') return item.escala_source === 'EVD' ? 'Escala diaria' : `Escala ${item.escala_source}`;
  if (!escalaAvailable) {
    // When escala data is unavailable for the period, don't say "sem escala"
    if (bucket === 'checkin_sem_escala') return 'Check-in (escala indisponivel)';
    if (bucket === 'jornada_sem_escala') return 'Jornada (escala indisponivel)';
  }
  if (bucket === 'checkin_sem_escala') return 'Check-in sem escala';
  if (bucket === 'jornada_sem_escala') return 'Jornada sem escala';
  return 'Sem atividade';
}

function matchesTextFilter(item: FrmsOperationalSnapshotItem, query: string): boolean {
  if (!query.trim()) return true;
  const haystack = [
    item.nome,
    item.nome_guerra,
    item.funcao,
    item.aeronave,
    item.base,
    item.funcionario_id,
  ]
    .map(normalizeSearch)
    .join(' ');
  return haystack.includes(normalizeSearch(query));
}

function filterItems(items: FrmsOperationalSnapshotItem[], filters: ControlFilters): FrmsOperationalSnapshotItem[] {
  const base = normalizeSearch(filters.base);
  const aeronave = normalizeSearch(filters.aeronave);
  const status = filters.status?.trim();
  const funcionarioId = filters.funcionario_id?.trim();

  return items.filter((item) => {
    if (funcionarioId && String(item.funcionario_id) !== funcionarioId) return false;
    if (base && normalizeSearch(item.base) !== base) return false;
    if (aeronave && !normalizeSearch(item.aeronave).includes(aeronave)) return false;
    if (status && item.snapshot_status !== status) return false;
    if (!matchesTextFilter(item, filters.tripulante_query || '')) return false;
    return true;
  });
}

function buildOperationalSummary(items: FrmsOperationalSnapshotItem[], readAckEvents: FrmsReadAckEvent[]) {
  return {
    monitored: items.filter((item) => operationalBucket(item) !== 'sem_atividade').length,
    pendingCheckins: items.filter((item) => item.checkin_status === 'PENDENTE' || item.checkin_status === 'AUSENTE').length,
    alerts: items.filter((item) => item.snapshot_status === 'CRITICO' || item.snapshot_status === 'ATENCAO').length,
    estimatedOrAbsent: items.filter(
      (item) =>
        item.sleep_data_source !== 'REAL' ||
        item.wake_data_source !== 'REAL' ||
        item.jornada_data_source === 'ESTIMADO' ||
        item.jornada_data_source === 'AUSENTE',
    ).length,
    inconsistencies: items.filter(
      (item) => item.snapshot_status === 'INCOMPLETO' || item.alertas.includes('DADO_INCONSISTENTE'),
    ).length,
    pendingAck: readAckEvents.filter((event) => event.lifecycle_status === 'PENDING' || event.status === 'PENDING').length,
  };
}

function SourceBadge({ value }: { value: string }) {
  return (
    <span className={`inline-flex rounded-md border px-2 py-0.5 text-[11px] font-medium ${toneBySource(value)}`}>
      {sourceLabel(value)}
    </span>
  );
}

function StatusBadge({ status }: { status: FrmsOperationalSnapshotStatus }) {
  return (
    <span className={`inline-flex rounded-md border px-2 py-0.5 text-[11px] font-semibold ${toneBySnapshotStatus(status)}`}>
      {statusLabel(status)}
    </span>
  );
}

function KpiTile({
  label,
  value,
  tone = 'neutral',
}: {
  label: string;
  value: number;
  tone?: 'neutral' | 'warning' | 'danger' | 'info';
}) {
  const toneClass =
    tone === 'danger'
      ? 'border-red-200 bg-red-50 text-red-900'
      : tone === 'warning'
        ? 'border-amber-200 bg-amber-50 text-amber-900'
        : tone === 'info'
          ? 'border-sky-200 bg-sky-50 text-sky-900'
          : 'border-slate-200 bg-white text-slate-900';

  return (
    <div className={`rounded-lg border p-3 ${toneClass}`}>
      <p className="text-xs font-medium text-slate-600">{label}</p>
      <p className="mt-1 text-2xl font-semibold tabular-nums">{value}</p>
    </div>
  );
}

function formatReadAckEventLabel(event: FrmsReadAckEvent): string {
  return READ_ACK_EVENT_LABELS[event.event_type] || event.event_type;
}

function isVisibleReadAckEvent(event: FrmsReadAckEvent, visibleIds: Set<number>): boolean {
  return visibleIds.has(event.funcionario_id);
}

export default function FrmsControleOperacional() {
  const today = useMemo(() => getTodayLocalIsoDate(), []);
  const [searchParams, setSearchParams] = useSearchParams();

  // Read QS on mount to support deep links from EVD (data_inicio, data_fim, funcionario_id, base, aeronave).
  // searchParams intentionally excluded from deps — filters are initialized once on mount only.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const initialFilters: ControlFilters = useMemo(() => {
    function resolveQsDate(key: string): string {
      const v = searchParams.get(key) || '';
      return /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : '';
    }
    const qsDataInicio = resolveQsDate('data_inicio') || resolveQsDate('data') || today;
    const qsDataFim = resolveQsDate('data_fim') || resolveQsDate('data') || qsDataInicio;
    return {
      data_inicio: qsDataInicio,
      data_fim: qsDataFim,
      funcionario_id: searchParams.get('funcionario_id') || '',
      base: searchParams.get('base') || '',
      aeronave: searchParams.get('aeronave') || '',
      tripulante_query: '',
      status: '',
      include_inconsistencies: true,
    };
  }, [today]); // eslint-disable-line react-hooks/exhaustive-deps

  const [draft, setDraft] = useState<ControlFilters>(initialFilters);
  const [appliedFilters, setAppliedFilters] = useState<ControlFilters>(initialFilters);
  const [readAckStatus, setReadAckStatus] = useState<FrmsReadAckQueryStatus>('PENDING');
  const [readAckEventType, setReadAckEventType] = useState('');
  const [readAckSeverity, setReadAckSeverity] = useState('');

  const snapshotFilters = useMemo<FrmsOperationalSnapshotFilters>(
    () => ({
      data_inicio: appliedFilters.data_inicio,
      data_fim: appliedFilters.data_fim,
      funcionario_id: appliedFilters.funcionario_id,
      include_inconsistencies: appliedFilters.include_inconsistencies,
    }),
    [
      appliedFilters.data_fim,
      appliedFilters.data_inicio,
      appliedFilters.funcionario_id,
      appliedFilters.include_inconsistencies,
    ],
  );

  const { data, meta, loading, error, unauthorized, refetch } = useFrmsOperationalSnapshot(snapshotFilters);
  const readAck = useFrmsReadAckEvents(appliedFilters, {
    status: readAckStatus,
    event_type: readAckEventType || undefined,
    severity: readAckSeverity || undefined,
  });

  const filterOptions = useMemo(
    () => ({
      bases: uniqueSorted(data.map((item) => item.base)),
      aeronaves: uniqueSorted(data.map((item) => item.aeronave)),
      tripulantes: data
        .map((item) => ({
          value: formatTripulante(item),
          label: `${formatTripulante(item)} - ${item.funcao || 'Funcao nao informada'}`,
        }))
        .filter((item, index, arr) => arr.findIndex((other) => other.value === item.value) === index)
        .sort((left, right) => left.value.localeCompare(right.value, 'pt-BR')),
    }),
    [data],
  );

  const visibleItems = useMemo(() => filterItems(data, appliedFilters), [data, appliedFilters]);
  const escalaAvailable = useMemo(() => hasAnyEscalaData(visibleItems), [visibleItems]);
  const visibleIds = useMemo(() => new Set(visibleItems.map((item) => item.funcionario_id)), [visibleItems]);
  const visibleReadAckEvents = useMemo(
    () => readAck.events.filter((event) => isVisibleReadAckEvent(event, visibleIds)),
    [readAck.events, visibleIds],
  );
  const technicalFilterSource = searchParams.get('funcionario_id')?.trim() || '';
  const backendScopedFuncionarioId =
    meta?.scope === 'self' && meta.forced_funcionario_id ? String(meta.forced_funcionario_id) : '';
  const technicalFilterValue = appliedFilters.funcionario_id?.trim() || draft.funcionario_id?.trim() || '';
  const hasTechnicalFilter = Boolean(technicalFilterValue || backendScopedFuncionarioId);
  const operationalSummary = useMemo(
    () => buildOperationalSummary(visibleItems, visibleReadAckEvents),
    [visibleItems, visibleReadAckEvents],
  );

  const groupedRows = useMemo(
    () => ({
      escalados: visibleItems.filter((item) => operationalBucket(item) === 'escalado'),
      excecoes: visibleItems.filter((item) => operationalBucket(item) !== 'escalado'),
    }),
    [visibleItems],
  );

  const handleApplyFilters = () => {
    setAppliedFilters({ ...draft });
  };

  const handleClearFilters = () => {
    const nextFilters = { ...initialFilters, funcionario_id: '', tripulante_query: '', base: '', aeronave: '', status: '' };
    setDraft(nextFilters);
    setAppliedFilters(nextFilters);

    const nextSearchParams = new URLSearchParams(searchParams);
    nextSearchParams.delete('funcionario_id');
    setSearchParams(nextSearchParams);
  };

  const handleClearTechnicalFilter = () => {
    const nextDraft = { ...draft, funcionario_id: '' };
    const nextApplied = { ...appliedFilters, funcionario_id: '' };
    setDraft(nextDraft);
    setAppliedFilters(nextApplied);

    const nextSearchParams = new URLSearchParams(searchParams);
    nextSearchParams.delete('funcionario_id');
    setSearchParams(nextSearchParams);
  };

  return (
    <AppLayout>
      <main className="space-y-4">
        <header className="border-b border-slate-200 pb-4">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">FRMS operacional</p>
              <h1 className="mt-1 text-2xl font-semibold text-slate-950">Controle operacional de fadiga</h1>
              <p className="mt-1 max-w-3xl text-sm text-slate-600">
                Escala, check-in, fontes de dados e ciencia operacional em uma unica visao de coordenacao.
              </p>
            </div>
            <div className="flex items-center gap-2">
              <Button variant="secondary" onClick={() => void refetch()} disabled={loading} aria-label="Atualizar snapshot">
                <RefreshCw className="h-4 w-4" />
              </Button>
              <Button onClick={handleApplyFilters}>Atualizar</Button>
            </div>
          </div>
        </header>

        <section className="rounded-lg border border-slate-200 bg-white p-4">
          {hasTechnicalFilter && (
            <div className="mb-4 flex flex-col gap-3 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900 md:flex-row md:items-center md:justify-between">
              <div>
                <p className="font-semibold">Filtro técnico ativo: exibindo apenas um tripulante.</p>
                <p className="text-xs text-amber-800">
                  {backendScopedFuncionarioId
                    ? `Escopo aplicado pelo perfil da sessão (funcionario_id=${backendScopedFuncionarioId}).`
                    : technicalFilterSource
                    ? `Origem: query string (funcionario_id=${technicalFilterSource}).`
                    : `Funcionario ID ativo: ${technicalFilterValue}.`}
                </p>
              </div>
              {!backendScopedFuncionarioId && (
                <Button variant="secondary" onClick={handleClearTechnicalFilter}>
                  Limpar filtro técnico
                </Button>
              )}
            </div>
          )}
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-6">
            <label className="text-sm font-medium text-slate-700">
              Data inicio
              <input
                type="date"
                value={draft.data_inicio}
                onChange={(event) => setDraft((prev) => ({ ...prev, data_inicio: event.target.value }))}
                className="mt-1 h-10 w-full rounded-lg border border-slate-300 px-3 text-sm"
              />
            </label>
            <label className="text-sm font-medium text-slate-700">
              Data fim
              <input
                type="date"
                value={draft.data_fim}
                onChange={(event) => setDraft((prev) => ({ ...prev, data_fim: event.target.value }))}
                className="mt-1 h-10 w-full rounded-lg border border-slate-300 px-3 text-sm"
              />
            </label>
            <label className="text-sm font-medium text-slate-700 xl:col-span-2">
              Tripulante
              <div className="relative mt-1">
                <Search className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
                <input
                  aria-label="Tripulante"
                  list="frms-tripulantes"
                  type="search"
                  value={draft.tripulante_query || ''}
                  placeholder="Nome, nome de guerra ou funcao"
                  onChange={(event) => setDraft((prev) => ({ ...prev, tripulante_query: event.target.value }))}
                  className="h-10 w-full rounded-lg border border-slate-300 pl-9 pr-3 text-sm"
                />
              </div>
              <datalist id="frms-tripulantes">
                {filterOptions.tripulantes.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </datalist>
            </label>
            <label className="text-sm font-medium text-slate-700">
              Base
              <select
                value={draft.base || ''}
                onChange={(event) => setDraft((prev) => ({ ...prev, base: event.target.value }))}
                className="mt-1 h-10 w-full rounded-lg border border-slate-300 px-3 text-sm"
              >
                <option value="">Todas</option>
                {filterOptions.bases.map((base) => (
                  <option key={base} value={base}>
                    {base}
                  </option>
                ))}
              </select>
            </label>
            <label className="text-sm font-medium text-slate-700">
              Aeronave/modelo
              <select
                value={draft.aeronave || ''}
                onChange={(event) => setDraft((prev) => ({ ...prev, aeronave: event.target.value }))}
                className="mt-1 h-10 w-full rounded-lg border border-slate-300 px-3 text-sm"
              >
                <option value="">Todas</option>
                {filterOptions.aeronaves.map((aeronave) => (
                  <option key={aeronave} value={aeronave}>
                    {aeronave}
                  </option>
                ))}
              </select>
            </label>
            <label className="text-sm font-medium text-slate-700">
              Status
              <select
                value={draft.status || ''}
                onChange={(event) =>
                  setDraft((prev) => ({
                    ...prev,
                    status: event.target.value as FrmsOperationalSnapshotStatus | '',
                  }))
                }
                className="mt-1 h-10 w-full rounded-lg border border-slate-300 px-3 text-sm"
              >
                {STATUS_OPTIONS.map((option) => (
                  <option key={option.value || 'all'} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex items-center gap-2 pt-6 text-sm font-medium text-slate-700">
              <input
                type="checkbox"
                checked={Boolean(draft.include_inconsistencies)}
                onChange={(event) =>
                  setDraft((prev) => ({ ...prev, include_inconsistencies: event.target.checked }))
                }
                className="h-4 w-4 accent-blue-600"
              />
              Incluir inconsistencias
            </label>
            <details className="md:col-span-2 xl:col-span-2" open={hasTechnicalFilter || undefined}>
              <summary className="cursor-pointer pt-2 text-sm font-medium text-slate-600">
                Filtro tecnico
                {hasTechnicalFilter ? ' ativo' : ''}
              </summary>
              <label className="mt-2 block text-sm font-medium text-slate-700">
                Funcionario ID
                <input
                  type="text"
                  value={draft.funcionario_id || ''}
                  placeholder="ID numerico"
                  onChange={(event) =>
                    setDraft((prev) => ({ ...prev, funcionario_id: event.target.value.replace(/[^\d]/g, '') }))
                  }
                  className="mt-1 h-10 w-full rounded-lg border border-slate-300 px-3 text-sm"
                />
              </label>
            </details>
            <div className="flex items-end gap-2">
              <Button onClick={handleApplyFilters}>Aplicar filtros</Button>
              <Button variant="secondary" onClick={handleClearFilters}>
                Limpar
              </Button>
            </div>
          </div>
        </section>

        {unauthorized && (
          <div className="rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
            Sem autorizacao para visualizar este snapshot.
          </div>
        )}

        {error && !unauthorized && (
          <div className="rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
            {error}
          </div>
        )}

        {!escalaAvailable && (
          <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
            Dados de escala indisponiveis para este periodo. As verificacoes de vinculo com escala nao puderam ser realizadas — tripulantes com check-in ou jornada sao exibidos sem a confirmacao de escala.
          </div>
        )}
        {!appliedFilters.include_inconsistencies && (
          <div className="rounded-lg border border-sky-200 bg-sky-50 px-4 py-3 text-sm text-sky-900">
            Visao filtrada: inconsistencias foram ocultadas. Os KPIs e a tabela refletem apenas o recorte sem excecoes.
          </div>
        )}

        <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-6">
          <KpiTile label="Tripulantes monitorados" value={operationalSummary.monitored} />
          <KpiTile label="Check-ins pendentes" value={operationalSummary.pendingCheckins} tone="warning" />
          <KpiTile label="Alertas" value={operationalSummary.alerts} tone="danger" />
          <KpiTile label="Dados estimados/ausentes" value={operationalSummary.estimatedOrAbsent} tone="warning" />
          <KpiTile label="Inconsistencias" value={operationalSummary.inconsistencies} tone="danger" />
          <KpiTile label="Ciencia pendente" value={operationalSummary.pendingAck} tone="info" />
        </section>

        <section className="rounded-lg border border-slate-200 bg-white">
          <div className="flex flex-col gap-3 border-b border-slate-200 p-4 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <h2 className="text-base font-semibold text-slate-950">Escala, fadiga e fontes</h2>
              <p className="mt-1 text-sm text-slate-600">
                Linhas escaladas aparecem primeiro; check-ins ou jornadas sem escala ficam como excecoes operacionais.
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2 text-xs text-slate-600">
              <span className="inline-flex items-center gap-1">
                <Plane className="h-3.5 w-3.5" />
                {groupedRows.escalados.length} escalados
              </span>
              <span className="inline-flex items-center gap-1">
                <AlertTriangle className="h-3.5 w-3.5" />
                {groupedRows.excecoes.length} excecoes
              </span>
            </div>
          </div>

          {loading ? (
            <div className="p-10 text-center text-sm text-slate-500">Carregando snapshot operacional...</div>
          ) : visibleItems.length === 0 ? (
            <div className="p-10 text-center text-sm text-slate-500">Nenhum dado para os filtros informados.</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full border-collapse text-sm">
                <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
                  <tr>
                    <th className="px-3 py-3 text-left">Tripulante</th>
                    <th className="px-3 py-3 text-left">Funcao</th>
                    <th className="px-3 py-3 text-left">Aeronave/base</th>
                    <th className="px-3 py-3 text-left">Escala/jornada</th>
                    <th className="px-3 py-3 text-left">Check-in</th>
                    <th className="px-3 py-3 text-left">Sono/KSS</th>
                    <th className="px-3 py-3 text-left">Efetividade/quinzena</th>
                    <th className="px-3 py-3 text-left">Status</th>
                    <th className="px-3 py-3 text-left">Alertas</th>
                    <th className="px-3 py-3 text-left">Fonte</th>
                  </tr>
                </thead>
                <tbody>
                  {visibleItems.map((item) => (
                    <tr key={`${item.data_operacional}-${item.funcionario_id}`} className="border-t border-slate-200 align-top">
                      <td className="px-3 py-3">
                        <div className="flex items-start gap-2">
                          <UserRound className="mt-0.5 h-4 w-4 shrink-0 text-slate-400" />
                          <div>
                            <div className="font-semibold text-slate-950">{formatTripulante(item)}</div>
                            <div className="text-xs text-slate-500">{item.nome || `ID ${item.funcionario_id}`}</div>
                          </div>
                        </div>
                      </td>
                      <td className="px-3 py-3 text-slate-700">{item.funcao || '-'}</td>
                      <td className="px-3 py-3">
                        <div className="font-medium text-slate-800">{item.aeronave || '-'}</div>
                        <div className="text-xs text-slate-500">{item.base || 'Base nao informada'}</div>
                      </td>
                      <td className="px-3 py-3">
                        <div className="font-medium text-slate-800">{operationalBucketLabel(item, escalaAvailable)}</div>
                        <div className="text-xs text-slate-500">{formatDisplayDate(item.data_operacional)}</div>
                        <div className="text-xs text-slate-500">
                          {item.teve_jornada
                            ? `${item.hora_apresentacao || '--:--'} - ${item.hora_termino || '--:--'}`
                            : 'Sem jornada FRMS'}
                        </div>
                      </td>
                      <td className="px-3 py-3">
                        <span className={`inline-flex rounded-md border px-2 py-0.5 text-[11px] font-semibold ${toneByCheckinStatus(item.checkin_status)}`}>
                          {item.checkin_status}
                        </span>
                        {item.checkin_horario && (
                          <div className="mt-1 text-xs text-slate-500">Horario {item.checkin_horario}</div>
                        )}
                      </td>
                      <td className="px-3 py-3">
                        <div className="font-medium text-slate-800">Sono {formatSleep(item.horas_sono)}</div>
                        <div className="text-xs text-slate-500">KSS {formatNumber(item.kss_score)}</div>
                        <div className="text-xs text-slate-500">Qualidade {formatNumber(item.qualidade_sono)}</div>
                      </td>
                      <td className="px-3 py-3">
                        <div className="font-medium text-slate-800">Efetividade {formatPercentage(item.effectiveness_pct)}</div>
                        <div className="text-xs text-slate-500">
                          {formatFortnightLabel(item.fortnight_indicator)}
                        </div>
                        {item.fatorizacao_status === 'AUSENTE' && item.teve_jornada && (
                          <div className="text-xs text-rose-700">Jornada sem fatorizacao</div>
                        )}
                      </td>
                      <td className="px-3 py-3">
                        <StatusBadge status={item.snapshot_status} />
                        {item.snapshot_status === 'CRITICO' && (
                          <div className="mt-1 flex items-center gap-1 text-xs text-red-700">
                            <ShieldAlert className="h-3 w-3" />
                            Requer avaliacao da coordenacao
                          </div>
                        )}
                      </td>
                      <td className="px-3 py-3">
                        <div className="flex max-w-xs flex-wrap gap-1">
                          {(() => {
                            const visibleAlertas = escalaAvailable
                              ? item.alertas
                              : item.alertas.filter(
                                  (a) => a !== 'JORNADA_FRMS_SEM_ESCALA' && a !== 'ESCALADO_SEM_JORNADA_FRMS',
                                );
                            return visibleAlertas.length > 0 ? (
                              visibleAlertas.map((alerta) => (
                                <span
                                  key={`${item.funcionario_id}-${item.data_operacional}-${alerta}`}
                                  className="inline-flex rounded-md border border-slate-200 bg-slate-50 px-2 py-0.5 text-[11px] text-slate-700"
                                >
                                  {ALERT_LABELS[alerta] || alerta}
                                </span>
                              ))
                            ) : (
                              <span className="text-slate-400">-</span>
                            );
                          })()}
                        </div>
                      </td>
                      <td className="px-3 py-3">
                        <div className="flex flex-wrap gap-2">
                          <div className="flex flex-col items-start gap-0.5">
                            <span className="text-[10px] text-slate-400">Sono</span>
                            <SourceBadge value={item.sleep_data_source} />
                          </div>
                          <div className="flex flex-col items-start gap-0.5">
                            <span className="text-[10px] text-slate-400">Despertar</span>
                            <SourceBadge value={item.wake_data_source} />
                          </div>
                          <div className="flex flex-col items-start gap-0.5">
                            <span className="text-[10px] text-slate-400">Jornada</span>
                            <SourceBadge value={item.jornada_data_source} />
                          </div>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>

        <section className="rounded-lg border border-slate-200 bg-white">
          <div className="flex flex-col gap-3 border-b border-slate-200 p-4 lg:flex-row lg:items-start lg:justify-between">
            <div>
              <h2 className="text-base font-semibold text-slate-950">Ciencia operacional FRMS</h2>
              <p className="mt-1 text-sm text-slate-600">
                Registro de leitura operacional. Nao representa mitigacao, decisao automatica ou mudanca de escala.
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <span className="rounded-md border border-amber-200 bg-amber-50 px-2 py-1 text-xs font-semibold text-amber-700">
                Pendentes {operationalSummary.pendingAck}
              </span>
              <span className="rounded-md border border-emerald-200 bg-emerald-50 px-2 py-1 text-xs font-semibold text-emerald-700">
                Cientes {visibleReadAckEvents.filter((event) => event.lifecycle_status === 'ACKED' || event.status === 'ACKED').length}
              </span>
              <Button size="sm" variant="secondary" onClick={() => void readAck.refetch()} disabled={readAck.loading}>
                <RefreshCw className="h-4 w-4" />
              </Button>
              <Button size="sm" onClick={() => void readAck.generateEvents()} loading={readAck.mutating}>
                Gerar eventos
              </Button>
            </div>
          </div>

          <div className="grid gap-3 border-b border-slate-200 p-4 md:grid-cols-3">
            <label className="text-sm font-medium text-slate-700">
              Status de ciencia
              <select
                value={readAckStatus}
                onChange={(event) => setReadAckStatus(event.target.value as FrmsReadAckQueryStatus)}
                className="mt-1 h-10 w-full rounded-lg border border-slate-300 px-3 text-sm"
              >
                {READ_ACK_STATUS_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>
            <label className="text-sm font-medium text-slate-700">
              Tipo de evento
              <select
                value={readAckEventType}
                onChange={(event) => setReadAckEventType(event.target.value)}
                className="mt-1 h-10 w-full rounded-lg border border-slate-300 px-3 text-sm"
              >
                {READ_ACK_EVENT_TYPE_OPTIONS.map((option) => (
                  <option key={option.value || 'all'} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>
            <label className="text-sm font-medium text-slate-700">
              Severidade
              <select
                value={readAckSeverity}
                onChange={(event) => setReadAckSeverity(event.target.value)}
                className="mt-1 h-10 w-full rounded-lg border border-slate-300 px-3 text-sm"
              >
                {READ_ACK_SEVERITY_OPTIONS.map((option) => (
                  <option key={option.value || 'all'} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>
          </div>

          {readAck.error && (
            <div className="m-4 rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
              {readAck.error}
            </div>
          )}

          <div className="divide-y divide-slate-100">
            {readAck.loading ? (
              <div className="p-4 text-sm text-slate-500">Carregando eventos...</div>
            ) : visibleReadAckEvents.length === 0 ? (
              <div className="p-4 text-sm text-slate-500">Nenhum evento de ciencia para os filtros atuais.</div>
            ) : (
              visibleReadAckEvents.map((event) => (
                <div key={event.id} className="flex flex-col gap-3 p-4 lg:flex-row lg:items-center lg:justify-between">
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <span className={`inline-flex rounded-md border px-2 py-0.5 text-[11px] font-semibold ${toneByReadAckSeverity(event.severity)}`}>
                        {event.severity}
                      </span>
                      <span className="font-semibold text-slate-900">{formatReadAckEventLabel(event)}</span>
                      <span className="text-xs text-slate-500">
                        {formatDisplayDate(event.data_operacional)} · {event.funcionario_nome || `ID ${event.funcionario_id}`}
                      </span>
                    </div>
                    <p className="mt-1 text-xs text-slate-500">
                      Fontes: {sourceLabel(event.sleep_data_source)} / {sourceLabel(event.wake_data_source)} / {sourceLabel(event.jornada_data_source)}.
                    </p>
                  </div>
                  {event.status === 'ACKED' || event.lifecycle_status === 'ACKED' ? (
                    <span className="inline-flex items-center gap-1 rounded-md border border-emerald-200 bg-emerald-50 px-3 py-1 text-xs font-semibold text-emerald-700">
                      <CheckCircle2 className="h-3.5 w-3.5" />
                      Ciente
                    </span>
                  ) : (
                    <Button
                      size="sm"
                      variant="secondary"
                      onClick={() => void readAck.acknowledgeEvent(event.id)}
                      loading={readAck.mutating}
                    >
                      <ClipboardCheck className="mr-1 h-4 w-4" />
                      Registrar ciencia
                    </Button>
                  )}
                </div>
              ))
            )}
          </div>
        </section>
      </main>
    </AppLayout>
  );
}
