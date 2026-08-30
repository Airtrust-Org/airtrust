import { useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  ExternalLink,
  Filter,
  RefreshCw,
  Search,
  ShieldAlert,
  WifiOff,
} from 'lucide-react';
import AppLayout from '@/react-app/components/AppLayout';
import PageHeader from '@/react-app/components/PageHeader';
import Button from '@/react-app/components/Button';
import { useApi } from '@/react-app/hooks/useApi';
import { onDataChanged } from '@/react-app/utils/data-sync';
import EscalasTabBar from './components/EscalasTabBar';

type IntegratedMonthlyEventSource =
  | 'ESCALA'
  | 'TREINAMENTO'
  | 'SIMULADOR'
  | 'QUALIFICACAO'
  | 'FRMS'
  | 'INDISPONIBILIDADE'
  | 'OUTRO';

type IntegratedMonthlyEventSeverity = 'INFO' | 'WARNING' | 'CONFLICT' | 'BLOCKING';

type IntegratedMonthlyEvent = {
  id: string;
  source: IntegratedMonthlyEventSource;
  sourceId: string | number | null;
  sourceRoute?: string | null;
  employeeId: number | string;
  employeeName: string;
  date: string;
  startAt?: string | null;
  endAt?: string | null;
  allDay: boolean;
  type: string;
  title: string;
  description?: string | null;
  severity: IntegratedMonthlyEventSeverity;
  status: string;
  blocksAllocation: boolean;
  requiresAction: boolean;
  metadata?: Record<string, unknown>;
};

type IntegratedEmployeeMonth = {
  employeeId: number | string;
  employeeName: string;
  role?: string | null;
  base?: string | null;
  summary: {
    scheduledDays: number;
    trainingEvents: number;
    simulatorEvents: number;
    qualificationWarnings: number;
    frmsWarnings: number;
    conflicts: number;
    blockingIssues: number;
  };
  days: Record<
    string,
    {
      operationalAssignments: IntegratedMonthlyEvent[];
      commitments: IntegratedMonthlyEvent[];
      alerts: IntegratedMonthlyEvent[];
      conflicts: IntegratedMonthlyEvent[];
    }
  >;
};

type IntegratedMonthlyResponse = {
  month: string;
  timezone: string;
  generatedAt: string;
  summary: {
    employees: number;
    events: number;
    warnings: number;
    conflicts: number;
    blockingIssues: number;
  };
  employees: IntegratedEmployeeMonth[];
  diagnostics?: {
    partialSources?: string[];
    warnings?: string[];
  };
};

const SOURCE_LABEL: Record<IntegratedMonthlyEventSource, string> = {
  ESCALA: 'Escala',
  TREINAMENTO: 'Treinamento',
  SIMULADOR: 'Simulador',
  QUALIFICACAO: 'Qualificação',
  FRMS: 'FRMS',
  INDISPONIBILIDADE: 'Indisponibilidade',
  OUTRO: 'Outro',
};

const SEVERITY_LABEL: Record<IntegratedMonthlyEventSeverity, string> = {
  INFO: 'Informação',
  WARNING: 'Aviso',
  CONFLICT: 'Conflito',
  BLOCKING: 'Bloqueio',
};

const SEVERITY_CLASS: Record<IntegratedMonthlyEventSeverity, string> = {
  INFO: 'border-slate-200 bg-slate-50 text-slate-700',
  WARNING: 'border-amber-200 bg-amber-50 text-amber-800',
  CONFLICT: 'border-orange-300 bg-orange-50 text-orange-800',
  BLOCKING: 'border-red-300 bg-red-50 text-red-800',
};

function currentMonth() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
}

function shiftMonth(month: string, delta: number) {
  const [year, monthNumber] = month.split('-').map(Number);
  const next = new Date(year, monthNumber - 1 + delta, 1);
  return `${next.getFullYear()}-${String(next.getMonth() + 1).padStart(2, '0')}`;
}

function formatDateTime(value: string | null | undefined) {
  if (!value) return '-';
  return new Intl.DateTimeFormat('pt-BR', {
    dateStyle: 'short',
    timeStyle: value.includes('T') ? 'short' : undefined,
  }).format(new Date(value));
}

