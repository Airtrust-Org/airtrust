import React from 'react';
import {
  Clock,
  Activity,
  Plane,
  Thermometer,
  Info,
} from 'lucide-react';

export interface FrmsIogpAuditPanelProps {
  className?: string;
  hasOperationalData?: boolean;
  totalTripulantes?: number;
  totalJornadas?: number;
  // Real aggregates if available
  maxHvDiaMin?: number | null;
  maxHv7dMin?: number | null;
  maxHv28dMin?: number | null;
  maxHvMesMin?: number | null;
  maxHv365dMin?: number | null;
  heatIndexLabel?: string | null;
  windChillStatus?: string | null;
  wbgtKind?: 'MEASURED' | 'ESTIMATED' | 'UNAVAILABLE' | null;
  wbgtValue?: number | null;
  maxFdpHoras?: number | null;
  minRepousoHoras?: number | null;
  avgEffectivenessPct?: number | null;
  effectivenessNivel?: string | null;
  totalSetores?: number | null;
  totalPousos?: number | null;
  totalPousos60m?: number | null;
  totalTrechosCurtos?: number | null;
  totalShuttles?: number | null;
  temperatura?: number | null;
  pontoOrvalho?: number | null;
  umidade?: number | null;
  vento?: string | null;
  isDemo?: boolean;
}

function formatHours(minutes: number | null | undefined): string {
  if (minutes == null || !Number.isFinite(minutes)) return '—';
  const hours = minutes / 60;
  return `${hours.toFixed(1)} h`;
}

function resolveLimitStatus(
  currentMinutes: number | null | undefined,
  limitHours: number,
  warningRatio = 0.85,
): { label: string; color: string } {
  if (currentMinutes == null || !Number.isFinite(currentMinutes)) {
    return {
      label: 'Não avaliado',
      color: 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400',
    };
  }
  const hours = currentMinutes / 60;
  if (hours > limitHours) {
    return {
      label: 'VIOLAÇÃO',
      color: 'bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-300 font-bold',
    };
  }
  if (hours >= limitHours * warningRatio) {
    return {
      label: 'ATENÇÃO',
      color: 'bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300 font-bold',
    };
  }
  return {
    label: 'CONFORME',
    color: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300 font-semibold',
  };
}

