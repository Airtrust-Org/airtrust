import { EscalaEvento } from '../hooks/queries/useEscalasQuery';

export type DayCellPriority =
  | 'CONFLITO'
  | 'SITUACAO_BLOQUEANTE'
  | 'ALOCACAO'
  | 'SITUACAO_COMPLEMENTAR'
  | 'FOLGA_AUTO'
  | 'FOLGA'
  | 'DISPONIVEL';

export interface DayCellState {
  primaryState: DayCellPriority;
  primaryEvento?: EscalaEvento;
  hasConflict: boolean;
  tooltipEvents: EscalaEvento[];
}

export function buildDayCellState(eventos: EscalaEvento[], temAlocacaoReal = false): DayCellState {
  if (!eventos || eventos.length === 0) {
    return {
      primaryState: temAlocacaoReal ? 'ALOCACAO' : 'DISPONIVEL',
      hasConflict: false,
      tooltipEvents: [],
    };
  }

  const tooltipEvents = [...eventos];
  let primaryState: DayCellPriority = 'DISPONIVEL';
  let primaryEvento: EscalaEvento | undefined;

  const folgasAuto = eventos.filter(
    (e) => e.auto_gerado === 1 && e.tipo_evento?.toUpperCase() === 'FOLGA',
  );
  const folgas = eventos.filter(
    (e) => e.auto_gerado !== 1 && e.tipo_evento?.toUpperCase() === 'FOLGA',
  );
  const bloqueantes = eventos.filter((e) =>
    ['FERIAS', 'LICENCA', 'LICENÇA', 'AFASTAMENTO'].includes(e.tipo_evento?.toUpperCase() || ''),
  );
  const complementares = eventos.filter((e) =>
    ['SIMULADOR', 'CURSO', 'CHEQUE', 'EXAME', 'MEDICO'].includes(
      e.tipo_evento?.toUpperCase() || '',
    ),
  );
  const avulsas = eventos.filter(
    (e) =>
      !bloqueantes.includes(e) &&
      !complementares.includes(e) &&
      !folgas.includes(e) &&
      !folgasAuto.includes(e) &&
      e.tipo_evento !== 'alocacao_aeronave' &&
      e.tipo_evento !== 'ALOCACAO',
  );

  const eventosOcupacao = bloqueantes.length + (avulsas.length > 0 ? 1 : 0);
  const totalOcupacao = (temAlocacaoReal ? 1 : 0) + eventosOcupacao;

  // A conflict exists if there are multiple ocupations, or allocation + complementary, etc.
  const hasConflict =
    totalOcupacao > 1 ||
    (temAlocacaoReal && complementares.length > 0) ||
    (temAlocacaoReal && folgas.length > 0) ||
    (temAlocacaoReal && folgasAuto.length > 0) ||
    (bloqueantes.length > 0 && complementares.length > 0) ||
    (folgas.length > 0 && complementares.length > 0);

  if (hasConflict) {
    primaryState = 'CONFLITO';
    primaryEvento = bloqueantes[0] || avulsas[0] || complementares[0] || eventos[0];
  } else if (bloqueantes.length > 0) {
    primaryState = 'SITUACAO_BLOQUEANTE';
    primaryEvento = bloqueantes[0];
  } else if (temAlocacaoReal) {
    primaryState = 'ALOCACAO';
    primaryEvento = undefined;
  } else if (avulsas.length > 0) {
    primaryState = 'ALOCACAO';
    primaryEvento = avulsas[0];
  } else if (complementares.length > 0) {
    primaryState = 'SITUACAO_COMPLEMENTAR';
    primaryEvento = complementares[0];
  } else if (folgasAuto.length > 0) {
    primaryState = 'FOLGA_AUTO';
    primaryEvento = folgasAuto[0];
  } else if (folgas.length > 0) {
    primaryState = 'FOLGA';
    primaryEvento = folgas[0];
  }

  return {
    primaryState,
    primaryEvento,
    hasConflict,
    tooltipEvents,
  };
}
