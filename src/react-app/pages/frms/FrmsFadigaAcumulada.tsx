/**
 * FRMS — Fadiga Acumulada Legal (PRC-OPS-012)
 *
 * Panorama de fadiga acumulada: % dos limites 176h jornada / 90h voo
 * com cores semânticas de risco independentes dos enums históricos do backend.
 */
import { useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Activity,
  AlertTriangle,
  ArrowLeft,
  ChevronDown,
  ChevronUp,
  Users,
  Clock,
  Plane,
} from 'lucide-react';
import AppLayout from '@/react-app/components/AppLayout';
import { useApi } from '@/react-app/hooks/useApi';
import {
  FADIGA_ACUMULADA_LEGENDA,
  getFadigaAcumuladaVisual,
} from './fadigaAcumuladaVisual';

interface TripulanteFadiga {
  tripulante_id: string;
  nome: string;
  funcao: string | null;
  jornada_horas: number;
  voo_horas: number;
  pct_jornada: number;
  pct_voo: number;
  dias_jornada: number;
  dia_ciclo: number | null;
  alerta: 'normal' | 'verde' | 'amarelo' | 'vermelho';
  em_alerta: boolean;
}

interface FrotaResponse {
  success: boolean;
  data: {
    mes: string;
    limites: { jornada_horas: number; voo_horas: number };
    thresholds: { verde: number; amarelo: number; vermelho: number };
    frota: TripulanteFadiga[];
    resumo: {
      total_tripulantes: number;
      em_alerta: number;
      criticos: number;
    };
  };
}

interface EvolucaoItem {
  dia: number;
  data: string;
  dia_ciclo: number | null;
  jornada_diaria_min: number;
  voo_diario_min: number;
  jornada_horas: number;
  voo_horas: number;
  jornada_acumulada_horas: number;
  voo_acumulado_horas: number;
  pct_jornada: number;
  pct_voo: number;
  pct_jornada_diaria: number;
  pct_voo_diaria: number;
  pct_jornada_mes: number;
  pct_voo_mes: number;
  alerta_jornada: string;
  alerta_voo: string;
  alerta_jornada_mes: string;
  alerta_voo_mes: string;
  integridade_status: 'OK' | 'INCONSISTENTE';
  integridade_codigo?: string | null;
  integridade_codigos?: string[];
  integridade_mensagem?: string | null;
  inconsistencias: string[];
  valores_brutos?: {
    duracao_jornada_minutos: number | null;
    horas_voo_minutos: number | null;
    hora_apresentacao: string | null;
    hora_termino: string | null;
  };
}

interface IndividualResponse {
  success: boolean;
  data: {
    tripulante_id: string;
    mes: string;
    resumo: {
      jornada_horas: number;
      voo_horas: number;
      pct_jornada: number;
      pct_voo: number;
      alerta: string;
    } | null;
    evolucao: EvolucaoItem[];
  };
}

function getMesAtual() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

function integridadeLabel(codigo?: string | null): string {
  switch (codigo) {
    case 'JORNADA_ZERO_COM_HV':
      return 'Jornada zero';
    case 'JORNADA_AUSENTE_COM_HV':
      return 'Jornada ausente';
    case 'HORARIO_INCOMPLETO_COM_HV':
      return 'Horario incompleto';
    case 'HV_MAIOR_QUE_JORNADA':
      return 'HV > jornada';
    default:
      return 'Inconsistente';
  }
}

function formatMinutos(minutos: number | null | undefined) {
  const total = Math.max(0, Math.round(Number(minutos || 0)));
  const h = Math.floor(total / 60);
  const m = total % 60;
  return `${String(h).padStart(2, '0')}h${String(m).padStart(2, '0')}`;
}

function alertColor(alerta: string) {
  return getFadigaAcumuladaVisual(alerta).barClass;
}

function alertBg(alerta: string) {
  return getFadigaAcumuladaVisual(alerta).surfaceClass;
}

function alertText(alerta: string) {
  return getFadigaAcumuladaVisual(alerta).textClass;
}

function alertLabel(alerta: string) {
  return getFadigaAcumuladaVisual(alerta).label;
}

