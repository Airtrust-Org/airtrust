export const QUALIFICATION_AREA_UNCLASSIFIED_FILTER = '__unclassified__';

const AREA_BADGE_CLASSES = [
  'border-blue-200 bg-blue-50 text-blue-700',
  'border-emerald-200 bg-emerald-50 text-emerald-700',
  'border-amber-200 bg-amber-50 text-amber-800',
  'border-violet-200 bg-violet-50 text-violet-700',
  'border-rose-200 bg-rose-50 text-rose-700',
  'border-cyan-200 bg-cyan-50 text-cyan-800',
  'border-orange-200 bg-orange-50 text-orange-800',
  'border-fuchsia-200 bg-fuchsia-50 text-fuchsia-700',
  'border-teal-200 bg-teal-50 text-teal-800',
  'border-indigo-200 bg-indigo-50 text-indigo-700',
] as const;

export function getQualificationAreaBadgeClass(
  areaId?: string | number | null,
  areaName?: string | null,
): string {
  const numericId = Number(areaId);
  if (Number.isInteger(numericId) && numericId > 0) {
    return AREA_BADGE_CLASSES[(numericId - 1) % AREA_BADGE_CLASSES.length];
  }

  const normalized = String(areaName || '').trim().toLocaleLowerCase('pt-BR');
  let hash = 0;
  for (const char of normalized) hash = (hash * 31 + char.charCodeAt(0)) >>> 0;
  return AREA_BADGE_CLASSES[hash % AREA_BADGE_CLASSES.length];
}

export function filterUnclassifiedQualificationAreas<T extends {
  area_id?: string | number | null;
  area_nome?: string | null;
}>(rows: T[], areaFilter: string): T[] {
  if (areaFilter !== QUALIFICATION_AREA_UNCLASSIFIED_FILTER) return rows;
  return rows.filter((row) => !row.area_id || !String(row.area_nome || '').trim());
}
