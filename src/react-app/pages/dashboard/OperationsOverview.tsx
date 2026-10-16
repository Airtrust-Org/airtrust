import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { fetchWithAuth, API_BASE_URL } from '@/react-app/config/api';
import { useTenantQueryKey } from '@/react-app/lib/useTenantQueryKey';
import { Target, AlertTriangle } from 'lucide-react';
import { safePct, dateDiffInDays } from './helpers';
import type { DashboardMetrics, ComplianceData, FrmsAlertaRaw, TreinamentoPlanejadoItem } from './types';

interface OperationsOverviewProps {
  metrics: DashboardMetrics;
  compliance: ComplianceData;
  frmsAlertas: FrmsAlertaRaw[];
  treinamentos: TreinamentoPlanejadoItem[];
}

export const OperationsOverview = React.memo(function OperationsOverview({
  metrics,
  compliance: _compliance,
  frmsAlertas: _frmsAlertas,
  treinamentos,
}: OperationsOverviewProps) {
  const { empresaId } = useTenantQueryKey();
  const training = useQuery({
    queryKey: ['dashboard', empresaId, 'training-compliance-canonical'],
    queryFn: async () => {
      const response = await fetchWithAuth(`${API_BASE_URL}/compliance-treinamentos/resumo`);
      if (!response.ok) throw new Error('Falha ao obter Compliance de Treinamentos');
      const payload = await response.json() as { success: boolean; data?: { compliance_pct: number | null; requisitos_obrigatorios: number; conformes: number; pessoas_sem_configuracao: number } };
      if (!payload.success || !payload.data) throw new Error('Resposta inválida de Compliance de Treinamentos');
      return payload.data;
    },
    staleTime: 3 * 60 * 1000,
    retry: false,
  });
  const trainingIncomplete = Boolean(training.data?.pessoas_sem_configuracao);
  const tripulantesEmDia = Math.max(metrics.tripulantesAtivos - metrics.tripulantesComQualificacoesVencidas, 0);
  const score = safePct(tripulantesEmDia, metrics.tripulantesAtivos);
  // Este percentual parcial não representa o Compliance de Treinamentos nem todas as qualificações.
  const tripulantesEmDiaPct = safePct(tripulantesEmDia, metrics.tripulantesAtivos);
  const tripulantesComVencimentoPct = safePct(metrics.tripulantesComQualificacoesVencendo, metrics.tripulantesAtivos);

  const hoje = new Date();
  hoje.setHours(0, 0, 0, 0);
  const treinamentosPeriodo = treinamentos.filter((t) => dateDiffInDays(String(t.data_prevista || ''), hoje) >= 0).length;

  return (
    <section className="rounded-2xl border border-slate-200 bg-white px-4 py-3 shadow-sm dark:border-slate-700 dark:bg-slate-900">
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.2em] text-slate-400 dark:text-slate-500">
              Visão geral
            </p>
            <p className="mt-0.5 text-xl font-black leading-none text-slate-900 dark:text-slate-100">{score}%</p>
            <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
              Tripulantes sem qualificações vencidas (não é o Compliance completo)
            </p>
          </div>
        </div>
      </div>

      <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2">
        <div className="rounded-lg border border-slate-200 p-3 dark:border-slate-700">
          <p className="text-xs font-semibold text-slate-500">Compliance de Treinamentos</p>
          <p className="text-xl font-bold text-slate-900 dark:text-slate-100">{training.isLoading ? 'Carregando…' : training.isError ? 'Indisponível' : training.data?.compliance_pct == null ? 'Não configurado' : `${training.data.compliance_pct}%${trainingIncomplete ? ' (parcial)' : ''}`}</p>
          <p className="text-xs text-slate-500">{training.data ? `${training.data.conformes} de ${training.data.requisitos_obrigatorios} obrigações cumpridas` : 'Treinamentos de todas as modalidades aplicáveis'}</p>
          {training.data && training.data.pessoas_sem_configuracao > 0 && <p className="text-xs text-amber-700">{training.data.pessoas_sem_configuracao} pessoas sem matriz configurada — percentual não representa cobertura integral</p>}
        </div>
        <div className="rounded-lg border border-slate-200 p-3 dark:border-slate-700">
          <p className="text-xs font-semibold text-slate-500">Compliance de Qualificações</p>
          <p className="text-xl font-bold text-slate-900 dark:text-slate-100">Em validação</p>
          <p className="text-xs text-slate-500">Licenças, habilitações, CMA e cheques: requer matriz e evidências completas</p>
        </div>
      </div>
      <div className="mt-3 space-y-2">
        <div>
          <div className="mb-1 flex items-center justify-between text-xs font-semibold text-slate-700 dark:text-slate-300">
            <span className="inline-flex items-center gap-1.5">
              <Target className="h-3.5 w-3.5" /> Tripulantes em dia
            </span>
            <span>{tripulantesEmDiaPct}%</span>
          </div>
          <div className="h-2 overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800">
            <div className="h-full rounded-full bg-emerald-500" style={{ width: `${Math.max(4, tripulantesEmDiaPct)}%` }} />
          </div>
        </div>
        <div>
          <div className="mb-1 flex items-center justify-between text-xs font-semibold text-slate-700 dark:text-slate-300">
            <span className="inline-flex items-center gap-1.5">
              <AlertTriangle className="h-3.5 w-3.5" /> Com vencimento em 30 dias
            </span>
            <span>{tripulantesComVencimentoPct}%</span>
          </div>
          <div className="h-2 overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800">
            <div className="h-full rounded-full bg-amber-500" style={{ width: `${Math.max(4, tripulantesComVencimentoPct)}%` }} />
          </div>
        </div>
      </div>

      <div className="mt-2 flex flex-wrap gap-1.5 text-xs font-semibold text-slate-600 dark:text-slate-400">
        {metrics.demandaFutura30Dias > 0 && (
          <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-400">
            {metrics.demandaFutura30Dias} em 30 dias
          </span>
        )}
        {metrics.demandaFutura60Dias > 0 && (
          <span className="rounded-full bg-amber-50 px-2 py-0.5 text-amber-700 dark:bg-amber-500/10 dark:text-amber-400">
            {metrics.demandaFutura60Dias} em 60 dias
          </span>
        )}
        {metrics.demandaFutura90Dias > 0 && (
          <span className="rounded-full bg-blue-50 px-2 py-0.5 text-blue-700 dark:bg-blue-500/10 dark:text-blue-400">
            {metrics.demandaFutura90Dias} em 90 dias
          </span>
        )}
        {treinamentosPeriodo > 0 && (
          <span className="rounded-full bg-slate-100 px-2 py-0.5 text-slate-700 dark:bg-slate-800 dark:text-slate-300">
            {treinamentosPeriodo} planejado(s)
          </span>
        )}
      </div>
    </section>
  );
});