export const FrmsIogpAuditPanel: React.FC<FrmsIogpAuditPanelProps> = ({
  className = '',
  hasOperationalData = false,
  totalTripulantes = 0,
  totalJornadas = 0,
  maxHvDiaMin = null,
  maxHv7dMin = null,
  maxHv28dMin = null,
  maxHvMesMin = null,
  maxHv365dMin = null,
  heatIndexLabel = null,
  windChillStatus = null,
  wbgtKind = null,
  wbgtValue = null,
  maxFdpHoras = null,
  minRepousoHoras = null,
  avgEffectivenessPct = null,
  effectivenessNivel = null,
  totalSetores = null,
  totalPousos = null,
  totalPousos60m = null,
  totalTrechosCurtos = null,
  totalShuttles = null,
  temperatura = null,
  pontoOrvalho = null,
  umidade = null,
  vento = null,
  isDemo = false,
}) => {
  const status1d = resolveLimitStatus(maxHvDiaMin, 8);
  const status7d = resolveLimitStatus(maxHv7dMin, 45);
  const status28d = resolveLimitStatus(maxHv28dMin, 93);
  const statusMes = resolveLimitStatus(maxHvMesMin, 90);
  const status365d = resolveLimitStatus(maxHv365dMin, 930);
  const heatIndexDisplay = heatIndexLabel?.trim() || 'Não avaliado';
  const windChillDisplay = windChillStatus?.trim() || 'Não avaliado';
  const wbgtDisplay =
    wbgtKind === 'MEASURED' && wbgtValue != null
      ? `${wbgtValue.toFixed(1)} °C (medido)`
      : wbgtKind === 'ESTIMATED' && wbgtValue != null
        ? `${wbgtValue.toFixed(1)} °C (estimado)`
        : 'Indisponível';

  const hasAnyHv =
    maxHvDiaMin != null ||
    maxHv7dMin != null ||
    maxHv28dMin != null ||
    maxHvMesMin != null ||
    maxHv365dMin != null;

  return (
    <section
      id="frms-iogp-audit-panel"
      aria-label="FRMS — Monitoramento de Fadiga Operacional IOGP 690-2"
      className={`rounded-3xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900 ${className}`}
    >
      {/* Header com identificação IOGP 690-2 e Status */}
      <div className="flex flex-col gap-3 border-b border-slate-100 pb-5 dark:border-slate-800 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-xl font-bold tracking-tight text-slate-900 dark:text-slate-100">
              FRMS — Monitoramento de Fadiga Operacional
            </h2>
            <span className="inline-flex items-center gap-1.5 rounded-full border border-amber-300 bg-amber-50 px-3 py-0.5 text-xs font-semibold text-amber-900 dark:border-amber-700/60 dark:bg-amber-950/50 dark:text-amber-300">
              <span className="h-1.5 w-1.5 rounded-full bg-amber-500 animate-pulse" />
              IMPLEMENTAÇÃO EM ANDAMENTO
            </span>
          </div>
          <p className="mt-1 text-sm font-medium text-slate-600 dark:text-slate-400">
            IOGP Report 690-2 · Critérios 17C, 18C, 19C e 20C (Diretrizes Internacionais de Fadiga Offshore)
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <span className="inline-flex items-center rounded-lg border border-blue-200 bg-blue-50 px-2.5 py-1 text-xs font-semibold text-blue-800 dark:border-blue-900 dark:bg-blue-950/60 dark:text-blue-300">
            IOGP 690-2
          </span>
          <span className="inline-flex items-center rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-1 text-xs font-medium text-slate-600 dark:border-slate-800 dark:bg-slate-800/80 dark:text-slate-300">
            {hasOperationalData
              ? `${totalTripulantes} tripulantes · ${totalJornadas} jornadas`
              : 'Aguardando dados operacionais SIGVOOS'}
          </span>
        </div>
      </div>

      {/* Banner Informativo / Honest Transparency Notice */}
      <div className="mt-4 flex items-start gap-3 rounded-2xl border border-blue-100 bg-blue-50/70 p-3.5 text-xs text-blue-900 dark:border-blue-950 dark:bg-blue-950/30 dark:text-blue-200">
        <Info className="mt-0.5 h-4 w-4 shrink-0 text-blue-600 dark:text-blue-400" />
        <div className="leading-relaxed">
          <p className="font-semibold">
            {isDemo
              ? 'Ambiente de demonstração — dados operacionais simulados para validação da implementação IOGP 690-2.'
              : 'Matriz de Avaliação Contínua de Fadiga e Riscos Operacionais IOGP 690-2.'}
          </p>
          <p className="mt-0.5 text-blue-800 dark:text-blue-300">
            {isDemo
              ? 'Conjunto sanitizado de testes QA para exibição de compliance, alerta biológico e demanda operacional.'
              : hasOperationalData
              ? 'Métricas monitoradas em conformidade com as regras mais restritivas entre Lei 13.475, ANAC RBAC 117 e IOGP 690-2.'
              : 'Aguardando dados operacionais do SIGVOOS e telemetria DECEA / REDEMET para cálculo e avaliação automática de conformidade.'}
          </p>
        </div>
      </div>

      {/* Grid 2x2 dos 4 Cards Obrigatórios */}
      <div className="mt-5 grid grid-cols-1 gap-4 lg:grid-cols-2">
        {/* CARD 1: COMPLIANCE / LIMITES IOGP / LEI 13.475 */}
        <div className="flex flex-col justify-between rounded-2xl border border-slate-200 bg-slate-50/60 p-4 dark:border-slate-800 dark:bg-slate-800/40">
          <div>
            <div className="flex items-center justify-between border-b border-slate-200/80 pb-2.5 dark:border-slate-700/60">
              <div className="flex items-center gap-2">
                <Clock className="h-4 w-4 text-blue-600 dark:text-blue-400" />
                <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100">
                  1. Compliance (IOGP) / Lei 13.475
                </h3>
              </div>
              <span className={`rounded-md border px-2 py-0.5 text-[11px] font-semibold ${
                hasAnyHv ? 'border-blue-300 bg-blue-50 text-blue-900 dark:bg-blue-950 dark:text-blue-200' : 'border-slate-300 bg-white text-slate-700 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300'
              }`}>
                {hasAnyHv ? 'MONITORADO' : 'NÃO AVALIADO'}
              </span>
            </div>

            {/* Horas de voo cumulativas */}
            <div className="mt-3">
              <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                Horas de Voo Cumulativas
              </p>
              <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-5">
                <div className="rounded-xl border border-slate-200 bg-white p-2.5 text-center dark:border-slate-700 dark:bg-slate-900">
                  <span className="block text-[11px] font-medium text-slate-500 dark:text-slate-400">1 dia</span>
                  <span className="mt-0.5 block text-base font-extrabold text-slate-900 dark:text-slate-100">8 h</span>
                  <span className="block text-[10px] text-slate-500 dark:text-slate-400">
                    {maxHvDiaMin != null ? `Real: ${formatHours(maxHvDiaMin)}` : 'Helicóptero 8 h'}
                  </span>
                  <span className={`mt-1 block rounded px-1 py-0.5 text-[10px] ${status1d.color}`}>
                    {status1d.label}
                  </span>
                </div>
                <div className="rounded-xl border border-slate-200 bg-white p-2.5 text-center dark:border-slate-700 dark:bg-slate-900">
                  <span className="block text-[11px] font-medium text-slate-500 dark:text-slate-400">7 dias</span>
                  <span className="mt-0.5 block text-base font-extrabold text-slate-900 dark:text-slate-100">45 h</span>
                  <span className="block text-[10px] text-slate-500 dark:text-slate-400">
                    {maxHv7dMin != null ? `Real: ${formatHours(maxHv7dMin)}` : 'IOGP/contratual'}
                  </span>
                  <span className={`mt-1 block rounded px-1 py-0.5 text-[10px] ${status7d.color}`}>
                    {status7d.label}
                  </span>
                </div>
                <div className="rounded-xl border border-slate-200 bg-white p-2.5 text-center dark:border-slate-700 dark:bg-slate-900">
                  <span className="block text-[11px] font-medium text-slate-500 dark:text-slate-400">28 dias</span>
                  <span className="mt-0.5 block text-base font-extrabold text-slate-900 dark:text-slate-100">93 h</span>
                  <span className="block text-[10px] text-slate-500 dark:text-slate-400">
                    {maxHv28dMin != null ? `Real: ${formatHours(maxHv28dMin)}` : 'RBAC 117'}
                  </span>
                  <span className={`mt-1 block rounded px-1 py-0.5 text-[10px] ${status28d.color}`}>
                    {status28d.label}
                  </span>
                </div>
                <div className="rounded-xl border border-slate-200 bg-white p-2.5 text-center dark:border-slate-700 dark:bg-slate-900">
                  <span className="block text-[11px] font-medium text-slate-500 dark:text-slate-400">Mês calendário</span>
                  <span className="mt-0.5 block text-base font-extrabold text-slate-900 dark:text-slate-100">90 h</span>
                  <span className="block text-[10px] text-slate-500 dark:text-slate-400">
                    {maxHvMesMin != null ? `Real: ${formatHours(maxHvMesMin)}` : 'Lei 13.475'}
                  </span>
                  <span className={`mt-1 block rounded px-1 py-0.5 text-[10px] ${statusMes.color}`}>
                    {statusMes.label}
                  </span>
                </div>
                <div className="rounded-xl border border-slate-200 bg-white p-2.5 text-center dark:border-slate-700 dark:bg-slate-900">
                  <span className="block text-[11px] font-medium text-slate-500 dark:text-slate-400">365 dias</span>
                  <span className="mt-0.5 block text-base font-extrabold text-slate-900 dark:text-slate-100">930 h</span>
                  <span className="block text-[10px] text-slate-500 dark:text-slate-400">
                    {maxHv365dMin != null ? `Real: ${formatHours(maxHv365dMin)}` : 'Lei 13.475'}
                  </span>
                  <span className={`mt-1 block rounded px-1 py-0.5 text-[10px] ${status365d.color}`}>
                    {status365d.label}
                  </span>
                </div>
              </div>
            </div>

            {/* FDP e Repouso */}
            <div className="mt-3 space-y-2 text-xs">
              <div className="flex items-center justify-between rounded-lg border border-slate-200/80 bg-white px-3 py-2 dark:border-slate-700/60 dark:bg-slate-900">
                <div>
                  <span className="font-semibold text-slate-800 dark:text-slate-200">FDP (Período de Serviço de Voo):</span>
                  <span className="ml-1 text-slate-600 dark:text-slate-400">
                    {maxFdpHoras != null ? `Real máx: ${maxFdpHoras.toFixed(1)} h (Teto IOGP 14 h)` : 'Teto IOGP de 14 h'}
                  </span>
                </div>
                <span className="rounded bg-slate-100 px-1.5 py-0.5 font-medium text-slate-600 dark:bg-slate-800 dark:text-slate-400">
                  {maxFdpHoras != null ? (maxFdpHoras <= 14 ? 'CONFORME' : 'VIOLAÇÃO') : 'Não avaliado'}
                </span>
              </div>
              <div className="flex items-center justify-between rounded-lg border border-slate-200/80 bg-white px-3 py-2 dark:border-slate-700/60 dark:bg-slate-900">
                <div>
                  <span className="font-semibold text-slate-800 dark:text-slate-200">Repouso Mínimo:</span>
                  <span className="ml-1 text-slate-600 dark:text-slate-400">
                    {minRepousoHoras != null ? `Real mín: ${minRepousoHoras.toFixed(1)} h (Mín. 10 h)` : 'Mínimo 10 h ou FDP anterior'}
                  </span>
                </div>
                <span className="rounded bg-slate-100 px-1.5 py-0.5 font-medium text-slate-600 dark:bg-slate-800 dark:text-slate-400">
                  {minRepousoHoras != null ? (minRepousoHoras >= 10 ? 'CONFORME' : 'VIOLAÇÃO') : 'Não avaliado'}
                </span>
              </div>
            </div>
          </div>

          <p className="mt-3 text-[11px] leading-relaxed text-slate-600 dark:text-slate-400">
            * Aplica-se sempre a regra mais restritiva entre Lei 13.475, RBAC 117 ANAC e IOGP Report 690-2.
          </p>
        </div>

        {/* CARD 2: ALERTA BIOLÓGICO & PRONTIDÃO */}
        <div className="flex flex-col justify-between rounded-2xl border border-slate-200 bg-slate-50/60 p-4 dark:border-slate-800 dark:bg-slate-800/40">
          <div>
            <div className="flex items-center justify-between border-b border-slate-200/80 pb-2.5 dark:border-slate-700/60">
              <div className="flex items-center gap-2">
                <Activity className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
                <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100">
                  2. Alerta Biológico & Circadiano
                </h3>
              </div>
              <span className={`rounded-md border px-2 py-0.5 text-[11px] font-semibold ${
                avgEffectivenessPct != null ? 'border-emerald-300 bg-emerald-50 text-emerald-900 dark:bg-emerald-950 dark:text-emerald-200' : 'border-slate-300 bg-white text-slate-700 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300'
              }`}>
                {avgEffectivenessPct != null ? (effectivenessNivel ?? 'AVALIADO') : 'NÃO AVALIADO'}
              </span>
            </div>

            <div className="mt-3 grid grid-cols-2 gap-2 text-xs">
              <div className="rounded-xl border border-slate-200 bg-white p-2.5 dark:border-slate-700 dark:bg-slate-900">
                <span className="block text-[11px] text-slate-500 dark:text-slate-400">Índice de Alerta Estimado</span>
                <span className="mt-0.5 block text-lg font-bold text-slate-800 dark:text-slate-200">
                  {avgEffectivenessPct != null ? `${avgEffectivenessPct.toFixed(1)}%` : '—'}
                </span>
                <span className="text-[10px] text-slate-500">Prontidão bio-matemática</span>
              </div>
              <div className="rounded-xl border border-slate-200 bg-white p-2.5 dark:border-slate-700 dark:bg-slate-900">
                <span className="block text-[11px] text-slate-500 dark:text-slate-400">Repouso / Sono</span>
                <span className="mt-0.5 block text-lg font-bold text-slate-800 dark:text-slate-200">
                  {minRepousoHoras != null ? `${minRepousoHoras.toFixed(1)} h` : '—'}
                </span>
                <span className="text-[10px] text-slate-500">Horas acumuladas</span>
              </div>
              <div className="rounded-xl border border-slate-200 bg-white p-2.5 dark:border-slate-700 dark:bg-slate-900">
                <span className="block text-[11px] text-slate-500 dark:text-slate-400">WOCL (Janela Circadiana)</span>
                <span className="mt-0.5 block text-lg font-bold text-slate-800 dark:text-slate-200">02:00 – 05:59</span>
                <span className="text-[10px] text-slate-500">Janela de baixa biológica</span>
              </div>
              <div className="rounded-xl border border-slate-200 bg-white p-2.5 dark:border-slate-700 dark:bg-slate-900">
                <span className="block text-[11px] text-slate-500 dark:text-slate-400">Jornadas Consecutivas / KSS</span>
                <span className="mt-0.5 block text-lg font-bold text-slate-800 dark:text-slate-200">—</span>
                <span className="text-[10px] text-slate-500">Sem check-in pendente</span>
              </div>
            </div>
          </div>

          <p className="mt-3 rounded-lg bg-slate-100/80 p-2 text-center text-xs font-medium text-slate-600 dark:bg-slate-800/80 dark:text-slate-300">
            {avgEffectivenessPct != null
              ? 'Avaliação de prontidão bio-matemática calculada pelo engine canônico FRMS.'
              : 'Sem dados operacionais suficientes para avaliação biológica.'}
          </p>
        </div>

        {/* CARD 3: DEMANDA OPERACIONAL — IOGP 17C.1 */}
        <div className="flex flex-col justify-between rounded-2xl border border-slate-200 bg-slate-50/60 p-4 dark:border-slate-800 dark:bg-slate-800/40">
          <div>
            <div className="flex items-center justify-between border-b border-slate-200/80 pb-2.5 dark:border-slate-700/60">
              <div className="flex items-center gap-2">
                <Plane className="h-4 w-4 text-indigo-600 dark:text-indigo-400" />
                <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100">
                  3. Demanda Operacional — IOGP 17C.1
                </h3>
              </div>
              <span className={`rounded-md border px-2 py-0.5 text-[11px] font-semibold ${
                totalSetores != null
                  ? isDemo
                    ? 'border-indigo-300 bg-indigo-50 text-indigo-900 dark:border-indigo-800 dark:bg-indigo-950 dark:text-indigo-200'
                    : 'border-indigo-300 bg-indigo-50 text-indigo-900 dark:bg-indigo-950 dark:text-indigo-200'
                  : 'border-amber-300 bg-amber-50 text-amber-900 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-300'
              }`}>
                {totalSetores != null
                  ? isDemo
                    ? 'DEMONSTRAÇÃO QA'
                    : 'TELEMETRIA SIGVOOS'
                  : 'AGUARDANDO DADOS SIGVOOS'}
              </span>
            </div>

            <div className="mt-3 grid grid-cols-2 gap-2 text-xs sm:grid-cols-4">
              <div className="rounded-xl border border-slate-200 bg-white p-2 text-center dark:border-slate-700 dark:bg-slate-900">
                <span className="block text-[10px] text-slate-500 dark:text-slate-400">Setores</span>
                <span className="mt-0.5 block text-base font-bold text-slate-800 dark:text-slate-200">
                  {totalSetores != null ? totalSetores : '—'}
                </span>
              </div>
              <div className="rounded-xl border border-slate-200 bg-white p-2 text-center dark:border-slate-700 dark:bg-slate-900">
                <span className="block text-[10px] text-slate-500 dark:text-slate-400">Pousos</span>
                <span className="mt-0.5 block text-base font-bold text-slate-800 dark:text-slate-200">
                  {totalPousos != null ? totalPousos : '—'}
                </span>
              </div>
              <div className="rounded-xl border border-slate-200 bg-white p-2 text-center dark:border-slate-700 dark:bg-slate-900">
                <span className="block text-[10px] text-slate-500 dark:text-slate-400">Pousos (60m)</span>
                <span className="mt-0.5 block text-base font-bold text-slate-800 dark:text-slate-200">
                  {totalPousos60m != null ? totalPousos60m : '—'}
                </span>
              </div>
              <div className="rounded-xl border border-slate-200 bg-white p-2 text-center dark:border-slate-700 dark:bg-slate-900">
                <span className="block text-[10px] text-slate-500 dark:text-slate-400">Trechos Curtos</span>
                <span className="mt-0.5 block text-base font-bold text-slate-800 dark:text-slate-200">
                  {totalTrechosCurtos != null ? totalTrechosCurtos : '—'}
                </span>
              </div>
              <div className="rounded-xl border border-slate-200 bg-white p-2 text-center dark:border-slate-700 dark:bg-slate-900">
                <span className="block text-[10px] text-slate-500 dark:text-slate-400">Shuttles</span>
                <span className="mt-0.5 block text-base font-bold text-slate-800 dark:text-slate-200">
                  {totalShuttles != null ? totalShuttles : '—'}
                </span>
              </div>
              <div className="rounded-xl border border-slate-200 bg-white p-2 text-center dark:border-slate-700 dark:bg-slate-900">
                <span className="block text-[10px] text-slate-500 dark:text-slate-400">Bloco Contínuo</span>
                <span className="mt-0.5 block text-base font-bold text-slate-800 dark:text-slate-200">—</span>
              </div>
              <div className="rounded-xl border border-slate-200 bg-white p-2 text-center dark:border-slate-700 dark:bg-slate-900">
                <span className="block text-[10px] text-slate-500 dark:text-slate-400">Pausa Operac.</span>
                <span className="mt-0.5 block text-base font-bold text-slate-800 dark:text-slate-200">—</span>
              </div>
              <div className="rounded-xl border border-slate-200 bg-white p-2 text-center dark:border-slate-700 dark:bg-slate-900">
                <span className="block text-[10px] text-slate-500 dark:text-slate-400">Exigência</span>
                <span className="mt-0.5 block text-base font-bold text-slate-800 dark:text-slate-200">—</span>
              </div>
            </div>
          </div>

          <p className="mt-3 text-[11px] leading-relaxed text-slate-600 dark:text-slate-400">
            IOGP 17C.1 — restrições adicionais para operações particularmente exigentes, incluindo múltiplos trechos offshore curtos e shuttles offshore (Benchmark operacional).
          </p>
        </div>

        {/* CARD 4: AMBIENTE — IOGP 17C.1 & METEOROLOGIA */}
        <div className="flex flex-col justify-between rounded-2xl border border-slate-200 bg-slate-50/60 p-4 dark:border-slate-800 dark:bg-slate-800/40">
          <div>
            <div className="flex items-center justify-between border-b border-slate-200/80 pb-2.5 dark:border-slate-700/60">
              <div className="flex items-center gap-2">
                <Thermometer className="h-4 w-4 text-rose-600 dark:text-rose-400" />
                <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100">
                  4. Ambiente — IOGP 17C.1 (DECEA / REDEMET)
                </h3>
              </div>
              <span className={`rounded-md border px-2 py-0.5 text-[11px] font-semibold ${
                temperatura != null ? 'border-rose-300 bg-rose-50 text-rose-900 dark:bg-rose-950 dark:text-rose-200' : 'border-slate-300 bg-white text-slate-700 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300'
              }`}>
                {temperatura != null ? 'METEOROLOGIA REDEMET' : 'METEOROLOGIA NÃO AVALIADA'}
              </span>
            </div>

            <div className="mt-3 grid grid-cols-2 gap-2 text-xs sm:grid-cols-4">
              <div className="rounded-xl border border-slate-200 bg-white p-2 text-center dark:border-slate-700 dark:bg-slate-900">
                <span className="block text-[10px] text-slate-500 dark:text-slate-400">Temperatura</span>
                <span className="mt-0.5 block text-base font-bold text-slate-800 dark:text-slate-200">
                  {temperatura != null ? `${temperatura}°C` : '—'}
                </span>
              </div>
              <div className="rounded-xl border border-slate-200 bg-white p-2 text-center dark:border-slate-700 dark:bg-slate-900">
                <span className="block text-[10px] text-slate-500 dark:text-slate-400">Ponto Orvalho</span>
                <span className="mt-0.5 block text-base font-bold text-slate-800 dark:text-slate-200">
                  {pontoOrvalho != null ? `${pontoOrvalho}°C` : '—'}
                </span>
              </div>
              <div className="rounded-xl border border-slate-200 bg-white p-2 text-center dark:border-slate-700 dark:bg-slate-900">
                <span className="block text-[10px] text-slate-500 dark:text-slate-400">Umidade</span>
                <span className="mt-0.5 block text-base font-bold text-slate-800 dark:text-slate-200">
                  {umidade != null ? `${umidade}%` : '—'}
                </span>
              </div>
              <div className="rounded-xl border border-slate-200 bg-white p-2 text-center dark:border-slate-700 dark:bg-slate-900">
                <span className="block text-[10px] text-slate-500 dark:text-slate-400">Vento</span>
                <span className="mt-0.5 block text-base font-bold text-slate-800 dark:text-slate-200">
                  {vento ?? '—'}
                </span>
              </div>
            </div>

            <div className="mt-2.5 grid grid-cols-3 gap-2 text-[11px]">
              <div className="rounded-lg border border-slate-200 bg-white p-1.5 text-center dark:border-slate-700 dark:bg-slate-900">
                <span className="text-slate-500">Heat Index:</span>{' '}
                <span className="font-semibold text-slate-700 dark:text-slate-300">
                  {heatIndexDisplay}
                </span>
              </div>
              <div className="rounded-lg border border-slate-200 bg-white p-1.5 text-center dark:border-slate-700 dark:bg-slate-900">
                <span className="text-slate-500">Wind Chill:</span>{' '}
                <span className="font-semibold text-slate-700 dark:text-slate-300">
                  {windChillDisplay}
                </span>
              </div>
              <div className="rounded-lg border border-slate-200 bg-white p-1.5 text-center dark:border-slate-700 dark:bg-slate-900">
                <span className="text-slate-500">WBGT:</span>{' '}
                <span className="font-semibold text-slate-700 dark:text-slate-300">{wbgtDisplay}</span>
              </div>
            </div>
          </div>

          <div className="mt-3 flex items-center justify-between border-t border-slate-200/80 pt-2 text-[11px] text-slate-600 dark:border-slate-700/60 dark:text-slate-400">
            <span>Fonte: <strong className="font-semibold text-slate-800 dark:text-slate-200">DECEA / REDEMET</strong> {temperatura != null ? '(sincronizado)' : '(aguardando dados)'}</span>
            <span className="italic text-slate-500">WBGT requer sensor dedicado</span>
          </div>
        </div>
      </div>
    </section>
  );
};

export default FrmsIogpAuditPanel;
