import type { CaeAvailabilitySlotV1 } from './cae-availability';
import type { SimulatorTrainingSessionBlock } from './cae-planning-session-proposal';

export type SessionRosterCheck = {
  eligible: boolean;
  state: string;
  reason: string;
};

export type ScheduledSessionBlock = SimulatorTrainingSessionBlock & {
  schedule_status: 'SCHEDULED' | 'UNMATCHED_CREW' | 'NO_CAE_SLOT';
  scheduled_slot: {
    slot_key: string;
    date: string;
    start_time: string;
    end_time: string;
    source_ref?: CaeAvailabilitySlotV1['source_ref'];
  } | null;
  roster: Array<{
    employee_id: number;
    employee_name: string;
    state: string;
    reason: string;
  }>;
  reasons: string[];
};

type WorkingSlot = {
  slot: CaeAvailabilitySlotV1;
  key: string;
  startMs: number;
  endMs: number;
};

function slotKey(slot: CaeAvailabilitySlotV1): string {
  return [slot.equipment, slot.date, slot.start_time, slot.end_date, slot.end_time].join('|');
}

function toMs(date: string, time: string): number {
  return Date.parse(`${date}T${time}:00Z`);
}

function isoDateTime(ms: number): { date: string; time: string } {
  const value = new Date(ms).toISOString();
  return { date: value.slice(0, 10), time: value.slice(11, 16) };
}

