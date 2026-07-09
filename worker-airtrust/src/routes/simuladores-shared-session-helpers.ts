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

// Thin D1 statement wrappers — reduce boilerplate without hiding DB access.
export async function runStatement(db: D1Database, sql: string, ...args: unknown[]) {
  return db.prepare(sql).bind(...args).run();
}

export async function firstStatement<T>(db: D1Database, sql: string, ...args: unknown[]) {
  return db.prepare(sql).bind(...args).first<T>();
}

export async function allStatement<T>(db: D1Database, sql: string, ...args: unknown[]) {
  return db.prepare(sql).bind(...args).all<T>();
}

export function prepareStatement(db: D1Database, sql: string, ...args: unknown[]) {
  return db.prepare(sql).bind(...args);
}
