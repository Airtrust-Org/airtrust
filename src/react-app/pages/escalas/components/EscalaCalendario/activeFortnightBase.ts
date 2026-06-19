import { format } from 'date-fns';
import type { QuinzenaEscala } from '../../hooks/queries/useEscalasQuery';

export const FOLGA_PLACEHOLDER_COLOR = '#E2E8F0';
export const DISPONIVEL_PLACEHOLDER_COLOR = '#10B981';

export function isDiaDentroQuinzenaAtiva(
  quinzenaPreferencial: number | null | undefined,
  diaIso: string,
  quinzenas: QuinzenaEscala[],
) {
  if (quinzenaPreferencial !== 1 && quinzenaPreferencial !== 2) {
    return false;
  }

  return quinzenas.some(
    (quinzena) =>
      quinzena.numero === quinzenaPreferencial &&
      diaIso >= quinzena.data_inicio &&
      diaIso <= quinzena.data_fim,
  );
}

export function hasDisponibilidadeBaseVisivel(
  quinzenaPreferencial: number | null | undefined,
  diasDoMes: Date[],
  quinzenas: QuinzenaEscala[],
) {
  return diasDoMes.some((dia) =>
    isDiaDentroQuinzenaAtiva(quinzenaPreferencial, format(dia, 'yyyy-MM-dd'), quinzenas),
  );
}
