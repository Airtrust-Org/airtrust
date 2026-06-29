import { AlertTriangle } from 'lucide-react';

/**
 * Banner persistente sobre limitações de fonte operacional (SIGVOOS NO-GO, dados estimados).
 * Frontend-only — não altera cálculo backend.
 */
export default function FrmsSourcePolicyBanner({ compact = false }: { compact?: boolean }) {
  return (
    <div
      className={`rounded-lg border border-amber-300 bg-amber-50 ${
        compact ? 'px-3 py-2' : 'px-4 py-3'
      }`}
      role="status"
    >
      <div className="flex gap-2">
        <AlertTriangle
          className={`shrink-0 text-amber-700 ${compact ? 'mt-0.5 h-4 w-4' : 'mt-0.5 h-5 w-5'}`}
          aria-hidden
        />
        <div className={compact ? 'text-xs text-amber-950' : 'text-sm text-amber-950'}>
          <p className="font-semibold">Limitação de fonte operacional</p>
          <p className={compact ? 'mt-0.5 text-amber-900' : 'mt-1 text-amber-900'}>
            SIGVOOS ainda não é fonte operacional ativa em produção. Parte dos dados pode estar
            estimada, planejada ou incompleta. Ausência de registro{' '}
            <strong>não</strong> significa descanso ou folga — trate como{' '}
            <em>fonte não classificada</em> até confirmação manual.
          </p>
        </div>
      </div>
    </div>
  );
}
