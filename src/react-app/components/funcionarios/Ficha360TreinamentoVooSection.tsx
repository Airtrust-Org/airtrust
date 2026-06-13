import { CheckCircle2, ExternalLink, Gauge, PlaneTakeoff } from 'lucide-react';
import { Link } from 'react-router-dom';

export interface TreinamentoVooPontoAtencaoItem {
  item_id: number | string;
  nome: string;
  tipo: 'MANOBRA' | 'ITEM' | 'SESSAO';
  nota: number;
  observacao: string | null;
  resultado?: string | null;
  tentativa?: number | null;
}

export interface TreinamentoVooPontoAtencaoSessao {
  sessao_id: number | null;
  ficha_id: number | null;
  data: string | null;
  tipo_sessao: 'SIMULADOR' | 'AERONAVE' | null;
  recurso_nome: string | null;
  modelo_sessao: string | null;
  instrutor_nome: string | null;
  nota_geral: number | null;
  status: string | null;
  url_ficha: string | null;
  itens_abaixo_padrao: TreinamentoVooPontoAtencaoItem[];
}

export interface TreinamentoVooPontosAtencaoData {
  threshold: number;
  total_itens: number;
  total_sessoes: number;
  ultima_ocorrencia: string | null;
  pendentes_acompanhamento?: number | null;
  sessoes: TreinamentoVooPontoAtencaoSessao[];
}

interface Ficha360TreinamentoVooSectionProps {
  data: TreinamentoVooPontosAtencaoData | null | undefined;
}

function formatarData(valor: string | null | undefined): string {
  if (!valor) return '-';

  const iso = String(valor).match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (iso) {
    return `${iso[3]}/${iso[2]}/${iso[1]}`;
  }

  const data = new Date(valor);
  if (Number.isNaN(data.getTime())) return '-';
  return data.toLocaleDateString('pt-BR');
}

function formatarNota(valor: number | null | undefined): string {
  if (valor === null || valor === undefined || Number.isNaN(valor)) return '-';
  return Number.isInteger(valor) ? String(valor) : valor.toFixed(1);
}

function getTipoLabel(tipo: TreinamentoVooPontoAtencaoItem['tipo']): string {
  if (tipo === 'SESSAO') return 'Sessão';
  if (tipo === 'ITEM') return 'Item';
  return 'Manobra';
}

function getStatusBadgeClass(status: string | null | undefined): string {
  const normalized = String(status || '').trim().toUpperCase();
  if (normalized.includes('APROVADO')) return 'bg-emerald-100 text-emerald-700';
  if (normalized.includes('PENDENTE') || normalized.includes('AGUARDANDO')) {
    return 'bg-amber-100 text-amber-800';
  }
  if (normalized.includes('REPROVADO') || normalized.includes('NAO_APROVADO')) {
    return 'bg-rose-100 text-rose-700';
  }
  return 'bg-slate-100 text-slate-600';
}