function subtractDays(value: string, days: number): string {
  const date = new Date(`${value}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() - Math.max(0, Math.trunc(days)));
  return date.toISOString().slice(0, 10);
}

function blockDeadline(block: SimulatorTrainingSessionBlock, sessionsPerDay: number): string {
  const safePerDay = Math.max(1, Math.trunc(sessionsPerDay || 1));
  return block.sessions
    .map((session) => {
      const remainingAfter = Math.max(0, session.training_session_count - session.session_order);
      return subtractDays(session.expiry_date, Math.floor(remainingAfter / safePerDay));
    })
    .sort()[0];
}

function overlaps(
  startMs: number,
  endMs: number,
  ranges: Array<{ startMs: number; endMs: number }>,
): boolean {
  return ranges.some((range) => startMs < range.endMs && endMs > range.startMs);
}

/**
 * Agenda somente blocos com dupla. A escolha é determinística e respeita:
 * equipamento, validade, ordem curricular aproximada por deadline, política
 * de escala resolvida pelo chamador e ausência de sobreposição do tripulante.
 */
export async function scheduleSimulatorTrainingBlocks(params: {
  blocks: SimulatorTrainingSessionBlock[];
  slots: CaeAvailabilitySlotV1[];
  referenceDate: string;
  preferredSessionsPerDay: number;
  checkRoster: (employeeId: number, employeeName: string, date: string) => Promise<SessionRosterCheck>;
}): Promise<{ scheduled: ScheduledSessionBlock[]; remaining_slots: CaeAvailabilitySlotV1[] }> {
  const working: WorkingSlot[] = params.slots
    .filter((slot) => ['OFFERED', 'HELD', 'CONFIRMED'].includes(slot.state))
    .map((slot) => ({
      slot: { ...slot },
      key: slotKey(slot),
      startMs: toMs(slot.date, slot.start_time),
      endMs: toMs(slot.end_date, slot.end_time),
    }))
    .filter((slot) => Number.isFinite(slot.startMs) && Number.isFinite(slot.endMs) && slot.endMs > slot.startMs);

  const assignmentsByEmployee = new Map<number, Array<{ startMs: number; endMs: number }>>();
  const orderedBlocks = [...params.blocks].sort((left, right) => {
    const leftDeadline = blockDeadline(left, params.preferredSessionsPerDay);
    const rightDeadline = blockDeadline(right, params.preferredSessionsPerDay);
    return (
      leftDeadline.localeCompare(rightDeadline) ||
      Math.min(...left.sessions.map((session) => session.session_order)) -
        Math.min(...right.sessions.map((session) => session.session_order)) ||
      left.block_id.localeCompare(right.block_id)
    );
  });

  const scheduled: ScheduledSessionBlock[] = [];
  for (const block of orderedBlocks) {
    if (block.sessions.length < 2) {
      scheduled.push({
        ...block,
        schedule_status: 'UNMATCHED_CREW',
        scheduled_slot: null,
        roster: [],
        reasons: ['Sessão ainda sem dupla compatível; slot CAE não foi consumido.'],
      });
      continue;
    }

    const deadline = blockDeadline(block, params.preferredSessionsPerDay);
    const durationMs = block.duration_minutes * 60_000;
    const eligible: Array<{
      slotIndex: number;
      startMs: number;
      endMs: number;
      roster: ScheduledSessionBlock['roster'];
    }> = [];

    for (let index = 0; index < working.length; index += 1) {
      const candidate = working[index];
      const start = isoDateTime(candidate.startMs);
      if (candidate.slot.equipment !== block.equipment) continue;
      if (start.date < params.referenceDate || start.date > deadline) continue;
      const endMs = candidate.startMs + durationMs;
      if (endMs > candidate.endMs) continue;

      let rosterAllowed = true;
      const rosterRows: ScheduledSessionBlock['roster'] = [];
      for (const session of block.sessions) {
        const existing = assignmentsByEmployee.get(session.employee_id) || [];
        if (overlaps(candidate.startMs, endMs, existing)) {
          rosterAllowed = false;
          rosterRows.push({
            employee_id: session.employee_id,
            employee_name: session.employee_name,
            state: 'CONFLITO',
            reason: 'Tripulante já possui outra sessão no mesmo horário.',
          });
          break;
        }
        const roster = await params.checkRoster(session.employee_id, session.employee_name, start.date);
        rosterRows.push({
          employee_id: session.employee_id,
          employee_name: session.employee_name,
          state: roster.state,
          reason: roster.reason,
        });
        if (!roster.eligible) {
          rosterAllowed = false;
          break;
        }
      }
      if (!rosterAllowed) continue;
      eligible.push({ slotIndex: index, startMs: candidate.startMs, endMs, roster: rosterRows });
    }

    eligible.sort((a, b) => {
      const leftDate = isoDateTime(a.startMs).date;
      const rightDate = isoDateTime(b.startMs).date;
      return (
        rightDate.localeCompare(leftDate) ||
        a.startMs - b.startMs ||
        (working[a.slotIndex].endMs - a.endMs) - (working[b.slotIndex].endMs - b.endMs) ||
        working[a.slotIndex].key.localeCompare(working[b.slotIndex].key)
      );
    });

    const chosen = eligible[0];
    if (!chosen) {
      scheduled.push({
        ...block,
        schedule_status: 'NO_CAE_SLOT',
        scheduled_slot: null,
        roster: [],
        reasons: [
          `Nenhum slot CAE compatível e permitido pela escala entre ${params.referenceDate} e ${deadline}.`,
        ],
      });
      continue;
    }

    const workingSlot = working[chosen.slotIndex];
    const start = isoDateTime(chosen.startMs);
    const end = isoDateTime(chosen.endMs);
    for (const session of block.sessions) {
      const ranges = assignmentsByEmployee.get(session.employee_id) || [];
      ranges.push({ startMs: chosen.startMs, endMs: chosen.endMs });
      assignmentsByEmployee.set(session.employee_id, ranges);
    }

    const originalKey = workingSlot.key;
    workingSlot.startMs = chosen.endMs;
    const shifted = isoDateTime(workingSlot.startMs);
    workingSlot.slot = {
      ...workingSlot.slot,
      date: shifted.date,
      start_time: shifted.time,
      duration_minutes: Math.max(0, Math.round((workingSlot.endMs - workingSlot.startMs) / 60_000)),
    };

    scheduled.push({
      ...block,
      schedule_status: 'SCHEDULED',
      scheduled_slot: {
        slot_key: originalKey,
        date: start.date,
        start_time: start.time,
        end_time: end.time,
        source_ref: workingSlot.slot.source_ref,
      },
      roster: chosen.roster,
      reasons: [`Sessão alocada ${start.date} ${start.time}–${end.time}, antes do vencimento.`],
    });
  }

  return {
    scheduled,
    remaining_slots: working
      .filter((slot) => slot.endMs > slot.startMs)
      .map((slot) => ({ ...slot.slot }))
      .sort((a, b) => a.date.localeCompare(b.date) || a.start_time.localeCompare(b.start_time)),
  };
}
