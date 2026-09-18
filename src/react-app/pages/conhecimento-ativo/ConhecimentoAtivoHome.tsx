import {
  ArrowLeft,
  BrainCircuit,
  CheckCircle2,
  ChevronRight,
  Circle,
  Clock3,
  RefreshCw,
  Sparkles,
  Target,
  Trophy,
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import AppLayout from '@/react-app/components/AppLayout';
import {
  ConhecimentoAtivoApiError,
  useConhecimentoAtivoMapa,
  useConhecimentoAtivoResumo,
  useGerarDesafioConhecimento,
  type ConhecimentoMapaTopico,
} from '@/react-app/hooks/useConhecimentoAtivo';

function progressoTopico(topico: ConhecimentoMapaTopico): number {
  const total = Number(topico.itens || 0);
  const consolidados = Number(topico.consolidados || 0);
  if (!total) return 0;
  return Math.round((consolidados / total) * 100);
}

function statusDesafio(status: string) {
  if (status === 'CONCLUIDO') return 'Concluído';
  if (status === 'EM_ANDAMENTO') return 'Em andamento';
  if (status === 'EXPIRADO') return 'Encerrado';
  return 'Disponível';
}

export default function ConhecimentoAtivoHome() {
  const navigate = useNavigate();
  const resumo = useConhecimentoAtivoResumo();
  const mapa = useConhecimentoAtivoMapa();
  const gerar = useGerarDesafioConhecimento();

  const data = resumo.data;
  const desafios = data?.desafios ?? [];
  const concluidos = desafios.filter((item) => item.status === 'CONCLUIDO').length;
  const pendente = desafios.find(
    (item) => item.status === 'DISPONIVEL' || item.status === 'EM_ANDAMENTO',
  );
  const modelo = pendente?.aeronave_modelo || data?.modelos?.[0] || null;

  const abrirOuGerar = async () => {
    if (pendente) {
      navigate(`/conhecimento-ativo/desafios/${pendente.id}`);
      return;
    }
    if (!modelo) {
      toast.info('Nenhuma aeronave ativa foi identificada para o seu perfil.');
      return;
    }
    try {
      const result = await gerar.mutateAsync(modelo);
      navigate(`/conhecimento-ativo/desafios/${result.desafio.id}`);
    } catch (error) {
      if (
        error instanceof ConhecimentoAtivoApiError &&
        error.code === 'CONHECIMENTO_ATIVO_CONTEUDO_INSUFICIENTE'
      ) {
        toast.info('O conteúdo técnico aprovado ainda está sendo preparado para esta aeronave.');
        return;
      }
      toast.error(error instanceof Error ? error.message : 'Não foi possível preparar seu desafio.');
    }
  };

  return (
    <AppLayout>
      <div className="min-h-screen bg-slate-50">
        <div className="mx-auto w-full max-w-6xl px-4 py-5 sm:px-6 sm:py-8">
          <button
            type="button"
            onClick={() => navigate(-1)}
            className="mb-5 inline-flex items-center gap-2 text-sm font-medium text-slate-600 hover:text-slate-900"
          >
            <ArrowLeft className="h-4 w-4" />
            Voltar
          </button>

          <section className="overflow-hidden rounded-3xl border border-sky-200 bg-gradient-to-br from-sky-600 via-sky-700 to-indigo-800 text-white shadow-sm">
            <div className="p-5 sm:p-7">
              <div className="flex flex-col gap-5 sm:flex-row sm:items-start sm:justify-between">
                <div className="max-w-2xl">
                  <div className="inline-flex items-center gap-2 rounded-full bg-white/15 px-3 py-1 text-xs font-semibold">
                    <BrainCircuit className="h-4 w-4" />
                    Conhecimento Ativo
                  </div>
                  <h1 className="mt-4 text-2xl font-bold tracking-tight sm:text-3xl">
                    Conhecimento essencial, sempre presente.
                  </h1>
                  <p className="mt-2 max-w-xl text-sm leading-relaxed text-sky-100 sm:text-base">
                    Desafios curtos para manter sistemas, limitações e procedimentos disponíveis na memória.
                    Aqui, errar faz parte do aprendizado.
                  </p>
                </div>

                <div className="rounded-2xl border border-white/20 bg-white/10 p-4 backdrop-blur-sm">
                  <p className="text-xs font-semibold uppercase tracking-[0.16em] text-sky-100">
                    Nesta quinzena
                  </p>
                  <div className="mt-3 flex items-center gap-2">
                    {[0, 1].map((index) =>
                      index < concluidos ? (
                        <CheckCircle2 key={index} className="h-7 w-7 text-emerald-300" />
                      ) : (
                        <Circle key={index} className="h-7 w-7 text-white/45" />
                      ),
                    )}
                    <span className="ml-2 text-sm font-semibold">{Math.min(concluidos, 2)}/2 desafios</span>
                  </div>
                  <div className="mt-3 flex items-center gap-2 text-xs text-sky-100">
                    <Trophy className="h-4 w-4" />
                    {data?.xp ?? 0} XP de participação
                  </div>
                </div>
              </div>
            </div>
          </section>

          <div className="mt-5 grid gap-4 lg:grid-cols-[1.4fr_0.6fr]">
            <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.16em] text-slate-400">
                    <Sparkles className="h-4 w-4" />
                    Desafio Técnico
                  </div>
                  <h2 className="mt-2 text-xl font-semibold text-slate-900">
                    {pendente
                      ? pendente.status === 'EM_ANDAMENTO'
                        ? 'Continue de onde parou'
                        : 'Seu desafio está pronto'
                      : concluidos >= 2
                        ? 'Quinzena cumprida'
                        : 'Prepare seu próximo desafio'}
                  </h2>
                  <p className="mt-1 text-sm text-slate-500">
                    {modelo ? `${modelo} · cerca de ${data?.estimativaMinutos ?? 4} minutos` : 'Aeronave vinculada ao seu perfil'}
                  </p>
                </div>
                <Clock3 className="h-6 w-6 text-sky-600" />
              </div>

              {resumo.isLoading ? (
                <div className="mt-6 h-12 animate-pulse rounded-xl bg-slate-100" />
              ) : (
                <button
                  type="button"
                  onClick={abrirOuGerar}
                  disabled={gerar.isPending || (!modelo && !pendente)}
                  className="mt-6 inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-xl bg-sky-600 px-4 py-3 text-sm font-semibold text-white transition hover:bg-sky-700 disabled:cursor-not-allowed disabled:opacity-50 sm:w-auto"
                >
                  {gerar.isPending ? (
                    <>
                      <RefreshCw className="h-4 w-4 animate-spin" />
                      Preparando…
                    </>
                  ) : (
                    <>
                      {pendente?.status === 'EM_ANDAMENTO' ? 'Continuar desafio' : concluidos >= 2 ? 'Rever meu conhecimento' : 'Iniciar desafio'}
                      <ChevronRight className="h-4 w-4" />
                    </>
                  )}
                </button>
              )}

              {desafios.length > 0 && (
                <div className="mt-6 grid gap-2 sm:grid-cols-2">
                  {desafios.slice(0, 2).map((desafio) => (
                    <button
                      type="button"
                      key={desafio.id}
                      onClick={() => navigate(`/conhecimento-ativo/desafios/${desafio.id}`)}
                      className="flex items-center justify-between rounded-xl border border-slate-200 px-3 py-3 text-left hover:border-sky-300 hover:bg-sky-50/50"
                    >
                      <div>
                        <p className="text-sm font-semibold text-slate-800">
                          Desafio {desafio.numero_desafio}
                        </p>
                        <p className="mt-0.5 text-xs text-slate-500">{statusDesafio(desafio.status)}</p>
                      </div>
                      {desafio.status === 'CONCLUIDO' ? (
                        <CheckCircle2 className="h-5 w-5 text-emerald-600" />
                      ) : (
                        <ChevronRight className="h-5 w-5 text-slate-300" />
                      )}
                    </button>
                  ))}
                </div>
              )}
            </section>

            <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
              <div className="flex items-center gap-2">
                <Target className="h-5 w-5 text-indigo-600" />
                <h2 className="font-semibold text-slate-900">Meu Conhecimento</h2>
              </div>
              <div className="mt-4 grid grid-cols-2 gap-2">
                {[
                  ['Consolidado', data?.dominio.CONSOLIDADO ?? 0],
                  ['Em reforço', data?.dominio.EM_REFORCO ?? 0],
                  ['Aprendendo', data?.dominio.APRENDENDO ?? 0],
                  ['Novos', data?.dominio.NOVO ?? 0],
                ].map(([label, value]) => (
                  <div key={String(label)} className="rounded-xl bg-slate-50 px-3 py-3">
                    <p className="text-xl font-bold text-slate-900">{value}</p>
                    <p className="mt-0.5 text-xs text-slate-500">{label}</p>
                  </div>
                ))}
              </div>
              <p className="mt-4 text-xs leading-relaxed text-slate-500">
                Não é uma nota. O mapa indica quais conceitos precisam aparecer novamente para permanecerem ativos na memória.
              </p>
            </section>
          </div>

          <section className="mt-5 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-400">
                Mapa de Conhecimento
              </p>
              <h2 className="mt-1 text-lg font-semibold text-slate-900">Como os assuntos estão se consolidando</h2>
            </div>

            {mapa.isLoading ? (
              <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {[1, 2, 3].map((item) => (
                  <div key={item} className="h-24 animate-pulse rounded-xl bg-slate-100" />
                ))}
              </div>
            ) : mapa.data?.length ? (
              <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {mapa.data.map((topico) => {
                  const progresso = progressoTopico(topico);
                  return (
                    <article key={topico.topico_id} className="rounded-xl border border-slate-200 p-4">
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <h3 className="text-sm font-semibold text-slate-900">{topico.nome}</h3>
                          <p className="mt-0.5 text-xs text-slate-500">
                            {topico.aeronave_modelo || 'Conhecimento geral'}
                          </p>
                        </div>
                        <span className="text-xs font-semibold text-slate-500">{progresso}% consolidado</span>
                      </div>
                      <div className="mt-3 h-2 overflow-hidden rounded-full bg-slate-100">
                        <div
                          className="h-full rounded-full bg-sky-600 transition-all"
                          style={{ width: `${progresso}%` }}
                        />
                      </div>
                      <p className="mt-2 text-xs text-slate-500">
                        {Number(topico.em_reforco || 0)} em reforço · {Number(topico.aprendendo || 0)} aprendendo
                      </p>
                    </article>
                  );
                })}
              </div>
            ) : (
              <div className="mt-5 rounded-xl border border-dashed border-slate-300 bg-slate-50 px-4 py-8 text-center">
                <BrainCircuit className="mx-auto h-8 w-8 text-slate-300" />
                <p className="mt-3 text-sm font-medium text-slate-700">Seu mapa será construído com os desafios.</p>
                <p className="mt-1 text-xs text-slate-500">
                  Os assuntos aparecem aqui conforme o conteúdo técnico aprovado for disponibilizado.
                </p>
              </div>
            )}
          </section>
        </div>
      </div>
    </AppLayout>
  );
}
