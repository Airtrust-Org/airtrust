import { Scale } from 'lucide-react';
import type { FrmsOperationalSnapshotItem } from '@/react-app/hooks/useFrmsOperationalSnapshot';
import { describeRegulatoryCompliance } from '../frmsRegulatoryCompliance';

const TONE_CLASS = {
  VIOLACAO: 'border-red-300 bg-red-50 text-red-950 dark:border-red-800 dark:bg-red-950/30 dark:text-red-100',
  NAO_AVALIAVEL: 'border-amber-300 bg-amber-50 text-amber-950 dark:border-amber-800 dark:bg-amber-950/30 dark:text-amber-100',
  CONFORME: 'border-slate-200 bg-white text-slate-900 dark:border-slate-800 dark:bg-slate-950 dark:text-slate-100',
} as const;

export function FrmsRegulatoryCompliancePanel({ item }: { item: FrmsOperationalSnapshotItem }) {
  const view = describeRegulatoryCompliance(item);
  if (!view) return null;
  return (
    <section aria-label="Conformidade legal e contratual" className={`rounded-xl border p-4 text-sm ${TONE_CLASS[view.tone]}`}>
      <h3 className="flex items-center gap-2 text-xs font-bold uppercase tracking-wide opacity-80">
        <Scale className="h-4 w-4" aria-hidden="true" /> Conformidade legal e contratual
      </h3>
      <p className="mt-2 font-bold">{view.title}</p>
      <p className="mt-1">{view.summary}</p>
      {view.violations.length > 0 ? (
        <ul className="mt-2 list-disc space-y-1 pl-5">
          {view.violations.map((violation) => (
            <li key={`${violation.reference}-${violation.text}`}>
              {violation.text} <span className="text-xs opacity-75">({violation.reference})</span>
            </li>
          ))}
        </ul>
      ) : null}
      {view.unknown.length > 0 ? (
        <div className="mt-2">
          <p className="text-xs font-semibold">Dados que impedem a verificação completa:</p>
          <ul className="mt-1 list-disc space-y-1 pl-5 text-xs">
            {view.unknown.map((reason) => <li key={reason}>{reason}</li>)}
          </ul>
        </div>
      ) : null}
      {view.pending.length > 0 ? (
        <div className="mt-3 rounded-lg border border-amber-300 bg-amber-50 p-3 text-amber-950 dark:border-amber-800 dark:bg-amber-950/30 dark:text-amber-100">
          <p className="text-xs font-bold">Possível desconformidade legal — aguardando validação jurídica</p>
          <ul className="mt-1 list-disc space-y-1 pl-5 text-xs">
            {view.pending.map((finding) => (
              <li key={`${finding.reference}-${finding.text}`}>
                {finding.text} <span className="opacity-75">({finding.reference})</span>
              </li>
            ))}
          </ul>
          <p className="mt-1 text-xs">Não altera a decisão automaticamente; confirme com a coordenação e registre a providência.</p>
        </div>
      ) : null}
    </section>
  );
}
