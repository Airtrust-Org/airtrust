import { useMemo, useState } from 'react';
import {
  ArrowLeft,
  BrainCircuit,
  CheckCircle2,
  ChevronRight,
  Circle,
  Clock3,
  RefreshCw,
  Shuffle,
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

function modeloLabel(modelo: string) {
  return modelo === 'SK76' ? 'S-76' : modelo;
}

function progressoCobertura(topico: ConhecimentoMapaTopico): number {
  const total = Number(topico.questoes || 0);
  const respondidas = Number(topico.respondidas || 0);
  if (!total) return 0;
  return Math.min(100, Math.round((respondidas / total) * 100));
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
  const [modeloSelecionado, setModeloSelecionado] = useState<string | null>(null);
  const [modoSelecionado, setModoSelecionado] = useState<'TOPICO' | 'MISTO' | null>(null);
  const [topicoSelecionadoId, setTopicoSelecionadoId] = useState<number | null>(null);

  const data = resumo.data;
  const desafios = data?.desafios ?? [];
  const concluidos = desafios.filter((item) => item.status === 'CONCLUIDO').length;
  const modelos = data?.modelos?.length ? data.modelos : ['AW139', 'SK76'];

  const topicosDoModelo = useMemo(
    () =>
      (mapa.data ?? [])
        .filter((topico) => topico.aeronave_modelo === modeloSelecionado)
        .sort((a, b) => b.prioridade_revisao - a.prioridade_revisao || a.nome.localeCompare(b.nome)),
    [mapa.data, modeloSelecionado],
  );

  const topicoSelecionado = topicosDoModelo.find(
    (topico) => topico.topico_id === topicoSelecionadoId,
  );
  const itensDoModelo = topicosDoModelo.reduce((sum, topico) => sum + Number(topico.itens || 0), 0);
  const mistoDisponivel = itensDoModelo >= 10;

  const pendenteSelecionado = desafios.find(
    (item) =>
      item.aeronave_modelo === modeloSelecionado &&
      (modoSelecionado === 'MISTO'
        ? item.topico_id == null
        : item.topico_id === topicoSelecionadoId) &&
      (item.status === 'DISPONIVEL' || item.status === 'EM_ANDAMENTO'),
  );

  const totaisPorModelo = useMemo(() => {
    const totals = new Map<string, number>();
    for (const topico of mapa.data ?? []) {
      if (!topico.aeronave_modelo) continue;
      totals.set(
        topico.aeronave_modelo,
        (totals.get(topico.aeronave_modelo) ?? 0) + Number(topico.questoes || 0),
      );
    }
    return totals;
  }, [mapa.data]);

  const selecionarModelo = (modelo: string) => {
    setModeloSelecionado(modelo);
    setModoSelecionado(null);
    setTopicoSelecionadoId(null);
  };

  const abrirOuGerar = async () => {
    if (!modeloSelecionado) {
      toast.info('Escolha primeiro o modelo de aeronave.');
      return;
    }
    if (!modoSelecionado) {
      toast.info('Escolha Revisão inteligente ou uma área específica.');
      return;
    }
    if (modoSelecionado === 'TOPICO' && !topicoSelecionado) {
      toast.info('Escolha a área de conhecimento para este desafio.');
      return;
    }
    if (modoSelecionado === 'TOPICO' && !topicoSelecionado?.disponivel_para_desafio) {
      toast.info(
        'Esta área ainda não possui itens suficientes para formar um desafio de 10 questões.',
      );
      return;
    }
    if (modoSelecionado === 'MISTO' && !mistoDisponivel) {
      toast.info('Ainda não há 10 itens distintos no modelo para formar uma revisão inteligente.');
      return;
    }
    if (pendenteSelecionado) {
      navigate(`/conhecimento-ativo/desafios/${pendenteSelecionado.id}`);
      return;
    }

    try {
      const result = await gerar.mutateAsync({
        aeronaveModelo: modeloSelecionado,
        topicoId: modoSelecionado === 'TOPICO' ? topicoSelecionado?.topico_id ?? null : null,
        modo: modoSelecionado,
      });
      navigate(`/conhecimento-ativo/desafios/${result.desafio.id}`);
    } catch (error) {
      if (
        error instanceof ConhecimentoAtivoApiError &&
        error.code === 'CONHECIMENTO_ATIVO_CONTEUDO_INSUFICIENTE'
      ) {
        toast.info('Ainda não há conteúdo suficiente para montar 10 questões neste recorte.');
        return;
      }
      toast.error(
        error instanceof Error ? error.message : 'Não foi possível preparar seu desafio.',
      );
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
                    Escolha o que você quer reforçar.
                  </h1>
                  <p className="mt-2 max-w-xl text-sm leading-relaxed text-sky-100 sm:text-base">
                    Selecione a aeronave e escolha uma área específica ou a Revisão inteligente,
                    que mistura sistemas e prioriza o que você mais precisa reforçar.
                  </p>
                </div>

                <div className="rounded-2xl border border-white/20 bg-white/10 p-4 backdrop-blur-sm">
                  <p className="text-xs font-semibold uppercase tracking-[0.16em] text-sky-100">
                    Recomendação da quinzena
                  </p>
                  <div className="mt-3 flex items-center gap-2">
                    {[0, 1].map((index) =>
                      index < concluidos ? (
                        <CheckCircle2 key={index} className="h-7 w-7 text-emerald-300" />
                      ) : (
                        <Circle key={index} className="h-7 w-7 text-white/45" />
                      ),
                    )}
                    <span className="ml-2 text-sm font-semibold">
                      {Math.min(concluidos, 2)}/2 desafios
                    </span>
                  </div>
                  <div className="mt-3 flex items-center gap-2 text-xs text-sky-100">
                    <Trophy className="h-4 w-4" />
                    {data?.xp ?? 0} XP de participação
                  </div>
                  <p className="mt-2 max-w-[17rem] text-xs leading-relaxed text-sky-100">
                    Dois é a meta recomendada. Você pode fazer quantos desafios adicionais quiser.
                  </p>
                  {concluidos >= 2 ? (
                    <button
                      type="button"
                      onClick={() =>
                        document
                          .getElementById('novo-desafio')
                          ?.scrollIntoView({ behavior: 'smooth', block: 'start' })
                      }
                      className="mt-3 inline-flex min-h-10 items-center gap-2 rounded-xl bg-white px-3.5 py-2 text-xs font-semibold text-sky-800 shadow-sm transition hover:bg-sky-50"
                    >
                      Fazer desafio extra
                      <ChevronRight className="h-4 w-4" />
                    </button>
                  ) : null}
                </div>
              </div>
            </div>
          </section>

          <div className="mt-5 grid gap-4 lg:grid-cols-[1.4fr_0.6fr]">
            <section
              id="novo-desafio"
              className="scroll-mt-4 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"
            >
              <div className="flex items-start justify-between gap-4">
                <div>
                  <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.16em] text-slate-400">
                    <Sparkles className="h-4 w-4" />
                    Novo desafio
                  </div>
                  <h2 className="mt-2 text-xl font-semibold text-slate-900">
                    1. Escolha a aeronave
                  </h2>
                  <p className="mt-1 text-sm text-slate-500">
                    O banco técnico de cada modelo permanece separado.
                  </p>
                </div>
                <Clock3 className="h-6 w-6 text-sky-600" />
              </div>

              <div className="mt-5 grid gap-3 sm:grid-cols-2">
                {modelos.map((modelo) => {
                  const selecionado = modeloSelecionado === modelo;
                  const totalQuestoes = totaisPorModelo.get(modelo) ?? 0;
                  return (
                    <button
                      type="button"
                      key={modelo}
                      onClick={() => selecionarModelo(modelo)}
                      className={`rounded-xl border px-4 py-4 text-left transition ${
                        selecionado
                          ? 'border-sky-500 bg-sky-50 ring-2 ring-sky-100'
                          : 'border-slate-200 hover:border-sky-300 hover:bg-sky-50/50'
                      }`}
                    >
                      <div className="flex items-center justify-between gap-3">
                        <div>
                          <p className="text-base font-semibold text-slate-900">
                            {modeloLabel(modelo)}
                          </p>
                          <p className="mt-1 text-xs text-slate-500">
                            {mapa.isLoading
                              ? 'Carregando banco…'
                              : totalQuestoes > 0
                                ? `${totalQuestoes} questões disponíveis`
                                : 'Banco ainda sem questões disponíveis'}
                          </p>
                        </div>
                        {selecionado ? (
                          <CheckCircle2 className="h-5 w-5 text-sky-600" />
                        ) : (
                          <Circle className="h-5 w-5 text-slate-300" />
                        )}
                      </div>
                    </button>
                  );
                })}
              </div>

              <div className="mt-6 border-t border-slate-100 pt-5">
                <h3 className="text-base font-semibold text-slate-900">2. Escolha como revisar</h3>
                <p className="mt-1 text-sm text-slate-500">
                  Você pode focar um sistema ou deixar o AirTrust montar uma revisão personalizada
                  entre diferentes sistemas.
                </p>

                {!modeloSelecionado ? (
                  <div className="mt-4 rounded-xl border border-dashed border-slate-300 bg-slate-50 px-4 py-7 text-center text-sm text-slate-500">
                    Selecione AW139 ou S-76 para ver as opções de revisão.
                  </div>
                ) : mapa.isLoading ? (
                  <div className="mt-4 grid gap-3 sm:grid-cols-2">
                    {[1, 2, 3, 4].map((item) => (
                      <div key={item} className="h-28 animate-pulse rounded-xl bg-slate-100" />
                    ))}
                  </div>
                ) : (
                  <>
                    <button
                      type="button"
                      onClick={() => {
                        setModoSelecionado('MISTO');
                        setTopicoSelecionadoId(null);
                      }}
                      disabled={!mistoDisponivel}
                      className={`mt-4 w-full rounded-2xl border p-4 text-left transition ${
                        modoSelecionado === 'MISTO'
                          ? 'border-indigo-500 bg-indigo-50 ring-2 ring-indigo-100'
                          : 'border-indigo-200 bg-gradient-to-r from-indigo-50 to-sky-50 hover:border-indigo-400'
                      } disabled:cursor-not-allowed disabled:opacity-50`}
                    >
                      <div className="flex items-start gap-3">
                        <div className="rounded-xl bg-white p-2 text-indigo-600 shadow-sm">
                          <Shuffle className="h-5 w-5" />
                        </div>
                        <div className="flex-1">
                          <div className="flex flex-wrap items-center gap-2">
                            <h4 className="text-sm font-semibold text-slate-900">
                              Revisão inteligente
                            </h4>
                            <span className="rounded-full bg-indigo-100 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-indigo-700">
                              diversos sistemas
                            </span>
                          </div>
                          <p className="mt-1 text-xs leading-relaxed text-slate-600">
                            Mistura 10 itens entre sistemas e prioriza revisão vencida, baixa
                            retenção, criticidade e conteúdo ainda não trabalhado.
                          </p>
                          <p className="mt-2 text-xs font-medium text-indigo-700">
                            {topicosDoModelo.length} áreas disponíveis · seleção personalizada para
                            você
                          </p>
                        </div>
                        {modoSelecionado === 'MISTO' ? (
                          <CheckCircle2 className="h-5 w-5 text-indigo-600" />
                        ) : null}
                      </div>
                    </button>

                    <div className="mt-4 rounded-xl border border-sky-100 bg-sky-50/60 p-4">
                      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                        <div>
                          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-sky-700">
                            Desafio selecionado
                          </p>
                          <p className="mt-1 text-sm font-semibold text-slate-900">
                            {modeloSelecionado && modoSelecionado === 'MISTO'
                              ? `${modeloLabel(modeloSelecionado)} · Revisão inteligente`
                              : modeloSelecionado && topicoSelecionado
                                ? `${modeloLabel(modeloSelecionado)} · ${topicoSelecionado.nome}`
                                : 'Escolha a forma de revisão'}
                          </p>
                          <p className="mt-1 text-xs text-slate-500">
                            {topicoSelecionado
                              ? `${topicoSelecionado.itens} itens · ${topicoSelecionado.questoes} questões disponíveis`
                              : `10 questões · cerca de ${data?.estimativaMinutos ?? 8} minutos`}
                          </p>
                        </div>
                        <button
                          type="button"
                          onClick={abrirOuGerar}
                          disabled={
                            gerar.isPending ||
                            !modeloSelecionado ||
                            !modoSelecionado ||
                            (modoSelecionado === 'TOPICO' &&
                              !topicoSelecionado?.disponivel_para_desafio) ||
                            (modoSelecionado === 'MISTO' && !mistoDisponivel)
                          }
                          className="inline-flex min-h-11 shrink-0 items-center justify-center gap-2 rounded-xl bg-sky-600 px-4 py-3 text-sm font-semibold text-white transition hover:bg-sky-700 disabled:cursor-not-allowed disabled:opacity-50"
                        >
                          {gerar.isPending ? (
                            <>
                              <RefreshCw className="h-4 w-4 animate-spin" />
                              Preparando…
                            </>
                          ) : (
                            <>
                              {pendenteSelecionado?.status === 'EM_ANDAMENTO'
                                ? 'Continuar este desafio'
                                : pendenteSelecionado
                                  ? 'Abrir este desafio'
                                  : concluidos >= 2
                                    ? 'Fazer desafio extra'
                                    : 'Iniciar desafio'}
                              <ChevronRight className="h-4 w-4" />
                            </>
                          )}
                        </button>
                      </div>
                    </div>

                    {topicosDoModelo.length ? (
                      <div className="mt-4 grid gap-3 sm:grid-cols-2">
                        {topicosDoModelo.map((topico, index) => {
                          const selecionado =
                            modoSelecionado === 'TOPICO' &&
                            topico.topico_id === topicoSelecionadoId;
                          const cobertura = progressoCobertura(topico);
                          return (
                            <button
                              type="button"
                              key={topico.topico_id}
                              onClick={() => {
                                setModoSelecionado('TOPICO');
                                setTopicoSelecionadoId(topico.topico_id);
                              }}
                              className={`rounded-xl border p-3.5 text-left transition ${
                                selecionado
                                  ? 'border-sky-500 bg-sky-50 ring-2 ring-sky-100'
                                  : 'border-slate-200 hover:border-sky-300 hover:bg-sky-50/40'
                              }`}
                            >
                              <div className="flex items-start justify-between gap-3">
                                <div className="min-w-0">
                                  <div className="flex flex-wrap items-center gap-2">
                                    <h4 className="text-sm font-semibold text-slate-900">
                                      {topico.nome}
                                    </h4>
                                    {index === 0 && topico.prioridade_revisao > 0 ? (
                                      <span className="rounded-full bg-amber-50 px-2 py-0.5 text-[10px] font-semibold text-amber-700">
                                        maior prioridade
                                      </span>
                                    ) : null}
                                  </div>
                                  <p className="mt-1 text-xs text-slate-500">
                                    {topico.itens} itens · {topico.questoes} questões
                                  </p>
                                </div>
                                {selecionado ? (
                                  <CheckCircle2 className="h-5 w-5 shrink-0 text-sky-600" />
                                ) : (
                                  <span className="shrink-0 text-xs font-semibold text-slate-500">
                                    {cobertura}%
                                  </span>
                                )}
                              </div>
                              <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-slate-100">
                                <div
                                  className="h-full rounded-full bg-sky-600 transition-all"
                                  style={{ width: `${cobertura}%` }}
                                />
                              </div>
                              <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-slate-500">
                                <span>
                                  {topico.retencao_media == null
                                    ? 'retenção: sem histórico'
                                    : `retenção: ${topico.retencao_media}%`}
                                </span>
                                <span>prioridade: {topico.prioridade_revisao}/100</span>
                                {!topico.disponivel_para_desafio ? (
                                  <span className="font-medium text-amber-700">
                                    conteúdo insuficiente para 10 itens
                                  </span>
                                ) : null}
                              </div>
                            </button>
                          );
                        })}
                      </div>
                    ) : (
                      <div className="mt-4 rounded-xl border border-dashed border-slate-300 bg-slate-50 px-4 py-7 text-center">
                        <p className="text-sm font-medium text-slate-700">
                          Ainda não há áreas publicadas para {modeloLabel(modeloSelecionado)}.
                        </p>
                      </div>
                    )}
                  </>
                )}
              </div>

              {desafios.length > 0 && (
                <div className="mt-6 border-t border-slate-100 pt-5">
                  <p className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-400">
                    Recentes
                  </p>
                  <div className="mt-3 grid gap-2 sm:grid-cols-2">
                    {desafios
                      .slice(-4)
                      .reverse()
                      .map((desafio) => {
                        const nomeTopico = (mapa.data ?? []).find(
                          (topico) => topico.topico_id === desafio.topico_id,
                        )?.nome;
                        return (
                          <button
                            type="button"
                            key={desafio.id}
                            onClick={() => navigate(`/conhecimento-ativo/desafios/${desafio.id}`)}
                            className="flex items-center justify-between rounded-xl border border-slate-200 px-3 py-3 text-left hover:border-sky-300 hover:bg-sky-50/50"
                          >
                            <div>
                              <p className="text-sm font-semibold text-slate-800">
                                {modeloLabel(desafio.aeronave_modelo)} · Desafio{' '}
                                {desafio.numero_desafio}
                              </p>
                              <p className="mt-0.5 text-xs text-slate-500">
                                {nomeTopico ||
                                  (desafio.topico_id == null
                                    ? 'Revisão inteligente'
                                    : 'Área agrupada')}{' '}
                                · {statusDesafio(desafio.status)}
                              </p>
                            </div>
                            {desafio.status === 'CONCLUIDO' ? (
                              <CheckCircle2 className="h-5 w-5 text-emerald-600" />
                            ) : (
                              <ChevronRight className="h-5 w-5 text-slate-300" />
                            )}
                          </button>
                        );
                      })}
                  </div>
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
                Não é uma nota nem uma qualificação. O mapa de retenção ajuda a escolher onde
                revisar mais.
              </p>
            </section>
          </div>
        </div>
      </div>
    </AppLayout>
  );
}
