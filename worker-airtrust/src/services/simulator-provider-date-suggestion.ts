import type {
  SimulatorTrainingClass,
  SimulatorTrainingSessionBlock,
} from './cae-planning-session-proposal';

export type SimulatorProviderAvailabilityMode = 'ALL_DAYS' | 'WINDOWS';

export type SimulatorProviderAvailabilityWindow = {
  start_date: string;
  end_date: string;
};

export type SimulatorProviderAvailabilityRule = {
  mode: SimulatorProviderAvailabilityMode;
  windows: SimulatorProviderAvailabilityWindow[];
};

export type SimulatorProviderAvailability = {
  AW139?: SimulatorProviderAvailabilityRule;
  SK76?: SimulatorProviderAvailabilityRule;
};

export type SimulatorDateRosterState = {
  eligible: boolean;
  state: string;
  reason: string;
};

export type SuggestedSimulatorTrainingBlock = SimulatorTrainingSessionBlock & {
  suggested_date: string | null;
  suggestion_status: 'SUGGESTED' | 'WAITING_CREW' | 'NO_PROVIDER_WINDOW' | 'NO_ROSTER_DATE';
  suggestion_reason: string;
  roster?: Array<{
    employee_id: number;
    employee_name: string;
    state: string;
    reason: string;
  }>;
};

export type SuggestedSimulatorTrainingClass = Omit<SimulatorTrainingClass, 'blocks'> & {
  blocks: SuggestedSimulatorTrainingBlock[];
};

function isIsoDate(value: unknown): value is string {
  const text = String(value || '');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(text)) return false;
  const parsed = new Date(`${text}T00:00:00Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === text;
}

function normalizeEquipment(value: unknown): 'AW139' | 'SK76' | null {
  const compact = String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '');
  if (compact.includes('AW139')) return 'AW139';
  if (compact.includes('SK76') || compact.includes('S76')) return 'SK76';
  return null;
}

function addDaysIso(value: string, days: number): string {
  const date = new Date(`${value}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function minIso(values: string[]): string {
  return [...values].sort()[0];
}

function maxIso(values: string[]): string {
  return [...values].sort().at(-1) as string;
}

function mergeWindows(
  windows: SimulatorProviderAvailabilityWindow[],
): SimulatorProviderAvailabilityWindow[] {
  const ordered = [...windows].sort(
    (left, right) =>
      left.start_date.localeCompare(right.start_date) ||
      left.end_date.localeCompare(right.end_date),
  );
  const merged: SimulatorProviderAvailabilityWindow[] = [];
  for (const window of ordered) {
    const previous = merged.at(-1);
    if (!previous || window.start_date > addDaysIso(previous.end_date, 1)) {
      merged.push({ ...window });
      continue;
    }
    if (window.end_date > previous.end_date) previous.end_date = window.end_date;
  }
  return merged;
}

function normalizeRule(value: unknown): SimulatorProviderAvailabilityRule | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const row = value as Record<string, unknown>;
  const mode = String(row.mode || '').toUpperCase();
  if (mode !== 'ALL_DAYS' && mode !== 'WINDOWS') return null;
  const rawWindows = Array.isArray(row.windows) ? row.windows : [];
  const windows: SimulatorProviderAvailabilityWindow[] = [];
  for (const raw of rawWindows) {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
    const window = raw as Record<string, unknown>;
    const start = String(window.start_date || '').slice(0, 10);
    const end = String(window.end_date || '').slice(0, 10);
    if (!isIsoDate(start) || !isIsoDate(end) || start > end) return null;
    windows.push({ start_date: start, end_date: end });
  }
  if (mode === 'WINDOWS' && windows.length === 0) return null;
  return { mode, windows: mode === 'WINDOWS' ? mergeWindows(windows) : [] };
}

export function normalizeSimulatorProviderAvailability(
  value: unknown,
): { ok: true; data: SimulatorProviderAvailability } | { ok: false; error: string } {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return { ok: false, error: 'Disponibilidade da CAI deve ser informada por equipamento.' };
  }
  const raw = value as Record<string, unknown>;
  const result: SimulatorProviderAvailability = {};
  for (const [key, rawRule] of Object.entries(raw)) {
    const equipment = normalizeEquipment(key);
    if (!equipment) continue;
    const rule = normalizeRule(rawRule);
    if (!rule) return { ok: false, error: `Disponibilidade CAI inválida para ${equipment}.` };
    result[equipment] = rule;
  }
  // AW139 is operationally available every day unless the user explicitly narrows it.
  if (!result.AW139) result.AW139 = { mode: 'ALL_DAYS', windows: [] };
  return { ok: true, data: result };
}

export function providerDateAllowed(
  availability: SimulatorProviderAvailability,
  equipmentValue: string,
  date: string,
): boolean {
  const equipment = normalizeEquipment(equipmentValue);
  if (!equipment || !isIsoDate(date)) return false;
  const rule = availability[equipment];
  if (!rule) return false;
  if (rule.mode === 'ALL_DAYS') return true;
  return rule.windows.some((window) => date >= window.start_date && date <= window.end_date);
}

function sessionOrder(block: SimulatorTrainingSessionBlock): number {
  return Math.max(...block.sessions.map((session) => Number(session.session_order || 0)), 0);
}

