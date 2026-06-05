import type { FrmsJornadaRow } from '@/react-app/hooks/useFrms';

export interface JornadaMensalPresentation {
  fatJornadaDiaLabel: string;
  fatHvDiaLabel: string;
  hasIntegrityIssue: boolean;
  integrityLabel: string | null;
  integrityMessage: string | null;
  sourceLabel: string;
  sourceBadgeClass: string;
  operationalHvLabel: string;
  operationalJourneyLabel: string;
  auxiliarySourceLabel: string | null;
}

function formatPct(value?: number | null): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return '—';
  return `${value.toFixed(2)}%`;
}

export function integridadeLabel(codigo?: string | null): string {
  switch (codigo) {
    case 'FONTE_NAO_CANONICA':
      return 'Fonte nao canonica';
    case 'PENDENTE_SIGVOOS':
      return 'Pendente SIGVOOS';
    case 'FIRA_NAO_OPERACIONAL':
      return 'FIRA nao operacional';
    case 'JORNADA_ZERO_COM_HV':
      return 'Jornada zero com HV';
    case 'JORNADA_AUSENTE_COM_HV':
      return 'Jornada ausente com HV';
    case 'HORARIO_INCOMPLETO_COM_HV':
      return 'Horario incompleto com HV';
    case 'HV_MAIOR_QUE_JORNADA':
      return 'HV maior que jornada';
    default:
      return 'Inconsistencia critica';
  }
}

function formatOperationalMinutes(value?: number | null): string {
  if (!value || value <= 0) return '—';
  const hours = Math.floor(value / 60);
  const minutes = value % 60;
  return `${hours}h${String(minutes).padStart(2, '0')}`;
}

function sourceLabel(status?: string | null): string {
  switch (status) {
    case 'CANONICAL_SIGVOOS':
      return 'SIGVOOS';
    case 'PENDENTE_SIGVOOS':
      return 'Pendente SIGVOOS';
    case 'FIRA_NAO_OPERACIONAL':
      return 'FIRA nao operacional';
    case 'FONTE_NAO_CANONICA':
      return 'Fonte nao canonica';
    default:
      return status || 'Pendente SIGVOOS';
  }
}

export function buildJornadaMensalPresentation(
  jornada: Pick<
    FrmsJornadaRow,
    | 'pct_jornada_diaria'
    | 'pct_voo_diaria'
    | 'integridade_status'
    | 'integridade_codigo'
    | 'integridade_mensagem'
  > &
    Partial<
      Pick<
        FrmsJornadaRow,
        | 'fonte_original'
        | 'source_status'
        | 'usado_no_frms_operacional'
        | 'duracao_jornada_minutos'
        | 'horas_voo_minutos'
      >
    >,
): JornadaMensalPresentation {
  const hasIntegrityIssue =
    jornada.integridade_status === 'INCONSISTENTE' || Boolean(jornada.integridade_codigo);
  const usedOperationally = jornada.usado_no_frms_operacional !== false;
  const hasSourceIssue = !usedOperationally;
  const originalSource = jornada.fonte_original || null;

  return {
    fatJornadaDiaLabel: formatPct(jornada.pct_jornada_diaria),
    fatHvDiaLabel: formatPct(jornada.pct_voo_diaria),
    hasIntegrityIssue: hasIntegrityIssue || hasSourceIssue,
    integrityLabel: hasIntegrityIssue
      ? integridadeLabel(jornada.integridade_codigo)
      : hasSourceIssue
        ? sourceLabel(jornada.source_status)
        : null,
    integrityMessage: hasIntegrityIssue
      ? jornada.integridade_mensagem ?? integridadeLabel(null)
      : hasSourceIssue
        ? 'Linha exibida apenas para auditoria; nao alimenta FRMS operacional.'
        : null,
    sourceLabel: sourceLabel(jornada.source_status),
    sourceBadgeClass: usedOperationally
      ? 'bg-emerald-100 text-emerald-700'
      : 'bg-amber-100 text-amber-800',
    operationalHvLabel: usedOperationally ? formatOperationalMinutes(jornada.horas_voo_minutos) : '—',
    operationalJourneyLabel: usedOperationally
      ? formatOperationalMinutes(jornada.duracao_jornada_minutos)
      : '—',
    auxiliarySourceLabel:
      !usedOperationally && originalSource
        ? `${originalSource}: ${formatOperationalMinutes(jornada.horas_voo_minutos)}`
        : null,
  };
}