export default function Ficha360TreinamentoVooSection({
  data,
}: Ficha360TreinamentoVooSectionProps) {
  if (!data) return null;

  const showPendenteCard = typeof data.pendentes_acompanhamento === 'number';

  return (
    <section className="space-y-4 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
      <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
        <div>
          <h3 className="text-base font-semibold text-slate-900">
            Pontos de Atenção em Treinamento de Voo
          </h3>
          <p className="mt-1 text-sm text-slate-600">
            Itens abaixo do padrão mínimo definido para acompanhamento técnico.
          </p>
        </div>
        <span className="inline-flex items-center gap-2 rounded-full bg-amber-50 px-3 py-1 text-xs font-semibold text-amber-800">
          <Gauge className="h-3.5 w-3.5" />
          Threshold {formatarNota(data.threshold)}
        </span>
      </div>

      {data.sessoes.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-emerald-200 bg-emerald-50/60 px-5 py-8 text-center">
          <CheckCircle2 className="mx-auto h-8 w-8 text-emerald-600" />
          <p className="mt-3 text-sm font-medium text-emerald-900">
            Nenhum ponto de atenção registrado em Treinamento de Voo.
          </p>
        </div>
      ) : (
        <>
          <div
            className={`grid gap-3 ${
              showPendenteCard ? 'md:grid-cols-2 xl:grid-cols-4' : 'md:grid-cols-3'
            }`}
          >
            <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                Total de pontos
              </p>
              <p className="mt-2 text-2xl font-semibold text-slate-900">{data.total_itens}</p>
            </div>
            <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                Sessões afetadas
              </p>
              <p className="mt-2 text-2xl font-semibold text-slate-900">{data.total_sessoes}</p>
            </div>
            <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                Última ocorrência
              </p>
              <p className="mt-2 text-lg font-semibold text-slate-900">
                {formatarData(data.ultima_ocorrencia)}
              </p>
            </div>
            {showPendenteCard && (
              <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                  Pendentes
                </p>
                <p className="mt-2 text-2xl font-semibold text-slate-900">
                  {data.pendentes_acompanhamento}
                </p>
              </div>
            )}
          </div>

          <div className="space-y-4">
            {data.sessoes.map((sessao) => (
              <article
                key={sessao.ficha_id ?? `${sessao.sessao_id}-${sessao.data}`}
                className="rounded-2xl border border-slate-200 bg-slate-50/70"
              >
                <div className="flex flex-col gap-4 px-5 py-4 lg:flex-row lg:items-start lg:justify-between">
                  <div className="space-y-3">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="inline-flex items-center gap-1 rounded-full bg-sky-100 px-2.5 py-1 text-xs font-semibold text-sky-700">
                        <PlaneTakeoff className="h-3.5 w-3.5" />
                        {sessao.tipo_sessao ?? 'Treinamento'}
                      </span>
                      {sessao.status && (
                        <span
                          className={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ${getStatusBadgeClass(
                            sessao.status,
                          )}`}
                        >
                          {sessao.status}
                        </span>
                      )}
                    </div>

                    <div className="grid gap-3 text-sm text-slate-700 md:grid-cols-2 xl:grid-cols-4">
                      <div>
                        <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                          Data
                        </p>
                        <p className="mt-1 font-medium text-slate-900">
                          {formatarData(sessao.data)}
                        </p>
                      </div>
                      <div>
                        <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                          Recurso
                        </p>
                        <p className="mt-1 font-medium text-slate-900">
                          {sessao.recurso_nome ?? '-'}
                        </p>
                      </div>
                      <div>
                        <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                          Modelo de sessão
                        </p>
                        <p className="mt-1 font-medium text-slate-900">
                          {sessao.modelo_sessao ?? '-'}
                        </p>
                      </div>
                      <div>
                        <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                          Instrutor
                        </p>
                        <p className="mt-1 font-medium text-slate-900">
                          {sessao.instrutor_nome ?? '-'}
                        </p>
                      </div>
                    </div>
                  </div>

                  <div className="flex flex-col items-start gap-3 lg:items-end">
                    <div className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2">
                      <p className="text-[11px] font-semibold uppercase tracking-wide text-rose-600">
                        Nota geral
                      </p>
                      <p className="mt-1 text-lg font-semibold text-rose-700">
                        {formatarNota(sessao.nota_geral)}
                      </p>
                    </div>
                    {sessao.url_ficha && (
                      <Link
                        to={sessao.url_ficha}
                        className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
                      >
                        Abrir ficha
                        <ExternalLink className="h-3.5 w-3.5" />
                      </Link>
                    )}
                  </div>
                </div>

                <div className="border-t border-slate-200 px-5 py-4">
                  <div className="space-y-3">
                    {sessao.itens_abaixo_padrao.map((item) => (
                      <div
                        key={item.item_id}
                        className="rounded-xl border border-rose-200 bg-white px-4 py-3"
                      >
                        <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                          <div>
                            <div className="flex flex-wrap items-center gap-2">
                              <span className="inline-flex rounded-full bg-rose-100 px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide text-rose-700">
                                {getTipoLabel(item.tipo)}
                              </span>
                              <p className="text-sm font-semibold text-slate-900">{item.nome}</p>
                            </div>

                            {(item.observacao || item.resultado || item.tentativa) && (
                              <div className="mt-2 space-y-1 text-sm text-slate-600">
                                {item.observacao && <p>Observação: {item.observacao}</p>}
                                {item.resultado && item.tipo !== 'SESSAO' && (
                                  <p>Resultado: {item.resultado}</p>
                                )}
                                {typeof item.tentativa === 'number' && (
                                  <p>Tentativa: {item.tentativa}</p>
                                )}
                              </div>
                            )}
                          </div>

                          <span className="inline-flex rounded-full bg-rose-100 px-3 py-1 text-sm font-semibold text-rose-700">
                            Nota {formatarNota(item.nota)}
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </article>
            ))}
          </div>
        </>
      )}
    </section>
  );
}
