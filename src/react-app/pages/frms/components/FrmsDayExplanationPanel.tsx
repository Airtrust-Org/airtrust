import { AlertTriangle, CheckCircle2, Database, Gauge, MoonStar } from 'lucide-react';
import { useFrmsDayExplanation, type FrmsDayExplanationFactor } from '@/react-app/hooks/useFrms';
import type { ConfigLimites } from '../frmsUtils';

interface Props {
  tripulanteId: string | null | undefined;
  tripulanteNome?: string;
  date: string | null | undefined;
  config: ConfigLimites;
  source?: 'dashboard' | 'ficha' | 'desconhecida';
}

function formatDate(value: string): string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return value;
  const [year, month, day] = value.split('-');
  return `${day}/${month}/${year}`;
}

function effectivenessLabel(value: number | null): string {
  if (value == null || !Number.isFinite(value)) return 'Não calculada';
  return `${value.toFixed(1).replace('.', ',')}%`;
}

function factorName(code: string, fallback: string): string {
  if (code === 'basica') return 'Contexto circadiano';
  if (code === 'processo_c') return 'Janela circadiana';
  if (code === 'processo_s') return 'Tempo acordado e ciclo de sono';
  if (code === 'hv') return 'Acúmulo de horas de voo';
  if (code === 'repouso') return 'Repouso e sono';
  if (code === 'duracao') return 'Duração da jornada';
  return fallback || 'Fator operacional';
}

function sanitizeText(text: string): string {
  return (text || '')
    .replace(/fator_[a-z0-9_]+\s*:\s*[\d.,-]+/gi, '')
    .replace(/7d pior dia (\d{4}-\d{2}-\d{2}) \(([\d.,]+)\)\.?/gi, (_, date, score) =>
      `Na janela de 7 dias, o pior ponto foi ${formatDate(date)}, com índice estimado de ${String(score).replace('.', ',')}%.`,
    )
    .replace(/28d pior dia (\d{4}-\d{2}-\d{2}) \(([\d.,]+)\)\.?/gi, (_, date, score) =>
      `Na janela de 28 dias, o pior ponto foi ${formatDate(date)}, com índice estimado de ${String(score).replace('.', ',')}%.`,
    )
    .replace(/\s{2,}/g, ' ')
    .trim();
}

function factorImpact(factor: FrmsDayExplanationFactor): string {
  const value = Math.abs(factor.impacto_pct || 0).toFixed(1).replace('.', ',');
  if (factor.direcao === 'penaliza') return `reduz ${value} pp`;
  if (factor.direcao === 'favorece') return `favorece ${value} pp`;
  return 'impacto neutro';
}

function confidenceLabel(value: string | null | undefined): string {
  if (value === 'reported') return 'alta';
  if (value === 'reduced') return 'reduzida';
  return 'não informada';
}

function sourceLabel(value: string | null | undefined): string {
  if (value === 'informed') return 'dados informados';
  if (value === 'estimated') return 'dados estimados';
  if (value === 'mixed') return 'fontes mistas';
  if (value === 'legacy') return 'dado legado';
  return 'fonte não identificada';
}

