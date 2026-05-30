import { useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  Bot,
  Brain,
  CalendarDays,
  Clock3,
  Copy,
  FileText,
  FlaskConical,
  MoonStar,
  X,
} from 'lucide-react';
import {
  useFrmsCompararDias,
  useFrmsDayExplanation,
  useFrmsJustificativas,
  useFrmsMutation,
  type FrmsJustificativaGeradaResponse,
  type FrmsSimulacaoResponse,
} from '@/react-app/hooks/useFrms';
import type {
  FrmsDayExplanationFactor,
  FrmsDayExplanationRecommendation,
} from '@/react-app/hooks/useFrms';
import {
  formatFrmsDate,
  getEffectivenessHex,
  getEffectivenessLabel,
  type ConfigLimites,
} from '../frmsUtils';

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

function previousDate(value: string): string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return value;
  const d = new Date(`${value}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() - 1);
  return d.toISOString().slice(0, 10);
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function renderLightMarkdown(text: string): string {
  const escaped = escapeHtml(text || '');
  const withBold = escaped.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
  return withBold.replace(/\n\n+/g, '<br/><br/>').replace(/\n/g, '<br/>');
}

function factorLabel(code: string): string {
  if (code === 'basica') return 'Contexto circadiano basal';
  if (code === 'processo_c') return 'Janela circadiana';
  if (code === 'processo_s') return 'Ciclo embarcado';
  if (code === 'hv') return 'Acúmulo de horas de voo';
  if (code === 'repouso') return 'Repouso e sono';
  if (code === 'duracao') return 'Duração da jornada';
  return code;
}

function sanitizeOperationalText(text: string): string {
  return (text || '')
    .replace(/fator_basica_pct\s*:\s*[\d.,-]+/gi, 'contexto circadiano basal auxiliar')
    .replace(/7d pior dia (\d{4}-\d{2}-\d{2}) \(([\d.,]+)\)\.?/gi, (_, date, score) => {
      return `Na janela de 7 dias, o pior ponto foi ${formatFrmsDate(date)}, com índice estimado de ${score}%.`;
    })
    .replace(/28d pior dia (\d{4}-\d{2}-\d{2}) \(([\d.,]+)\)\.?/gi, (_, date, score) => {
      return `Na janela de 28 dias, o pior ponto foi ${formatFrmsDate(date)}, com índice estimado de ${score}%.`;
    });
}

function formatPp(value: number): string {
  return `${value.toFixed(1).replace('.', ',')} pp`;
}

function formatHora(value: string | null | undefined): string | null {
  if (!value) return null;
  if (/^\d{2}:\d{2}$/.test(value)) return value;
  return null;
}

function parseWindowWorst(text: string): {
  d7: { date: string; score: string } | null;
  d28: { date: string; score: string } | null;
} {
  const safe = text || '';
  const m7 = safe.match(/7d pior dia (\d{4}-\d{2}-\d{2}) \(([\d.,]+)\)/i);
  const m28 = safe.match(/28d pior dia (\d{4}-\d{2}-\d{2}) \(([\d.,]+)\)/i);
  return {
    d7: m7 ? { date: formatFrmsDate(m7[1]), score: m7[2].replace('.', ',') } : null,
    d28: m28 ? { date: formatFrmsDate(m28[1]), score: m28[2].replace('.', ',') } : null,
  };
}

function priorityClass(priority: FrmsDayExplanationRecommendation['prioridade']): string {
  if (priority === 'alta') return 'border-rose-200 bg-rose-50 text-rose-700';
  if (priority === 'media') return 'border-amber-200 bg-amber-50 text-amber-700';
  return 'border-sky-200 bg-sky-50 text-sky-700';
}

function factorClass(factor: FrmsDayExplanationFactor, faixa: string): string {
  if (factor.direcao === 'penaliza') {
    if (factor.impacto_pct <= -10) return 'border-rose-200 bg-rose-50';
    return faixa === 'verde' ? 'border-amber-200 bg-amber-50' : 'border-rose-200 bg-rose-50';
  }
  if (factor.direcao === 'favorece') return 'border-teal-200 bg-teal-50';
  return 'border-slate-200 bg-slate-50';
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

  const pct = data.jornada.effectiveness_pct;
  const duracaoFactor =
    data.diagnostico.fatores.find((factor) => factor.codigo === 'duracao')?.impacto_pct ?? null;
  const pctFimEstimado =
    pct != null && duracaoFactor != null ? Math.max(0, Math.min(100, pct + duracaoFactor)) : null;
  const pctPrincipal = pctFimEstimado ?? pct;
  const accent = pctPrincipal != null ? getEffectivenessHex(pctPrincipal, config) : '#64748B';
  const label =
    pctPrincipal != null ? getEffectivenessLabel(pctPrincipal, config) : 'Sem classificação';
  const penalizacaoBaseDiaPts = data.diagnostico.fatores
    .filter((factor) => factor.codigo !== 'duracao' && factor.direcao === 'penaliza')
    .reduce((sum, factor) => sum + Math.abs(Math.min(0, factor.impacto_pct)), 0);
  const penalizacaoIntrajornadaPts = Math.abs(Math.min(0, duracaoFactor ?? 0));
  const semVariacaoIntrajornada = penalizacaoIntrajornadaPts < 0.05;
  const diasCriticosConsecutivos = data.jornada.dias_criticos_consecutivos ?? 0;
  const faixa = data.diagnostico.faixa?.toLowerCase() ?? '';
  const statusTone = faixa.includes('verde')
    ? {
        wrap: 'border-teal-200 bg-teal-50/70',
        title: 'text-teal-800',
      }
    : faixa.includes('amarel') || faixa.includes('aten')
      ? {
          wrap: 'border-amber-200 bg-amber-50/70',
          title: 'text-amber-800',
        }
      : {
          wrap: 'border-rose-200 bg-rose-50/70',
          title: 'text-rose-800',
        };
  const factors = data.diagnostico.fatores.map((factor) => ({
    ...factor,
    resumo: sanitizeOperationalText(factor.resumo),
    titulo: factor.codigo === 'basica' ? 'Contexto circadiano basal' : factor.titulo,
  }));
  const wakeTime = formatHora(data.jornada.hora_acordou || data.jornada.hora_despertar_estimada);
  const apresentacaoTime = formatHora(data.jornada.hora_apresentacao);
  const sonoFormatado = formatMinutes(data.jornada.duracao_sono_efetiva_min);
  const principalFactor =
    [...factors].sort((a, b) => Math.abs(b.impacto_pct) - Math.abs(a.impacto_pct))[0] ?? null;
  const windows = parseWindowWorst(
    `${data.diagnostico.resumo_executivo ?? ''} ${data.diagnostico.explicacao_didatica ?? ''} ${data.diagnostico.explicacao_tecnica ?? ''}`,
  );
  const resumoExecutivo = (() => {
    const partes: string[] = [];
    const nome = tripulanteNome || data.tripulante.nome;
    if (principalFactor) {
      partes.push(
        `${nome} ficou em ${label.toLowerCase()} porque ${factorLabel(principalFactor.codigo).toLowerCase()} foi o principal redutor da margem operacional do dia.`,
      );
    } else {
      partes.push(
        `${nome} ficou em ${label.toLowerCase()} pela combinação dos fatores disponíveis no cálculo diário.`,
      );
    }
    if (
      data.jornada.dia_periodo_embarcado != null &&
      data.jornada.total_dias_periodo != null &&
      data.jornada.total_dias_periodo > 0
    ) {
      partes.push(
        `O sistema também considerou o ${data.jornada.dia_periodo_embarcado}º dia de ${data.jornada.total_dias_periodo} do ciclo embarcado.`,
      );
    }
    if (wakeTime && apresentacaoTime) {
      partes.push(`Na janela circadiana, foram considerados despertar às ${wakeTime} e apresentação às ${apresentacaoTime}.`);
    }
    if (sonoFormatado !== 'Sem dado') {
      partes.push(`O sono informado foi de ${sonoFormatado}.`);
    }
    return partes.join(' ');
  })();
  const explicacaoOperacional = (() => {
    const partes: string[] = [`A leitura foi classificada como ${label.toLowerCase()}.`];
    const hv = factors.find((f) => f.codigo === 'hv');
    if (hv) {
      partes.push(
        `O maior peso veio de ${factorLabel(hv.codigo).toLowerCase()}, com impacto de ${formatPp(hv.impacto_pct)} na margem do dia.`,
      );
    }
    const ciclo = factors.find((f) => f.codigo === 'processo_s');
    if (
      ciclo &&
      data.jornada.dia_periodo_embarcado != null &&
      data.jornada.total_dias_periodo != null &&
      data.jornada.total_dias_periodo > 0
    ) {
      partes.push(
        `O ciclo embarcado também contribuiu, pois o tripulante estava no ${data.jornada.dia_periodo_embarcado}º dia de ${data.jornada.total_dias_periodo} do período.`,
      );
    }
    const circ = factors.find((f) => f.codigo === 'processo_c');
    if (circ && wakeTime && apresentacaoTime) {
      partes.push(
        `A janela circadiana foi considerada menos favorável pela combinação entre despertar às ${wakeTime} e apresentação às ${apresentacaoTime}.`,
      );
    }
    const repouso = factors.find((f) => f.codigo === 'repouso');
    if (repouso && sonoFormatado !== 'Sem dado') {
      partes.push(
        `O sono informado de ${sonoFormatado} ${
          Math.abs(repouso.impacto_pct) < 0.05
            ? 'não acrescentou penalização relevante neste cálculo.'
            : `entrou com impacto de ${formatPp(repouso.impacto_pct)}.`
        }`,
      );
    }
    return partes.join(' ');
  })();

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
            {tripulanteNome || data.tripulante.nome} · {formatFrmsDate(date)}
          </h4>
          <p className="mt-1 text-sm text-slate-500">
            Leitura operacional baseada nos dados disponíveis do dia.
          </p>
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

      <div className="mt-4 grid gap-3 xl:grid-cols-[1.25fr_0.9fr]">
        <section className={`rounded-2xl border p-4 shadow-sm ${statusTone.wrap}`}>
          <div className="flex items-center gap-2 text-slate-800">
            <Brain className="h-4 w-4" />
            <h5 className={`text-sm font-semibold uppercase tracking-[0.16em] ${statusTone.title}`}>
              Síntese do Dia
            </h5>
          </div>
          <p className="mt-3 text-sm leading-6 text-slate-700">
            {resumoExecutivo}
          </p>
          <p className="mt-3 text-sm leading-6 text-slate-600">
            {explicacaoOperacional}
          </p>

          <div className="mt-4 grid gap-2 sm:grid-cols-2">
            <div className="rounded-2xl border border-rose-200 bg-rose-50 p-3">
              <div className="text-xs font-semibold uppercase tracking-[0.16em] text-rose-700">
                Penalização de Base do Dia
              </div>
              <p className="mt-1 text-base font-bold text-rose-800">
                {formatPp(penalizacaoBaseDiaPts)}
              </p>
              <p className="text-[11px] text-rose-600">
                Soma dos fatores já presentes no início do dia: histórico recente de voo, ciclo
                embarcado, janela circadiana e repouso/sono.
              </p>
            </div>
            <div className="rounded-2xl border border-amber-200 bg-amber-50 p-3">
              <div className="text-xs font-semibold uppercase tracking-[0.16em] text-amber-700">
                Penalização Intrajornada
              </div>
              <p className="mt-1 text-base font-bold text-amber-800">
                {formatPp(penalizacaoIntrajornadaPts)}
              </p>
              <p className="text-[11px] text-amber-600">
                Componente associado à duração/variação da jornada.
              </p>
            </div>
          </div>

          {semVariacaoIntrajornada ? (
            <div className="mt-3 rounded-xl border border-sky-200 bg-sky-50 px-3 py-2 text-xs text-sky-700">
              Sem variação intrajornada por duração neste dia. Por isso, início e fim estimado podem
              coincidir.
            </div>
          ) : null}

          <div className="mt-4 grid gap-3 sm:grid-cols-3">
            <div className="rounded-2xl border border-slate-200 bg-slate-50 p-3">
              <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">
                <Clock3 className="h-3.5 w-3.5" />
                Tempo Crítico
              </div>
              <p className="mt-2 text-base font-semibold text-slate-900">
                {formatMinutesCompact(data.jornada.tempo_abaixo_limiar_min)}
              </p>
            </div>
            <div className="rounded-2xl border border-slate-200 bg-slate-50 p-3">
              <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">
                <MoonStar className="h-3.5 w-3.5" />
                Sono Efetivo
              </div>
              <p className="mt-2 text-base font-semibold text-slate-900">
                {formatMinutes(data.jornada.duracao_sono_efetiva_min)}
              </p>
            </div>
            <div className="rounded-2xl border border-slate-200 bg-slate-50 p-3">
              <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">
                <AlertTriangle className="h-3.5 w-3.5" />
                Fator Principal
              </div>
              <p className="mt-2 text-sm font-semibold text-slate-900">
                {principalFactor ? factorLabel(principalFactor.codigo) : data.diagnostico.fator_principal}
              </p>
              {principalFactor ? (
                <p className="mt-1 text-xs text-slate-600">
                  Maior impacto: {formatPp(principalFactor.impacto_pct)}
                </p>
              ) : null}
              {windows.d7 && windows.d28 ? (
                windows.d7.date === windows.d28.date && windows.d7.score === windows.d28.score ? (
                  <p className="mt-1 text-xs text-slate-600">
                    Nas janelas de 7 e 28 dias, o pior ponto foi {windows.d7.date}, com índice
                    estimado de {windows.d7.score}%.
                  </p>
                ) : (
                  <p className="mt-1 text-xs text-slate-600">
                    Na janela de 7 dias, o pior ponto foi {windows.d7.date}, com índice estimado
                    de {windows.d7.score}%. Na janela de 28 dias, o pior ponto foi{' '}
                    {windows.d28.date}, com índice estimado de {windows.d28.score}%.
                  </p>
                )
              ) : windows.d7 ? (
                <p className="mt-1 text-xs text-slate-600">
                  Na janela de 7 dias, o pior ponto foi {windows.d7.date}, com índice estimado de{' '}
                  {windows.d7.score}%.
                </p>
              ) : windows.d28 ? (
                <p className="mt-1 text-xs text-slate-600">
                  Na janela de 28 dias, o pior ponto foi {windows.d28.date}, com índice estimado de{' '}
                  {windows.d28.score}%.
                </p>
              ) : (
                <p className="mt-1 text-xs text-slate-600">
                  Dado bruto da janela não disponível neste payload.
                </p>
              )}
            </div>
          </div>

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
              📄 Gerar justificativa
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
                    COMPARAÇÃO: {formatFrmsDate(comparisonData.dia_a.data)} →{' '}
                    {formatFrmsDate(comparisonData.dia_b.data)}
                  </p>
                  <div className="overflow-auto rounded-xl border border-slate-200 bg-white">
                    <table className="min-w-full text-xs">
                      <thead className="bg-slate-100 text-slate-600">
                        <tr>
                          <th className="px-3 py-2 text-left">Fator</th>
                          <th className="px-3 py-2 text-right">
                            {formatFrmsDate(comparisonData.dia_a.data)}
                          </th>
                          <th className="px-3 py-2 text-right">
                            {formatFrmsDate(comparisonData.dia_b.data)}
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
        </section>

        <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <div className="flex items-center gap-2 text-slate-800">
            <Bot className="h-4 w-4" />
            <h5 className="text-sm font-semibold uppercase tracking-[0.16em]">
              Explicação operacional
            </h5>
          </div>
          <div
            className="mt-3 text-sm leading-6 text-slate-700 [&_strong]:font-semibold [&_strong]:text-slate-900"
            dangerouslySetInnerHTML={{
              __html: renderLightMarkdown(sanitizeOperationalText(data.copiloto.texto)),
            }}
          />
        </section>
      </div>

      <div className="mt-4 grid gap-3 xl:grid-cols-2">
        <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <h5 className="text-sm font-semibold uppercase tracking-[0.16em] text-slate-800">
            Principais Fatores
          </h5>
          {data.diagnostico.faixa === 'verde' ? (
            <p className="mt-2 text-xs text-slate-500">
              Os impactos abaixo mostram contribuição de cada componente, mas não significam risco
              operacional isolado quando o score final está em faixa verde.
            </p>
          ) : null}
          <div className="mt-3 space-y-2.5">
            {factors.map((factor) => (
              <div
                key={factor.codigo}
                className={`rounded-2xl border p-3 ${factorClass(factor, data.diagnostico.faixa)}`}
              >
                <div className="flex items-center justify-between gap-3">
                  <p className="text-sm font-semibold text-slate-900">{factorLabel(factor.codigo)}</p>
                  <span className="text-sm font-bold text-slate-700">
                    {formatPp(factor.impacto_pct)}
                  </span>
                </div>
                <p className="mt-1 text-sm leading-5 text-slate-600">{factor.resumo}</p>
              </div>
            ))}
          </div>
          <div className="mt-3 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-600">
            Ferramenta de triagem operacional. A leitura é estimativa, exige revisão humana, não
            diagnostica fadiga, não determina aptidão ou restrição automática e não valida
            SAFTE-FAST.
          </div>
        </section>

        <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <h5 className="text-sm font-semibold uppercase tracking-[0.16em] text-slate-800">
            O que verificar antes de agir
          </h5>
          <div className="mt-3 space-y-2.5">
            {data.diagnostico.recomendacoes.length === 0 ? (
              <div className="rounded-2xl border border-slate-200 bg-slate-50 p-3 text-sm text-slate-600">
                Sem recomendação adicional para este dia além do monitoramento normal.
              </div>
            ) : (
              data.diagnostico.recomendacoes.map((recommendation) => (
                <div
                  key={recommendation.codigo}
                  className={`rounded-2xl border p-3 ${priorityClass(recommendation.prioridade)}`}
                >
                  <div className="flex items-center justify-between gap-3">
                    <p className="text-sm font-semibold">{recommendation.titulo}</p>
                    <span className="rounded-full border border-current/20 px-2 py-0.5 text-[10px] font-bold uppercase tracking-[0.16em]">
                      {recommendation.prioridade}
                    </span>
                  </div>
                  <p className="mt-1 text-sm leading-5 opacity-90">{recommendation.descricao}</p>
                </div>
              ))
            )}
          </div>
        </section>
      </div>

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
                  <option>Aplicou mitigação (briefing reforçado)</option>
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
                  {formatFrmsDate(justificativaGerada.documento.data_voo)}
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
