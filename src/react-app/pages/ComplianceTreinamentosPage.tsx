import { useEffect, useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link, useSearchParams } from 'react-router-dom';
import {
  AlertTriangle,
  CheckCircle2,
  Clock3,
  GraduationCap,
  ShieldCheck,
  Users,
  XCircle,
} from 'lucide-react';
import AppLayout from '@/react-app/components/AppLayout';
import { TrainingComplianceApplicabilityEditor } from '@/react-app/components/compliance/TrainingComplianceApplicabilityEditor';
import { TrainingComplianceOrganizationEditor } from '@/react-app/components/compliance/TrainingComplianceOrganizationEditor';
import { TrainingEnrollmentReconciliation } from '@/react-app/components/compliance/TrainingEnrollmentReconciliation';
import {
  TrainingComplianceIntelligence,
  TrainingComplianceNotificationSettings,
} from '@/react-app/components/compliance/TrainingComplianceIntelligence';
import { fetchWithAuth } from '@/react-app/config/api';
import { useQualificacaoTipos } from '@/react-app/hooks/useQualificacoesExt';

type Summary = {
  pessoas: number;
  pessoas_sem_configuracao: number;
  setores_sem_matriz: number;
  cargos_sem_matriz: number;
  matriculas_sem_requisito: number;
  requisitos_obrigatorios: number;
  conformes: number;
  vencendo: number;
  vencidos: number;
  nao_realizados: number;
  em_andamento: number;
  compliance_pct: number | null;
  setores: Array<{
    setor_id: number | null;
    setor_nome: string;
    pessoas: number;
    pessoas_sem_configuracao: number;
    compliance_pct: number | null;
  }>;
};

type Person = {
  id: number;
  nome: string;
  setor_id: number | null;
  setor_nome: string | null;
  funcao_id: number | null;
  funcao_nome: string | null;
  configurado: boolean;
  total_obrigatorios: number;
  conformes: number;
  vencendo: number;
  vencidos: number;
  nao_realizados: number;
  em_andamento: number;
  compliance_pct: number | null;
};

type Training = {
  qualificacao_tipo_id: number;
  qualificacao_tipo_nome: string;
  qualificacao_tipo_codigo?: string | null;
  pessoas: number;
  conformes: number;
  vencendo: number;
  vencidos: number;
  nao_realizados: number;
  em_andamento: number;
  compliance_pct: number;
};

type SectorCompliance = {
  setor_id: number | null;
  setor_nome: string;
  pessoas: number;
  pessoas_sem_configuracao: number;
  requisitos_obrigatorios: number;
  conformes: number;
  vencendo: number;
  vencidos: number;
  nao_realizados: number;
  em_andamento: number;
  compliance_pct: number | null;
  cargos: Array<{
    funcao_id: number | null;
    funcao_nome: string;
    pessoas: number;
    pessoas_sem_configuracao: number;
    requisitos_obrigatorios: number;
    conformes: number;
    vencendo: number;
    vencidos: number;
    nao_realizados: number;
    em_andamento: number;
    compliance_pct: number | null;
  }>;
};

type Catalogs = {
  setores: Array<{ id: number; nome: string }>;
  funcoes: Array<{ id: number; nome: string }>;
  setor_funcoes: Array<{ setor_id: number; funcao_id: number }>;
};

async function readJson<T>(response: Response): Promise<T> {
  const json = (await response.json().catch(() => ({}))) as {
    success?: boolean;
    data?: T;
    error?: string;
  };
  if (!response.ok || json.success === false)
    throw new Error(json.error || 'Erro ao carregar compliance');
  return json.data as T;
}

function buildFilter(setorId: number | null, funcaoId: number | null) {
  const params = new URLSearchParams();
  if (setorId) params.set('setor_id', String(setorId));
  if (funcaoId) params.set('funcao_id', String(funcaoId));
  const query = params.toString();
  return query ? `?${query}` : '';
}

type ComplianceTab = 'pendencias' | 'treinamentos' | 'pessoas' | 'setores' | 'relatorios' | 'comunicacoes' | 'administracao';

type ComplianceDrilldownStatus =
  | 'CONFORME'
  | 'VENCENDO'
  | 'VENCIDO'
  | 'NAO_REALIZADO'
  | 'EM_ANDAMENTO';

function isComplianceTab(value: string | null): value is ComplianceTab {
  return (
    value === 'pendencias' ||
    value === 'treinamentos' ||
    value === 'pessoas' ||
    value === 'setores' ||
    value === 'relatorios' ||
    value === 'comunicacoes' ||
    value === 'administracao'
  );
}

