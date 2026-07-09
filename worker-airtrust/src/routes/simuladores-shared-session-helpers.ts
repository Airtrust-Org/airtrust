import type { Env } from '../types';

export function isSharedSessionsEnabled(env: Env): boolean {
  return env.SIMULATOR_SHARED_SESSIONS_ENABLED === 'true';
}

export function isProtectedFichaStatus(status: unknown): boolean {
  const normalized = String(status || '')
    .trim()
    .toUpperCase();
  return ['APROVADO', 'NAO_APROVADO', 'CONCLUIDA'].includes(normalized);
}

export function overlaps(startA: number, endA: number, startB: number, endB: number): boolean {
  return startA < endB && endA > startB;
}
