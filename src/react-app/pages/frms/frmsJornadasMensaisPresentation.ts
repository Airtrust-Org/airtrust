import type { FrmsJornadaRow } from '@/react-app/hooks/useFrms';

export interface JornadaMensalPresentation {
  fatJornadaDiaLabel: string;
  fatHvDiaLabel: string;
  hasIntegrityIssue: boolean;
  integrityLabel: string | null;
  integrityMessage: string | null;
}

function formatPct(value?: number | null): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return '—';
  return `${value.toFixed(2)}%`;
}

export function integridadeLabel(codigo?: string | null): string {
  switch (codigo) {
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

export function buildJornadaMensalPresentation(
  jornada: Pick<
    FrmsJornadaRow,
    | 'pct_jornada_diaria'
    | 'pct_voo_diaria'
    | 'integridade_status'
    | 'integridade_codigo'
    | 'integridade_mensagem'
  >,
): JornadaMensalPresentation {
  const hasIntegrityIssue =
    jornada.integridade_status === 'INCONSISTENTE' || Boolean(jornada.integridade_codigo);

  return {
    fatJornadaDiaLabel: formatPct(jornada.pct_jornada_diaria),
    fatHvDiaLabel: formatPct(jornada.pct_voo_diaria),
    hasIntegrityIssue,
    integrityLabel: hasIntegrityIssue ? integridadeLabel(jornada.integridade_codigo) : null,
    integrityMessage: hasIntegrityIssue ? jornada.integridade_mensagem ?? integridadeLabel(null) : null,
  };
}