function realizedCount(conformes: number, vencendo: number) {
  return Math.max(0, conformes - vencendo);
}

function drilldownStatusLabel(status?: ComplianceDrilldownStatus) {
  if (status === 'CONFORME') return 'REALIZADOS';
  if (status === 'EM_ANDAMENTO') return 'EM ANDAMENTO';
  if (status === 'VENCENDO') return 'VENCENDO';
  if (status === 'VENCIDO') return 'VENCIDOS';
  if (status === 'NAO_REALIZADO') return 'NUNCA FEZ';
  return '';
}

function StatusMetric({
  label,
  value,
  icon: Icon,
  tone,
  onClick,
}: {
  label: string;
  value: number;
  icon: typeof ShieldCheck;
  tone: 'success' | 'info' | 'warning' | 'danger' | 'attention';
  onClick: () => void;
}) {
  const tones = {
    success: {
      icon: 'bg-emerald-50 text-emerald-700',
      value: 'text-emerald-800',
      hover: 'hover:border-emerald-200 hover:bg-emerald-50/40',
    },
    info: {
      icon: 'bg-blue-50 text-blue-700',
      value: 'text-blue-800',
      hover: 'hover:border-blue-200 hover:bg-blue-50/40',
    },
    warning: {
      icon: 'bg-amber-50 text-amber-700',
      value: 'text-amber-800',
      hover: 'hover:border-amber-200 hover:bg-amber-50/40',
    },
    danger: {
      icon: 'bg-red-50 text-red-700',
      value: 'text-red-800',
      hover: 'hover:border-red-200 hover:bg-red-50/40',
    },
    attention: {
      icon: 'bg-orange-50 text-orange-700',
      value: 'text-orange-800',
      hover: 'hover:border-orange-200 hover:bg-orange-50/40',
    },
  } as const;
  const selected = tones[tone];

  return (
    <button
      type="button"
      onClick={onClick}
      className={`min-w-0 rounded-xl border border-slate-200 bg-white px-3 py-3 text-left transition ${selected.hover}`}
    >
      <span className="flex items-start justify-between gap-2">
        <span className={`text-xl font-bold tabular-nums ${selected.value}`}>{value}</span>
        <span className={`rounded-lg p-1.5 ${selected.icon}`}>
          <Icon className="h-4 w-4" />
        </span>
      </span>
      <span className="mt-1 block text-xs font-medium leading-4 text-slate-600">{label}</span>
    </button>
  );
}

function StatusBreakdown({
  emAndamento,
  vencendo,
  vencidos,
  naoRealizados,
  semConfiguracao = 0,
}: {
  emAndamento: number;
  vencendo: number;
  vencidos: number;
  naoRealizados: number;
  semConfiguracao?: number;
}) {
  const hasAttention =
    emAndamento + vencendo + vencidos + naoRealizados + semConfiguracao > 0;

  if (!hasAttention) {
    return <span className="text-xs font-medium text-emerald-700">Sem pendências</span>;
  }

  return (
    <div className="flex flex-wrap justify-end gap-1.5">
      {emAndamento > 0 ? (
        <span className="rounded-full bg-blue-50 px-2 py-1 text-xs font-medium text-blue-700">
          Em andamento {emAndamento}
        </span>
      ) : null}
      {vencendo > 0 ? (
        <span className="rounded-full bg-amber-50 px-2 py-1 text-xs font-medium text-amber-700">
          Vencendo {vencendo}
        </span>
      ) : null}
      {vencidos > 0 ? (
        <span className="rounded-full bg-red-50 px-2 py-1 text-xs font-medium text-red-700">
          Vencidos {vencidos}
        </span>
      ) : null}
      {naoRealizados > 0 ? (
        <span className="rounded-full bg-orange-50 px-2 py-1 text-xs font-medium text-orange-700">
          Nunca fez {naoRealizados}
        </span>
      ) : null}
      {semConfiguracao > 0 ? (
        <span className="rounded-full bg-slate-100 px-2 py-1 text-xs font-medium text-slate-700">
          Sem configuração {semConfiguracao}
        </span>
      ) : null}
    </div>
  );
}


