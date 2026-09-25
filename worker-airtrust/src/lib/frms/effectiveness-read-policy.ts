export const COMPLETE_FRMS_CHECKIN_EXISTS_SQL = `EXISTS (
  SELECT 1
    FROM frms_fadiga_checkin ch
   WHERE ch.empresa_id = p.empresa_id
     AND ch.funcionario_id = p.id
     AND ch.data_checkin = j.data
     AND ch.deleted_at IS NULL
     AND ch.jornada_inicio_prevista IS NOT NULL
     AND ch.wake_time IS NOT NULL
     AND ch.horas_sono > 0
     AND ch.horas_sono <= 24
)`;

import { maskFrmsEffectivenessRead } from './day-explanation-checkin';

export function maskFrmsTimelineRows<T extends Record<string, unknown>>(rows: T[]): T[] {
  return rows.map((row) =>
    maskFrmsEffectivenessRead(row, String(row.jornada_boundary_source ?? '') === 'REAL'),
  );
}

export function buildFrmsEffectivenessComparison(
  pctA: number | null,
  pctB: number | null,
): { diferencaPts: number | null; analiseDelta: string } {
  const diferencaPts = pctA == null || pctB == null ? null : Math.round((pctB - pctA) * 10) / 10;
  const analiseDelta =
    diferencaPts == null
      ? 'Comparação de efetividade indisponível: um ou ambos os dias não possuem check-in completo.'
      : diferencaPts < 0
        ? `O dia B foi ${Math.abs(diferencaPts).toFixed(1)} pts pior que o dia A.`
        : diferencaPts > 0
          ? `O dia B foi ${Math.abs(diferencaPts).toFixed(1)} pts melhor que o dia A.`
          : 'Os dois dias ficaram com efetividade equivalente.';
  return { diferencaPts, analiseDelta };
}

export function buildFrmsSimulationComparison(
  realPct: number | null,
  simulatedPct: number | null,
  presentation: string,
): { diferencaPts: number | null; conclusao: string } {
  const diferencaPts =
    realPct == null || simulatedPct == null ? null : Math.round((simulatedPct - realPct) * 10) / 10;
  const conclusao =
    diferencaPts == null
      ? `Cenário simulado para apresentação às ${presentation || '--:--'}; sem comparação com efetividade real porque o check-in completo não está disponível.`
      : diferencaPts >= 0
        ? `Com apresentação às ${presentation || '--:--'}, a efetividade subiria ${Math.abs(diferencaPts).toFixed(1)} pts.`
        : `Com apresentação às ${presentation || '--:--'}, a efetividade cairia ${Math.abs(diferencaPts).toFixed(1)} pts.`;
  return { diferencaPts, conclusao };
}
