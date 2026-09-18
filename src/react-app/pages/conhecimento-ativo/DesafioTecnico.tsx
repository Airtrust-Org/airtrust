import { useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowLeft,
  BookOpenCheck,
  CheckCircle2,
  ChevronRight,
  CircleHelp,
  Lightbulb,
  Loader2,
  RotateCcw,
  ShieldCheck,
  Sparkles,
  XCircle,
} from 'lucide-react';
import { useNavigate, useParams } from 'react-router-dom';
import { toast } from 'sonner';
import AppLayout from '@/react-app/components/AppLayout';
import {
  useConhecimentoAtivoDesafio,
  useIniciarDesafioConhecimento,
  useResponderConhecimento,
  type ConhecimentoConfianca,
  type ConhecimentoFeedback,
} from '@/react-app/hooks/useConhecimentoAtivo';

const confiancas: Array<{
  value: ConhecimentoConfianca;
  label: string;
  description: string;
}> = [
  { value: 'SABIA', label: 'Eu sabia', description: 'Estava seguro da resposta.' },
  { value: 'DUVIDA', label: 'Fiquei em dúvida', description: 'Tinha conhecimento parcial.' },
  { value: 'CHUTEI', label: 'Chutei', description: 'Não lembrava com segurança.' },
];

export default function DesafioTecnico() {
  const navigate = useNavigate();
  const params = useParams<{ id: string }>();
  const desafioId = Number(params.id || 0);
  const desafioQuery = useConhecimentoAtivoDesafio(desafioId);
  const iniciar = useIniciarDesafioConhecimento(desafioId);
  const responder = useResponderConhecimento(desafioId);
  const [alternativaId, setAlternativaId] = useState<number | null>(null);
  const [confianca, setConfianca] = useState<ConhecimentoConfianca | null>(null);
  const [feedback, setFeedback] = useState<ConhecimentoFeedback | null>(null);
  const [estudando, setEstudando] = useState(false);
  const startedAtRef = useRef(Date.now());
  const iniciarDisparadoRef = useRef(false);

  const desafio = desafioQuery.data;
  const questaoAtual = useMemo(
    () => desafio?.questoes.find((questao) => !questao.resposta) ?? null,
    [desafio],
  );

  useEffect(() => {
    if (
      desafio?.status === 'DISPONIVEL' &&
      !iniciarDisparadoRef.current &&
      !iniciar.isPending
    ) {
      iniciarDisparadoRef.current = true;
      iniciar.mutate();
    }
  }, [desafio?.status, iniciar]);

  useEffect(() => {
    if (questaoAtual?.id) {
      setAlternativaId(null);
      setConfianca(null);
      setFeedback(null);
      setEstudando(false);
      startedAtRef.current = Date.now();
    }
  }, [questaoAtual?.id]);

  const enviarResposta = async () => {
    if (!questaoAtual || !alternativaId || !confianca) return;
    try {
      const result = await responder.mutateAsync({
        desafioQuestaoId: questaoAtual.id,
        alternativaId,
        confianca,
        tempoRespostaMs: Date.now() - startedAtRef.current,
      });
      setFeedback(result);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Não foi possível registrar a resposta.');
    }
  };

  const proximaQuestao = async () => {
    await desafioQuery.refetch();
    setFeedback(null);
    setAlternativaId(null);
    setConfianca(null);
    setEstudando(false);
    startedAtRef.current = Date.now();
  };

  if (!Number.isInteger(desafioId) || desafioId <= 0) {
    return (
      <AppLayout>
        <div className="p-6 text-center text-sm text-slate-600">Desafio inválido.</div>
      </AppLayout>
    );
  }

  if (desafioQuery.isLoading) {
    return (
      <AppLayout>
        <div className="flex min-h-[60vh] items-center justify-center">
          <Loader2 className="h-8 w-8 animate-spin text-sky-600" />
        </div>
      </AppLayout>
    );
  }

  if (!desafio) {
    return (
      <AppLayout>
        <div className="mx-auto max-w-xl p-6 text-center">
          <CircleHelp className="mx-auto h-10 w-10 text-slate-300" />
          <p className="mt-3 text-sm text-slate-600">Não foi possível abrir este desafio.</p>
          <button
            type="button"
            onClick={() => navigate('/conhecimento-ativo')}
            className="mt-4 rounded-xl bg-sky-600 px-4 py-2 text-sm font-semibold text-white"
          >
            Voltar ao Conhecimento Ativo
          </button>
        </div>
      </AppLayout>
    );
  }

  if (!questaoAtual || desafio.status === 'CONCLUIDO') {
    return (
      <AppLayout>
        <div className="min-h-screen bg-slate-50 px-4 py-6 sm:px-6 sm:py-10">
          <div className="mx-auto max-w-2xl">
            <section className="rounded-3xl border border-emerald-200 bg-white p-6 text-center shadow-sm sm:p-8">
              <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-emerald-100 text-emerald-700">
                <CheckCircle2 className="h-9 w-9" />
              </div>
              <p className="mt-5 text-xs font-semibold uppercase tracking-[0.18em] text-emerald-700">
                Missão cumprida
              </p>
              <h1 className="mt-2 text-2xl font-bold text-slate-900">Desafio Técnico concluído</h1>
              <p className="mt-2 text-sm leading-relaxed text-slate-600">
                Você revisou {desafio.total_questoes} conceitos do {desafio.aeronave_modelo}.
                O sistema usará suas respostas e sua confiança para escolher as próximas revisões.
              </p>
              <div className="mt-6 rounded-2xl bg-slate-50 p-4 text-left">
                <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-400">
                  Assuntos revisados
                </p>
                <div className="mt-3 flex flex-wrap gap-2">
                  {[...new Set(desafio.questoes.map((questao) => questao.topico))].map((topico) => (
                    <span
                      key={topico}
                      className="rounded-full border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-700"
                    >
                      {topico}
                    </span>
                  ))}
                </div>
              </div>
              <button
                type="button"
                onClick={() => navigate('/conhecimento-ativo')}
                className="mt-6 inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-sky-600 px-5 py-3 text-sm font-semibold text-white hover:bg-sky-700"
              >
                Ver meu conhecimento
                <ChevronRight className="h-4 w-4" />
              </button>
            </section>
          </div>
        </div>
      </AppLayout>
    );
  }

  const progress = Math.round((desafio.respondidas / Math.max(1, desafio.total_questoes)) * 100);

  return (
    <AppLayout>
      <div className="min-h-screen bg-slate-50">
        <div className="mx-auto w-full max-w-3xl px-4 py-5 sm:px-6 sm:py-8">
          <div className="mb-5 flex items-center justify-between gap-3">
            <button
              type="button"
              onClick={() => navigate('/conhecimento-ativo')}
              className="inline-flex items-center gap-2 text-sm font-medium text-slate-600 hover:text-slate-900"
            >
              <ArrowLeft className="h-4 w-4" />
              Conhecimento Ativo
            </button>
            <span className="text-xs font-semibold text-slate-500">
              {desafio.aeronave_modelo} · Desafio {desafio.numero_desafio}
            </span>
          </div>

          <div className="mb-4">
            <div className="flex items-center justify-between text-xs font-medium text-slate-500">
              <span>
                Questão {Math.min(desafio.respondidas + 1, desafio.total_questoes)} de {desafio.total_questoes}
              </span>
              <span>{progress}% revisado</span>
            </div>
            <div className="mt-2 h-2 overflow-hidden rounded-full bg-slate-200">
              <div
                className="h-full rounded-full bg-sky-600 transition-all"
                style={{ width: `${progress}%` }}
              />
            </div>
          </div>

          <article className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm">
            <div className="border-b border-slate-100 px-5 py-4 sm:px-7">
              <div className="flex flex-wrap items-center gap-2">
                <span className="rounded-full bg-sky-100 px-2.5 py-1 text-xs font-semibold text-sky-700">
                  {questaoAtual.topico}
                </span>
                {questaoAtual.criticidade === 'CRITICA' || questaoAtual.criticidade === 'ALTA' ? (
                  <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 px-2.5 py-1 text-xs font-medium text-amber-700">
                    <ShieldCheck className="h-3.5 w-3.5" />
                    Conhecimento essencial
                  </span>
                ) : null}
              </div>
            </div>

            <div className="p-5 sm:p-7">
              <h1 className="text-lg font-semibold leading-relaxed text-slate-900 sm:text-xl">
                {questaoAtual.enunciado}
              </h1>

              <div className="mt-6 space-y-2.5">
                {questaoAtual.alternativas.map((alternativa) => {
                  const selected = alternativaId === alternativa.id;
                  const correctAfterFeedback =
                    feedback && alternativa.id === feedback.alternativaCorretaId;
                  const wrongSelectedAfterFeedback =
                    feedback && selected && !feedback.correta;
                  return (
                    <button
                      key={alternativa.id}
                      type="button"
                      disabled={Boolean(feedback)}
                      onClick={() => setAlternativaId(alternativa.id)}
                      className={[
                        'flex min-h-12 w-full items-start gap-3 rounded-xl border px-4 py-3 text-left text-sm transition',
                        correctAfterFeedback
                          ? 'border-emerald-300 bg-emerald-50 text-emerald-900'
                          : wrongSelectedAfterFeedback
                            ? 'border-rose-300 bg-rose-50 text-rose-900'
                            : selected
                              ? 'border-sky-400 bg-sky-50 text-sky-950'
                              : 'border-slate-200 bg-white text-slate-700 hover:border-sky-300 hover:bg-sky-50/40',
                      ].join(' ')}
                    >
                      <span
                        className={[
                          'mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full border text-[10px] font-bold',
                          selected ? 'border-sky-500 bg-sky-600 text-white' : 'border-slate-300 text-slate-400',
                        ].join(' ')}
                      >
                        {String.fromCharCode(65 + alternativa.ordem - 1)}
                      </span>
                      <span className="leading-relaxed">{alternativa.texto}</span>
                    </button>
                  );
                })}
              </div>

              {!feedback && alternativaId && (
                <div className="mt-7 rounded-2xl border border-indigo-100 bg-indigo-50/60 p-4">
                  <p className="text-sm font-semibold text-slate-900">Antes de ver a resposta: como você estava?</p>
                  <p className="mt-1 text-xs text-slate-500">
                    Isso ajuda o sistema a distinguir conhecimento consolidado de acerto por dúvida ou chute.
                  </p>
                  <div className="mt-4 grid gap-2 sm:grid-cols-3">
                    {confiancas.map((item) => (
                      <button
                        key={item.value}
                        type="button"
                        onClick={() => setConfianca(item.value)}
                        className={[
                          'rounded-xl border px-3 py-3 text-left transition',
                          confianca === item.value
                            ? 'border-indigo-400 bg-white shadow-sm'
                            : 'border-indigo-100 bg-white/60 hover:border-indigo-300',
                        ].join(' ')}
                      >
                        <p className="text-sm font-semibold text-slate-800">{item.label}</p>
                        <p className="mt-0.5 text-[11px] leading-relaxed text-slate-500">{item.description}</p>
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {!feedback && (
                <button
                  type="button"
                  disabled={!alternativaId || !confianca || responder.isPending}
                  onClick={enviarResposta}
                  className="mt-5 inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-xl bg-sky-600 px-5 py-3 text-sm font-semibold text-white hover:bg-sky-700 disabled:cursor-not-allowed disabled:opacity-40 sm:w-auto"
                >
                  {responder.isPending ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin" />
                      Registrando…
                    </>
                  ) : (
                    'Responder'
                  )}
                </button>
              )}

              {feedback && (
                <div
                  className={[
                    'mt-7 rounded-2xl border p-5',
                    feedback.correta
                      ? 'border-emerald-200 bg-emerald-50/70'
                      : 'border-amber-200 bg-amber-50/70',
                  ].join(' ')}
                >
                  <div className="flex items-start gap-3">
                    {feedback.correta ? (
                      <CheckCircle2 className="mt-0.5 h-6 w-6 shrink-0 text-emerald-600" />
                    ) : (
                      <XCircle className="mt-0.5 h-6 w-6 shrink-0 text-amber-600" />
                    )}
                    <div>
                      <h2 className="font-semibold text-slate-900">
                        {feedback.correta ? 'Isso mesmo.' : 'Veja o que vale guardar.'}
                      </h2>
                      {feedback.oQueGuardar && (
                        <p className="mt-2 text-sm font-medium leading-relaxed text-slate-800">
                          {feedback.oQueGuardar}
                        </p>
                      )}
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={() => setEstudando((current) => !current)}
                    className="mt-4 inline-flex min-h-10 items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 hover:border-sky-300 hover:text-sky-700"
                  >
                    <Lightbulb className="h-4 w-4" />
                    {estudando ? 'Fechar explicação' : 'Quero estudar este assunto'}
                  </button>

                  {estudando && (
                    <div className="mt-4 rounded-xl border border-white bg-white/80 p-4">
                      <div className="flex items-center gap-2 text-sm font-semibold text-slate-900">
                        <BookOpenCheck className="h-4 w-4 text-sky-600" />
                        Por quê?
                      </div>
                      <p className="mt-2 whitespace-pre-line text-sm leading-relaxed text-slate-700">
                        {feedback.explicacao}
                      </p>

                      {feedback.fontes.length > 0 && (
                        <div className="mt-5 border-t border-slate-100 pt-4">
                          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-400">
                            Fonte técnica
                          </p>
                          <div className="mt-2 space-y-2">
                            {feedback.fontes.map((fonte, index) => (
                              <div key={fonte.titulo + fonte.revisao + index} className="text-xs leading-relaxed text-slate-600">
                                <span className="font-semibold text-slate-800">
                                  {fonte.tipoDocumento} · {fonte.titulo}
                                </span>
                                <span> · Rev. {fonte.revisao}</span>
                                {fonte.secao ? <span> · Seção {fonte.secao}</span> : null}
                                {fonte.pagina ? <span> · pág. {fonte.pagina}</span> : null}
                                {fonte.referencia ? <p className="mt-0.5 text-slate-500">{fonte.referencia}</p> : null}
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  )}

                  <button
                    type="button"
                    onClick={proximaQuestao}
                    className="mt-5 inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-xl bg-slate-900 px-5 py-3 text-sm font-semibold text-white hover:bg-slate-800 sm:w-auto"
                  >
                    {feedback.conclusao.concluido ? 'Concluir desafio' : 'Próxima questão'}
                    <ChevronRight className="h-4 w-4" />
                  </button>
                </div>
              )}
            </div>
          </article>

          <div className="mt-4 flex items-center justify-center gap-2 text-xs text-slate-400">
            <RotateCcw className="h-3.5 w-3.5" />
            As próximas revisões são escolhidas pelo que você demonstrou lembrar.
          </div>
        </div>
      </div>
    </AppLayout>
  );
}
