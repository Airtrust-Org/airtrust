/**
 * BOA/CBMMG monthly check-in receipt evidence ONLY. Deliberately no offshore
 * operational score, regulatory compliance, individual sleep or duty fitness.
 */
import { useState } from 'react';
import { FileText, Printer } from 'lucide-react';
import { useApi } from '@/react-app/hooks/useApi';

type Totals = {
  receipt_person_days: number | null;
  distinct_people: number | null;
  privacy_state: 'OBSERVED' | 'NO_RECEIPTS' | 'SMALL_COHORT_SUPPRESSED' | 'SMALL_PARTICIPANT_SET_SUPPRESSED';
};
type Summary = {
  current: Totals;
  previous: Totals;
  receipt_person_days_delta: number | null;
  source: 'FRMS_FADIGA_CHECKIN_TENANT_SCOPED';
  restrictions: string[];
};
type Envelope = {
  success: boolean;
  data: Summary;
  meta?: { tenant_id?: number; period?: string; profile_code?: string;
    policy_version?: string; revision_id?: string; comparison_month?: string;
    limitations?: string[] };
};
function currentLocalMonth() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
}
function showCount(value: number | null, privacy: Totals['privacy_state']) {
  if (value != null) return String(value);
  return privacy === 'SMALL_COHORT_SUPPRESSED' || privacy === 'SMALL_PARTICIPANT_SET_SUPPRESSED'
    ? 'Suprimido por privacidade' : 'Indisponível';
}

export default function FrmsMonthlyConsolidated() {
  const [month, setMonth] = useState(currentLocalMonth);
  const { data, loading, error, refetch } = useApi<Envelope>(
    `/api/bombeiros/frms/relatorios/mensal-consolidado?mes=${month}`,
    { requireAuth: true, bypassGetCache: true, staleTime: 0 },
  );
  const summary = data?.success && data.data ? data.data : null;
  return (
    <section aria-label="Evidências mensais BOA" className="space-y-4 rounded-xl border border-slate-300 bg-white p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="flex items-center gap-2 text-base font-semibold text-slate-900">
            <FileText className="h-5 w-5" /> Recibos mensais de check-in — Bombeiros
          </h2>
          <p className="text-sm text-slate-600">
            Somente registros de envio do próprio tenant. Não é relatório de conformidade,
            avaliação de aptidão, análise de fadiga nem fechamento técnico assinado.
          </p>
        </div>
        <label className="text-sm font-medium text-slate-700">
          Mês
          <input aria-label="Mês das evidências de check-in" type="month" value={month}
            onChange={event => setMonth(event.target.value || month)}
            className="ml-2 rounded border border-slate-300 p-2" />
        </label>
      </div>
      {loading && <p role="status">Consultando recibos do tenant…</p>}
      {error && <div role="alert" className="text-sm text-rose-800">
        Recibos indisponíveis para esta empresa, permissão ou período: {error}
        <button type="button" onClick={() => refetch()} className="ml-2 underline">Tentar novamente</button>
      </div>}
      {!loading && !error && !summary &&
        <p role="status">Nenhuma evidência disponível. Não presumir conformidade ou aptidão.</p>}
      {summary && !error && <>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <div className="rounded-lg border border-slate-200 p-3">
            <p className="text-sm text-slate-700">Pessoas com envio no mês</p>
            <p className="text-xl font-semibold text-slate-900">
              {showCount(summary.current.distinct_people, summary.current.privacy_state)}
            </p>
          </div>
          <div className="rounded-lg border border-slate-200 p-3">
            <p className="text-sm text-slate-700">Recibos por pessoa e dia</p>
            <p className="text-xl font-semibold text-slate-900">
              {showCount(summary.current.receipt_person_days, summary.current.privacy_state)}
            </p>
          </div>
          <div className="rounded-lg border border-slate-200 p-3">
            <p className="text-sm text-slate-700">Variação de recibos versus mês anterior</p>
            <p className="text-xl font-semibold text-slate-900">
              {summary.receipt_person_days_delta == null
                ? 'Comparação não disponível'
                : String(summary.receipt_person_days_delta)}
            </p>
          </div>
        </div>
        <p className="text-xs text-slate-600">Fonte: {summary.source}.
          Perfil: {data?.meta?.profile_code ?? 'não informado'}.
          Revisão na emissão: {data?.meta?.revision_id ?? 'não informada'}.</p>
        <div className="space-y-2 text-sm text-slate-700">
          <h3 className="font-semibold text-slate-900">O que esses números não comprovam</h3>
          <ul className="list-disc pl-5">
            {[...summary.restrictions, ...(data?.meta?.limitations ?? [])].map(
              (value, index) => <li key={index}>{value}</li>)}
          </ul>
        </div>
        <button type="button" onClick={() => window.print()}
          className="inline-flex items-center gap-2 rounded-lg border border-slate-300 p-2 text-sm">
          <Printer className="h-4 w-4" /> Imprimir prévia sem validade de relatório oficial
        </button>
      </>}
    </section>
  );
}
