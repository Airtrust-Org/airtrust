import type { CaeAvailabilitySlotV1 } from './cae-availability';

export type CaePlanningNeed = {
  id: string | number;
  equipment: string;
  expiry_date: string;
  planning_start_date?: string | null;
  preferred_window_start?: string | null;
  preferred_window_end?: string | null;
  session_durations_minutes: number[];
};

export type CaeSessionAssignment = {
  session_index: number;
  session_duration_minutes: number;
  slot_key: string;
};

export type CaePlanningMatch = {
  status: 'MATCHED' | 'INSUFFICIENT_AVAILABILITY' | 'INVALID_NEED';
  need_id: string | number;
  selected_slots: CaeAvailabilitySlotV1[];
  assignments: CaeSessionAssignment[];
  outside_preferred_window: boolean;
  total_required_minutes: number;
  total_reserved_minutes: number;
  unused_reserved_minutes: number;
  latest_training_date: string | null;
  days_before_expiry: number | null;
  reasons: string[];
};

type WorkingSlot = {
  slot: CaeAvailabilitySlotV1;
  key: string;
  remaining: number;
  used: number;
  outsidePreferred: boolean;
};

type AllocationCandidate = {
  slots: WorkingSlot[];
  assignments: CaeSessionAssignment[];
};

function isIsoDate(value: string | null | undefined): value is string {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

function daysBetween(from: string, to: string): number {
  return Math.round(
    (Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000,
  );
}

function slotKey(slot: CaeAvailabilitySlotV1): string {
  return [slot.equipment, slot.date, slot.start_time, slot.end_date, slot.end_time].join('|');
}

function inPreferredWindow(slotDate: string, need: CaePlanningNeed): boolean {
  if (!need.preferred_window_start || !need.preferred_window_end) return true;
  return slotDate >= need.preferred_window_start && slotDate <= need.preferred_window_end;
}

function compareAllocation(left: AllocationCandidate, right: AllocationCandidate): number {
  const usedLeft = left.slots.filter((slot) => slot.used > 0);
  const usedRight = right.slots.filter((slot) => slot.used > 0);
  const outsideLeft = usedLeft.filter((slot) => slot.outsidePreferred).length;
  const outsideRight = usedRight.filter((slot) => slot.outsidePreferred).length;
  if (outsideLeft !== outsideRight) return outsideLeft - outsideRight;

  const latestLeft = usedLeft.map((item) => item.slot.date).sort().at(-1) || '9999-12-31';
  const latestRight = usedRight.map((item) => item.slot.date).sort().at(-1) || '9999-12-31';
  const latestCompare = latestLeft.localeCompare(latestRight);
  if (latestCompare !== 0) return latestCompare;

  if (usedLeft.length !== usedRight.length) return usedLeft.length - usedRight.length;

  const wasteLeft = usedLeft.reduce((sum, slot) => sum + slot.remaining, 0);
  const wasteRight = usedRight.reduce((sum, slot) => sum + slot.remaining, 0);
  if (wasteLeft !== wasteRight) return wasteLeft - wasteRight;

  const sequenceLeft = usedLeft.map((item) => item.key).sort().join('||');
  const sequenceRight = usedRight.map((item) => item.key).sort().join('||');
  return sequenceLeft.localeCompare(sequenceRight);
}

function cloneSlots(slots: WorkingSlot[]): WorkingSlot[] {
  return slots.map((item) => ({ ...item }));
}

export function matchCaeAvailabilityToNeed(
  need: CaePlanningNeed,
  allSlots: CaeAvailabilitySlotV1[],
): CaePlanningMatch {
  const required = need.session_durations_minutes.map(Number);
  const invalidNeed =
    !['AW139', 'SK76'].includes(need.equipment) ||
    !isIsoDate(need.expiry_date) ||
    (need.planning_start_date != null && !isIsoDate(need.planning_start_date)) ||
    (need.preferred_window_start != null && !isIsoDate(need.preferred_window_start)) ||
    (need.preferred_window_end != null && !isIsoDate(need.preferred_window_end)) ||
    required.length === 0 ||
    required.some((duration) => !Number.isInteger(duration) || duration <= 0);

  const totalRequired = required.reduce((sum, duration) => sum + duration, 0);
  if (invalidNeed) {
    return {
      status: 'INVALID_NEED',
      need_id: need.id,
      selected_slots: [],
      assignments: [],
      outside_preferred_window: false,
      total_required_minutes: totalRequired,
      total_reserved_minutes: 0,
      unused_reserved_minutes: 0,
      latest_training_date: null,
      days_before_expiry: null,
      reasons: ['Necessidade de treinamento incompleta ou inválida.'],
    };
  }

  const eligible = allSlots
    .filter((slot) => slot.equipment === need.equipment)
    .filter((slot) => ['OFFERED', 'HELD', 'CONFIRMED'].includes(slot.state))
    .filter((slot) => slot.date <= need.expiry_date && slot.end_date <= need.expiry_date)
    .filter((slot) => !need.planning_start_date || slot.date >= need.planning_start_date)
    .map<WorkingSlot>((slot) => ({
      slot,
      key: slotKey(slot),
      remaining: slot.duration_minutes,
      used: 0,
      outsidePreferred: !inPreferredWindow(slot.date, need),
    }))
    .sort((left, right) =>
      Number(left.outsidePreferred) - Number(right.outsidePreferred) ||
      left.slot.date.localeCompare(right.slot.date) ||
      left.slot.start_time.localeCompare(right.slot.start_time) ||
      left.key.localeCompare(right.key),
    );

  const maxSession = Math.max(...required);
  const feasibleSlots = eligible.filter((slot) => slot.remaining >= Math.min(...required));
  if (
    feasibleSlots.length === 0 ||
    eligible.reduce((sum, slot) => sum + slot.remaining, 0) < totalRequired ||
    Math.max(0, ...eligible.map((slot) => slot.remaining)) < maxSession
  ) {
    return {
      status: 'INSUFFICIENT_AVAILABILITY',
      need_id: need.id,
      selected_slots: [],
      assignments: [],
      outside_preferred_window: false,
      total_required_minutes: totalRequired,
      total_reserved_minutes: 0,
      unused_reserved_minutes: 0,
      latest_training_date: null,
      days_before_expiry: null,
      reasons: ['A disponibilidade CAE não possui capacidade suficiente antes do vencimento.'],
    };
  }

  const sessions = required
    .map((duration, index) => ({ duration, index }))
    .sort((left, right) => right.duration - left.duration || left.index - right.index);
  const candidates: AllocationCandidate[] = [];
  const candidateLimit = 250;

  function walk(
    sessionPosition: number,
    slots: WorkingSlot[],
    assignments: CaeSessionAssignment[],
  ): void {
    if (candidates.length >= candidateLimit) return;
    if (sessionPosition >= sessions.length) {
      candidates.push({ slots: cloneSlots(slots), assignments: [...assignments] });
      return;
    }

    const session = sessions[sessionPosition];
    const seenCapacities = new Set<string>();
    for (let slotIndex = 0; slotIndex < slots.length; slotIndex += 1) {
      const slot = slots[slotIndex];
      if (slot.remaining < session.duration) continue;

      const symmetryKey = `${slot.remaining}|${slot.outsidePreferred}|${slot.slot.date}`;
      if (seenCapacities.has(symmetryKey)) continue;
      seenCapacities.add(symmetryKey);

      const nextSlots = cloneSlots(slots);
      nextSlots[slotIndex].remaining -= session.duration;
      nextSlots[slotIndex].used += session.duration;
      walk(sessionPosition + 1, nextSlots, [
        ...assignments,
        {
          session_index: session.index,
          session_duration_minutes: session.duration,
          slot_key: slot.key,
        },
      ]);
    }
  }

  walk(0, eligible, []);

  if (candidates.length === 0) {
    return {
      status: 'INSUFFICIENT_AVAILABILITY',
      need_id: need.id,
      selected_slots: [],
      assignments: [],
      outside_preferred_window: false,
      total_required_minutes: totalRequired,
      total_reserved_minutes: 0,
      unused_reserved_minutes: 0,
      latest_training_date: null,
      days_before_expiry: null,
      reasons: ['Há minutos disponíveis, mas os blocos não comportam as sessões do currículo sem fracioná-las.'],
    };
  }

  candidates.sort(compareAllocation);
  const best = candidates[0];
  const used = best.slots.filter((slot) => slot.used > 0);
  const selectedSlots = used.map((slot) => slot.slot);
  const latestDate = selectedSlots.map((slot) => slot.date).sort().at(-1) || null;
  const totalReserved = selectedSlots.reduce((sum, slot) => sum + slot.duration_minutes, 0);
  const outside = used.some((slot) => slot.outsidePreferred);
  const reasons: string[] = [];
  if (outside) reasons.push('Foi necessário usar ao menos um slot fora da janela preferencial.');
  else reasons.push('Todas as sessões cabem dentro da janela preferencial.');
  if (latestDate) {
    reasons.push(`Última sessão prevista ${daysBetween(latestDate, need.expiry_date)} dia(s) antes do vencimento.`);
  }

  return {
    status: 'MATCHED',
    need_id: need.id,
    selected_slots: selectedSlots,
    assignments: best.assignments.sort((left, right) => left.session_index - right.session_index),
    outside_preferred_window: outside,
    total_required_minutes: totalRequired,
    total_reserved_minutes: totalReserved,
    unused_reserved_minutes: used.reduce((sum, slot) => sum + slot.remaining, 0),
    latest_training_date: latestDate,
    days_before_expiry: latestDate ? daysBetween(latestDate, need.expiry_date) : null,
    reasons,
  };
}
