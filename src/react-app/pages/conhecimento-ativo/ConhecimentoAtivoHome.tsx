import { useMemo, useState } from 'react';
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
  const [topicoSelecionadoId, setTopicoSelecionadoId] = useState<number | null>(null);

  const data = resumo.data;
  const desafios = data?.desafios ?? [];
  const concluidos = desafios.filter((item) => item.status === 'CONCLUIDO').length;
  const modelos = data?.modelos?.length ? data.modelos : ['AW139', 'SK76'];

  const topicosDoModelo = useMemo(
    () => (mapa.data ?? []).filter((topico) => topico.aeronave_modelo === modeloSelecionado),
    [mapa.data, modeloSelecionado],
  );

  const topicoSelecionado = topicosDoModelo.find(
    (topico) => topico.topico_id === topicoSelecionadoId,
  );

  const pendenteSelecionado = desafios.find(
    (item) =>
      item.aeronave_modelo === modeloSelecionado &&
      item.topico_id === topicoSelecionadoId &&
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
    setTopicoSelecionadoId(null);
  };

  const abrirOuGerar = async () => {
    if (!modeloSelecionado) {
      toast.info('Escolha primeiro o modelo de aeronave.');
      return;
    }
    if (!topicoSelecionado) {
      toast.info('Escolha a área de conhecimento para este desafio.');
      return;
    }
    if (!topicoSelecionado.disponivel_para_desafio) {
      toast.info(
        'Esta área ainda não possui itens suficientes para formar um desafio de 10 questões.',
      );
      return;
    }
    if (pendenteSelecionado) {
      navigate(`/conhecimento-ativo/desafios/${pendenteSelecionado.id}`);
      return;
    }

    try {
      const result = await gerar.mutateAsync({
        aeronaveModelo: modeloSelecionado,
        topicoId: topicoSelecionado.topico_id,
      });
      navigate(`/conhecimento-ativo/desafios/${result.desafio.id}`);
    } catch (error) {
      if (
        error instanceof ConhecimentoAtivoApiError &&
        error.code === 'CONHECIMENTO_ATIVO_CONTEUDO_INSUFICIENTE'
      ) {
        toast.info('Ainda não há conteúdo suficiente para montar 10 questões nesta área.');
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
                    Selecione a aeronave e a área. Cada desafio tem 10 questões e, após cada
                    resposta, a explicação permanece na tela até você avançar.
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
                <h3 className="text-base font-semibold text-slate-900">2. Escolha a área</h3>
                <p className="mt-1 text-sm text-slate-500">
                  Você decide onde quer reforçar conhecimento. O progresso mostra quantas questões
                  diferentes já foram trabalhadas.
                </p>

                {!modeloSelecionado ? (
                  <div className="mt-4 rounded-xl border border-dashed border-slate-300 bg-slate-50 px-4 py-7 text-center text-sm text-slate-500">
                    Selecione AW139 ou S-76 para ver as áreas disponíveis.
                  </div>
                ) : mapa.isLoading ? (
                  <div className="mt-4 grid gap-3 sm:grid-cols-2">
                    {[1, 2, 3, 4].map((item) => (
                      <div key={item} className="h-28 animate-pulse rounded-xl bg-slate-100" />
                    ))}
                  </div>
                ) : topicosDoModelo.length ? (
                  <div className="mt-4 grid gap-3 sm:grid-cols-2">
                    {topicosDoModelo.map((topico) => {
                      const selecionado = topico.topico_id === topicoSelecionadoId;
                      const cobertura = progressoCobertura(topico);
                      return (
                        <button
                          type="button"
                          key={topico.topico_id}
                          onClick={() => setTopicoSelecionadoId(topico.topico_id)}
                          className={`rounded-xl border p-4 text-left transition ${
                            selecionado
                              ? 'border-sky-500 bg-sky-50 ring-2 ring-sky-100'
                              : 'border-slate-200 hover:border-sky-300 hover:bg-sky-50/40'
                          }`}
                        >
                          <div className="flex items-start justify-between gap-3">
                            <div>
                              <h4 className="text-sm font-semibold text-slate-900">
                                {topico.nome}
                              </h4>
                              <p className="mt-1 text-xs text-slate-500">
                                {topico.respondidas}/{topico.questoes} questões trabalhadas
                              </p>
                            </div>
                            <span className="shrink-0 text-xs font-semibold text-slate-500">
                              {cobertura}%
                            </span>
                          </div>
                          <div className="mt-3 h-2 overflow-hidden rounded-full bg-slate-100">
                            <div
                              className="h-full rounded-full bg-sky-600 transition-all"
                              style={{ width: `${cobertura}%` }}
                            />
                          </div>
                          <p className="mt-2 text-xs text-slate-500">
                            {topico.questoes} questões · {topico.desafios_estimados} desafio
                            {topico.desafios_estimados === 1 ? '' : 's'} para percorrer o banco uma
                            vez
                          </p>
                          {!topico.disponivel_para_desafio && (
                            <p className="mt-2 text-xs font-medium text-amber-700">
                              Ainda não há 10 itens distintos para formar um desafio completo.
                            </p>
                          )}
                        </button>
                      );
                    })}
                  </div>
                ) : (
                  <div className="mt-4 rounded-xl border border-dashed border-slate-300 bg-slate-50 px-4 py-7 text-center">
                    <p className="text-sm font-medium text-slate-700">
                      Ainda não há áreas publicadas para {modeloLabel(modeloSelecionado)}.
                    </p>
                    <p className="mt-1 text-xs text-slate-500">
                      O modelo permanece disponível e as áreas aparecerão assim que o banco técnico
                      for publicado.
                    </p>
                  </div>
                )}
              </div>

              <div className="mt-6 rounded-xl bg-slate-50 p-4">
                <p className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-400">
                  Desafio selecionado
                </p>
                <p className="mt-2 text-sm font-semibold text-slate-900">
                  {modeloSelecionado && topicoSelecionado
                    ? `${modeloLabel(modeloSelecionado)} · ${topicoSelecionado.nome}`
                    : 'Escolha aeronave e área'}
                </p>
                <p className="mt-1 text-xs text-slate-500">
                  10 questões · cerca de {data?.estimativaMinutos ?? 8} minutos · explicação após
                  cada resposta
                </p>
                <button
                  type="button"
                  onClick={abrirOuGerar}
                  disabled={
                    gerar.isPending ||
                    !modeloSelecionado ||
                    !topicoSelecionado ||
                    !topicoSelecionado.disponivel_para_desafio
                  }
                  className="mt-4 inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-xl bg-sky-600 px-4 py-3 text-sm font-semibold text-white transition hover:bg-sky-700 disabled:cursor-not-allowed disabled:opacity-50 sm:w-auto"
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
                                {nomeTopico || 'Desafio anterior'} · {statusDesafio(desafio.status)}
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
