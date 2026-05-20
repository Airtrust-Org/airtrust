import type { CMAStatus } from '../../hooks/queries/useEscalasQuery';

export function CMABadge({ status }: { status: CMAStatus | undefined }) {
  if (!status) return null;
  if (status.status === 'ok') {
    return (
      <span className="ml-1 inline-flex items-center rounded-full bg-emerald-50 px-1.5 py-px text-[9px] font-semibold text-emerald-700">
        CMA ok
      </span>
    );
  }
  if (status.status === 'sem_cma') {
    return (
      <span className="ml-1 inline-flex items-center rounded-full bg-slate-100 px-1.5 py-px text-[9px] font-semibold text-slate-500">
        SEM CMA
      </span>
    );
  }
  if (status.status === 'expirado') {
    return (
      <span className="ml-1 inline-flex items-center rounded-full bg-red-100 px-1.5 py-px text-[9px] font-bold text-red-700">
        CMA vencida
      </span>
    );
  }
  return (
    <span className="ml-1 inline-flex items-center rounded-full bg-amber-100 px-1.5 py-px text-[9px] font-semibold text-amber-700">
      CMA ⚠ {status.dias_restantes}d
    </span>
  );
}

export function FRMSBadge({
  nivel,
  score,
}: {
  nivel?: 'ok' | 'atencao' | 'critico';
  score?: number;
}) {
  if (!nivel || nivel === 'ok') return null;
  if (nivel === 'critico') {
    return (
      <span
        className="ml-1 inline-flex items-center rounded-full bg-red-100 px-1.5 py-px text-[9px] font-bold text-red-700"
        title={`Score FRMS: ${score ?? '-'}`}
      >
        FRMS {score ?? '-'} ⚠
      </span>
    );
  }
  return (
    <span
      className="ml-1 inline-flex items-center rounded-full bg-amber-100 px-1.5 py-px text-[9px] font-semibold text-amber-700"
      title={`Score FRMS: ${score ?? '-'}`}
    >
      FRMS {score ?? '-'}
    </span>
  );
}

export function AlocadoBadge({ inSession, aeronave }: { inSession?: boolean; aeronave?: string }) {
  if (inSession) {
    return (
      <span className="ml-1 inline-flex items-center rounded bg-amber-100 px-1.5 py-px text-[9px] font-semibold text-amber-700">
        🔒 esta sessão
      </span>
    );
  }
  if (aeronave) {
    return (
      <span className="ml-1 inline-flex items-center rounded bg-blue-100 px-1.5 py-px text-[9px] font-semibold text-blue-700">
        🔒 {aeronave}
      </span>
    );
  }
  return null;
}