export default function ComplianceTreinamentosPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [setorId, setSetorId] = useState<number | null>(null);
  const [funcaoId, setFuncaoId] = useState<number | null>(null);
  const [tab, setTab] = useState<ComplianceTab>(() => {
    const requested = searchParams.get('tab');
    return isComplianceTab(requested) ? requested : 'pendencias';
  });
  const [configurationMode, setConfigurationMode] = useState<
    'organizacao' | 'treinamento' | 'reconciliacao' | 'automacao'
  >('organizacao');
  const [expandedSectors, setExpandedSectors] = useState<Set<number | null>>(new Set());
  const [selectedTipoId, setSelectedTipoId] = useState<number | null>(null);
  const [drilldown, setDrilldown] = useState<{
    qualificacao_tipo_id?: number;
    qualificacao_nome?: string;
    status?: ComplianceDrilldownStatus;
  } | null>(null);
  const { tipos } = useQualificacaoTipos(true, 500);

  useEffect(() => {
    const requested = searchParams.get('tab');
    const nextTab = isComplianceTab(requested) ? requested : 'pendencias';
    setTab(nextTab);
    if (nextTab !== 'pessoas') setDrilldown(null);
  }, [searchParams]);

  const capabilities = useQuery({
    queryKey: ['training-compliance', 'capabilities'],
    queryFn: async () =>
      readJson<{ schema_ready: boolean; reconciliation_ready: boolean }>(
        await fetchWithAuth('/api/compliance-treinamentos/capabilities'),
      ),
  });
  const schemaReady = capabilities.data?.schema_ready === true;
  const catalogs = useQuery({
    queryKey: ['training-compliance', 'catalogs'],
    enabled: schemaReady,
    queryFn: async () =>
      readJson<Catalogs>(await fetchWithAuth('/api/compliance-treinamentos/catalogos')),
  });
  const filter = buildFilter(setorId, funcaoId);
  const summary = useQuery({
    queryKey: ['training-compliance', 'summary', setorId, funcaoId],
    enabled: schemaReady,
    queryFn: async () =>
      readJson<Summary>(await fetchWithAuth(`/api/compliance-treinamentos/resumo${filter}`)),
  });
  const people = useQuery({
    queryKey: ['training-compliance', 'people', setorId, funcaoId, drilldown],
    enabled: schemaReady && tab === 'pessoas',
    queryFn: async () => {
      const params = new URLSearchParams(filter.startsWith('?') ? filter.slice(1) : '');
      if (drilldown?.qualificacao_tipo_id) {
        params.set('qualificacao_tipo_id', String(drilldown.qualificacao_tipo_id));
      }
      if (drilldown?.status) params.set('status', drilldown.status);
      const query = params.toString();
      return readJson<Person[]>(
        await fetchWithAuth(`/api/compliance-treinamentos/pessoas${query ? `?${query}` : ''}`),
      );
    },
  });
  const trainings = useQuery({
    queryKey: ['training-compliance', 'trainings', setorId, funcaoId],
    enabled: schemaReady && tab === 'treinamentos',
    queryFn: async () =>
      readJson<Training[]>(
        await fetchWithAuth(`/api/compliance-treinamentos/treinamentos${filter}`),
      ),
  });
  const sectors = useQuery({
    queryKey: ['training-compliance', 'sectors', setorId],
    enabled: schemaReady && tab === 'setores',
    queryFn: async () =>
      readJson<SectorCompliance[]>(
        await fetchWithAuth(
          `/api/compliance-treinamentos/setores${setorId ? `?setor_id=${setorId}` : ''}`,
        ),
      ),
  });

  const functions = useMemo(() => {
    const all = catalogs.data?.funcoes || [];
    if (!setorId) return all;
    const allowed = new Set(
      (catalogs.data?.setor_funcoes || [])
        .filter((pair) => pair.setor_id === setorId)
        .map((pair) => pair.funcao_id),
    );
    return all.filter((item) => allowed.has(item.id));
  }, [catalogs.data, setorId]);

  const selectTab = (nextTab: ComplianceTab, clearDrilldown = true) => {
    if (clearDrilldown) setDrilldown(null);
    if (nextTab === 'setores') setFuncaoId(null);
    setTab(nextTab);
    const nextParams = new URLSearchParams(searchParams);
    if (nextTab === 'pendencias') nextParams.delete('tab');
    else nextParams.set('tab', nextTab);
    setSearchParams(nextParams, { replace: true });
  };

  const openPeopleDrilldown = (
    item: Training,
    status?: ComplianceDrilldownStatus,
  ) => {
    setDrilldown({
      qualificacao_tipo_id: item.qualificacao_tipo_id,
      qualificacao_nome: item.qualificacao_tipo_nome,
      status,
    });
    selectTab('pessoas', false);
  };

  const openStatusDrilldown = (status: ComplianceDrilldownStatus) => {
    setDrilldown({ status });
    selectTab('pessoas', false);
  };

  const summaryRealized = realizedCount(
    summary.data?.conformes ?? 0,
    summary.data?.vencendo ?? 0,
  );

  const handleSetor = (value: string) => {
    const next = value ? Number(value) : null;
    setSetorId(next);
    if (funcaoId && next) {
      const allowed = (catalogs.data?.setor_funcoes || []).some(
        (pair) => pair.setor_id === next && pair.funcao_id === funcaoId,
      );
      if (!allowed) setFuncaoId(null);
    }
  };

  return (
    <AppLayout>
      <div className="w-full space-y-5">
        <div className="flex flex-col gap-4 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm lg:flex-row lg:items-center lg:justify-between">
          <div>
            <div className="flex items-center gap-2">
              <ShieldCheck className="h-5 w-5 text-primary" />
              <h1 className="text-xl font-semibold text-slate-900">Compliance de Treinamentos</h1>
            </div>
            <p className="mt-1 max-w-3xl text-sm text-slate-500">
              Visão geral dos requisitos, vencimentos e pendências de treinamento.
            </p>
          </div>
          {tab !== 'administracao' ? (
            <div className="flex min-w-[300px] flex-col gap-2">
              <div className={`grid gap-2 ${tab === 'setores' ? '' : 'sm:grid-cols-2'}`}>
                <select
                  aria-label="Filtrar por setor"
                  value={setorId ?? ''}
                  onChange={(event) => handleSetor(event.target.value)}
                  className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm"
                >
                  <option value="">Todos os setores</option>
                  {(catalogs.data?.setores || []).map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.nome}
                    </option>
                  ))}
                </select>
                {tab !== 'setores' ? (
                  <select
                    aria-label="Filtrar por cargo"
                    value={funcaoId ?? ''}
                    onChange={(event) =>
                      setFuncaoId(event.target.value ? Number(event.target.value) : null)
                    }
                    className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm"
                  >
                    <option value="">Todos os cargos</option>
                    {functions.map((item) => (
                      <option key={item.id} value={item.id}>
                        {item.nome}
                      </option>
                    ))}
                  </select>
                ) : null}
              </div>
              {setorId || funcaoId ? (
                <button
                  type="button"
                  onClick={() => {
                    setSetorId(null);
                    setFuncaoId(null);
                  }}
                  className="self-end text-xs font-medium text-slate-500 hover:text-primary"
                >
                  Limpar filtros
                </button>
              ) : null}
            </div>
          ) : null}
        </div>

        {capabilities.isLoading ? (
          <div className="rounded-xl border border-slate-200 bg-white p-6 text-sm text-slate-500">
            Carregando motor de compliance...
          </div>
        ) : null}
        {!capabilities.isLoading && !schemaReady ? (
          <div className="rounded-2xl border border-amber-200 bg-amber-50 p-5 text-amber-900">
            <div className="flex items-center gap-2 font-semibold">
              <AlertTriangle className="h-5 w-5" /> Schema V2 ainda não aplicado neste ambiente
            </div>
            <p className="mt-1 text-sm">
              O código está preparado para operar sem quebrar a matriz antiga. A visão canônica será
              ativada após a mudança de schema governada.
            </p>
          </div>
        ) : null}

        {schemaReady ? (
          <>
            {(['pendencias', 'treinamentos', 'pessoas', 'setores', 'relatorios'] as ComplianceTab[]).includes(tab) ? (
              <div className="grid gap-3 xl:grid-cols-[minmax(0,1.1fr)_minmax(0,2fr)_minmax(260px,0.95fr)]">
              <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                      Compliance geral
                    </p>
                    <div className="mt-2 flex flex-wrap items-end gap-x-3 gap-y-1">
                      <span className="text-4xl font-bold tracking-tight text-slate-950">
                        {summary.data?.compliance_pct == null
                          ? '—'
                          : `${summary.data.compliance_pct}%`}
                      </span>
                      <span className="mb-1 inline-flex items-center gap-1.5 rounded-full bg-slate-100 px-2.5 py-1 text-xs font-medium text-slate-600">
                        <Users className="h-3.5 w-3.5" />
                        {summary.data?.pessoas ?? 0} pessoas
                      </span>
                    </div>
                  </div>
                  <div className="rounded-xl bg-emerald-50 p-2.5 text-emerald-700">
                    <ShieldCheck className="h-5 w-5" />
                  </div>
                </div>
                <div className="mt-5 h-2 overflow-hidden rounded-full bg-slate-100">
                  <div
                    className="h-full rounded-full bg-emerald-500 transition-all"
                    style={{
                      width: `${Math.min(100, Math.max(0, summary.data?.compliance_pct ?? 0))}%`,
                    }}
                  />
                </div>
                <div className="mt-2 flex items-center justify-between gap-3 text-xs text-slate-500">
                  <span>
                    <strong className="font-semibold text-slate-700">
                      {summary.data?.conformes ?? 0}
                    </strong>{' '}
                    de {summary.data?.requisitos_obrigatorios ?? 0} requisitos atendidos
                  </span>
                  <span className="whitespace-nowrap">janela: 30 dias</span>
                </div>
              </section>

              <section className="rounded-2xl border border-slate-200 bg-slate-50/60 p-4 shadow-sm">
                <div className="mb-3 flex items-center justify-between gap-3">
                  <div>
                    <h2 className="text-sm font-semibold text-slate-900">Situação dos requisitos</h2>
                    <p className="text-xs text-slate-500">
                      Clique em uma situação para ver as pessoas.
                    </p>
                  </div>
                  <span className="hidden text-xs font-medium text-slate-400 sm:inline">
                    {summary.data?.requisitos_obrigatorios ?? 0} no total
                  </span>
                </div>
                <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-5">
                  <StatusMetric
                    label="Realizados"
                    value={summaryRealized}
                    icon={CheckCircle2}
                    tone="success"
                    onClick={() => openStatusDrilldown('CONFORME')}
                  />
                  <StatusMetric
                    label="Em andamento"
                    value={summary.data?.em_andamento ?? 0}
                    icon={GraduationCap}
                    tone="info"
                    onClick={() => openStatusDrilldown('EM_ANDAMENTO')}
                  />
                  <StatusMetric
                    label="Vencendo"
                    value={summary.data?.vencendo ?? 0}
                    icon={Clock3}
                    tone="warning"
                    onClick={() => openStatusDrilldown('VENCENDO')}
                  />
                  <StatusMetric
                    label="Vencidos"
                    value={summary.data?.vencidos ?? 0}
                    icon={XCircle}
                    tone="danger"
                    onClick={() => openStatusDrilldown('VENCIDO')}
                  />
                  <StatusMetric
                    label="Nunca fez"
                    value={summary.data?.nao_realizados ?? 0}
                    icon={AlertTriangle}
                    tone="attention"
                    onClick={() => openStatusDrilldown('NAO_REALIZADO')}
                  />
                </div>
              </section>

              <button
                type="button"
                onClick={() => {
                  setConfigurationMode('organizacao');
                  selectTab('administracao');
                }}
                className="rounded-2xl border border-amber-200 bg-amber-50/60 p-5 text-left shadow-sm transition hover:border-amber-300 hover:bg-amber-50"
              >
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-wide text-amber-800">
                      Configuração da matriz
                    </p>
                    <p className="mt-2 text-3xl font-bold tabular-nums text-slate-950">
                      {summary.data?.pessoas_sem_configuracao ?? 0}
                    </p>
                    <p className="mt-1 text-sm font-medium text-slate-700">
                      pessoas sem configuração
                    </p>
                  </div>
                  <div className="rounded-xl bg-white/80 p-2.5 text-amber-700 shadow-sm">
                    <AlertTriangle className="h-5 w-5" />
                  </div>
                </div>
                <p className="mt-4 text-xs leading-5 text-slate-600">
                  {summary.data?.cargos_sem_matriz ?? 0} cargo(s) sem matriz ·{' '}
                  {summary.data?.setores_sem_matriz ?? 0} setor(es) sem matriz
                </p>
                <span className="mt-4 inline-flex text-xs font-semibold text-amber-900">
                  Revisar configuração →
                </span>
              </button>
              </div>
            ) : null}

            <div className="rounded-2xl border border-slate-200 bg-white shadow-sm">
              <div className="flex flex-wrap gap-2 border-b border-slate-100 p-3">
                {(
                  [
                    ['pendencias', 'Pendências'],
                    ['treinamentos', 'Treinamentos'],
                    ['pessoas', 'Pessoas'],
                    ['setores', 'Setores'],
                    ['relatorios', 'Relatórios'],
                    ['comunicacoes', 'Comunicações'],
                    ['administracao', 'Administração'],
                  ] as const
                ).map(([value, label]) => (
                  <button
                    key={value}
                    type="button"
                    onClick={() => selectTab(value)}
                    className={`rounded-lg px-3 py-2 text-sm font-medium ${tab === value ? 'bg-primary/10 text-primary' : 'text-slate-600 hover:bg-slate-100'}`}
                  >
                    {label}
                  </button>
                ))}
              </div>

              {tab === 'pendencias' || tab === 'relatorios' || tab === 'comunicacoes' ? (
                <TrainingComplianceIntelligence
                  mode={tab}
                  setorId={setorId}
                  funcaoId={funcaoId}
                  catalogs={catalogs.data}
                  summary={{
                    pessoas: summary.data?.pessoas ?? 0,
                    requisitos_obrigatorios: summary.data?.requisitos_obrigatorios ?? 0,
                    conformes: summary.data?.conformes ?? 0,
                    vencendo: summary.data?.vencendo ?? 0,
                    vencidos: summary.data?.vencidos ?? 0,
                    nao_realizados: summary.data?.nao_realizados ?? 0,
                    em_andamento: summary.data?.em_andamento ?? 0,
                    compliance_pct: summary.data?.compliance_pct ?? null,
                  }}
                />
              ) : null}

              {tab === 'treinamentos' ? (
                <div className="overflow-x-auto">
                  <table className="min-w-full text-sm">
                    <thead className="bg-slate-50 text-slate-500">
                      <tr>
                        <th className="px-4 py-3 text-left">Treinamento</th>
                        <th className="px-3 py-3 text-right">Pessoas</th>
                        <th className="px-3 py-3 text-right">Compliance</th>
                        <th className="px-3 py-3 text-right">Realizados</th>
                        <th className="px-3 py-3 text-right">Em andamento</th>
                        <th className="px-3 py-3 text-right">Vencendo</th>
                        <th className="px-3 py-3 text-right">Vencidos</th>
                        <th className="px-3 py-3 text-right">Nunca fez</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {(trainings.data || []).map((item) => (
                        <tr key={item.qualificacao_tipo_id} className="hover:bg-slate-50">
                          <td className="px-4 py-3">
                            <button
                              type="button"
                              onClick={() => openPeopleDrilldown(item)}
                              className="text-left font-medium text-primary hover:underline"
                            >
                              {item.qualificacao_tipo_nome}
                            </button>
                            <div className="text-xs text-slate-400">
                              {item.qualificacao_tipo_codigo || '—'}
                            </div>
                          </td>
                          <td className="px-3 py-3 text-right">{item.pessoas}</td>
                          <td className="px-3 py-3 text-right font-semibold">
                            {item.compliance_pct == null ? '—' : `${item.compliance_pct}%`}
                          </td>
                          <td className="px-3 py-3 text-right text-emerald-700">
                            <button
                              type="button"
                              onClick={() => openPeopleDrilldown(item, 'CONFORME')}
                              className="font-medium hover:underline"
                              disabled={!realizedCount(item.conformes, item.vencendo)}
                            >
                              {realizedCount(item.conformes, item.vencendo)}
                            </button>
                          </td>
                          <td className="px-3 py-3 text-right text-blue-700">
                            <button
                              type="button"
                              onClick={() => openPeopleDrilldown(item, 'EM_ANDAMENTO')}
                              className="hover:underline"
                              disabled={!item.em_andamento}
                            >
                              {item.em_andamento}
                            </button>
                          </td>
                          <td className="px-3 py-3 text-right text-amber-700">
                            <button
                              type="button"
                              onClick={() => openPeopleDrilldown(item, 'VENCENDO')}
                              className="hover:underline"
                              disabled={!item.vencendo}
                            >
                              {item.vencendo}
                            </button>
                          </td>
                          <td className="px-3 py-3 text-right text-red-700">
                            <button
                              type="button"
                              onClick={() => openPeopleDrilldown(item, 'VENCIDO')}
                              className="hover:underline"
                              disabled={!item.vencidos}
                            >
                              {item.vencidos}
                            </button>
                          </td>
                          <td className="px-3 py-3 text-right text-orange-700">
                            <button
                              type="button"
                              onClick={() => openPeopleDrilldown(item, 'NAO_REALIZADO')}
                              className="hover:underline"
                              disabled={!item.nao_realizados}
                            >
                              {item.nao_realizados}
                            </button>
                          </td>
                        </tr>
                      ))}
                      {!trainings.isLoading && (trainings.data?.length || 0) === 0 ? (
                        <tr>
                          <td colSpan={8} className="px-4 py-8 text-center text-slate-500">
                            Nenhum requisito obrigatório configurado para o filtro atual.
                          </td>
                        </tr>
                      ) : null}
                    </tbody>
                  </table>
                </div>
              ) : null}

              {tab === 'pessoas' ? (
                <div>
                  {drilldown ? (
                    <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 bg-blue-50 px-4 py-3 text-sm text-blue-900">
                      <span>
                        {drilldown.qualificacao_nome ? (
                          <>
                            Pessoas de <strong>{drilldown.qualificacao_nome}</strong>
                            {drilldown.status ? ` · ${drilldownStatusLabel(drilldown.status)}` : ''}
                          </>
                        ) : (
                          <>Pessoas · {drilldownStatusLabel(drilldown.status)}</>
                        )}
                      </span>
                      <button
                        type="button"
                        onClick={() => setDrilldown(null)}
                        className="font-semibold text-blue-700 hover:underline"
                      >
                        Limpar filtro
                      </button>
                    </div>
                  ) : null}
                  <div className="overflow-x-auto">
                    <table className="min-w-full text-sm">
                      <thead className="bg-slate-50 text-slate-500">
                        <tr>
                          <th className="px-4 py-3 text-left">Pessoa</th>
                          <th className="px-3 py-3 text-left">Setor / cargo</th>
                          <th className="px-3 py-3 text-right">Requisitos</th>
                          <th className="px-3 py-3 text-right">Compliance</th>
                          <th className="px-3 py-3 text-right">Realizados</th>
                          <th className="px-4 py-3 text-right">Situação</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {(people.data || []).map((item) => (
                          <tr key={item.id} className="hover:bg-slate-50">
                            <td className="px-4 py-3">
                              <Link
                                to={`/funcionarios/${item.id}`}
                                className="font-medium text-primary hover:underline"
                              >
                                {item.nome}
                              </Link>
                            </td>
                            <td className="px-3 py-3 text-slate-600">
                              <div>{item.setor_nome || 'Sem setor'}</div>
                              <div className="mt-0.5 text-xs text-slate-400">
                                {item.funcao_nome || 'Sem cargo'}
                              </div>
                            </td>
                            <td className="px-3 py-3 text-right font-medium tabular-nums text-slate-700">
                              {!item.configurado ? '—' : item.total_obrigatorios}
                            </td>
                            <td className="px-3 py-3 text-right font-semibold tabular-nums">
                              {!item.configurado
                                ? 'Sem configuração'
                                : item.total_obrigatorios === 0
                                  ? 'Sem obrigatórios'
                                  : `${item.compliance_pct}%`}
                            </td>
                            <td className="px-3 py-3 text-right font-medium tabular-nums text-emerald-700">
                              {!item.configurado
                                ? '—'
                                : realizedCount(item.conformes, item.vencendo)}
                            </td>
                            <td className="px-4 py-3 text-right">
                              <StatusBreakdown
                                emAndamento={item.em_andamento}
                                vencendo={item.vencendo}
                                vencidos={item.vencidos}
                                naoRealizados={item.nao_realizados}
                                semConfiguracao={item.configurado ? 0 : 1}
                              />
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              ) : null}

              {tab === 'setores' ? (
                <div className="overflow-x-auto">
                  <table className="min-w-full text-sm">
                    <thead className="bg-slate-50 text-slate-500">
                      <tr>
                        <th className="px-4 py-3 text-left">Setor / cargo</th>
                        <th className="px-3 py-3 text-right">Pessoas</th>
                        <th className="px-3 py-3 text-right">Requisitos</th>
                        <th className="px-3 py-3 text-right">Compliance</th>
                        <th className="px-3 py-3 text-right">Realizados</th>
                        <th className="px-4 py-3 text-right">Situação</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {(sectors.data || []).flatMap((sector) => {
                        const expanded = expandedSectors.has(sector.setor_id);
                        const rows = [
                          <tr
                            key={`sector-${sector.setor_id ?? 'none'}`}
                            className="bg-white hover:bg-slate-50"
                          >
                            <td className="px-4 py-3">
                              <button
                                type="button"
                                onClick={() =>
                                  setExpandedSectors((old) => {
                                    const next = new Set(old);
                                    if (next.has(sector.setor_id)) next.delete(sector.setor_id);
                                    else next.add(sector.setor_id);
                                    return next;
                                  })
                                }
                                className="font-semibold text-primary hover:underline"
                              >
                                {expanded ? '▾' : '▸'} {sector.setor_nome}
                              </button>
                            </td>
                            <td className="px-3 py-3 text-right">{sector.pessoas}</td>
                            <td className="px-3 py-3 text-right">
                              {sector.requisitos_obrigatorios}
                            </td>
                            <td className="px-3 py-3 text-right font-semibold">
                              {sector.compliance_pct == null ? '—' : `${sector.compliance_pct}%`}
                            </td>
                            <td className="px-3 py-3 text-right font-medium text-emerald-700">
                              {realizedCount(sector.conformes, sector.vencendo)}
                            </td>
                            <td className="px-4 py-3 text-right">
                              <StatusBreakdown
                                emAndamento={sector.em_andamento}
                                vencendo={sector.vencendo}
                                vencidos={sector.vencidos}
                                naoRealizados={sector.nao_realizados}
                                semConfiguracao={sector.pessoas_sem_configuracao}
                              />
                            </td>
                          </tr>,
                        ];
                        if (expanded) {
                          rows.push(
                            ...sector.cargos.map((cargo) => (
                              <tr
                                key={`cargo-${sector.setor_id}-${cargo.funcao_id}`}
                                className="bg-slate-50/70"
                              >
                                <td className="px-4 py-2 pl-9 text-slate-700">
                                  {cargo.funcao_nome}
                                </td>
                                <td className="px-3 py-2 text-right">{cargo.pessoas}</td>
                                <td className="px-3 py-2 text-right">
                                  {cargo.requisitos_obrigatorios}
                                </td>
                                <td className="px-3 py-2 text-right font-medium">
                                  {cargo.compliance_pct == null ? '—' : `${cargo.compliance_pct}%`}
                                </td>
                                <td className="px-3 py-2 text-right font-medium text-emerald-700">
                                  {realizedCount(cargo.conformes, cargo.vencendo)}
                                </td>
                                <td className="px-4 py-2 text-right">
                                  <StatusBreakdown
                                    emAndamento={cargo.em_andamento}
                                    vencendo={cargo.vencendo}
                                    vencidos={cargo.vencidos}
                                    naoRealizados={cargo.nao_realizados}
                                    semConfiguracao={cargo.pessoas_sem_configuracao}
                                  />
                                </td>
                              </tr>
                            )),
                          );
                        }
                        return rows;
                      })}
                    </tbody>
                  </table>
                </div>
              ) : null}

              {tab === 'administracao' ? (
                <div className="space-y-4 p-4">
                  <div className="inline-flex rounded-lg border border-slate-200 bg-slate-50 p-1">
                    <button
                      type="button"
                      onClick={() => setConfigurationMode('organizacao')}
                      className={`rounded-md px-3 py-1.5 text-sm font-medium ${configurationMode === 'organizacao' ? 'bg-white text-primary shadow-sm' : 'text-slate-600'}`}
                    >
                      Por organização
                    </button>
                    <button
                      type="button"
                      onClick={() => setConfigurationMode('treinamento')}
                      className={`rounded-md px-3 py-1.5 text-sm font-medium ${configurationMode === 'treinamento' ? 'bg-white text-primary shadow-sm' : 'text-slate-600'}`}
                    >
                      Por treinamento
                    </button>
                    <button
                      type="button"
                      onClick={() => setConfigurationMode('reconciliacao')}
                      className={`rounded-md px-3 py-1.5 text-sm font-medium ${configurationMode === 'reconciliacao' ? 'bg-white text-primary shadow-sm' : 'text-slate-600'}`}
                    >
                      Matrículas
                    </button>
                    <button
                      type="button"
                      onClick={() => setConfigurationMode('automacao')}
                      className={`rounded-md px-3 py-1.5 text-sm font-medium ${configurationMode === 'automacao' ? 'bg-white text-primary shadow-sm' : 'text-slate-600'}`}
                    >
                      Automação
                    </button>
                  </div>
                  {configurationMode === 'organizacao' ? (
                    <TrainingComplianceOrganizationEditor />
                  ) : configurationMode === 'reconciliacao' ? (
                    <TrainingEnrollmentReconciliation setorId={setorId} funcaoId={funcaoId} />
                  ) : configurationMode === 'automacao' ? (
                    <TrainingComplianceNotificationSettings />
                  ) : (
                    <>
                      <div className="max-w-xl">
                        <label className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                          Treinamento / modelo de qualificação
                        </label>
                        <select
                          value={selectedTipoId ?? ''}
                          onChange={(event) =>
                            setSelectedTipoId(
                              event.target.value ? Number(event.target.value) : null,
                            )
                          }
                          className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm"
                        >
                          <option value="">Selecione um treinamento</option>
                          {tipos.map((tipo) => (
                            <option key={String(tipo.id)} value={String(tipo.id)}>
                              {tipo.nome}
                              {tipo.codigo ? ` (${tipo.codigo})` : ''}
                            </option>
                          ))}
                        </select>
                      </div>
                      {selectedTipoId ? (
                        <TrainingComplianceApplicabilityEditor
                          qualificacaoTipoId={selectedTipoId}
                          title="Regras deste treinamento"
                        />
                      ) : (
                        <div className="rounded-xl border border-dashed border-slate-300 p-6 text-sm text-slate-500">
                          Selecione um treinamento para consultar e editar suas regras de aplicação.
                        </div>
                      )}
                    </>
                  )}
                </div>
              ) : null}
            </div>

          </>
        ) : null}
      </div>
    </AppLayout>
  );
}