function formatMonthLabel(month: string) {
  const [year, monthNumber] = month.split('-').map(Number);
  return new Intl.DateTimeFormat('pt-BR', { month: 'long', year: 'numeric' }).format(
    new Date(year, monthNumber - 1, 1),
  );
}

function allEvents(employee: IntegratedEmployeeMonth) {
  return Object.values(employee.days).flatMap((day) => [
    ...day.operationalAssignments,
    ...day.commitments,
    ...day.alerts,
    ...day.conflicts,
  ]);
}

function sourceMatches(employee: IntegratedEmployeeMonth, source: string) {
  if (!source) return true;
  return allEvents(employee).some((event) => event.source === source);
}

function severityMatches(employee: IntegratedEmployeeMonth, severity: string) {
  if (!severity) return true;
  return allEvents(employee).some((event) => event.severity === severity);
}

function EventPill({ event }: { event: IntegratedMonthlyEvent }) {
  const isConcluded =
    event.type === 'TREINAMENTO_CONCLUIDO' ||
    event.status === 'CONCLUIDO' ||
    event.status === 'CONCLUIDA';
  const className = [
    'group block rounded border px-1.5 py-1 text-[11px] leading-tight transition hover:shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500',
    isConcluded
      ? 'border-slate-200 bg-slate-100 text-slate-400 line-through decoration-slate-300'
      : SEVERITY_CLASS[event.severity],
  ].join(' ');
  const title = `${SOURCE_LABEL[event.source]} - ${event.title}${event.description ? `: ${event.description}` : ''}`;
  const content = (
    <>
      <span className="flex items-center justify-between gap-1">
        <span className="truncate font-medium">{event.title}</span>
        {event.sourceRoute ? <ExternalLink className="h-3 w-3 shrink-0 opacity-60" /> : null}
      </span>
      <span className="mt-0.5 block truncate opacity-80">
        {SOURCE_LABEL[event.source]}
        {isConcluded ? ' · Concluído' : ` · ${SEVERITY_LABEL[event.severity]}`}
      </span>
    </>
  );

  if (!event.sourceRoute) {
    return (
      <div className={className} title={title}>
        {content}
      </div>
    );
  }

  return (
    <a href={event.sourceRoute} className={className} title={title}>
      {content}
    </a>
  );
}

function DayCell({ date, events }: { date: string; events: IntegratedMonthlyEvent[] }) {
  const dayNumber = Number(date.slice(8, 10));
  const [expanded, setExpanded] = useState(false);
  const hasOverflow = events.length > 4;
  const visible = expanded ? events : events.slice(0, 4);
  return (
    <div className="min-h-[112px] min-w-[132px] border-r border-slate-200 bg-white p-2 align-top last:border-r-0">
      <div className="mb-1 flex items-center justify-between">
        <span className="text-xs font-semibold text-slate-700">{dayNumber}</span>
        {events.some((event) => event.blocksAllocation) ? (
          <ShieldAlert className="h-3.5 w-3.5 text-red-600" aria-label="Bloqueio operacional" />
        ) : events.some((event) => event.severity === 'CONFLICT') ? (
          <AlertTriangle className="h-3.5 w-3.5 text-orange-600" aria-label="Conflito" />
        ) : null}
      </div>
      <div className="space-y-1">
        {visible.map((event) => (
          <EventPill key={event.id} event={event} />
        ))}
        {hasOverflow ? (
          <button
            type="button"
            onClick={() => setExpanded((value) => !value)}
            aria-expanded={expanded}
            className="w-full rounded border border-slate-200 bg-slate-50 px-1.5 py-1 text-left text-[11px] text-slate-600 hover:bg-slate-100 focus:outline-none focus:ring-2 focus:ring-slate-400"
          >
            {expanded ? 'Mostrar menos' : `+${events.length - 4} itens`}
          </button>
        ) : null}
      </div>
    </div>
  );
}

