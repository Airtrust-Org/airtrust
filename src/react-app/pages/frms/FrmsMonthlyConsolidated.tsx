/**
 * Prévia mensal gerencial. Não é relatório assinado, prontuário, laudo de saúde
 * nem autorização operacional. A API decide RBAC, tenant e supressão.
 */
import { useState } from 'react';
import { FileText, Printer } from 'lucide-react';
import { useApi } from '@/react-app/hooks/useApi';

type Metric = 'dias_avaliados' | 'dias_conformes' | 'dias_violacao'
  | 'dias_nao_avaliados' | 'dias_mitigacao' | 'dias_atencao';
type MetricValue = { value: number | null; state: string };
type MonthlySummary = {
  status: 'SMALL_COHORT_SUPPRESSED' | 'NO_OBSERVATIONS' | 'PARTIAL_COVERAGE' | 'COVERAGE_UNVERIFIED';
  authorized_crew: number | null;
  represented_crew: number | null;
  indicators: Record<Metric, MetricValue>;
  recorded_month_delta: Record<Metric, number | null>;
  recommendations: string[];
  limitations: string[];
};
type Envelope = {
  success: boolean;
  data: MonthlySummary;
  meta?: {
    tenant_id?: number; period?: string; profile_code?: string;
    policy_version?: string; revision_id?: string;
    generated_at?: string; comparison_month?: string;
    limitations?: string[];
  };
};
const METRIC_LABELS: readonly { key: Metric; label: string }[] = [
  { key: 'dias_avaliados', label: 'Dias avaliados' },
  { key: 'dias_conformes', label: 'Dias conformes registrados' },
  { key: 'dias_violacao', label: 'Dias com violação registrada' },
  { key: 'dias_nao_avaliados', label: 'Dias sem avaliação conclusiva' },
  { key: 'dias_mitigacao', label: 'Dias classificados para mitigação' },
  { key: 'dias_atencao', label: 'Dias classificados em atenção' },
];
const UNKNOWN: Record<string, string> = {
  SMALL_CELL_SUPPRESSED: 'Suprimido por privacidade',
  INCOMPLETE_SOURCE: 'Fonte incompleta',
  NO_OBSERVATION: 'Sem registros suficientes',
};
function currentLocalMonth() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
}
export default function FrmsMonthlyConsolidated() {
  const [month, setMonth] = useState(currentLocalMonth);
  const { data, loading, error, refetch } = useApi<Envelope>(
    `/api/frms/relatorios/mensal-consolidado?mes=${month}`,
    { requireAuth: true, bypassGetCache: true, staleTime: 0 },
  );
  const summary = data?.success && data.data ? data.data : null;
  return (
    <section aria-label="Prévia gerencial mensal FRMS" className="space-y-4 rounded-xl border border-slate-300 bg-white p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="flex items-center gap-2 text-base font-semibold text-slate-900">
            <FileText className="h-5 w-5" /> Resumo mensal consolidado
          </h2>
          <p className="text-sm text-slate-600">
            Acesso administrativo, sem informações pessoais. Prévia técnica não assinada.
          </p>
        </div>
        <label className="text-sm font-medium text-slate-700">
          Mês
          <input aria-label="Mês do resumo consolidado" type="month" value={month}
            onChange={event => setMonth(event.target.value || month)}
            className="ml-2 rounded border border-slate-300 p-2" />
        </label>
      </div>
      {loading && <p role="status">Consultando dados consolidados…</p>}
      {error && <div role="alert" className="text-sm text-rose-800">
        A consulta gerencial não está disponível para este acesso ou período: {error}
        <button type="button" onClick={refetch} className="ml-2 underline">Tentar novamente</button>
      </div>}
      {!loading && !error && !summary && <p role="status">Resumo não disponível. Nenhuma aptidão ou conformidade foi inferida.</p>}
      {summary && !error && <>
        <div className="text-sm text-slate-600">
          <p><strong>Estado da cobertura:</strong> {summary.status === 'NO_OBSERVATIONS' ? 'Sem observações'
            : summary.status === 'PARTIAL_COVERAGE' ? 'Cobertura parcial'
            : summary.status === 'COVERAGE_UNVERIFIED' ? 'Cobertura não comprovada'
            : 'Exibição suprimida por privacidade'}.</p>
          <p>Escopo autorizado: {summary.authorized_crew ?? 'suprimido'} profissionais.
            Representados nos registros: {summary.represented_crew ?? 'indeterminado ou suprimido'}.</p>
        </div>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {METRIC_LABELS.map(({ key, label }) => {
            const metric = summary.indicators[key];
            const delta = summary.recorded_month_delta[key];
            return <div key={key} className="rounded-lg border border-slate-200 p-3">
              <p className="text-sm text-slate-700">{label}</p>
              <p className="text-xl font-semibold text-slate-900">
                {metric?.value != null ? metric.value : UNKNOWN[metric?.state] ?? 'Indisponível'}
              </p>
              <p className="text-xs text-slate-600">
                {delta == null ? 'Comparação mensal não disponível' :
                  `Variação de registros: ${delta > 0 ? '+' : ''}${delta}`}
              </p>
            </div>;
          })}
        </div>
        <div className="space-y-2 text-sm text-slate-700">
          <h3 className="font-semibold text-slate-900">Providências para o gestor</h3>
          <ul className="list-disc pl-5">
            {summary.recommendations.map((item, index) => <li key={index}>{item}</li>)}
          </ul>
          <h3 className="font-semibold text-slate-900">Limitações e proveniência</h3>
          <p>Perfil: {data?.meta?.profile_code ?? 'não informado'} · Revisão: {data?.meta?.revision_id ?? 'não informada'} · Política na emissão: {data?.meta?.policy_version ?? 'não informada'}</p>
          <ul className="list-disc pl-5">
            {[...summary.limitations, ...(data?.meta?.limitations ?? [])].map((item, index) => <li key={index}>{item}</li>)}
          </ul>
        </div>
        <button type="button" onClick={() => window.print()}
          className="inline-flex items-center gap-2 rounded-lg border border-slate-300 p-2 text-sm">
          <Printer className="h-4 w-4" /> Imprimir prévia (não é relatório oficial)
        </button>
      </>}
    </section>
  );
}
