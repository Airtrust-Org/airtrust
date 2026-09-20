import { BrainCircuit, ChevronRight, CheckCircle2, Circle, Sparkles } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import {
  ConhecimentoAtivoApiError,
  useConhecimentoAtivoResumo,
} from '@/react-app/hooks/useConhecimentoAtivo';

export function CardConhecimentoAtivo() {
  const navigate = useNavigate();
  const { data, isLoading, error } = useConhecimentoAtivoResumo();
  if (
    error instanceof ConhecimentoAtivoApiError &&
    error.code === 'CONHECIMENTO_ATIVO_DESABILITADO'
  ) {
    return null;
  }
  const desafios = data?.desafios ?? [];
  const concluidos = desafios.filter((desafio) => desafio.status === 'CONCLUIDO').length;
  const disponivel = desafios.find(
    (desafio) => desafio.status === 'DISPONIVEL' || desafio.status === 'EM_ANDAMENTO',
  );

  return (
    <section className="overflow-hidden rounded-2xl border border-sky-200 bg-gradient-to-br from-sky-50 via-white to-indigo-50 shadow-sm">
      <button
        type="button"
        onClick={() => navigate('/conhecimento-ativo')}
        className="group w-full p-4 text-left sm:p-5"
      >
        <div className="flex items-start gap-3">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-sky-600 text-white shadow-sm">
            <BrainCircuit className="h-6 w-6" />
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="text-base font-semibold text-slate-900">Conhecimento Ativo</h2>
              <span className="inline-flex items-center gap-1 rounded-full bg-sky-100 px-2 py-0.5 text-[11px] font-semibold text-sky-700">
                <Sparkles className="h-3 w-3" />
                Desafio Técnico
              </span>
            </div>
            <p className="mt-1 text-xs leading-relaxed text-slate-600 sm:text-sm">
              Conhecimento essencial, sempre presente.
            </p>
          </div>
          <ChevronRight className="mt-2 h-5 w-5 shrink-0 text-slate-300 transition-all group-hover:translate-x-0.5 group-hover:text-sky-600" />
        </div>

        <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-sky-100 bg-white/80 px-3 py-3">
          <div>
            {isLoading ? (
              <span className="text-xs text-slate-500">Atualizando seus desafios…</span>
            ) : disponivel ? (
              <>
                <p className="text-sm font-semibold text-slate-800">
                  {disponivel.status === 'EM_ANDAMENTO' ? 'Continue seu desafio' : 'Desafio disponível'}
                </p>
                <p className="mt-0.5 text-xs text-slate-500">
                  {disponivel.aeronave_modelo} · 10 perguntas · cerca de {data?.estimativaMinutos ?? 8} min
                </p>
              </>
            ) : concluidos >= 2 ? (
              <>
                <p className="text-sm font-semibold text-emerald-700">Quinzena concluída</p>
                <p className="mt-0.5 text-xs text-slate-500">Meta recomendada cumprida. Desafios extras continuam disponíveis.</p>
              </>
            ) : (
              <>
                <p className="text-sm font-semibold text-slate-800">Seu próximo desafio</p>
                <p className="mt-0.5 text-xs text-slate-500">Abra para verificar a disponibilidade.</p>
              </>
            )}
          </div>

          <div className="flex items-center gap-2" aria-label="Progresso da quinzena">
            {[0, 1].map((index) =>
              index < concluidos ? (
                <CheckCircle2 key={index} className="h-5 w-5 text-emerald-600" />
              ) : (
                <Circle key={index} className="h-5 w-5 text-slate-300" />
              ),
            )}
          </div>
        </div>
      </button>
    </section>
  );
}
