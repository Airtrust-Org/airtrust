import type { CaeAvailabilitySlotV1 } from './cae-availability';
import {
  matchCaeAvailabilityToNeed,
  type CaePlanningMatch,
  type CaePlanningNeed,
} from './cae-planning-matcher';

export type CaeBatchPlanningNeed = CaePlanningNeed & {
  priority?: number | null;
};

export type CaeBatchPlanningResult = {
  matches: CaePlanningMatch[];
  remaining_slots: CaeAvailabilitySlotV1[];
};

function slotKey(slot: CaeAvailabilitySlotV1): string {
  return [slot.equipment, slot.date, slot.start_time, slot.end_date, slot.end_time].join('|');
}

function addMinutesToSlotStart(slot: CaeAvailabilitySlotV1, minutes: number): {
  date: string;
  time: string;
} {
  const start = new Date(`${slot.date}T${slot.start_time}:00Z`);
  start.setUTCMinutes(start.getUTCMinutes() + minutes);
  return {
    date: start.toISOString().slice(0, 10),
    time: start.toISOString().slice(11, 16),
  };
}

function consumeMatch(
  slots: CaeAvailabilitySlotV1[],
  match: CaePlanningMatch,
): CaeAvailabilitySlotV1[] {
  if (match.status !== 'MATCHED') return slots;

  const usedByKey = new Map<string, number>();
  for (const assignment of match.assignments) {
    usedByKey.set(
      assignment.slot_key,
      (usedByKey.get(assignment.slot_key) || 0) + assignment.session_duration_minutes,
    );
  }

  const next: CaeAvailabilitySlotV1[] = [];
  for (const slot of slots) {
    const key = slotKey(slot);
    const used = usedByKey.get(key) || 0;
    if (used <= 0) {
      next.push(slot);
      continue;
    }
    if (used >= slot.duration_minutes) continue;

    const shifted = addMinutesToSlotStart(slot, used);
    next.push({
      ...slot,
      external_ref: slot.external_ref ? `${slot.external_ref}#remaining-${used}` : null,
      date: shifted.date,
      start_time: shifted.time,
      duration_minutes: slot.duration_minutes - used,
      source_ref: {
        ...(slot.source_ref || {}),
        section: [slot.source_ref?.section, `Saldo após alocação de ${used} min`]
          .filter(Boolean)
          .join(' — '),
      },
    });
  }
  return next;
}

function needSort(left: CaeBatchPlanningNeed, right: CaeBatchPlanningNeed): number {
  const priorityLeft = Number.isFinite(Number(left.priority)) ? Number(left.priority) : 0;
  const priorityRight = Number.isFinite(Number(right.priority)) ? Number(right.priority) : 0;
  if (priorityLeft !== priorityRight) return priorityRight - priorityLeft;

  const expiryCompare = left.expiry_date.localeCompare(right.expiry_date);
  if (expiryCompare !== 0) return expiryCompare;

  const preferredLeft = left.preferred_window_end || '9999-12-31';
  const preferredRight = right.preferred_window_end || '9999-12-31';
  const preferredCompare = preferredLeft.localeCompare(preferredRight);
  if (preferredCompare !== 0) return preferredCompare;

  const totalLeft = left.session_durations_minutes.reduce((sum, value) => sum + Number(value || 0), 0);
  const totalRight = right.session_durations_minutes.reduce((sum, value) => sum + Number(value || 0), 0);
  if (totalLeft !== totalRight) return totalRight - totalLeft;

  return String(left.id).localeCompare(String(right.id));
}

export function matchCaeAvailabilityBatch(
  needs: CaeBatchPlanningNeed[],
  slots: CaeAvailabilitySlotV1[],
): CaeBatchPlanningResult {
  let remaining = slots.map((slot) => ({ ...slot }));
  const matches: CaePlanningMatch[] = [];

  for (const need of [...needs].sort(needSort)) {
    const match = matchCaeAvailabilityToNeed(need, remaining);
    matches.push(match);
    remaining = consumeMatch(remaining, match);
  }

  return {
    matches,
    remaining_slots: remaining.sort(
      (left, right) =>
        left.date.localeCompare(right.date) ||
        left.start_time.localeCompare(right.start_time) ||
        left.equipment.localeCompare(right.equipment),
    ),
  };
}
