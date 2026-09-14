import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
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
import { fetchWithAuth } from '@/react-app/config/api';
import { useQualificacaoTipos } from '@/react-app/hooks/useQualificacoesExt';

type Summary = {
  pessoas: number;
  pessoas_sem_configuracao: number;
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

function Kpi({
  label,
  value,
  icon: Icon,
  helper,
}: {
  label: string;
  value: string | number;
  icon: typeof ShieldCheck;
  helper?: string;
}) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{label}</p>
          <p className="mt-1 text-2xl font-bold text-slate-900">{value}</p>
          {helper ? <p className="mt-1 text-xs text-slate-500">{helper}</p> : null}
        </div>
        <div className="rounded-xl bg-slate-100 p-2 text-slate-600">
          <Icon className="h-5 w-5" />
        </div>
      </div>
    </div>
  );
}

export default function ComplianceTreinamentosPage() {
  const [setorId, setSetorId] = useState<number | null>(null);
  const [funcaoId, setFuncaoId] = useState<number | null>(null);
  const [tab, setTab] = useState<'treinamentos' | 'pessoas' | 'configuracao'>('treinamentos');
  const [selectedTipoId, setSelectedTipoId] = useState<number | null>(null);
  const { tipos } = useQualificacaoTipos(true, 500);

  const capabilities = useQuery({
    queryKey: ['training-compliance', 'capabilities'],
    queryFn: async () =>
      readJson<{ schema_ready: boolean }>(
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
    queryKey: ['training-compliance', 'people', setorId, funcaoId],
    enabled: schemaReady && tab === 'pessoas',
    queryFn: async () =>
      readJson<Person[]>(await fetchWithAuth(`/api/compliance-treinamentos/pessoas${filter}`)),
  });
  const trainings = useQuery({
    queryKey: ['training-compliance', 'trainings', setorId, funcaoId],
    enabled: schemaReady && tab === 'treinamentos',
    queryFn: async () =>
      readJson<Training[]>(
        await fetchWithAuth(`/api/compliance-treinamentos/treinamentos${filter}`),
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
      <div className="mx-auto max-w-[1440px] space-y-5 p-4 sm:p-6">
        <div className="flex flex-col gap-4 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm lg:flex-row lg:items-center lg:justify-between">
          <div>
            <div className="flex items-center gap-2">
              <ShieldCheck className="h-5 w-5 text-primary" />
              <h1 className="text-xl font-semibold text-slate-900">Compliance de Treinamentos</h1>
            </div>
            <p className="mt-1 max-w-3xl text-sm text-slate-500">
              Quem precisa de qual treinamento, por qual regra e qual é a situação atual. Requisitos
              nunca realizados aparecem como gap mesmo sem existir vencimento anterior.
            </p>
          </div>
          <div className="grid min-w-[300px] gap-2 sm:grid-cols-2">
            <select
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
            <select
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
          </div>
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
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-7">
              <Kpi
                label="Compliance"
                value={summary.data?.compliance_pct == null ? '—' : `${summary.data.compliance_pct}%`}
                icon={ShieldCheck}
                helper={`${summary.data?.conformes ?? 0}/${summary.data?.requisitos_obrigatorios ?? 0} requisitos atendidos`}
              />
              <Kpi label="Pessoas" value={summary.data?.pessoas ?? 0} icon={Users} />
              <Kpi
                label="Sem configuração"
                value={summary.data?.pessoas_sem_configuracao ?? 0}
                icon={AlertTriangle}
                helper="sem qualquer regra aplicável"
              />
              <Kpi label="Vencendo" value={summary.data?.vencendo ?? 0} icon={Clock3} />
              <Kpi label="Vencidos" value={summary.data?.vencidos ?? 0} icon={XCircle} />
              <Kpi
                label="Nunca realizados"
                value={summary.data?.nao_realizados ?? 0}
                icon={AlertTriangle}
              />
              <Kpi
                label="Em andamento"
                value={summary.data?.em_andamento ?? 0}
                icon={GraduationCap}
              />
            </div>

            <div className="rounded-2xl border border-slate-200 bg-white shadow-sm">
              <div className="flex flex-wrap gap-2 border-b border-slate-100 p-3">
                {(
                  [
                    ['treinamentos', 'Treinamentos'],
                    ['pessoas', 'Pessoas'],
                    ['configuracao', 'Configuração da matriz'],
                  ] as const
                ).map(([value, label]) => (
                  <button
                    key={value}
                    type="button"
                    onClick={() => setTab(value)}
                    className={`rounded-lg px-3 py-2 text-sm font-medium ${tab === value ? 'bg-primary/10 text-primary' : 'text-slate-600 hover:bg-slate-100'}`}
                  >
                    {label}
                  </button>
                ))}
              </div>

              {tab === 'treinamentos' ? (
                <div className="overflow-x-auto">
                  <table className="min-w-full text-sm">
                    <thead className="bg-slate-50 text-slate-500">
                      <tr>
                        <th className="px-4 py-3 text-left">Treinamento</th>
                        <th className="px-3 py-3 text-right">Pessoas</th>
                        <th className="px-3 py-3 text-right">Compliance</th>
                        <th className="px-3 py-3 text-right">Vencendo</th>
                        <th className="px-3 py-3 text-right">Vencidos</th>
                        <th className="px-3 py-3 text-right">Nunca fez</th>
                        <th className="px-3 py-3 text-right">Em andamento</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {(trainings.data || []).map((item) => (
                        <tr key={item.qualificacao_tipo_id} className="hover:bg-slate-50">
                          <td className="px-4 py-3">
                            <div className="font-medium text-slate-900">
                              {item.qualificacao_tipo_nome}
                            </div>
                            <div className="text-xs text-slate-400">
                              {item.qualificacao_tipo_codigo || '—'}
                            </div>
                          </td>
                          <td className="px-3 py-3 text-right">{item.pessoas}</td>
                          <td className="px-3 py-3 text-right font-semibold">
                            {item.compliance_pct == null ? '—' : `${item.compliance_pct}%`}
                          </td>
                          <td className="px-3 py-3 text-right text-amber-700">{item.vencendo}</td>
                          <td className="px-3 py-3 text-right text-red-700">{item.vencidos}</td>
                          <td className="px-3 py-3 text-right text-orange-700">
                            {item.nao_realizados}
                          </td>
                          <td className="px-3 py-3 text-right text-blue-700">
                            {item.em_andamento}
                          </td>
                        </tr>
                      ))}
                      {!trainings.isLoading && (trainings.data?.length || 0) === 0 ? (
                        <tr>
                          <td colSpan={7} className="px-4 py-8 text-center text-slate-500">
                            Nenhum requisito obrigatório configurado para o filtro atual.
                          </td>
                        </tr>
                      ) : null}
                    </tbody>
                  </table>
                </div>
              ) : null}

              {tab === 'pessoas' ? (
                <div className="overflow-x-auto">
                  <table className="min-w-full text-sm">
                    <thead className="bg-slate-50 text-slate-500">
                      <tr>
                        <th className="px-4 py-3 text-left">Pessoa</th>
                        <th className="px-3 py-3 text-left">Setor</th>
                        <th className="px-3 py-3 text-left">Cargo</th>
                        <th className="px-3 py-3 text-right">Compliance</th>
                        <th className="px-3 py-3 text-right">Pendências</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {(people.data || []).map((item) => {
                        const pending = item.vencidos + item.nao_realizados + item.em_andamento;
                        return (
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
                              {item.setor_nome || 'Sem setor'}
                            </td>
                            <td className="px-3 py-3 text-slate-600">
                              {item.funcao_nome || 'Sem cargo'}
                            </td>
                            <td className="px-3 py-3 text-right font-semibold">
                              {!item.configurado
                                ? 'Sem configuração'
                                : item.total_obrigatorios === 0
                                  ? 'Sem obrigatórios'
                                  : `${item.compliance_pct}%`}
                            </td>
                            <td
                              className={`px-3 py-3 text-right font-semibold ${pending ? 'text-red-700' : item.configurado ? 'text-emerald-700' : 'text-amber-700'}`}
                            >
                              {!item.configurado ? '—' : pending}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              ) : null}

              {tab === 'configuracao' ? (
                <div className="space-y-4 p-4">
                  <div className="max-w-xl">
                    <label className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                      Treinamento / modelo de qualificação
                    </label>
                    <select
                      value={selectedTipoId ?? ''}
                      onChange={(event) =>
                        setSelectedTipoId(event.target.value ? Number(event.target.value) : null)
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
                      title="Aplicabilidade canônica"
                    />
                  ) : (
                    <div className="rounded-xl border border-dashed border-slate-300 p-6 text-sm text-slate-500">
                      Selecione um treinamento para definir empresa, setor e cargo. Alterações
                      feitas aqui aparecem também nos modelos de qualificação e nos cursos EAD vinculados.
                    </div>
                  )}
                </div>
              ) : null}
            </div>

            {(summary.data?.setores?.length || 0) > 1 ? (
              <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
                <h2 className="text-sm font-semibold text-slate-900">Compliance por setor</h2>
                <div className="mt-3 grid gap-2 md:grid-cols-2 xl:grid-cols-4">
                  {(summary.data?.setores || []).map((item) => (
                    <div key={item.setor_id ?? 'none'} className="rounded-xl bg-slate-50 px-3 py-3">
                      <div className="flex items-center justify-between gap-3">
                        <span className="text-sm font-medium text-slate-700">
                          {item.setor_nome}
                        </span>
                        <span className="text-sm font-bold text-slate-900">
                          {item.compliance_pct == null ? '—' : `${item.compliance_pct}%`}
                        </span>
                      </div>
                      <p className="mt-1 text-xs text-slate-500">
                        {item.pessoas} pessoa(s)
                        {item.pessoas_sem_configuracao > 0
                          ? ` · ${item.pessoas_sem_configuracao} sem configuração`
                          : ''}
                      </p>
                    </div>
                  ))}
                </div>
              </div>
            ) : null}
          </>
        ) : null}
      </div>
    </AppLayout>
  );
}
