export type PlanningClassSeed = {
  key: string;
  equipment: string;
  referenceDate: string;
};

function equipmentCode(value: string): string {
  const normalized = String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '');
  if (normalized.includes('AW139')) return 'AW139';
  if (normalized.includes('SK76') || normalized.includes('S76')) return 'SK76';
  return normalized || 'SIM';
}

function yearMonth(value: string): string {
  const raw = String(value || '').slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(raw) ? `${raw.slice(0, 4)}.${raw.slice(5, 7)}` : 'A-DEFINIR';
}

function suffix(index: number): string {
  let value = index + 1;
  let result = '';
  while (value > 0) {
    value -= 1;
    result = String.fromCharCode(65 + (value % 26)) + result;
    value = Math.floor(value / 26);
  }
  return result;
}

export function namePlanningClasses(seeds: PlanningClassSeed[]): Record<string, string> {
  const groups = new Map<string, PlanningClassSeed[]>();
  for (const seed of [...seeds].sort(
    (a, b) =>
      equipmentCode(a.equipment).localeCompare(equipmentCode(b.equipment)) ||
      a.referenceDate.localeCompare(b.referenceDate) ||
      a.key.localeCompare(b.key),
  )) {
    const groupKey = `${equipmentCode(seed.equipment)}|${yearMonth(seed.referenceDate)}`;
    const bucket = groups.get(groupKey) || [];
    bucket.push(seed);
    groups.set(groupKey, bucket);
  }

  const result: Record<string, string> = {};
  for (const bucket of groups.values()) {
    const base = `${equipmentCode(bucket[0].equipment)}-${yearMonth(bucket[0].referenceDate)}`;
    bucket.forEach((seed, index) => {
      result[seed.key] = bucket.length === 1 ? base : `${base}${suffix(index)}`;
    });
  }
  return result;
}
