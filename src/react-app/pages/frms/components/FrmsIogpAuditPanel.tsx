import React from 'react';
import {
  ShieldAlert,
  Clock,
  Activity,
  Plane,
  Thermometer,
  CloudSun,
  AlertCircle,
  CheckCircle2,
  Info,
  Layers,
  Compass,
} from 'lucide-react';

export interface FrmsIogpAuditPanelProps {
  className?: string;
  hasOperationalData?: boolean;
  totalTripulantes?: number;
  totalJornadas?: number;
}

export const FrmsIogpAuditPanel: React.FC<FrmsIogpAuditPanelProps> = ({
  className = '',
  hasOperationalData = false,
  totalTripulantes = 0,
  totalJornadas = 0,
}) => {
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
            Matriz de Avaliação Contínua de Fadiga e Riscos Operacionais IOGP 690-2.
          </p>
          <p className="mt-0.5 text-blue-800 dark:text-blue-300">
            {hasOperationalData
              ? 'Métricas monitoradas em conformidade com as regras mais restritivas entre ANAC RBAC 117 e IOGP 690-2.'
              : 'Aguardando dados operacionais do SIGVOOS e telemetria DECEA / REDEMET para cálculo e avaliação automática de conformidade.'}
          </p>
        </div>
      </div>

      {/* Grid 2x2 dos 4 Cards Obrigatórios */}
      <div className="mt-5 grid grid-cols-1 gap-4 lg:grid-cols-2">
        {/* CARD 1: COMPLIANCE / LIMITES IOGP */}
        <div className="flex flex-col justify-between rounded-2xl border border-slate-200 bg-slate-50/60 p-4 dark:border-slate-800 dark:bg-slate-800/40">
          <div>
            <div className="flex items-center justify-between border-b border-slate-200/80 pb-2.5 dark:border-slate-700/60">
              <div className="flex items-center gap-2">
                <Clock className="h-4 w-4 text-blue-600 dark:text-blue-400" />
                <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100">
                  1. Compliance / Limites (IOGP 690-2)
                </h3>
              </div>
              <span className="rounded-md border border-slate-300 bg-white px-2 py-0.5 text-[11px] font-semibold text-slate-700 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300">
                NÃO AVALIADO
              </span>
            </div>

            {/* Horas de voo cumulativas */}
            <div className="mt-3">
              <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                Horas de Voo Cumulativas
              </p>
              <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-4">
                <div className="rounded-xl border border-slate-200 bg-white p-2.5 text-center dark:border-slate-700 dark:bg-slate-900">
                  <span className="block text-[11px] font-medium text-slate-500 dark:text-slate-400">1 dia (24h)</span>
                  <span className="mt-0.5 block text-base font-extrabold text-slate-900 dark:text-slate-100">10 h</span>
                  <span className="block text-[10px] text-slate-500 dark:text-slate-400">Máx. IOGP</span>
                  <span className="mt-1 block rounded bg-slate-100 px-1 py-0.5 text-[10px] font-medium text-slate-600 dark:bg-slate-800 dark:text-slate-400">
                    Não avaliado
                  </span>
                </div>
                <div className="rounded-xl border border-slate-200 bg-white p-2.5 text-center dark:border-slate-700 dark:bg-slate-900">
                  <span className="block text-[11px] font-medium text-slate-500 dark:text-slate-400">7 dias</span>
                  <span className="mt-0.5 block text-base font-extrabold text-slate-900 dark:text-slate-100">45 h</span>
                  <span className="block text-[10px] text-slate-500 dark:text-slate-400">Máx. IOGP</span>
                  <span className="mt-1 block rounded bg-slate-100 px-1 py-0.5 text-[10px] font-medium text-slate-600 dark:bg-slate-800 dark:text-slate-400">
                    Não avaliado
                  </span>
                </div>
                <div className="rounded-xl border border-slate-200 bg-white p-2.5 text-center dark:border-slate-700 dark:bg-slate-900">
                  <span className="block text-[11px] font-medium text-slate-500 dark:text-slate-400">28 dias</span>
                  <span className="mt-0.5 block text-base font-extrabold text-slate-900 dark:text-slate-100">120 h</span>
                  <span className="block text-[10px] text-slate-500 dark:text-slate-400">Máx. IOGP</span>
                  <span className="mt-1 block rounded bg-slate-100 px-1 py-0.5 text-[10px] font-medium text-slate-600 dark:bg-slate-800 dark:text-slate-400">
                    Não avaliado
                  </span>
                </div>
                <div className="rounded-xl border border-slate-200 bg-white p-2.5 text-center dark:border-slate-700 dark:bg-slate-900">
                  <span className="block text-[11px] font-medium text-slate-500 dark:text-slate-400">365 dias</span>
                  <span className="mt-0.5 block text-base font-extrabold text-slate-900 dark:text-slate-100">1.200 h</span>
                  <span className="block text-[10px] text-slate-500 dark:text-slate-400">Máx. IOGP</span>
                  <span className="mt-1 block rounded bg-slate-100 px-1 py-0.5 text-[10px] font-medium text-slate-600 dark:bg-slate-800 dark:text-slate-400">
                    Não avaliado
                  </span>
                </div>
              </div>
            </div>

            {/* FDP e Repouso */}
            <div className="mt-3 space-y-2 text-xs">
              <div className="flex items-center justify-between rounded-lg border border-slate-200/80 bg-white px-3 py-2 dark:border-slate-700/60 dark:bg-slate-900">
                <div>
                  <span className="font-semibold text-slate-800 dark:text-slate-200">FDP (Período de Serviço de Voo):</span>
                  <span className="ml-1 text-slate-600 dark:text-slate-400">Teto IOGP de 14 h</span>
                </div>
                <span className="rounded bg-slate-100 px-1.5 py-0.5 font-medium text-slate-600 dark:bg-slate-800 dark:text-slate-400">
                  Não avaliado
                </span>
              </div>
              <div className="flex items-center justify-between rounded-lg border border-slate-200/80 bg-white px-3 py-2 dark:border-slate-700/60 dark:bg-slate-900">
                <div>
                  <span className="font-semibold text-slate-800 dark:text-slate-200">Repouso Mínimo:</span>
                  <span className="ml-1 text-slate-600 dark:text-slate-400">Mínimo 10 h ou FDP anterior</span>
                </div>
                <span className="rounded bg-slate-100 px-1.5 py-0.5 font-medium text-slate-600 dark:bg-slate-800 dark:text-slate-400">
                  Não avaliado
                </span>
              </div>
            </div>
          </div>

          <p className="mt-3 text-[11px] text-slate-500 dark:text-slate-400">
            * Aplica-se sempre a regra mais restritiva entre RBAC 117 ANAC e IOGP Report 690-2.
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
              <span className="rounded-md border border-slate-300 bg-white px-2 py-0.5 text-[11px] font-semibold text-slate-700 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300">
                NÃO AVALIADO
              </span>
            </div>

            <div className="mt-3 grid grid-cols-2 gap-2 text-xs">
              <div className="rounded-xl border border-slate-200 bg-white p-2.5 dark:border-slate-700 dark:bg-slate-900">
                <span className="block text-[11px] text-slate-500 dark:text-slate-400">Índice de Alerta Estimado</span>
                <span className="mt-0.5 block text-lg font-bold text-slate-800 dark:text-slate-200">—</span>
                <span className="text-[10px] text-slate-500">Prontidão bio-matemática</span>
              </div>
              <div className="rounded-xl border border-slate-200 bg-white p-2.5 dark:border-slate-700 dark:bg-slate-900">
                <span className="block text-[11px] text-slate-500 dark:text-slate-400">Repouso / Sono</span>
                <span className="mt-0.5 block text-lg font-bold text-slate-800 dark:text-slate-200">—</span>
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
            Sem dados operacionais suficientes para avaliação biológica.
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
              <span className="rounded-md border border-amber-300 bg-amber-50 px-2 py-0.5 text-[11px] font-semibold text-amber-900 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-300">
                AGUARDANDO DADOS SIGVOOS
              </span>
            </div>

            <div className="mt-3 grid grid-cols-2 gap-2 text-xs sm:grid-cols-4">
              <div className="rounded-xl border border-slate-200 bg-white p-2 text-center dark:border-slate-700 dark:bg-slate-900">
                <span className="block text-[10px] text-slate-500 dark:text-slate-400">Setores</span>
                <span className="mt-0.5 block text-base font-bold text-slate-800 dark:text-slate-200">—</span>
              </div>
              <div className="rounded-xl border border-slate-200 bg-white p-2 text-center dark:border-slate-700 dark:bg-slate-900">
                <span className="block text-[10px] text-slate-500 dark:text-slate-400">Pousos</span>
                <span className="mt-0.5 block text-base font-bold text-slate-800 dark:text-slate-200">—</span>
              </div>
              <div className="rounded-xl border border-slate-200 bg-white p-2 text-center dark:border-slate-700 dark:bg-slate-900">
                <span className="block text-[10px] text-slate-500 dark:text-slate-400">Pousos (60m)</span>
                <span className="mt-0.5 block text-base font-bold text-slate-800 dark:text-slate-200">—</span>
              </div>
              <div className="rounded-xl border border-slate-200 bg-white p-2 text-center dark:border-slate-700 dark:bg-slate-900">
                <span className="block text-[10px] text-slate-500 dark:text-slate-400">Trechos Curtos</span>
                <span className="mt-0.5 block text-base font-bold text-slate-800 dark:text-slate-200">—</span>
              </div>
              <div className="rounded-xl border border-slate-200 bg-white p-2 text-center dark:border-slate-700 dark:bg-slate-900">
                <span className="block text-[10px] text-slate-500 dark:text-slate-400">Shuttles</span>
                <span className="mt-0.5 block text-base font-bold text-slate-800 dark:text-slate-200">—</span>
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
              <span className="rounded-md border border-slate-300 bg-white px-2 py-0.5 text-[11px] font-semibold text-slate-700 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300">
                METEOROLOGIA NÃO AVALIADA
              </span>
            </div>

            <div className="mt-3 grid grid-cols-2 gap-2 text-xs sm:grid-cols-4">
              <div className="rounded-xl border border-slate-200 bg-white p-2 text-center dark:border-slate-700 dark:bg-slate-900">
                <span className="block text-[10px] text-slate-500 dark:text-slate-400">Temperatura</span>
                <span className="mt-0.5 block text-base font-bold text-slate-800 dark:text-slate-200">—</span>
              </div>
              <div className="rounded-xl border border-slate-200 bg-white p-2 text-center dark:border-slate-700 dark:bg-slate-900">
                <span className="block text-[10px] text-slate-500 dark:text-slate-400">Ponto Orvalho</span>
                <span className="mt-0.5 block text-base font-bold text-slate-800 dark:text-slate-200">—</span>
              </div>
              <div className="rounded-xl border border-slate-200 bg-white p-2 text-center dark:border-slate-700 dark:bg-slate-900">
                <span className="block text-[10px] text-slate-500 dark:text-slate-400">Umidade</span>
                <span className="mt-0.5 block text-base font-bold text-slate-800 dark:text-slate-200">—</span>
              </div>
              <div className="rounded-xl border border-slate-200 bg-white p-2 text-center dark:border-slate-700 dark:bg-slate-900">
                <span className="block text-[10px] text-slate-500 dark:text-slate-400">Vento</span>
                <span className="mt-0.5 block text-base font-bold text-slate-800 dark:text-slate-200">—</span>
              </div>
            </div>

            <div className="mt-2.5 grid grid-cols-3 gap-2 text-[11px]">
              <div className="rounded-lg border border-slate-200 bg-white p-1.5 text-center dark:border-slate-700 dark:bg-slate-900">
                <span className="text-slate-500">Heat Index:</span> <span className="font-semibold text-slate-700 dark:text-slate-300">Não avaliado</span>
              </div>
              <div className="rounded-lg border border-slate-200 bg-white p-1.5 text-center dark:border-slate-700 dark:bg-slate-900">
                <span className="text-slate-500">Wind Chill:</span> <span className="font-semibold text-slate-700 dark:text-slate-300">Não avaliado</span>
              </div>
              <div className="rounded-lg border border-slate-200 bg-white p-1.5 text-center dark:border-slate-700 dark:bg-slate-900">
                <span className="text-slate-500">WBGT:</span> <span className="font-semibold text-slate-700 dark:text-slate-300">Não avaliado</span>
              </div>
            </div>
          </div>

          <div className="mt-3 flex items-center justify-between border-t border-slate-200/80 pt-2 text-[11px] text-slate-600 dark:border-slate-700/60 dark:text-slate-400">
            <span>Fonte: <strong className="font-semibold text-slate-800 dark:text-slate-200">DECEA / REDEMET</strong> (aguardando dados)</span>
            <span className="italic text-slate-500">WBGT requer sensor dedicado</span>
          </div>
        </div>
      </div>
    </section>
  );
};

export default FrmsIogpAuditPanel;
