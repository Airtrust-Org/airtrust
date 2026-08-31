export type SimulatorPlanningClassSeed = {
  id: string | number;
  equipment: string;
  reference_date: string;
};

export type SimulatorPlanningNamedClass = SimulatorPlanningClassSeed & {
  class_name: string;
};

function normalizeEquipment(value: string): string {
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
  if (!/^\d{4}-\d{2}-\d{2}$/.test(raw)) {
    throw new Error(`INVALID_CLASS_REFERENCE_DATE:${value}`);
  }
  return `${raw.slice(0, 4)}.${raw.slice(5, 7)}`;
}

/** A, B ... Z, AA, AB ... */
export function classSequenceSuffix(index: number): string {
  if (!Number.isInteger(index) || index < 0) throw new Error('INVALID_CLASS_SEQUENCE');
  let value = index + 1;
  let suffix = '';
  while (value > 0) {
    value -= 1;
    suffix = String.fromCharCode(65 + (value % 26)) + suffix;
    value = Math.floor(value / 26);
  }
  return suffix;
}

/**
 * Nome canônico operacional da turma.
 * Ex.: AW139-2027.06; se houver mais de uma turma do mesmo equipamento no
 * mesmo mês, usa AW139-2027.06A, AW139-2027.06B, etc.
 */
export function nameSimulatorPlanningClasses(
  seeds: SimulatorPlanningClassSeed[],
): SimulatorPlanningNamedClass[] {
  const ordered = [...seeds].sort(
    (a, b) =>
      normalizeEquipment(a.equipment).localeCompare(normalizeEquipment(b.equipment)) ||
      String(a.reference_date).localeCompare(String(b.reference_date)) ||
      String(a.id).localeCompare(String(b.id)),
  );

  const grouped = new Map<string, SimulatorPlanningClassSeed[]>();
  for (const seed of ordered) {
    const equipment = normalizeEquipment(seed.equipment);
    const month = yearMonth(seed.reference_date);
    const key = `${equipment}|${month}`;
    const bucket = grouped.get(key) || [];
    bucket.push(seed);
    grouped.set(key, bucket);
  }

  const names = new Map<string, string>();
  for (const bucket of grouped.values()) {
    const first = bucket[0];
    const base = `${normalizeEquipment(first.equipment)}-${yearMonth(first.reference_date)}`;
    bucket.forEach((seed, index) => {
      names.set(String(seed.id), bucket.length === 1 ? base : `${base}${classSequenceSuffix(index)}`);
    });
  }

  return seeds.map((seed) => ({
    ...seed,
    class_name: names.get(String(seed.id)) || `${normalizeEquipment(seed.equipment)}-${yearMonth(seed.reference_date)}`,
  }));
}
