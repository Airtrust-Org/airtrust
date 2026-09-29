export interface MissionPeriodRow {
  funcionario_id: number;
  data_inicio_embarque: string;
  data_fim_embarque: string;
  source_priority?: number;
  source_kind?: 'ALLOCATION' | 'BASE_FORTNIGHT' | 'FRMS_LEGACY';
}

function addDaysIso(iso: string, days: number): string {
  const date = new Date(`${iso}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

export function normalizeMissionPeriods(rows: readonly MissionPeriodRow[]): MissionPeriodRow[] {
  const byRange = new Map<string, MissionPeriodRow>();
  for (const row of rows) {
    const funcionarioId = Number(row.funcionario_id);
    if (!Number.isInteger(funcionarioId) || funcionarioId <= 0) continue;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(row.data_inicio_embarque) || !/^\d{4}-\d{2}-\d{2}$/.test(row.data_fim_embarque)) continue;
    if (row.data_inicio_embarque > row.data_fim_embarque) continue;
    const normalized: MissionPeriodRow = {
      ...row,
      funcionario_id: funcionarioId,
      source_priority: Number.isFinite(Number(row.source_priority)) ? Number(row.source_priority) : 99,
    };
    const key = `${funcionarioId}::${row.data_inicio_embarque}::${row.data_fim_embarque}`;
    const current = byRange.get(key);
    if (!current || Number(normalized.source_priority) < Number(current.source_priority ?? 99)) {
      byRange.set(key, normalized);
    }
  }
  return [...byRange.values()].sort((a, b) =>
    a.funcionario_id - b.funcionario_id ||
    a.data_inicio_embarque.localeCompare(b.data_inicio_embarque) ||
    Number(a.source_priority ?? 99) - Number(b.source_priority ?? 99),
  );
}

export function buildMissionRosterRows(
  missionPeriods: readonly MissionPeriodRow[],
  start: string,
  end: string,
): Array<{ data_operacional: string; funcionario_id: number }> {
  const byKey = new Map<string, { data_operacional: string; funcionario_id: number }>();
  for (const period of missionPeriods) {
    const funcionarioId = Number(period.funcionario_id);
    if (!Number.isInteger(funcionarioId) || funcionarioId <= 0) continue;
    const rangeStart = start > period.data_inicio_embarque ? start : period.data_inicio_embarque;
    const rangeEnd = end < period.data_fim_embarque ? end : period.data_fim_embarque;
    if (rangeStart > rangeEnd) continue;
    for (let date = rangeStart; date <= rangeEnd; date = addDaysIso(date, 1)) {
      const key = `${date}::${funcionarioId}`;
      byKey.set(key, { data_operacional: date, funcionario_id: funcionarioId });
    }
  }
  return [...byKey.values()];
}

export function buildActiveFortnightRosterRows(
  missionPeriods: readonly MissionPeriodRow[],
  start: string,
  end: string,
): Array<{ data_operacional: string; funcionario_id: number }> {
  // `FRMS_LEGACY` continua disponível para histórico/compliance, mas não prova
  // pertencimento à quinzena operacional atual. Só as fontes vigentes de escala
  // (alocação ou quinzena-base) podem materializar alguém no roster do dia.
  return buildMissionRosterRows(
    missionPeriods.filter((period) => period.source_kind !== 'FRMS_LEGACY'),
    start,
    end,
  );
}
