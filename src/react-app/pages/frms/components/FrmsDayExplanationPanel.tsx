import { useEffect, useMemo, useState } from 'react';
import {
  CalendarDays,
  Copy,
  FileText,
  FlaskConical,
  X,
} from 'lucide-react';
import {
  useFrmsCompararDias,
  useFrmsDayExplanation,
  useFrmsJornadasEffectiveness,
  useFrmsJustificativas,
  useFrmsMutation,
  type FrmsJustificativaGeradaResponse,
  type FrmsSimulacaoResponse,
} from '@/react-app/hooks/useFrms';
import type {
  FrmsDayExplanationFactor,
} from '@/react-app/hooks/useFrms';
import { buildFrmsDayExplanationTrace } from '../frmsDayExplanationTrace';
import { getEffectivenessHex, getEffectivenessLabel, type ConfigLimites } from '../frmsUtils';

function formatMinutes(totalMinutes: number | null | undefined): string {
  if (totalMinutes == null) return 'Sem dado';
  const rounded = Math.max(0, Math.round(totalMinutes));
  const hours = Math.floor(rounded / 60);
  const minutes = rounded % 60;
  return `${hours}h${String(minutes).padStart(2, '0')}`;
}

function formatMinutesCompact(totalMinutes: number | null | undefined): string {
  if (totalMinutes == null) return '—';
  const rounded = Math.max(0, Math.round(totalMinutes));
  if (rounded <= 0) return '—';
  return `${rounded} min`;
}

function toBrDate(value: string): string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return value;
  return `${value.slice(8, 10)}/${value.slice(5, 7)}`;
}

