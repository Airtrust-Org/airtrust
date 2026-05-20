export const SEM_AERONAVE_VALUE = '__sem_aeronave__';
export const SEM_AERONAVE_LABEL = 'Alocações Avulsas';

export function isSemAeronaveValue(value: string | number | null | undefined): boolean {
  return String(value || '').trim() === SEM_AERONAVE_VALUE;
}