function ProgressBar({
  value,
  alerta,
  max = 100,
}: {
  value: number;
  alerta: string;
  max?: number;
}) {
  const pct = Math.min((value / max) * 100, 100);
  return (
    <div className="relative w-full h-3 bg-slate-200 dark:bg-slate-700 rounded-full overflow-hidden">
      <div
        className={`h-full rounded-full transition-all ${alertColor(alerta)}`}
        style={{ width: `${pct}%` }}
      />
      {/* Threshold markers: atenção / alerta / crítico */}
      <div className="absolute top-0 left-[80%] w-px h-full bg-amber-700/50" />
      <div className="absolute top-0 left-[90%] w-px h-full bg-orange-700/50" />
      <div className="absolute top-0 left-[95%] w-px h-full bg-red-700/50" />
    </div>
  );
}

function MonthPicker({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <input
      type="month"
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="rounded-lg border border-slate-300 px-3 py-2 text-sm focus:ring-2 focus:ring-primary/30 focus:border-blue-500"
    />
  );
}

export default function FrmsFadigaAcumulada() {
  const navigate = useNavigate();
  const [mes, setMes] = useState(getMesAtual);
  const [selectedTrip, setSelectedTrip] = useState<string | null>(null);
  const [expandedTrip, setExpandedTrip] = useState<string | null>(null);

  const { data: frotaRaw, loading } = useApi<FrotaResponse>(
    `/api/frms/fadiga-acumulada/frota?mes=${mes}`,
  );
  const frota = frotaRaw?.data?.frota || [];
  const resumo = frotaRaw?.data?.resumo;

  const { data: individualRaw } = useApi<IndividualResponse>(
    expandedTrip ? `/api/frms/fadiga-acumulada?mes=${mes}&tripulante_id=${expandedTrip}` : null,
  );
  const evolucao = individualRaw?.data?.evolucao || [];

  const sorted = useMemo(() => {
    return [...frota].sort((a, b) => {
      // Critical first
      if (a.alerta !== b.alerta) {
        const order = { vermelho: 0, amarelo: 1, verde: 2, normal: 3 };
        return (order[a.alerta] ?? 3) - (order[b.alerta] ?? 3);
      }
      return Math.max(b.pct_jornada, b.pct_voo) - Math.max(a.pct_jornada, a.pct_voo);
    });
  }, [frota]);

  return (
    <AppLayout>
      <div className="max-w-7xl mx-auto px-4 sm:px-6 py-6 space-y-6">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div className="flex items-center gap-3">
            <button
              onClick={() => navigate('/frms')}
              className="p-2 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 transition"
            >
              <ArrowLeft className="h-5 w-5 text-slate-600 dark:text-slate-300" />
            </button>
            <div>
              <h1 className="text-xl font-bold text-slate-900 dark:text-slate-100 flex items-center gap-2">
                <Activity className="h-5 w-5 text-blue-600 dark:text-blue-300" />
                Fadiga Acumulada Legal
              </h1>
              <p className="text-sm text-slate-500 dark:text-slate-400 mt-0.5">
                PRC-OPS-012 — % dos limites 176h jornada / 90h voo mensal
              </p>
            </div>
          </div>
          <MonthPicker value={mes} onChange={setMes} />
        </div>

        {/* Resumo cards */}
        {resumo && (
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-700 dark:bg-slate-900">
              <div className="flex items-center gap-2 text-slate-600 dark:text-slate-300 text-sm">
                <Users className="h-4 w-4" /> Tripulantes
              </div>
              <p className="text-2xl font-bold text-slate-900 dark:text-slate-100 mt-1">{resumo.total_tripulantes}</p>
            </div>
            <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 shadow-sm dark:border-amber-800 dark:bg-amber-950/20">
              <div className="flex items-center gap-2 text-amber-700 dark:text-amber-300 text-sm">
                <AlertTriangle className="h-4 w-4" /> Em alerta (≥80%)
              </div>
              <p className="text-2xl font-bold text-amber-700 dark:text-amber-300 mt-1">{resumo.em_alerta}</p>
            </div>
            <div className="rounded-xl border border-red-200 bg-red-50 p-4 shadow-sm dark:border-red-800 dark:bg-red-950/20">
              <div className="flex items-center gap-2 text-red-700 dark:text-red-300 text-sm">
                <AlertTriangle className="h-4 w-4" /> Críticos (≥95%)
              </div>
              <p className="text-2xl font-bold text-red-700 dark:text-red-300 mt-1">{resumo.criticos}</p>
            </div>
          </div>
        )}

        {/* Legend */}
        <div className="flex flex-wrap items-center gap-4 text-xs text-slate-500 dark:text-slate-400">
          {FADIGA_ACUMULADA_LEGENDA.map(({ alerta, faixa }) => {
            const meta = getFadigaAcumuladaVisual(alerta);
            return (
              <div key={alerta} className="flex items-center gap-1.5">
                <div className={`w-3 h-3 rounded-full ${meta.dotClass}`} />
                {faixa} {meta.label}
              </div>
            );
          })}
        </div>

        {/* Fleet table */}
        {loading ? (
          <div className="flex items-center justify-center py-20">
            <div className="animate-spin h-8 w-8 border-4 border-blue-500 border-t-transparent rounded-full" />
          </div>
        ) : sorted.length === 0 ? (
          <div className="text-center py-20 text-slate-400">
            <Activity className="h-12 w-12 mx-auto mb-3 opacity-40" />
            <p>Nenhuma jornada registrada em {mes}</p>
          </div>
        ) : (
          <div className="space-y-2">
            {sorted.map((t) => (
              <div key={t.tripulante_id}>
                <button
                  onClick={() =>
                    setExpandedTrip(expandedTrip === t.tripulante_id ? null : t.tripulante_id)
                  }
                  className={`w-full rounded-xl border p-4 transition hover:shadow-md text-left ${alertBg(t.alerta)}`}
                >
                  <div className="flex flex-col sm:flex-row sm:items-center gap-3">
                    {/* Name + badge */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="font-semibold text-slate-900 dark:text-slate-100 truncate">{t.nome}</span>
                        {t.funcao && (
                          <span className="text-xs px-1.5 py-0.5 rounded bg-slate-200/80 text-slate-600 dark:bg-slate-800 dark:text-slate-300 whitespace-nowrap">
                            {t.funcao}
                          </span>
                        )}
                        {t.dia_ciclo && (
                          <span className="text-xs text-slate-500 dark:text-slate-400">Dia {t.dia_ciclo}</span>
                        )}
                      </div>
                      {/* Jornada bar */}
                      <div className="mt-2 space-y-1">
                        <div className="flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
                          <Clock className="h-3 w-3" />
                          <span>Jornada {t.jornada_horas}h / 176h</span>
                          <span className={`font-semibold ${alertText(t.alerta)}`}>
                            {t.pct_jornada}%
                          </span>
                        </div>
                        <ProgressBar
                          value={t.pct_jornada}
                          alerta={
                            t.pct_jornada >= 95
                              ? 'vermelho'
                              : t.pct_jornada >= 90
                                ? 'amarelo'
                                : t.pct_jornada >= 80
                                  ? 'verde'
                                  : 'normal'
                          }
                        />
                      </div>
                      {/* Voo bar */}
                      <div className="mt-2 space-y-1">
                        <div className="flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
                          <Plane className="h-3 w-3" />
                          <span>Voo {t.voo_horas}h / 90h</span>
                          <span className={`font-semibold ${alertText(t.alerta)}`}>
                            {t.pct_voo}%
                          </span>
                        </div>
                        <ProgressBar
                          value={t.pct_voo}
                          alerta={
                            t.pct_voo >= 95
                              ? 'vermelho'
                              : t.pct_voo >= 90
                                ? 'amarelo'
                                : t.pct_voo >= 80
                                  ? 'verde'
                                  : 'normal'
                          }
                        />
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className={`text-xs font-bold uppercase ${alertText(t.alerta)}`}>
                        {alertLabel(t.alerta)}
                      </span>
                      {expandedTrip === t.tripulante_id ? (
                        <ChevronUp className="h-4 w-4 text-slate-400" />
                      ) : (
                        <ChevronDown className="h-4 w-4 text-slate-400" />
                      )}
                    </div>
                  </div>
                </button>

                {/* Expanded detail: daily evolution */}
                {expandedTrip === t.tripulante_id && evolucao.length > 0 && (
                  <div className="mt-1 ml-4 mr-4 rounded-lg border border-slate-200 bg-white overflow-x-auto dark:border-slate-700 dark:bg-slate-900">
                    <table className="w-full min-w-[920px] text-xs">
                      <thead className="bg-slate-50 text-slate-500 dark:bg-slate-800 dark:text-slate-300">
                        <tr>
                          <th className="px-3 py-2 text-left">Dia</th>
                          <th className="px-3 py-2 text-left">Data</th>
                          <th className="px-3 py-2 text-right">Jornada diária</th>
                          <th className="px-3 py-2 text-right">FAT.JORNADA% dia</th>
                          <th className="px-3 py-2 text-right">HV diária</th>
                          <th className="px-3 py-2 text-right">FAT.HV% dia</th>
                          <th className="px-3 py-2 text-right">Uso mês jornada</th>
                          <th className="px-3 py-2 text-right">Uso mês HV</th>
                          <th className="px-3 py-2 text-center">Auditoria</th>
                        </tr>
                      </thead>
                      <tbody>
                        {evolucao.map((e) => (
                          <tr key={e.data} className="border-t border-slate-100 hover:bg-slate-50 dark:border-slate-800 dark:hover:bg-slate-800/50">
                            <td className="px-3 py-1.5">{e.dia}</td>
                            <td className="px-3 py-1.5">
                              {e.data.slice(8, 10)}/{e.data.slice(5, 7)}
                            </td>
                            <td className="px-3 py-1.5 text-right font-mono">
                              {formatMinutos(e.jornada_diaria_min)}
                            </td>
                            <td className="px-3 py-1.5 text-right">
                              <span className={`font-semibold ${alertText(e.alerta_jornada)}`}>
                                {Number(e.pct_jornada_diaria ?? e.pct_jornada).toFixed(3)}%
                              </span>
                            </td>
                            <td className="px-3 py-1.5 text-right font-mono">
                              {formatMinutos(e.voo_diario_min)}
                            </td>
                            <td className="px-3 py-1.5 text-right">
                              <span className={`font-semibold ${alertText(e.alerta_voo)}`}>
                                {Number(e.pct_voo_diaria ?? e.pct_voo).toFixed(3)}%
                              </span>
                            </td>
                            <td className="px-3 py-1.5 text-right">
                              <span className={`font-semibold ${alertText(e.alerta_jornada_mes)}`}>
                                {Number(e.pct_jornada_mes || 0).toFixed(3)}%
                              </span>
                              <span className="ml-1 font-mono text-slate-400">
                                ({e.jornada_acumulada_horas}h)
                              </span>
                            </td>
                            <td className="px-3 py-1.5 text-right">
                              <span className={`font-semibold ${alertText(e.alerta_voo_mes)}`}>
                                {Number(e.pct_voo_mes || 0).toFixed(3)}%
                              </span>
                              <span className="ml-1 font-mono text-slate-400">
                                ({e.voo_acumulado_horas}h)
                              </span>
                            </td>
                            <td className="px-3 py-1.5 text-center">
                              {e.integridade_status === 'INCONSISTENTE' ? (
                                <span
                                  title={[
                                    e.integridade_mensagem,
                                    ...(e.integridade_codigos || e.inconsistencias || []),
                                  ]
                                    .filter(Boolean)
                                    .join(' | ')}
                                  className="inline-flex max-w-[160px] items-center justify-center rounded-full border border-red-200 bg-red-50 px-2 py-0.5 text-[10px] font-semibold uppercase text-red-700 dark:border-red-800 dark:bg-red-950/30 dark:text-red-300"
                                >
                                  {integridadeLabel(e.integridade_codigo)}
                                </span>
                              ) : (
                                <span className="inline-flex rounded-full border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-[10px] font-semibold uppercase text-emerald-700 dark:border-emerald-800 dark:bg-emerald-950/30 dark:text-emerald-300">
                                  OK
                                </span>
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </AppLayout>
  );
}