/**
 * FRMS — Helpers partilhados entre sub-módulos do db-service.
 * NÃO re-exportado pelo barrel (uso interno apenas).
 */

import type { FrmsJornada } from './types';

export function generateId(): string {
  return crypto.randomUUID();
}

export function now(): string {
  return new Date().toISOString().replace('T', ' ').slice(0, 19);
}

export function dateOffset(dateStr: string, days: number): string {
  const d = new Date(`${dateStr}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

export function diffDays(d1: string, d2: string): number {
  const a = new Date(`${d1}T00:00:00Z`);
  const b = new Date(`${d2}T00:00:00Z`);
  return Math.round((b.getTime() - a.getTime()) / 86400000);
}

export async function logAuditoria(
  db: D1Database,
  entidade: string,
  entidadeId: string,
  acao: string,
  dadosAnteriores?: unknown,
  dadosNovos?: unknown,
): Promise<void> {
  try {
    await db
      .prepare(
        `INSERT INTO auditoria_avancada_v2 (tabela, acao, registro_id, dados_anteriores, dados_novos)
         VALUES (?, ?, ?, ?, ?)`,
      )
      .bind(
        entidade,
        acao,
        entidadeId,
        dadosAnteriores ? JSON.stringify(dadosAnteriores) : null,
        dadosNovos ? JSON.stringify(dadosNovos) : null,
      )
      .run();
  } catch (e) {
    console.warn('[FRMS][AUDITORIA] falha:', (e as Error).message);
  }
}

export async function buscarHistoricoJornadas(
  db: D1Database,
  tripulanteId: number | string,
  dataReferencia: string,
  diasAtras: number = 365,
): Promise<FrmsJornada[]> {
  const dataInicio = dateOffset(dataReferencia, -diasAtras);
  const rows = await db
    .prepare(
      `SELECT * FROM frms_jornada
       WHERE tripulante_id = ? AND data >= ? AND data <= ? AND deleted_at IS NULL
       ORDER BY data ASC`,
    )
    .bind(String(tripulanteId), dataInicio, dataReferencia)
    .all<FrmsJornada>();
  return rows.results || [];
}
