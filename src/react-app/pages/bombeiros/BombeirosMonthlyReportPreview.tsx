/**
 * BOA/CBMMG — draft managerial/technical monthly evidence, never official.
 * No personal medical or psychometric data is displayed or downloaded.
 */
import { useState } from 'react';
import { useApi } from '@/react-app/hooks/useApi';

type Cases = {
  opened: number | null;
  awaiting_treatment: number | null;
  under_treatment: number | null;
  closed_with_efficacy: number | null;
  privacy: 'OBSERVED' | 'NO_RECEIPTS' | 'SMALL_PARTICIPATION' | 'SMALL_CELL_SUPPRESSED';
};
type Period = {
  month: string; participants: number | null; checkin_receipts: number | null; cases: Cases;
};
type MonthlyPreview = {
  method_version: string;
  state: 'UNSIGNED_UNVALIDATED_PREVIEW';
  basis: string;
  coverage: 'NOT_DETERMINABLE_WITHOUT_ROSTER';
  current: Period;
  previous: Period;
  receipt_delta: number | null;
  managerial_recommendations: string[];
  technical_caveats: string[];
  provenance: { event_types: string[]; signed: false; stored: false; scientific_score: string };
};
type Response = {
  success: boolean;
  data: MonthlyPreview;
  meta?: {
    tenant_id: number; profile_code: string; policy_revision: string;
    policy_version: string; generated_at: string; signature: string;
  };
};
const monthNow = () => {
  const date = new Date();
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
};
const printedCount = (n: number | null) => n === null ? 'Protegido / indisponível' : String(n);

export default function BombeirosMonthlyReportPreview() {
  const [month, setMonth] = useState(monthNow);
  const { data, loading, error, refetch } = useApi<Response>(
    `/api/bombeiros/frms/relatorios/gerencial-tecnico-previa?mes=${month}`,
    { requireAuth: true, bypassGetCache: true, staleTime: 0 },
  );
  const report = data?.success ? data.data : null;
  const cases = report?.current.cases;
  return <section className="space-y-4 rounded-xl border border-slate-300 bg-white p-4"
    aria-label="Prévia gerencial e técnica mensal BOA">
    <header className="space-y-2">
      <p className="text-xs font-bold uppercase tracking-wider text-slate-700">
        Rascunho não assinado · Não homologado
      </p>
      <h2 className="text-lg font-semibold text-slate-900">
        Relatório mensal gerencial e técnico — Aviação dos Bombeiros
      </h2>
      <p className="text-sm text-slate-700">
        Evidência operacional exclusivamente do tenant BOA, sem aplicar parâmetros offshore.
        Os números são uma prévia, não um documento oficial, nem um parecer de aptidão
        ou uma taxa de fadiga. A apuração formal depende de validação científica,
        escalas e assinatura.
      </p>
    </header>
    <label className="block text-sm font-semibold text-slate-800">
      Mês de referência
      <input aria-label="Mês do relatório BOA" type="month"
        className="ml-3 rounded border border-slate-300 p-2" value={month}
        onChange={e => setMonth(e.target.value || month)} />
    </label>
    {loading && <p role="status">Preparando evidências do mês…</p>}
    {error && <div role="alert" className="text-sm text-red-800">
      Relatório não disponível neste contexto: {error}.
      <button type="button" className="ml-2 underline"
        onClick={() => refetch()}>Reconsultar</button>
    </div>}
    {!loading && !error && !report &&
      <p role="status">Não foi possível comprovar as fontes. Nenhum resultado foi presumido.</p>}
    {report && !error && <>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {[
          ['Tripulantes que enviaram evidência', printedCount(report.current.participants)],
          ['Recibos de check-in enviados', printedCount(report.current.checkin_receipts)],
          ['Diferença de recibos vs. mês anterior', printedCount(report.receipt_delta)],
          ['Casos abertos pela coorte', printedCount(cases?.opened ?? null)],
        ].map(([label, value]) =>
          <div key={label} className="rounded-lg border border-slate-200 bg-slate-50 p-3">
            <p className="text-xs text-slate-700">{label}</p>
            <p className="mt-1 text-lg font-semibold text-slate-900">{value}</p>
          </div>)}
      </div>
      <section className="space-y-2" aria-label="Acompanhamento de mitigações BOA">
        <h3 className="font-semibold text-slate-900">Acompanhamento de mitigação e eficácia</h3>
        <p className="text-sm text-slate-700">
          Estados dos casos derivados dos recibos do mês, consultados no momento desta
          emissão. Não representam necessariamente o estado ao final do mês.
        </p>
        <table className="w-full max-w-2xl border-collapse text-sm">
          <tbody>
            <tr className="border-b"><th scope="row" className="p-2 text-left">Aguardando tratamento</th>
              <td className="p-2 text-right">{printedCount(cases?.awaiting_treatment ?? null)}</td></tr>
            <tr className="border-b"><th scope="row" className="p-2 text-left">Em tratamento</th>
              <td className="p-2 text-right">{printedCount(cases?.under_treatment ?? null)}</td></tr>
            <tr className="border-b"><th scope="row" className="p-2 text-left">Encerrados com eficácia registrada</th>
              <td className="p-2 text-right">{printedCount(cases?.closed_with_efficacy ?? null)}</td></tr>
          </tbody>
        </table>
        {cases?.privacy !== 'OBSERVED' && cases?.privacy !== 'NO_RECEIPTS' &&
          <p className="text-sm font-medium text-slate-700">
            Distribuição suprimida integralmente para impedir identificação por células pequenas.
          </p>}
      </section>
      <section className="space-y-2">
        <h3 className="font-semibold text-slate-900">Recomendações à gestão</h3>
        <ul className="list-disc space-y-1 pl-5 text-sm text-slate-700">
          {report.managerial_recommendations.map((x, i) => <li key={i}>{x}</li>)}
        </ul>
      </section>
      <section className="space-y-2">
        <h3 className="font-semibold text-slate-900">Fundamentação e limitações técnicas</h3>
        <ul className="list-disc space-y-1 pl-5 text-sm text-slate-700">
          {report.technical_caveats.map((x, i) => <li key={i}>{x}</li>)}
        </ul>
      </section>
      <footer className="space-y-1 border-t border-slate-200 pt-3 text-xs text-slate-700">
        <p>Metodologia: {report.method_version} · Fonte: eventos BOA registrados por tenant.</p>
        <p>Revisão regulatória vigente na consulta: {data?.meta?.policy_revision ?? 'indisponível'}.</p>
        <p>Gerado em: {data?.meta?.generated_at ?? 'indisponível'}.</p>
        <p><strong>Não assinado · não arquivado · sem valor de relatório oficial.</strong></p>
      </footer>
      <button type="button" className="rounded border border-slate-400 px-3 py-2 text-sm"
        onClick={() => window.print()}>
        Imprimir prévia não oficial
      </button>
    </>}
  </section>;
}