export default function VisaoMensalIntegradaPage() {
  const [month, setMonth] = useState(currentMonth());
  const [query, setQuery] = useState('');
  const [source, setSource] = useState('');
  const [severity, setSeverity] = useState('');
  const [onlyConflicts, setOnlyConflicts] = useState(false);
  const [onlyBlocking, setOnlyBlocking] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);

  const params = new URLSearchParams({ mes: month, incluir_frms: 'true', _r: String(refreshKey) });
  const { data, loading, error, refetch } = useApi<IntegratedMonthlyResponse>(
    `/escalas/visao-mensal-integrada?${params.toString()}`,
    { bypassGetCache: true, retry: 1 },
  );

  const filteredEmployees = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    return (data?.employees || []).filter((employee) => {
      if (normalizedQuery) {
        const haystack = `${employee.employeeName} ${employee.role || ''} ${employee.base || ''}`.toLowerCase();
        if (!haystack.includes(normalizedQuery)) return false;
      }
      if (onlyConflicts && employee.summary.conflicts === 0) return false;
      if (onlyBlocking && employee.summary.blockingIssues === 0) return false;
      if (!sourceMatches(employee, source)) return false;
      if (!severityMatches(employee, severity)) return false;
      return true;
    });
  }, [data?.employees, onlyBlocking, onlyConflicts, query, severity, source]);

  const visualSummary = useMemo(() => {
    let compromissos = 0;
    let avisos = 0;
    let conflitos = 0;
    let bloqueios = 0;
    for (const employee of filteredEmployees) {
      for (const day of Object.values(employee.days)) {
        for (const event of day.operationalAssignments) compromissos++;
        for (const event of day.commitments) compromissos++;
        for (const event of day.alerts) {
          if (event.severity === 'BLOCKING' || event.blocksAllocation) {
            bloqueios++;
          } else if (event.severity === 'WARNING') {
            avisos++;
          }
        }
        for (const event of day.conflicts) conflitos++;
      }
    }
    return {
      employees: filteredEmployees.length,
      events: compromissos,
      warnings: avisos,
      conflicts: conflitos,
      blockingIssues: bloqueios,
    };
  }, [filteredEmployees]);

  const days = useMemo(() => {
    const [year, monthNumber] = month.split('-').map(Number);
    const last = new Date(year, monthNumber, 0).getDate();
    return Array.from({ length: last }, (_, index) => `${month}-${String(index + 1).padStart(2, '0')}`);
  }, [month]);

  const handleRefresh = () => {
    setRefreshKey((value) => value + 1);
    refetch();
  };

  useEffect(() => {
    const unsubscribe = onDataChanged(
      () => refetch(),
      ['treinamentos', 'escala', 'qualificacoes', 'simuladores', 'all'],
    );
    const onFocus = () => refetch();
    window.addEventListener('focus', onFocus);
    return () => {
      unsubscribe();
      window.removeEventListener('focus', onFocus);
    };
  }, [refetch]);

  const diagnostics = data?.diagnostics;
  const partialSources = diagnostics?.partialSources || [];
  const diagnosticWarnings = diagnostics?.warnings || [];
  const hasPartialData = partialSources.length > 0 || diagnosticWarnings.length > 0;

  return (
    <AppLayout>
      <PageHeader
        title="Visão Mensal Integrada"
        subtitle="Espelho operacional mensal por tripulante, com origem e severidade preservadas"
      />
      <EscalasTabBar />

      <div className="space-y-5">
        <section className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
          <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
            <div className="flex flex-wrap items-center gap-2">
              <Button variant="secondary" onClick={() => setMonth(shiftMonth(month, -1))} title="Mês anterior">
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <label className="flex min-h-11 items-center gap-2 rounded-md border border-slate-200 bg-white px-3">
                <CalendarDays className="h-4 w-4 text-slate-500" />
                <input
                  type="month"
                  value={month}
                  onChange={(event) => setMonth(event.target.value)}
                  className="min-h-10 border-0 bg-transparent text-sm font-medium text-slate-900 outline-none"
                  aria-label="Selecionar mês"
                />
              </label>
              <Button variant="secondary" onClick={() => setMonth(shiftMonth(month, 1))} title="Próximo mês">
                <ChevronRight className="h-4 w-4" />
              </Button>
              <Button variant="secondary" onClick={() => setMonth(currentMonth())}>
                Mês atual
              </Button>
              <Button onClick={handleRefresh}>
                <RefreshCw className="h-4 w-4" />
                Recarregar
              </Button>
            </div>

            <div className="text-sm text-slate-600">
              {data ? (
                <>
                  {formatMonthLabel(data.month)} · atualizado em {formatDateTime(data.generatedAt)}
                </>
              ) : (
                formatMonthLabel(month)
              )}
            </div>
          </div>
        </section>

        {loading && !data ? (
          <section
            className="rounded-lg border border-slate-200 bg-white px-4 py-3 text-sm text-slate-600 shadow-sm"
            aria-live="polite"
          >
            Carregando indicadores da visão mensal…
          </section>
        ) : data ? (
          <section
            className="flex flex-wrap items-center gap-x-6 gap-y-2 rounded-lg border border-slate-200 bg-white px-4 py-3 shadow-sm"
            aria-label="Resumo operacional da visão mensal"
          >
            {[
              ['Tripulantes', visualSummary.employees],
              ['Avisos', visualSummary.warnings],
              ['Conflitos', visualSummary.conflicts],
              ['Bloqueios', visualSummary.blockingIssues],
            ].map(([label, value]) => (
              <div key={String(label)} className="flex items-baseline gap-2">
                <span className="text-xs font-medium uppercase tracking-wide text-slate-500">
                  {label}
                </span>
                <span className="text-lg font-semibold text-slate-950">{value}</span>
              </div>
            ))}
          </section>
        ) : null}

        {hasPartialData ? (
          <section
            className="rounded-lg border border-amber-300 bg-amber-50 p-4 shadow-sm"
            role="alert"
            aria-live="polite"
          >
            <div className="flex items-start gap-3">
              <WifiOff className="mt-0.5 h-5 w-5 flex-shrink-0 text-amber-700" aria-hidden="true" />
              <div className="flex-1">
                <div className="text-sm font-semibold text-amber-900">
                  Dados parciais — uma ou mais fontes não responderam
                </div>
                <p className="mt-1 text-sm text-amber-800">
                  Os totais podem estar incompletos. Ausência de eventos de uma fonte indisponível{' '}
                  <strong>não significa</strong> ausência de compromissos.
                </p>
                {partialSources.length > 0 ? (
                  <p className="mt-1 text-sm text-amber-800">
                    Fontes afetadas:{' '}
                    <span className="font-medium">
                      {partialSources
                        .map((src) => SOURCE_LABEL[src as IntegratedMonthlyEventSource] || src)
                        .join(', ')}
                    </span>
                    .
                  </p>
                ) : null}
                {diagnosticWarnings.length > 0 ? (
                  <ul className="mt-1 list-disc pl-5 text-xs text-amber-700">
                    {diagnosticWarnings.map((warning, index) => (
                      <li key={index}>{warning}</li>
                    ))}
                  </ul>
                ) : null}
                <div className="mt-2">
                  <Button variant="secondary" onClick={handleRefresh}>
                    <RefreshCw className="h-4 w-4" />
                    Tentar novamente
                  </Button>
                </div>
              </div>
            </div>
          </section>
        ) : null}

        <section className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
          <div className="mb-3 flex items-center gap-2 text-sm font-semibold text-slate-800">
            <Filter className="h-4 w-4" />
            Filtros
          </div>
          <div className="grid gap-3 lg:grid-cols-[minmax(220px,1fr)_180px_180px_auto_auto]">
            <label className="flex min-h-11 items-center gap-2 rounded-md border border-slate-200 px-3">
              <Search className="h-4 w-4 text-slate-500" />
              <input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Buscar tripulante, função ou base"
                className="w-full border-0 text-sm outline-none"
              />
            </label>
            <select
              value={source}
              onChange={(event) => setSource(event.target.value)}
              className="min-h-11 rounded-md border border-slate-200 px-3 text-sm"
              aria-label="Filtrar por fonte"
            >
              <option value="">Todas as fontes</option>
              {Object.entries(SOURCE_LABEL).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
            <select
              value={severity}
              onChange={(event) => setSeverity(event.target.value)}
              className="min-h-11 rounded-md border border-slate-200 px-3 text-sm"
              aria-label="Filtrar por severidade"
            >
              <option value="">Todas severidades</option>
              {Object.entries(SEVERITY_LABEL).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
            <label className="flex min-h-11 items-center gap-2 rounded-md border border-slate-200 px-3 text-sm">
              <input
                type="checkbox"
                checked={onlyConflicts}
                onChange={(event) => setOnlyConflicts(event.target.checked)}
              />
              Só conflitos
            </label>
            <label className="flex min-h-11 items-center gap-2 rounded-md border border-slate-200 px-3 text-sm">
              <input
                type="checkbox"
                checked={onlyBlocking}
                onChange={(event) => setOnlyBlocking(event.target.checked)}
              />
              Só bloqueios
            </label>
          </div>
        </section>

        <section className="overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm">
          {error && !data ? (
            <div className="p-8" role="alert">
              <p className="text-sm font-semibold text-red-700">
                Não foi possível carregar a visão mensal integrada.
              </p>
              <p className="mt-1 text-sm text-slate-600">
                Os indicadores não serão tratados como zero enquanto a consulta não for concluída.
              </p>
              <div className="mt-4">
                <Button variant="secondary" onClick={handleRefresh}>
                  <RefreshCw className="h-4 w-4" />
                  Tentar novamente
                </Button>
              </div>
            </div>
          ) : loading ? (
            <div className="p-8 text-sm text-slate-600" aria-live="polite">
              Carregando visão mensal integrada…
            </div>
          ) : filteredEmployees.length === 0 ? (
            <div className="p-8 text-sm text-slate-600">
              Nenhum tripulante encontrado para os filtros atuais.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <div className="min-w-max">
                <div className="sticky top-0 z-10 grid grid-cols-[260px_1fr] border-b border-slate-200 bg-slate-50">
                  <div className="border-r border-slate-200 p-3 text-sm font-semibold text-slate-800">
                    Tripulante
                  </div>
                  <div className="flex">
                    {days.map((day) => (
                      <div
                        key={day}
                        className="min-w-[132px] border-r border-slate-200 p-3 text-center text-xs font-semibold text-slate-700 last:border-r-0"
                      >
                        {day.slice(8, 10)}
                      </div>
                    ))}
                  </div>
                </div>

                {filteredEmployees.map((employee) => (
                  <div
                    key={employee.employeeId}
                    className="grid grid-cols-[260px_1fr] border-b border-slate-200 last:border-b-0"
                  >
                    <div className="border-r border-slate-200 bg-slate-50 p-3">
                      <div className="font-semibold text-slate-950">{employee.employeeName}</div>
                      <div className="mt-1 text-xs text-slate-600">
                        {[employee.role, employee.base].filter(Boolean).join(' · ') || 'Sem função/base'}
                      </div>
                      <div className="mt-3 grid grid-cols-2 gap-2 text-xs">
                        <span className="rounded bg-white px-2 py-1 text-slate-700">
                          {employee.summary.scheduledDays} dias escala
                        </span>
                        <span className="rounded bg-white px-2 py-1 text-slate-700">
                          {employee.summary.conflicts} conflitos
                        </span>
                        <span className="rounded bg-white px-2 py-1 text-slate-700">
                          {employee.summary.blockingIssues} bloqueios
                        </span>
                        <span className="rounded bg-white px-2 py-1 text-slate-700">
                          {employee.summary.frmsWarnings} FRMS
                        </span>
                      </div>
                    </div>
                    <div className="flex">
                      {days.map((day) => {
                        const bucket = employee.days[day] || {
                          operationalAssignments: [],
                          commitments: [],
                          alerts: [],
                          conflicts: [],
                        };
                        const events = [
                          ...bucket.operationalAssignments,
                          ...bucket.commitments,
                          ...bucket.alerts,
                          ...bucket.conflicts,
                        ].filter(
                          (event) =>
                            (!source || event.source === source) &&
                            (!severity || event.severity === severity),
                        );
                        return (
                          <DayCell
                            key={`${employee.employeeId}-${day}`}
                            date={day}
                            events={events}
                          />
                        );
                      })}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </section>
      </div>
    </AppLayout>
  );
}