export default function FrmsDayExplanationPanel({
  tripulanteId,
  tripulanteNome,
  date,
  source = 'desconhecida',
}: Props) {
  const { data, loading, error } = useFrmsDayExplanation(tripulanteId, date, { source });

  if (!tripulanteId || !date) return null;

  if (loading) {
    return (
      <section className="mt-4 rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-950">
        <div className="space-y-3 animate-pulse" aria-label="Carregando explicação operacional">
          <div className="h-5 w-52 rounded bg-slate-200 dark:bg-slate-800" />
          <div className="h-20 rounded-lg bg-slate-100 dark:bg-slate-900" />
          <div className="h-28 rounded-lg bg-slate-100 dark:bg-slate-900" />
        </div>
      </section>
    );
  }

  if (error || !data) {
    return (
      <section className="mt-4 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800 dark:border-amber-900/60 dark:bg-amber-950/30 dark:text-amber-200">
        <div className="flex gap-2">
          <AlertTriangle className="mt-0.5 h-4 w-4 flex-none" />
          <span>Não foi possível carregar a explicação deste dia. Não use ausência de explicação como sinal de normalidade.</span>
        </div>
      </section>
    );
  }

  const name = tripulanteNome?.trim() || data.tripulante.nome || `Tripulante #${tripulanteId}`;
  const pct = data.jornada.effectiveness_pct;
  const factors = [...(data.diagnostico.fatores || [])]
    .filter((factor) => Math.abs(factor.impacto_pct || 0) > 0)
    .sort((a, b) => Math.abs(b.impacto_pct || 0) - Math.abs(a.impacto_pct || 0))
    .slice(0, 4);
  const recommendations = (data.diagnostico.recomendacoes || []).slice(0, 3);
  const trace = data.explanation_trace;
  const summary = sanitizeText(data.diagnostico.resumo_executivo || data.diagnostico.explicacao_didatica || '');

  return (
    <section className="mt-4 overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-950">
      <header className="border-b border-slate-200 p-4 dark:border-slate-800">
        <p className="text-xs font-bold uppercase tracking-wide text-slate-500">Explicação operacional</p>
        <div className="mt-1 flex flex-wrap items-baseline justify-between gap-2">
          <h3 className="text-lg font-bold text-slate-950 dark:text-white">
            {name} · {formatDate(date)}
          </h3>
          <span className="text-2xl font-bold tabular-nums text-slate-950 dark:text-white">
            {effectivenessLabel(pct)}
          </span>
        </div>
        <p className="mt-1 text-xs text-slate-500">
          {data.jornada.effectiveness_nivel || (pct == null ? 'Cálculo indisponível' : 'Leitura disponível')}
        </p>
      </header>

      <div className="grid gap-4 p-4 lg:grid-cols-[minmax(0,1.4fr)_minmax(260px,0.8fr)]">
        <div className="space-y-4">
          <div className="rounded-lg bg-slate-50 p-4 dark:bg-slate-900/60">
            <h4 className="flex items-center gap-2 text-sm font-bold text-slate-900 dark:text-white">
              <Gauge className="h-4 w-4" /> O que explica o resultado
            </h4>
            <p className="mt-2 text-sm leading-6 text-slate-700 dark:text-slate-200">
              {summary || 'O sistema não forneceu um resumo operacional para este dia.'}
            </p>
          </div>

          <div>
            <h4 className="text-sm font-bold text-slate-900 dark:text-white">Principais fatores</h4>
            {factors.length === 0 ? (
              <p className="mt-2 text-sm text-slate-500">Nenhum fator determinante foi informado.</p>
            ) : (
              <div className="mt-2 grid gap-2 sm:grid-cols-2">
                {factors.map((factor) => (
                  <div key={factor.codigo} className="rounded-lg border border-slate-200 p-3 dark:border-slate-800">
                    <div className="flex items-start justify-between gap-3">
                      <p className="text-sm font-semibold text-slate-900 dark:text-white">
                        {factorName(factor.codigo, factor.titulo)}
                      </p>
                      <span className="whitespace-nowrap text-xs font-bold text-slate-500">
                        {factorImpact(factor)}
                      </span>
                    </div>
                    <p className="mt-1 text-xs leading-5 text-slate-500">{sanitizeText(factor.resumo)}</p>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div>
            <h4 className="text-sm font-bold text-slate-900 dark:text-white">Ação recomendada</h4>
            {recommendations.length === 0 ? (
              <div className="mt-2 flex gap-2 rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800 dark:border-emerald-900/60 dark:bg-emerald-950/30 dark:text-emerald-200">
                <CheckCircle2 className="mt-0.5 h-4 w-4 flex-none" />
                <span>Nenhuma recomendação adicional foi emitida para este dia.</span>
              </div>
            ) : (
              <ul className="mt-2 space-y-2">
                {recommendations.map((recommendation) => (
                  <li key={recommendation.codigo} className="rounded-lg border border-slate-200 p-3 dark:border-slate-800">
                    <p className="text-sm font-bold text-slate-900 dark:text-white">{recommendation.titulo}</p>
                    <p className="mt-1 text-xs leading-5 text-slate-500">{recommendation.descricao}</p>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>

        <aside className="space-y-3">
          <div className="rounded-lg border border-slate-200 p-3 dark:border-slate-800">
            <h4 className="flex items-center gap-2 text-xs font-bold uppercase tracking-wide text-slate-500">
              <Database className="h-4 w-4" /> Qualidade do dado
            </h4>
            {trace ? (
              <>
                <p className="mt-2 text-sm font-semibold text-slate-900 dark:text-white">
                  Confiança {confidenceLabel(trace.dataQuality.confidence)}
                </p>
                <p className="mt-1 text-xs text-slate-500">{sourceLabel(trace.dataQuality.sourceSummary)}</p>
                {trace.dataQuality.limitations.length > 0 ? (
                  <ul className="mt-2 space-y-1 text-xs text-amber-700 dark:text-amber-300">
                    {trace.dataQuality.limitations.slice(0, 4).map((limitation) => (
                      <li key={limitation}>• {limitation}</li>
                    ))}
                  </ul>
                ) : null}
              </>
            ) : (
              <p className="mt-2 text-sm text-amber-700 dark:text-amber-300">
                Rastreabilidade detalhada não disponível para este cálculo.
              </p>
            )}
          </div>

          <div className="rounded-lg border border-slate-200 p-3 dark:border-slate-800">
            <h4 className="flex items-center gap-2 text-xs font-bold uppercase tracking-wide text-slate-500">
              <MoonStar className="h-4 w-4" /> Sono e vigília
            </h4>
            <p className="mt-2 text-sm text-slate-700 dark:text-slate-200">
              Sono: {data.jornada.duracao_sono_efetiva_min == null
                ? 'não informado'
                : `${(data.jornada.duracao_sono_efetiva_min / 60).toFixed(1).replace('.', ',')} h`}
            </p>
            <p className="mt-1 text-sm text-slate-700 dark:text-slate-200">
              Acordou: {data.jornada.hora_acordou || data.jornada.hora_despertar_estimada || 'não informado'}
            </p>
            <p className="mt-1 text-sm text-slate-700 dark:text-slate-200">
              Apresentação: {data.jornada.hora_apresentacao || 'não informada'}
            </p>
          </div>

          <p className="rounded-lg bg-slate-50 p-3 text-xs leading-5 text-slate-500 dark:bg-slate-900/60">
            Ferramenta de triagem operacional. A leitura apoia revisão humana; não diagnostica fadiga e não determina aptidão ou restrição automaticamente.
          </p>
        </aside>
      </div>
    </section>
  );
}