function dateRangeDescending(start: string, end: string): string[] {
  if (start > end) return [];
  const dates: string[] = [];
  for (let current = end; current >= start; current = addDaysIso(current, -1)) dates.push(current);
  return dates;
}

export async function suggestSimulatorTrainingDates(params: {
  classes: SimulatorTrainingClass[];
  availability: SimulatorProviderAvailability;
  referenceDate: string;
  horizonDays: number;
  preferredSessionsPerDay: number;
  checkRoster: (
    employeeId: number,
    employeeName: string,
    date: string,
  ) => Promise<SimulatorDateRosterState>;
}): Promise<{
  classes: SuggestedSimulatorTrainingClass[];
  suggested_blocks: number;
  waiting_crew_blocks: number;
  no_provider_window_blocks: number;
  no_roster_date_blocks: number;
}> {
  const preferredSessionsPerDay = Math.max(1, Math.trunc(params.preferredSessionsPerDay || 1));
  const horizonDays = Math.max(0, Math.trunc(params.horizonDays || 0));
  const output: SuggestedSimulatorTrainingClass[] = [];
  let suggested = 0;
  let waitingCrew = 0;
  let noProvider = 0;
  let noRoster = 0;

  for (const trainingClass of params.classes) {
    const byId = new Map<string, SuggestedSimulatorTrainingBlock>();
    const usage = new Map<string, number>();
    const latestByEmployee = new Map<number, string>();
    const ordered = [...trainingClass.blocks].sort(
      (left, right) =>
        sessionOrder(right) - sessionOrder(left) ||
        right.target_date.localeCompare(left.target_date) ||
        right.block_id.localeCompare(left.block_id),
    );

    for (const block of ordered) {
      if (block.pairing === 'SEM_DUPLA') {
        waitingCrew += 1;
        byId.set(block.block_id, {
          ...block,
          suggested_date: null,
          suggestion_status: 'WAITING_CREW',
          suggestion_reason: 'Defina a dupla antes de sugerir uma data operacional.',
        });
        continue;
      }

      const participantIds = [...new Set(block.sessions.map((session) => session.employee_id))];
      const latestConstraints = participantIds
        .map((id) => latestByEmployee.get(id))
        .filter((value): value is string => Boolean(value));
      const latestAllowed = minIso([block.target_date, ...latestConstraints]);
      const earliestByHorizon = addDaysIso(block.target_date, -horizonDays);
      const earliestAllowed = maxIso([params.referenceDate, earliestByHorizon]);
      let providerDateSeen = false;
      let selectedDate: string | null = null;
      let selectedRoster: SuggestedSimulatorTrainingBlock['roster'];

      for (const date of dateRangeDescending(earliestAllowed, latestAllowed)) {
        if (!providerDateAllowed(params.availability, block.equipment, date)) continue;
        providerDateSeen = true;
        if (
          participantIds.some(
            (employeeId) => (usage.get(`${employeeId}:${date}`) || 0) >= preferredSessionsPerDay,
          )
        ) {
          continue;
        }

        const rosterRows: NonNullable<SuggestedSimulatorTrainingBlock['roster']> = [];
        let rosterOk = true;
        for (const session of block.sessions) {
          const roster = await params.checkRoster(session.employee_id, session.employee_name, date);
          rosterRows.push({
            employee_id: session.employee_id,
            employee_name: session.employee_name,
            state: roster.state,
            reason: roster.reason,
          });
          if (!roster.eligible) rosterOk = false;
        }
        if (!rosterOk) continue;
        selectedDate = date;
        selectedRoster = rosterRows;
        break;
      }

      if (!selectedDate) {
        if (!providerDateSeen) {
          noProvider += 1;
          byId.set(block.block_id, {
            ...block,
            suggested_date: null,
            suggestion_status: 'NO_PROVIDER_WINDOW',
            suggestion_reason:
              'A CAI não possui janela informada para este equipamento antes do vencimento.',
          });
        } else {
          noRoster += 1;
          byId.set(block.block_id, {
            ...block,
            suggested_date: null,
            suggestion_status: 'NO_ROSTER_DATE',
            suggestion_reason:
              'Não foi encontrada data comum elegível na Escala 1/2 dentro da janela da CAI.',
          });
        }
        continue;
      }

      suggested += 1;
      for (const employeeId of participantIds) {
        latestByEmployee.set(employeeId, selectedDate);
        const key = `${employeeId}:${selectedDate}`;
        usage.set(key, (usage.get(key) || 0) + 1);
      }
      byId.set(block.block_id, {
        ...block,
        suggested_date: selectedDate,
        suggestion_status: 'SUGGESTED',
        suggestion_reason:
          'Data mais próxima do vencimento compatível com janela CAI, Escala 1/2 e ordem curricular.',
        roster: selectedRoster,
      });
    }

    output.push({
      ...trainingClass,
      blocks: trainingClass.blocks.map(
        (block) =>
          byId.get(block.block_id) || {
            ...block,
            suggested_date: null,
            suggestion_status: 'NO_ROSTER_DATE',
            suggestion_reason: 'Data não calculada.',
          },
      ),
    });
  }

  return {
    classes: output,
    suggested_blocks: suggested,
    waiting_crew_blocks: waitingCrew,
    no_provider_window_blocks: noProvider,
    no_roster_date_blocks: noRoster,
  };
}
