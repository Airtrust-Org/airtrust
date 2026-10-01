import { useQuery } from '@tanstack/react-query';
import { X } from 'lucide-react';
import { fetchWithAuth } from '@/react-app/config/api';

export type RequirementComplianceStatus =
  | 'CONFORME'
  | 'VENCENDO'
  | 'VENCIDO'
  | 'NAO_REALIZADO'
  | 'EM_ANDAMENTO';

export type RequirementDrilldownFilters = {
  setor_id?: number | null;
  funcao_id?: number | null;
  funcionario_id?: number | null;
  qualificacao_tipo_id?: number | null;
  status?: RequirementComplianceStatus | null;
  q?: string | null;
};

type RequirementRow = {
  qualificacao_tipo_id: number;
  qualificacao_tipo_nome: string | null;
  qualificacao_tipo_codigo: string | null;
  pessoas: number;
  obrigacoes_individuais: number;
  conformes: number;
  vencendo: number;
  vencidos: number;
  nao_realizados: number;
  em_andamento: number;
  origens: string[];
  referencias_normativas: string[];
  escopos: string[];
  modalidades: string[];
  perfis_competencia: string[];
  aeronaves_modelos: string[];
  condicoes: string[];
};

type RequirementResponse = {
  data: RequirementRow[];
  meta: {
    pessoas: number;
    requisitos_distintos: number;
    obrigacoes_individuais: number;
  };
};

async function readJson(response: Response): Promise<RequirementResponse> {
  const json = (await response.json().catch(() => ({}))) as {
    success?: boolean;
    data?: RequirementRow[];
    meta?: RequirementResponse['meta'];
    error?: string;
  };
  if (!response.ok || json.success === false) {
    throw new Error(json.error || 'Erro ao carregar requisitos de compliance');
  }
  return { data: json.data || [], meta: json.meta! };
}
function buildQuery(filters: RequirementDrilldownFilters) {
  const params = new URLSearchParams();
  if (filters.setor_id) params.set('setor_id', String(filters.setor_id));
  if (filters.funcao_id) params.set('funcao_id', String(filters.funcao_id));
  if (filters.funcionario_id) params.set('funcionario_id', String(filters.funcionario_id));
  if (filters.qualificacao_tipo_id) {
    params.set('qualificacao_tipo_id', String(filters.qualificacao_tipo_id));
  }
  if (filters.status) params.set('status', filters.status);
  if (filters.q?.trim()) params.set('q', filters.q.trim());
  const query = params.toString();
  return `/api/compliance-treinamentos/requisitos-aplicaveis${query ? `?${query}` : ''}`;
}

function statusPills(row: RequirementRow) {
  return [
    ['Realizados', row.conformes, 'bg-emerald-50 text-emerald-700'],
    ['Em andamento', row.em_andamento, 'bg-blue-50 text-blue-700'],
    ['Vencendo', row.vencendo, 'bg-amber-50 text-amber-700'],
    ['Vencidos', row.vencidos, 'bg-red-50 text-red-700'],
    ['Nunca fez', row.nao_realizados, 'bg-orange-50 text-orange-700'],
  ] as const;
}