function previousDate(value: string): string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return value;
  const d = new Date(`${value}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() - 1);
  return d.toISOString().slice(0, 10);
}

function factorLabel(code: string): string {
  if (code === 'basica') return 'Penalização de base do dia';
  if (code === 'processo_c') return 'Janela circadiana';
  if (code === 'processo_s') return 'Ciclo embarcado';
  if (code === 'hv') return 'Acúmulo de horas de voo';
  if (code === 'repouso') return 'Repouso';
  if (code === 'duracao') return 'Duração da jornada';
  return code;
}

function formatImpact(factor: FrmsDayExplanationFactor): string {
  if (factor.codigo === 'basica') return 'Contexto basal (sem leitura isolada em pp)';
  return `${factor.impacto_pct > 0 ? '+' : ''}${factor.impacto_pct.toFixed(1)} pp`;
}

interface Props {
  tripulanteId: string | null | undefined;
  tripulanteNome?: string;
  date: string | null | undefined;
  config: ConfigLimites;
  source?: 'dashboard' | 'ficha' | 'desconhecida';
}

export default function FrmsDayExplanationPanel({
  tripulanteId,
  tripulanteNome,
  date,
  config,
  source = 'desconhecida',
}: Props) {
  const { data, loading, error } = useFrmsDayExplanation(tripulanteId, date, { source });
  const { data: timelineRows } = useFrmsJornadasEffectiveness(tripulanteId, 7, {
    inicio: date ?? undefined,
    fim: date ?? undefined,
  });
  const [showComparison, setShowComparison] = useState(false);
  const [comparisonDate, setComparisonDate] = useState<string | null>(
    date ? previousDate(date) : null,
  );
  const [showSimulation, setShowSimulation] = useState(false);
  const [simulationResult, setSimulationResult] = useState<FrmsSimulacaoResponse | null>(null);
  const [simHoraApresentacao, setSimHoraApresentacao] = useState('');
  const [simHoraAcordou, setSimHoraAcordou] = useState('');
  const [simSonoHoras, setSimSonoHoras] = useState<number>(8);
  const [showJustificativaModal, setShowJustificativaModal] = useState(false);
  const [decisaoTomada, setDecisaoTomada] = useState('Manteve operação normalmente');
  const [decisaoOutro, setDecisaoOutro] = useState('');
  const [observacoes, setObservacoes] = useState('');
  const [justificativaGerada, setJustificativaGerada] =
    useState<FrmsJustificativaGeradaResponse | null>(null);

  const simulacaoMutation = useFrmsMutation<FrmsSimulacaoResponse>();
  const justificativaMutation = useFrmsMutation<FrmsJustificativaGeradaResponse>();
  const { data: justificativasAnteriores, refetch: refetchJustificativas } = useFrmsJustificativas(
    tripulanteId,
    showJustificativaModal,
  );

  const comparisonSource = source === 'ficha' ? 'ficha' : 'dashboard';
  const {
    data: comparisonData,
    loading: comparisonLoading,
    error: comparisonError,
  } = useFrmsCompararDias(
    tripulanteId,
    showComparison ? date : null,
    showComparison ? comparisonDate : null,
    comparisonSource,
  );

  useEffect(() => {
    if (!date) return;
    setComparisonDate(previousDate(date));
    setShowComparison(false);
    setSimulationResult(null);
  }, [date]);

  useEffect(() => {
    if (!data?.jornada) return;
    setSimHoraApresentacao(data.jornada.hora_apresentacao || '');
    setSimHoraAcordou(data.jornada.hora_acordou || '');
    setSimSonoHoras(
      data.jornada.duracao_sono_efetiva_min != null
        ? Number((data.jornada.duracao_sono_efetiva_min / 60).toFixed(1))
        : 8,
    );
  }, [data]);

  const comparisonRows = useMemo(() => {
    if (!comparisonData) return [];
    return comparisonData.dia_a.fatores.map((fatorA) => {
      const fatorB = comparisonData.dia_b.fatores.find((item) => item.codigo === fatorA.codigo);
      const impactoB = fatorB?.impacto_pts ?? 0;
      const delta = Number((impactoB - fatorA.impacto_pts).toFixed(1));
      return {
        codigo: fatorA.codigo,
        nome: factorLabel(fatorA.codigo),
        a: fatorA.impacto_pts,
        b: impactoB,
        delta,
      };
    });
  }, [comparisonData]);

  const timelineRow = useMemo(() => {
    if (!timelineRows || !date) return null;
    return timelineRows.find((row) => row.data_apresentacao === date) ?? null;
  }, [timelineRows, date]);

  const trace = useMemo(() => {
    if (!data) return null;
    const pct = data.jornada.effectiveness_pct;
    const duracaoFactor =
      data.diagnostico.fatores.find((factor) => factor.codigo === 'duracao')?.impacto_pct ?? null;
    const pctFimEstimado =
      pct != null && duracaoFactor != null
        ? Math.max(0, Math.min(100, pct + duracaoFactor))
        : null;
    const pctPrincipal = pctFimEstimado ?? pct;
    const displayedEffectivenessLabel =
      pctPrincipal != null ? getEffectivenessLabel(pctPrincipal, config) : 'Sem classificação';

    return buildFrmsDayExplanationTrace({
      explanation: data,
      timelineRow,
      displayedEffectivenessLabel,
    });
  }, [data, timelineRow, config]);

  if (!tripulanteId || !date) {
    return null;
  }

  if (loading) {
    return (
      <div className="mt-4 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <div className="animate-pulse space-y-3">
          <div className="h-4 w-48 rounded bg-slate-200" />
          <div className="h-20 rounded-2xl bg-slate-100" />
          <div className="grid gap-3 md:grid-cols-2">
            <div className="h-28 rounded-2xl bg-slate-100" />
            <div className="h-28 rounded-2xl bg-slate-100" />
          </div>
        </div>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="mt-4 rounded-2xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-700 shadow-sm">
        Não foi possível gerar a explicação desse dia agora.
      </div>
    );
  }

  if (!trace) {
    return (
      <div className="mt-4 rounded-2xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-700 shadow-sm">
        Não foi possível gerar a explicação desse dia agora.
      </div>
    );
  }

  const pct = data.jornada.effectiveness_pct;
  const duracaoFactor =
    data.diagnostico.fatores.find((factor) => factor.codigo === 'duracao')?.impacto_pct ?? null;
  const pctFimEstimado =
    pct != null && duracaoFactor != null ? Math.max(0, Math.min(100, pct + duracaoFactor)) : null;
  const pctPrincipal = pctFimEstimado ?? pct;
  const accent = pctPrincipal != null ? getEffectivenessHex(pctPrincipal, config) : '#64748B';
  const label =
    pctPrincipal != null ? getEffectivenessLabel(pctPrincipal, config) : 'Sem classificação';
  const diasCriticosConsecutivos = data.jornada.dias_criticos_consecutivos ?? 0;
  const fonteSonoBadge = data.jornada.hora_acordou
    ? {
        label: 'Fonte do sono: informado',
        tone: 'border-emerald-200 bg-emerald-50 text-emerald-700',
        help: 'Há horário de acordar informado para o cálculo do dia.',
      }
    : data.jornada.duracao_sono_efetiva_min != null
      ? {
          label: 'Fonte do sono: padrão',
          tone: 'border-amber-200 bg-amber-50 text-amber-700',
          help: 'Sem horário informado; cálculo usa estimativa padrão de sono.',
        }
      : {
          label: 'Fonte do sono: estimado',
          tone: 'border-slate-200 bg-slate-100 text-slate-600',
          help: 'Não há dado de sono informado suficiente para o dia.',
        };
  const recalcPendente = !data.jornada.hora_apresentacao;
  const wakeTime = data.jornada.hora_acordou || data.jornada.hora_despertar_estimada;

  const explanationRows = data.diagnostico.fatores.map((factor) => {
    let dadoUsado = 'Dado bruto não disponível neste payload.';
    let comoEntrou = factor.resumo;

    if (factor.codigo === 'hv') {
      dadoUsado =
        trace.inputs.priorDaysWindow && !trace.inputs.priorDaysWindow.includes('não disponível')
          ? trace.inputs.priorDaysWindow
          : 'Horas brutas 7d/28d/mês não disponíveis neste payload.';
      comoEntrou = 'Componente de acúmulo recente de voo no modelo de efetividade do dia.';
    } else if (factor.codigo === 'processo_s') {
      dadoUsado =
        data.jornada.dia_periodo_embarcado != null && data.jornada.total_dias_periodo != null
          ? `${data.jornada.dia_periodo_embarcado}º dia de ${data.jornada.total_dias_periodo} do período embarcado`
          : 'Dia do ciclo embarcado não disponível neste payload.';
      comoEntrou = 'Penalização progressiva por avanço do período embarcado.';
    } else if (factor.codigo === 'processo_c') {
      dadoUsado =
        wakeTime && data.jornada.hora_apresentacao
          ? `Despertar ${wakeTime}; apresentação ${data.jornada.hora_apresentacao}`
          : 'Horário de despertar/apresentação incompleto no payload.';
      comoEntrou = 'Penalização circadiana pela janela de apresentação do dia.';
    } else if (factor.codigo === 'repouso') {
      dadoUsado = `${formatMinutes(data.jornada.duracao_sono_efetiva_min)} (${fonteSonoBadge.label.toLowerCase()})`;
      comoEntrou = 'Componente de repouso/sono da jornada processada.';
    } else if (factor.codigo === 'duracao') {
      dadoUsado =
        data.jornada.tempo_abaixo_limiar_min != null
          ? `Tempo em faixa de atenção: ${formatMinutesCompact(data.jornada.tempo_abaixo_limiar_min)}`
          : 'Duração bruta da jornada não disponível neste payload.';
      comoEntrou = 'Componente de duração da jornada no cálculo diário de efetividade.';
    } else if (factor.codigo === 'basica') {
      dadoUsado =
        timelineRow?.fator_basica_pct != null
          ? `fator_basica_pct: ${timelineRow.fator_basica_pct.toFixed(4)}`
          : 'fator_basica_pct não disponível neste payload.';
      comoEntrou =
        'Contexto basal/circadiano auxiliar; não representa impacto direto isolado em pp na leitura operacional.';
    }

    return {
      key: factor.codigo,
      componente: factor.titulo || factorLabel(factor.codigo),
      dadoUsado,
      comoEntrou,
      impacto: formatImpact(factor),
      impactoAbs: Math.abs(Math.min(0, factor.impacto_pct)),
    };
  });

  const dominantRow =
    explanationRows
      .filter((row) => row.key !== 'basica')
      .sort((a, b) => b.impactoAbs - a.impactoAbs)[0] ?? null;

  const handleSimular = async () => {
    if (!tripulanteId || !date) return;
    const payload: Record<string, unknown> = {
      origem_tela: comparisonSource,
    };
    if (simHoraApresentacao) payload.hora_apresentacao_simulada = simHoraApresentacao;
    if (simHoraAcordou) payload.hora_acordou_simulada = simHoraAcordou;
    if (Number.isFinite(simSonoHoras))
      payload.sono_efetivo_simulado_min = Math.round(simSonoHoras * 60);

    const result = await simulacaoMutation.mutate(
      `/api/frms/simular-cenario/${tripulanteId}/${date}`,
      {
        method: 'POST',
        body: JSON.stringify(payload),
      },
    );
    setSimulationResult(result);
  };

  const handleGerarJustificativa = async () => {
    if (!tripulanteId || !date) return;
    const decisaoFinal =
      decisaoTomada === 'Outro (especificar)' ? decisaoOutro.trim() : decisaoTomada;
    if (!decisaoFinal) return;

    const result = await justificativaMutation.mutate(
      `/api/frms/justificativas/${tripulanteId}/${date}`,
      {
        method: 'POST',
        body: JSON.stringify({
          decisao_tomada: decisaoFinal,
          observacoes,
          origem_tela: comparisonSource,
        }),
      },
    );

    setJustificativaGerada(result);
    refetchJustificativas();
  };

  const copyJustificativa = async () => {
    if (!justificativaGerada?.documento?.texto_formal) return;
    await navigator.clipboard.writeText(justificativaGerada.documento.texto_formal);
  };

  const downloadJustificativa = () => {
    if (!justificativaGerada?.documento?.texto_formal) return;
    const blob = new Blob([justificativaGerada.documento.texto_formal], {
      type: 'text/plain;charset=utf-8',
    });
    const href = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = href;
    anchor.download = `justificativa-frms-${date || 'documento'}.txt`;
    document.body.appendChild(anchor);
    anchor.click();
    document.body.removeChild(anchor);
    URL.revokeObjectURL(href);
  };

  return (
    <div className="mt-4 rounded-[28px] border border-slate-200 bg-[linear-gradient(180deg,rgba(255,255,255,0.98),rgba(248,250,252,0.98))] p-4 shadow-sm sm:p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h4 className="text-lg font-semibold text-slate-900">
            {tripulanteNome || data.tripulante.nome} · {date.slice(8, 10)}/{date.slice(5, 7)}
          </h4>
          <p className="mt-1 text-sm text-slate-500">
            Análise estimada.
          </p>
          <div className="mt-2 flex flex-wrap gap-1">
            <span
              title={fonteSonoBadge.help}
              className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-semibold ${fonteSonoBadge.tone}`}
            >
              {fonteSonoBadge.label}
            </span>
            {recalcPendente ? (
              <span
                title="Sem horário de apresentação registrado para a jornada."
                className="inline-flex items-center rounded-full border border-rose-200 bg-rose-50 px-2 py-0.5 text-[10px] font-semibold text-rose-700"
              >
                Sem horário de apresentação: recálculo pendente
              </span>
            ) : null}
          </div>
        </div>
        <div className="rounded-2xl border border-slate-200 bg-white px-4 py-3 text-right shadow-sm">
          <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-400">
            {pctFimEstimado != null ? 'Fim Estimado (Proxy)' : 'Efetividade'}
          </p>
          <p className="mt-1 text-2xl font-black" style={{ color: accent }}>
            {pctPrincipal != null ? `${pctPrincipal.toFixed(1)}%` : '—'}
          </p>
          <p className="text-xs font-medium" style={{ color: accent }}>
            {label}
          </p>
          {pctFimEstimado != null && pct != null ? (
            <p className="mt-1 text-[11px] text-slate-500">Início do dia: {pct.toFixed(1)}%</p>
          ) : null}
        </div>
      </div>
      <div className="mt-3 rounded-2xl border border-slate-200 bg-slate-50 px-3 py-3 text-sm text-slate-700">
        {tripulanteNome || data.tripulante.nome} ficou em <strong>{label.toLowerCase()}</strong>{' '}
        porque a combinação de fatores do dia reduziu a margem operacional estimada.
      </div>

      <div className="mt-4 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <h5 className="text-sm font-semibold uppercase tracking-[0.16em] text-slate-800">
          Como chegamos ao índice
        </h5>
        <div className="mt-3 overflow-auto rounded-xl border border-slate-200">
          <table className="min-w-full text-xs">
            <thead className="bg-slate-100 text-slate-600">
              <tr>
                <th className="px-3 py-2 text-left">Componente</th>
                <th className="px-3 py-2 text-left">Dado usado</th>
                <th className="px-3 py-2 text-left">Como entrou no cálculo</th>
                <th className="px-3 py-2 text-right">Impacto</th>
              </tr>
            </thead>
            <tbody>
              {explanationRows.map((row) => (
                <tr key={row.key} className="border-t border-slate-100 align-top">
                  <td className="px-3 py-2 font-semibold text-slate-800">{row.componente}</td>
                  <td className="px-3 py-2 text-slate-600">{row.dadoUsado}</td>
                  <td className="px-3 py-2 text-slate-600">{row.comoEntrou}</td>
                  <td className="px-3 py-2 text-right font-semibold text-slate-700">{row.impacto}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="mt-4 grid gap-3 xl:grid-cols-2">
        <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <h5 className="text-sm font-semibold uppercase tracking-[0.16em] text-slate-800">
            O que mais pesou
          </h5>
          <p className="mt-2 text-sm leading-6 text-slate-700">
            {dominantRow
              ? `Maior impacto observado em ${dominantRow.componente}: ${dominantRow.dadoUsado} (${dominantRow.impacto}).`
              : 'Sem componente dominante com impacto material neste payload.'}
          </p>
        </section>

        <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <h5 className="text-sm font-semibold uppercase tracking-[0.16em] text-slate-800">
            O que verificar antes de agir
          </h5>
          <ul className="mt-2 list-disc space-y-1.5 pl-4 text-sm text-slate-700">
            <li>Confirmar se as horas recentes de voo estão corretas.</li>
            <li>Conferir sono informado e horário de despertar.</li>
            <li>Verificar horário real de apresentação.</li>
            <li>Avaliar janela operacional para ajuste.</li>
            <li>Considerar relato/check-in do tripulante quando disponível.</li>
          </ul>
        </section>
      </div>

      <div className="mt-4 rounded-2xl border border-sky-200 bg-sky-50 px-3 py-3 text-xs text-sky-900">
        Ferramenta de triagem operacional. Esta leitura é uma estimativa operacional: não
        diagnostica fadiga, não determina aptidão ou restrição automática, exige revisão humana e
        não valida SAFTE-FAST.{' '}
        {trace.sourceFlags.informedData
          ? 'Para este dia, há dado informado no payload.'
          : 'Sem dado informado completo no dia, o sistema usa proxy operacional com base nos dados disponíveis.'}
      </div>

      <details className="mt-4 rounded-2xl border border-slate-200 bg-white p-3">
        <summary className="cursor-pointer text-xs font-semibold uppercase tracking-[0.16em] text-slate-700">
          Trace técnico (secundário)
        </summary>
        <div className="mt-3 space-y-2 text-xs text-slate-600">
          <p>
            Crew: {trace.crewMemberLabel} · Data: {trace.date} · Fonte sono: {trace.inputs.sleepSource}
            {' '}· Wake source: {trace.inputs.wakeTimeSource}
          </p>
          <p>
            Apresentação: {trace.inputs.reportTime || 'sem dado'} · Despertar:{' '}
            {trace.inputs.wakeTime || 'sem dado'} · Min acordado pré-apresentação:{' '}
            {trace.inputs.minutesAwakeBeforeReport != null
              ? `${trace.inputs.minutesAwakeBeforeReport} min`
              : 'sem dado'}
          </p>
          <p>
            Janelas: {trace.windowsUsed.map((w) => `${w.key}:${w.used ? 'ok' : 'indisponível'}`).join(' · ')}
          </p>
          <p>
            Flags: {trace.sourceFlags.informedData ? 'dado informado' : 'dado estimado'} ·{' '}
            {trace.sourceFlags.legacyPreC2
              ? 'legado pré-C2'
              : trace.sourceFlags.c2Corrected
                ? 'C2 corrigido'
                : 'sem status C2'}{' '}
            · {trace.sourceFlags.recalculationPending ? 'recálculo pendente' : 'sem recálculo pendente'}
          </p>
        </div>
      </details>

      {diasCriticosConsecutivos >= 2 ? (
        <div className="mt-3 inline-flex items-center gap-2 rounded-full border border-rose-200 bg-rose-50 px-3 py-1.5 text-xs font-semibold text-rose-700">
          ⚠️ {diasCriticosConsecutivos} dias críticos consecutivos
        </div>
      ) : null}
      {diasCriticosConsecutivos === 1 ? (
        <div className="mt-3 inline-flex items-center gap-2 rounded-full border border-amber-200 bg-amber-50 px-3 py-1.5 text-xs font-semibold text-amber-700">
          1º dia crítico consecutivo
        </div>
      ) : null}

      <div className="mt-4 flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => setShowComparison((prev) => !prev)}
              className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-100"
            >
              <CalendarDays className="h-3.5 w-3.5" />↔ Comparar com dia anterior
            </button>

            <button
              type="button"
              onClick={() => setShowSimulation(true)}
              className="inline-flex items-center gap-2 rounded-xl border border-amber-200 bg-amber-50 px-3 py-1.5 text-xs font-semibold text-amber-800 hover:bg-amber-100"
            >
              <FlaskConical className="h-3.5 w-3.5" />
              🧪 Simular horário diferente
            </button>

            <button
              type="button"
              onClick={() => setShowJustificativaModal(true)}
              className="inline-flex items-center gap-2 rounded-xl border border-slate-900 bg-slate-900 px-3 py-1.5 text-xs font-semibold text-white hover:bg-black"
            >
              <FileText className="h-3.5 w-3.5" />
              📄 Registrar justificativa
            </button>
      </div>

      {showComparison ? (
        <div className="mt-4 rounded-2xl border border-slate-200 bg-slate-50 p-3">
              <div className="mb-3 flex flex-wrap items-center gap-2">
                <label className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-600">
                  Comparar com
                </label>
                <input
                  type="date"
                  value={comparisonDate || ''}
                  onChange={(event) => setComparisonDate(event.target.value)}
                  className="rounded-lg border border-slate-300 bg-white px-2 py-1 text-xs text-slate-700"
                />
              </div>

              {comparisonLoading ? (
                <p className="text-xs text-slate-500">Carregando comparação...</p>
              ) : comparisonError ? (
                <p className="text-xs text-rose-600">{comparisonError}</p>
              ) : comparisonData ? (
                <>
                  <p className="mb-2 text-xs font-semibold text-slate-700">
                    COMPARAÇÃO: {toBrDate(comparisonData.dia_a.data)} →{' '}
                    {toBrDate(comparisonData.dia_b.data)}
                  </p>
                  <div className="overflow-auto rounded-xl border border-slate-200 bg-white">
                    <table className="min-w-full text-xs">
                      <thead className="bg-slate-100 text-slate-600">
                        <tr>
                          <th className="px-3 py-2 text-left">Fator</th>
                          <th className="px-3 py-2 text-right">
                            {toBrDate(comparisonData.dia_a.data)}
                          </th>
                          <th className="px-3 py-2 text-right">
                            {toBrDate(comparisonData.dia_b.data)}
                          </th>
                          <th className="px-3 py-2 text-right">Delta</th>
                        </tr>
                      </thead>
                      <tbody>
                        {comparisonRows.map((row) => (
                          <tr key={row.codigo} className="border-t border-slate-100">
                            <td className="px-3 py-2 font-medium text-slate-700">{row.nome}</td>
                            <td className="px-3 py-2 text-right text-slate-600">
                              {row.a.toFixed(1)} pp
                            </td>
                            <td className="px-3 py-2 text-right text-slate-600">
                              {row.b.toFixed(1)} pp
                            </td>
                            <td
                              className={`px-3 py-2 text-right font-semibold ${
                                row.delta > 0
                                  ? 'text-emerald-600'
                                  : row.delta < 0
                                    ? 'text-rose-600'
                                    : 'text-slate-500'
                              }`}
                            >
                              {row.delta > 0 ? '+' : ''}
                              {row.delta.toFixed(1)}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  <p className="mt-2 text-xs text-slate-700">{comparisonData.analise_delta}</p>
                </>
              ) : null}
            </div>
      ) : null}

      {showSimulation ? (
        <div className="fixed inset-0 z-modal flex justify-end bg-black/30 backdrop-blur-sm">
          <div className="h-full w-full max-w-md overflow-y-auto bg-white p-4 shadow-2xl">
            <div className="mb-3 flex items-start justify-between gap-3">
              <div>
                <h5 className="text-sm font-semibold uppercase tracking-[0.16em] text-slate-700">
                  Simulação "E se..."
                </h5>
                <div className="mt-2 inline-flex items-center gap-2 rounded-full border border-amber-300 bg-amber-50 px-2.5 py-1 text-[11px] font-semibold text-amber-800">
                  🧪 Simulação — não afeta dados reais
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowSimulation(false)}
                className="rounded-lg border border-slate-200 p-1.5 text-slate-500 hover:bg-slate-50"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="space-y-3">
              <label className="block">
                <span className="mb-1 block text-xs font-semibold text-slate-600">
                  Hora de apresentação
                </span>
                <input
                  type="time"
                  value={simHoraApresentacao}
                  onChange={(event) => setSimHoraApresentacao(event.target.value)}
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                />
              </label>

              <label className="block">
                <span className="mb-1 block text-xs font-semibold text-slate-600">
                  Hora que acordou
                </span>
                <input
                  type="time"
                  value={simHoraAcordou}
                  onChange={(event) => setSimHoraAcordou(event.target.value)}
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                />
              </label>

              <label className="block">
                <span className="mb-1 block text-xs font-semibold text-slate-600">
                  Sono efetivo (horas)
                </span>
                <input
                  type="number"
                  min={0}
                  max={24}
                  step={0.1}
                  value={simSonoHoras}
                  onChange={(event) => setSimSonoHoras(Number(event.target.value))}
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                />
              </label>

              <button
                type="button"
                onClick={handleSimular}
                disabled={simulacaoMutation.loading}
                className="w-full rounded-lg bg-slate-900 px-3 py-2 text-sm font-semibold text-white hover:bg-black disabled:opacity-60"
              >
                {simulacaoMutation.loading ? 'Simulando...' : 'Simular'}
              </button>
            </div>

            {simulationResult ? (
              <div className="mt-4 rounded-xl border border-slate-200 bg-slate-50 p-3">
                <p className="text-xs font-semibold text-slate-700">REAL → SIMULADO</p>
                <p className="mt-1 text-sm font-semibold text-slate-900">
                  {(simulationResult.resultado_real.effectiveness_pct ?? 0).toFixed(1)}% →{' '}
                  {(simulationResult.resultado_simulado.effectiveness_pct ?? 0).toFixed(1)}% (
                  {simulationResult.diferenca_pts > 0 ? '+' : ''}
                  {simulationResult.diferenca_pts.toFixed(1)} pts)
                </p>
                <p className="mt-1 text-xs text-slate-700">{simulationResult.conclusao}</p>
                <button
                  type="button"
                  onClick={() => setSimulationResult(null)}
                  className="mt-3 rounded-lg border border-slate-300 px-2.5 py-1 text-xs font-semibold text-slate-700 hover:bg-white"
                >
                  Fechar simulação
                </button>
              </div>
            ) : null}
          </div>
        </div>
      ) : null}

      {showJustificativaModal ? (
        <div className="fixed inset-0 z-modal flex items-center justify-center bg-black/40 p-4 backdrop-blur-sm">
          <div className="w-full max-w-3xl rounded-2xl bg-white p-4 shadow-2xl">
            <div className="mb-3 flex items-center justify-between gap-3">
              <h5 className="text-sm font-semibold uppercase tracking-[0.16em] text-slate-700">
                Justificativa Operacional
              </h5>
              <button
                type="button"
                onClick={() => setShowJustificativaModal(false)}
                className="rounded-lg border border-slate-200 p-1.5 text-slate-500 hover:bg-slate-50"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="grid gap-3 md:grid-cols-2">
              <label className="block">
                <span className="mb-1 block text-xs font-semibold text-slate-600">
                  Decisão tomada
                </span>
                <select
                  value={decisaoTomada}
                  onChange={(event) => setDecisaoTomada(event.target.value)}
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                >
                  <option>Manteve operação normalmente</option>
                  <option>Registrou briefing reforçado</option>
                  <option>Substituiu o tripulante</option>
                  <option>Adiou / cancelou voo</option>
                  <option>Outro (especificar)</option>
                </select>
              </label>
              {decisaoTomada === 'Outro (especificar)' ? (
                <label className="block">
                  <span className="mb-1 block text-xs font-semibold text-slate-600">
                    Especificar decisão
                  </span>
                  <input
                    type="text"
                    value={decisaoOutro}
                    onChange={(event) => setDecisaoOutro(event.target.value)}
                    className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                  />
                </label>
              ) : (
                <div />
              )}
            </div>

            <label className="mt-3 block">
              <span className="mb-1 block text-xs font-semibold text-slate-600">Observações</span>
              <textarea
                value={observacoes}
                onChange={(event) => setObservacoes(event.target.value)}
                rows={3}
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
              />
            </label>

            <button
              type="button"
              onClick={handleGerarJustificativa}
              disabled={justificativaMutation.loading}
              className="mt-3 rounded-lg bg-slate-900 px-3 py-2 text-sm font-semibold text-white hover:bg-black disabled:opacity-60"
            >
              {justificativaMutation.loading ? 'Gerando documento...' : 'Gerar documento'}
            </button>

            {justificativaGerada ? (
              <div className="mt-4 rounded-xl border border-slate-300 bg-slate-50 p-3 font-mono text-xs text-slate-800">
                <p>JUSTIFICATIVA OPERACIONAL — FRMS</p>
                <p>
                  Tripulante: {justificativaGerada.documento.tripulante.nome} · Data:{' '}
                  {justificativaGerada.documento.data_voo}
                </p>
                <p>
                  Efetividade: {justificativaGerada.documento.effectiveness_real ?? '—'}% —{' '}
                  {justificativaGerada.documento.nivel_fadiga}
                </p>
                <p>Decisão: {justificativaGerada.documento.decisao_tomada}</p>
                <p>Fundamentação: RBAC 135</p>
                <p>
                  Gerado por: {justificativaGerada.documento.gerado_por.nome} em{' '}
                  {justificativaGerada.documento.gerado_em}
                </p>
                <p>🔒 Hash: {justificativaGerada.assinatura_hash.slice(0, 16)}</p>

                <div className="mt-3 flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    onClick={copyJustificativa}
                    className="inline-flex items-center gap-1 rounded-lg border border-slate-300 bg-white px-2.5 py-1 text-[11px] font-semibold text-slate-700 hover:bg-slate-100"
                  >
                    <Copy className="h-3.5 w-3.5" />
                    📋 Copiar texto
                  </button>
                  <button
                    type="button"
                    onClick={downloadJustificativa}
                    className="rounded-lg border border-slate-300 bg-white px-2.5 py-1 text-[11px] font-semibold text-slate-700 hover:bg-slate-100"
                  >
                    ⬇️ Baixar .txt
                  </button>
                </div>
              </div>
            ) : null}

            <div className="mt-4 rounded-xl border border-slate-200 bg-slate-50 p-3">
              <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-600">
                Justificativas anteriores deste tripulante
              </p>
              <div className="mt-2 space-y-1">
                {(justificativasAnteriores || []).slice(0, 8).map((item) => (
                  <div
                    key={item.id}
                    className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs text-slate-700"
                  >
                    <span>{item.data_voo}</span>
                    <span>{item.decisao_tomada}</span>
                    <span className="text-slate-500">{item.gerado_por_nome}</span>
                  </div>
                ))}
                {(justificativasAnteriores || []).length === 0 ? (
                  <p className="text-xs text-slate-500">Nenhuma justificativa anterior.</p>
                ) : null}
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
