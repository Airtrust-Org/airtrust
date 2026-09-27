/**
 * FRMS — Helpers partilhados entre sub-módulos do db-service.
 * NÃO re-exportado pelo barrel (uso interno apenas).
 */

import type { FrmsJornada } from './types';
import { loadPreferredOperationalJourneys } from './preferred-operational-source';

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
  empresaId?: number,
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
  const base = rows.results || [];
  if (!empresaId) return base;

  try {
    const preferred = (await loadPreferredOperationalJourneys(db, empresaId, dataInicio, dataReferencia))
      .filter((row) => row.tripulante_id === Number(tripulanteId));
    const preferredByDate = new Map(preferred.map((row) => [row.data, row]));
    const byDate = new Map<string, FrmsJornada>();

    for (const row of base) {
      const resolved = preferredByDate.get(row.data);
      byDate.set(row.data, resolved ? {
        ...row,
        hora_apresentacao: resolved.hora_apresentacao,
        hora_termino: resolved.hora_termino,
        horas_voo_minutos: resolved.horas_voo_minutos,
        duracao_jornada_minutos: resolved.duracao_jornada_minutos,
        hora_primeiro_acionamento: resolved.hora_primeiro_acionamento,
        hora_primeira_decolagem: resolved.hora_primeira_decolagem,
        hora_ultimo_pouso: resolved.hora_ultimo_pouso,
        hora_corte_motor: resolved.hora_corte_motor,
        operational_data_source: resolved.operational_data_source,
      } : row);
    }

    for (const resolved of preferred) {
      if (byDate.has(resolved.data)) continue;
      byDate.set(resolved.data, {
        id: `operational-${resolved.tripulante_id}-${resolved.data}`,
        tripulante_id: resolved.tripulante_id,
        empresa_id: empresaId,
        data: resolved.data,
        status: 'ES',
        hora_apresentacao: resolved.hora_apresentacao,
        hora_termino: resolved.hora_termino,
        duracao_jornada_minutos: resolved.duracao_jornada_minutos,
        horas_voo_minutos: resolved.horas_voo_minutos,
        hora_primeiro_acionamento: resolved.hora_primeiro_acionamento,
        hora_primeira_decolagem: resolved.hora_primeira_decolagem,
        hora_ultimo_pouso: resolved.hora_ultimo_pouso,
        hora_corte_motor: resolved.hora_corte_motor,
        repouso_plataforma_inicio: null,
        repouso_plataforma_fim: null,
        repouso_plataforma_valido: 0,
        observacao: null,
        registrado_por: 'CONTROLE_VOOS_RUNTIME',
        origem: 'SIGVOOS',
        created_at: '', updated_at: '', deleted_at: null,
        tripulacao_aumentada: 0, classe_cabine: null, local_base: null,
        operational_data_source: resolved.operational_data_source,
      });
    }
    return [...byDate.values()].sort((a, b) => a.data.localeCompare(b.data));
  } catch (error) {
    console.warn('[FRMS] preferred operational history unavailable; using persisted SIGVOOS fallback', {
      tripulanteId, empresaId, dataInicio, dataReferencia,
      error: error instanceof Error ? error.message : String(error ?? ''),
    });
    return base;
  }
}