export function TrainingComplianceRequirementDrilldown({
  title,
  filters,
  onClose,
}: {
  title: string;
  filters: RequirementDrilldownFilters;
  onClose: () => void;
}) {
  const queryUrl = buildQuery(filters);
  const query = useQuery({
    queryKey: ['training-compliance', 'requirement-drilldown', queryUrl],
    queryFn: async () => readJson(await fetchWithAuth(queryUrl)),
  });

  return (
    <div className="fixed inset-0 z-[100] flex justify-end bg-slate-950/35">
      <button
        type="button"
        aria-label="Fechar detalhamento"
        className="absolute inset-0 cursor-default"
        onClick={onClose}
      />
      <section
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className="relative z-10 flex h-full w-full max-w-3xl flex-col bg-white shadow-2xl"
      >
        <header className="border-b border-slate-200 px-5 py-4">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-primary">
                Detalhamento do número
              </p>
              <h2 className="mt-1 text-lg font-semibold text-slate-950">{title}</h2>
              <p className="mt-1 text-xs leading-5 text-slate-500">
                Requisito = treinamento distinto. Obrigação individual = uma pessoa × um requisito
                aplicável. O mesmo treinamento não é multiplicado para contar requisitos do cargo.
              </p>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg border border-slate-200 p-2 text-slate-500 hover:bg-slate-50"
              aria-label="Fechar"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </header>

        <div className="border-b border-slate-100 bg-slate-50 px-5 py-3">
          <div className="grid grid-cols-3 gap-3">
            <div>
              <div className="text-2xl font-bold tabular-nums text-slate-950">
                {query.data?.meta.requisitos_distintos ?? '—'}
              </div>
              <div className="text-xs text-slate-500">requisitos distintos</div>
            </div>
            <div>
              <div className="text-2xl font-bold tabular-nums text-slate-950">
                {query.data?.meta.pessoas ?? '—'}
              </div>
              <div className="text-xs text-slate-500">pessoas no escopo</div>
            </div>
            <div>
              <div className="text-2xl font-bold tabular-nums text-slate-950">
                {query.data?.meta.obrigacoes_individuais ?? '—'}
              </div>
              <div className="text-xs text-slate-500">obrigações individuais</div>
            </div>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-5">
          {query.isLoading ? (
            <div className="rounded-xl border border-slate-200 p-5 text-sm text-slate-500">
              Carregando requisitos...
            </div>
          ) : query.isError ? (
            <div className="rounded-xl border border-red-200 bg-red-50 p-5 text-sm text-red-800">
              {query.error instanceof Error ? query.error.message : 'Erro ao carregar requisitos.'}
            </div>
          ) : (query.data?.data.length || 0) === 0 ? (
            <div className="rounded-xl border border-dashed border-slate-300 p-6 text-sm text-slate-500">
              Nenhum requisito obrigatório encontrado para este recorte.
            </div>
          ) : (
            <div className="space-y-3">
              {query.data?.data.map((row) => (
                <article
                  key={row.qualificacao_tipo_id}
                  className="rounded-xl border border-slate-200 p-4 shadow-sm"
                >
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0">
                      <h3 className="font-semibold text-slate-950">
                        {row.qualificacao_tipo_nome || 'Treinamento sem nome'}
                      </h3>
                      <p className="mt-0.5 text-xs text-slate-400">
                        {row.qualificacao_tipo_codigo || `ID ${row.qualificacao_tipo_id}`}
                      </p>
                    </div>
                    <div className="text-right">
                      <div className="text-lg font-bold tabular-nums text-slate-950">{row.pessoas}</div>
                      <div className="text-xs text-slate-500">
                        {row.pessoas} pessoa{row.pessoas === 1 ? '' : 's'} ·{' '}
                        {row.obrigacoes_individuais}{' '}
                        {row.obrigacoes_individuais === 1 ? 'obrigação' : 'obrigações'}
                      </div>
                    </div>
                  </div>
                  <div className="mt-3 flex flex-wrap gap-1.5">
                    {statusPills(row)
                      .filter(([, value]) => value > 0)
                      .map(([label, value, className]) => (
                        <span
                          key={label}
                          className={`rounded-full px-2 py-1 text-xs font-medium ${className}`}
                        >
                          {label} {value}
                        </span>
                      ))}
                  </div>
                  {row.referencias_normativas.length > 0 ? (
                    <div className="mt-3 text-xs leading-5 text-slate-600">
                      <strong className="text-slate-700">Base normativa:</strong>{' '}
                      {row.referencias_normativas.join(' · ')}
                    </div>
                  ) : null}
                  <div className="mt-2 flex flex-wrap gap-1.5 text-[11px] text-slate-500">
                    {[...row.escopos.map((v) => `Aplicação: ${v.replace(/_/g, ' ')}`),
                      ...row.origens.map((v) => `Origem: ${v}`),
                      ...row.modalidades.map((v) => `Modalidade: ${v}`),
                      ...row.perfis_competencia.map((v) => `Perfil: ${v}`),
                      ...row.aeronaves_modelos.map((v) => `Aeronave: ${v}`),
                      ...row.condicoes.map((v) => `Condição: ${v}`)].map((value) => (
                      <span key={value} className="rounded bg-slate-100 px-2 py-1">
                        {value}
                      </span>
                    ))}
                  </div>
                </article>
              ))}
            </div>
          )}
        </div>
      </section>
    </div>
  );
}
