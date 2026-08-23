import type { SimulatorRosterDayState } from './cae-planning-policy';

export type PublishedRosterAllocationRow = {
  allocation_id: string | number;
  employee_id: number;
  date_start: string;
  date_end: string;
  aircraft_id?: number | null;
  function_code?: string | null;
  situation_type?: string | null;
  situation_blocks_allocation?: number | boolean | null;
  fortnight_id?: number | null;
  fortnight_number?: number | null;
  monthly_roster_id?: string | number | null;
  monthly_roster_status?: string | null;
  source_revision?: string | null;
};

export type ResolvedRosterDay = {
  employee_id: number;
  date: string;
  state: SimulatorRosterDayState;
  source_allocation_ids: Array<string | number>;
  fortnight_id: number | null;
  fortnight_number: number | null;
  source_revision: string | null;
  reason: string;
};

function normalizedSituation(value: unknown): string {
  return String(value ?? '').trim().toUpperCase();
}

function activeForDate(row: PublishedRosterAllocationRow, date: string): boolean {
  return row.date_start <= date && row.date_end >= date;
}

function isPublished(row: PublishedRosterAllocationRow): boolean {
  const status = String(row.monthly_roster_status || 'publicada').trim().toLowerCase();
  return status === 'publicada';
}

/**
 * Resolve o estado operacional a partir das alocações PUBLICADAS da data.
 * Não consulta nem depende de funcionarios.quinzena.
 *
 * Casos contraditórios falham fechado como DESCONHECIDO para forçar revisão/replanejamento.
 */
export function resolveRosterDayFromPublishedAllocations(params: {
  employee_id: number;
  date: string;
  allocations: PublishedRosterAllocationRow[];
}): ResolvedRosterDay {
  const rows = params.allocations.filter(
    (row) =>
      Number(row.employee_id) === Number(params.employee_id) &&
      isPublished(row) &&
      activeForDate(row, params.date),
  );

  if (rows.length === 0) {
    return {
      employee_id: params.employee_id,
      date: params.date,
      state: 'DESCONHECIDO',
      source_allocation_ids: [],
      fortnight_id: null,
      fortnight_number: null,
      source_revision: null,
      reason: 'Nenhuma alocação publicada cobre a data candidata.',
    };
  }

  const blocking = rows.filter((row) => {
    const situation = normalizedSituation(row.situation_type);
    return situation && situation !== 'FOLGA' && row.situation_blocks_allocation !== false && row.situation_blocks_allocation !== 0;
  });
  if (blocking.length > 0) {
    return {
      employee_id: params.employee_id,
      date: params.date,
      state: 'INDISPONIVEL',
      source_allocation_ids: blocking.map((row) => row.allocation_id),
      fortnight_id: blocking[0].fortnight_id ?? null,
      fortnight_number: blocking[0].fortnight_number ?? null,
      source_revision: blocking[0].source_revision ?? null,
      reason: `Situação operacional bloqueante: ${normalizedSituation(blocking[0].situation_type)}.`,
    };
  }

  const workRows = rows.filter((row) =>
    row.aircraft_id != null ||
    Boolean(String(row.function_code || '').trim()) ||
    (!row.situation_type && row.fortnight_id != null),
  );
  const offRows = rows.filter((row) => normalizedSituation(row.situation_type) === 'FOLGA');

  if (workRows.length > 0 && offRows.length > 0) {
    return {
      employee_id: params.employee_id,
      date: params.date,
      state: 'DESCONHECIDO',
      source_allocation_ids: rows.map((row) => row.allocation_id),
      fortnight_id: null,
      fortnight_number: null,
      source_revision: null,
      reason: 'Escala publicada contém trabalho e folga simultâneos para a mesma data.',
    };
  }

  if (workRows.length > 0) {
    const row = workRows[0];
    return {
      employee_id: params.employee_id,
      date: params.date,
      state: 'TRABALHO',
      source_allocation_ids: workRows.map((item) => item.allocation_id),
      fortnight_id: row.fortnight_id ?? null,
      fortnight_number: row.fortnight_number ?? null,
      source_revision: row.source_revision ?? null,
      reason: 'Alocação operacional publicada cobre a data candidata.',
    };
  }

  if (offRows.length > 0) {
    const row = offRows[0];
    return {
      employee_id: params.employee_id,
      date: params.date,
      state: 'FOLGA',
      source_allocation_ids: offRows.map((item) => item.allocation_id),
      fortnight_id: row.fortnight_id ?? null,
      fortnight_number: row.fortnight_number ?? null,
      source_revision: row.source_revision ?? null,
      reason: 'Folga publicada cobre a data candidata.',
    };
  }

  return {
    employee_id: params.employee_id,
    date: params.date,
    state: 'DESCONHECIDO',
    source_allocation_ids: rows.map((row) => row.allocation_id),
    fortnight_id: rows[0].fortnight_id ?? null,
    fortnight_number: rows[0].fortnight_number ?? null,
    source_revision: rows[0].source_revision ?? null,
    reason: 'Alocação publicada encontrada, mas sem semântica suficiente para classificar trabalho ou folga.',
  };
}
