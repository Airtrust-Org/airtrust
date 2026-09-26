import { BrainCircuit, CheckCircle2, Loader2, Plane, XCircle } from 'lucide-react';
import {
  useDesafioDiarioConhecimento,
  useResponderDesafioDiario,
} from '@/react-app/hooks/useDesafioDiarioConhecimento';

interface DesafioDiarioCardProps {
  enabled?: boolean;
}

export function DesafioDiarioCard({ enabled = true }: DesafioDiarioCardProps) {
  const desafio = useDesafioDiarioConhecimento({ enabled });
  const responder = useResponderDesafioDiario();

  if (!enabled) return null;

  const questao = desafio.data;
  const feedback = responder.data;
  const alternativaEmEnvio = responder.isPending ? responder.variables : null;

  function classeAlternativa(id: number): string {
    const base =
      'w-full rounded-xl border px-3 py-3 text-left text-sm transition-colors disabled:cursor-default';
    if (!feedback) {
      return `${base} border-slate-200 bg-white text-slate-700 hover:border-sky-300 hover:bg-sky-50`;
    }
    if (id === feedback.alternativaCorretaId) {
      return `${base} border-emerald-300 bg-emerald-50 text-emerald-900`;
    }
    if (id === feedback.alternativaId && !feedback.correta) {
      return `${base} border-rose-300 bg-rose-50 text-rose-900`;
    }
    return `${base} border-slate-200 bg-slate-50 text-slate-500`;
  }

  return (
    <section
      data-testid="desafio-diario-conhecimento"
      className="overflow-hidden rounded-2xl border border-sky-200 bg-gradient-to-br from-sky-50 via-white to-cyan-50 shadow-sm"
    >
      <div className="border-b border-sky-100 px-4 py-4 sm:px-5">
        <div className="flex items-start justify-between gap-3">
          <div className="flex min-w-0 items-start gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-sky-600 text-white shadow-sm">
              <BrainCircuit className="h-5 w-5" />
            </div>
            <div className="min-w-0">
              <p className="text-xs font-bold uppercase tracking-[0.18em] text-sky-700">
                Desafio diário
              </p>
              <h2 className="mt-0.5 text-base font-semibold text-slate-900 sm:text-lg">
                Uma pergunta para manter o conhecimento ativo
              </h2>
            </div>
          </div>
          {questao?.aeronaveModelo && (
            <span className="inline-flex shrink-0 items-center gap-1.5 rounded-full bg-white px-2.5 py-1 text-xs font-semibold text-slate-700 ring-1 ring-sky-100">
              <Plane className="h-3.5 w-3.5 text-sky-600" />
              {questao.aeronaveModelo === 'SK76' ? 'S76' : questao.aeronaveModelo}
            </span>
          )}
        </div>
      </div>

      <div className="px-4 py-4 sm:px-5 sm:py-5">
        {desafio.isLoading ? (
          <div className="flex items-center gap-2 text-sm text-slate-500" aria-live="polite">
            <Loader2 className="h-4 w-4 animate-spin" />
            Carregando a pergunta de hoje...
          </div>
        ) : desafio.isError || !questao ? (
          <div className="rounded-xl border border-slate-200 bg-white/80 px-4 py-4">
            <p className="text-sm font-medium text-slate-700">Desafio diário indisponível no momento.</p>
            <p className="mt-1 text-xs text-slate-500">
              A pergunta aparecerá aqui assim que houver conteúdo aprovado para a aeronave cadastrada.
            </p>
          </div>
        ) : (
          <div className="space-y-4">
            <div>
              <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500">
                <span className="rounded-full bg-slate-100 px-2 py-1 font-medium">{questao.topico}</span>
                <span>Pergunta do dia</span>
              </div>
              <p className="mt-3 text-sm font-semibold leading-relaxed text-slate-900 sm:text-base">
                {questao.enunciado}
              </p>
            </div>

            <div className="grid gap-2" role="group" aria-label="Alternativas do desafio diário">
              {questao.alternativas.map((alternativa) => (
                <button
                  key={alternativa.id}
                  type="button"
                  disabled={Boolean(feedback) || responder.isPending}
                  onClick={() => responder.mutate(alternativa.id)}
                  className={classeAlternativa(alternativa.id)}
                >
                  <span className="flex items-start gap-2.5">
                    <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-slate-100 text-[11px] font-bold text-slate-600">
                      {String.fromCharCode(64 + alternativa.ordem)}
                    </span>
                    <span className="flex-1 leading-relaxed">{alternativa.texto}</span>
                    {alternativaEmEnvio === alternativa.id && (
                      <Loader2 className="mt-0.5 h-4 w-4 shrink-0 animate-spin text-sky-600" />
                    )}
                    {feedback && alternativa.id === feedback.alternativaCorretaId && (
                      <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" />
                    )}
                    {feedback &&
                      !feedback.correta &&
                      alternativa.id === feedback.alternativaId && (
                        <XCircle className="mt-0.5 h-4 w-4 shrink-0 text-rose-600" />
                      )}
                  </span>
                </button>
              ))}
            </div>

            {responder.isError && (
              <p className="text-xs font-medium text-rose-700" role="alert">
                Não foi possível registrar a resposta. Tente novamente.
              </p>
            )}

            {feedback && (
              <div
                className={`rounded-xl border px-4 py-3 ${
                  feedback.correta
                    ? 'border-emerald-200 bg-emerald-50'
                    : 'border-amber-200 bg-amber-50'
                }`}
                aria-live="polite"
              >
                <p className="flex items-center gap-2 text-sm font-semibold text-slate-900">
                  {feedback.correta ? (
                    <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                  ) : (
                    <XCircle className="h-4 w-4 text-amber-600" />
                  )}
                  {feedback.correta ? 'Resposta correta.' : 'Não foi desta vez.'}
                </p>
                <p className="mt-2 text-sm leading-relaxed text-slate-700">{feedback.explicacao}</p>
                {feedback.oQueGuardar && (
                  <p className="mt-2 text-xs font-medium leading-relaxed text-slate-700">
                    <span className="font-bold">O que guardar:</span> {feedback.oQueGuardar}
                  </p>
                )}
                {feedback.fontes[0] && (
                  <p className="mt-2 text-[11px] leading-relaxed text-slate-500">
                    Fonte: {feedback.fontes[0].tipoDocumento} · {feedback.fontes[0].titulo} · rev.{' '}
                    {feedback.fontes[0].revisao}
                    {feedback.fontes[0].secao ? ` · ${feedback.fontes[0].secao}` : ''}
                    {feedback.fontes[0].pagina ? ` · p. ${feedback.fontes[0].pagina}` : ''}
                  </p>
                )}
              </div>
            )}
          </div>
        )}
      </div>
    </section>
  );
}
