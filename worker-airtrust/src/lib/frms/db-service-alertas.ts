/**
 * FRMS — Queries de alertas.
 */

import type { FrmsAlerta, NivelAlerta } from './types';
import { now, logAuditoria } from './db-service-shared';
import { FRMS_CANONICAL_OPERATIONAL_SOURCE } from './frms-source-policy';

export interface BuscarAlertasFiltro {
  tripulante_id?: string;
  nivel?: NivelAlerta;
  resolvido?: boolean;
  data_inicio?: string;
  data_fim?: string;
  page?: number;
  limit?: number;
}

export async function buscarAlertas(
  db: D1Database,
  filtro: BuscarAlertasFiltro,
  empresaId?: number,
): Promise<{ alertas: FrmsAlerta[]; total: number }> {
  const conditions: string[] = ['a.deleted_at IS NULL'];
  const binds: (string | number)[] = [];

  // Coerência com módulo FRMS: considerar apenas jornadas ativas
  conditions.push('j.deleted_at IS NULL');
  conditions.push("UPPER(COALESCE(j.origem, '')) = ?");
  binds.push(FRMS_CANONICAL_OPERATIONAL_SOURCE);
  // Auto-cura: ocultar alerta FDP stale quando valor do alerta não bate com jornada atual
  conditions.push(
    "(a.tipo_limite <> 'FDP_DIARIO' OR COALESCE(a.valor_atual_min, -1) = COALESCE(j.duracao_jornada_minutos, -1))",
  );

  if (empresaId !== undefined) {
    conditions.push('f.deleted_at IS NULL');
    conditions.push('f.empresa_id = ?');
    binds.push(empresaId);
  }

  if (filtro.tripulante_id) {
    conditions.push('a.tripulante_id = ?');
    binds.push(filtro.tripulante_id);
  }
  if (filtro.nivel) {
    conditions.push('a.nivel = ?');
    binds.push(filtro.nivel);
  }
  if (filtro.resolvido !== undefined) {
    conditions.push('a.resolvido = ?');
    binds.push(filtro.resolvido ? 1 : 0);
  }
  if (filtro.data_inicio) {
    conditions.push('j.data IS NOT NULL AND date(j.data) >= date(?)');
    binds.push(filtro.data_inicio);
  }
  if (filtro.data_fim) {
    conditions.push('j.data IS NOT NULL AND date(j.data) <= date(?)');
    binds.push(filtro.data_fim);
  }

  const where = conditions.join(' AND ');
  const page = filtro.page ?? 1;
  const limit = filtro.limit ?? 50;
  const offset = (page - 1) * limit;

  const countResult = await db
    .prepare(
      `SELECT COUNT(*) as total
       FROM frms_alerta a
       LEFT JOIN frms_jornada j ON j.id = a.jornada_id
       LEFT JOIN funcionarios f ON f.id = CAST(a.tripulante_id AS INTEGER)
       WHERE ${where}`,
    )
    .bind(...binds)
    .first<{ total: number }>();

  const rows = await db
    .prepare(
      `SELECT a.*,
          j.data as data_jornada,
          j.data as data_fato,
              COALESCE(f.nome, 'Tripulante #' || a.tripulante_id) as nome_tripulante
       FROM frms_alerta a
        LEFT JOIN frms_jornada j ON j.id = a.jornada_id
       LEFT JOIN funcionarios f ON f.id = CAST(a.tripulante_id AS INTEGER)
       WHERE ${where}
        ORDER BY date(j.data) DESC, a.created_at DESC LIMIT ? OFFSET ?`,
    )
    .bind(...binds, limit, offset)
    .all<FrmsAlerta & { nome_tripulante?: string }>();

  return {
    alertas: rows.results || [],
    total: countResult?.total ?? 0,
  };
}

export async function marcarAlertaVisualizado(
  db: D1Database,
  id: string,
  userId: string,
): Promise<void> {
  const timestamp = now();
  const anterior = await db
    .prepare('SELECT * FROM frms_alerta WHERE id = ? AND deleted_at IS NULL')
    .bind(id)
    .first();
  await db
    .prepare(
      'UPDATE frms_alerta SET visualizado = 1, visualizado_em = ?, visualizado_por = ?, updated_at = ? WHERE id = ? AND deleted_at IS NULL',
    )
    .bind(timestamp, userId, timestamp, id)
    .run();
  await logAuditoria(db, 'frms_alerta', id, 'VISUALIZADO', anterior, {
    visualizado_por: userId,
    visualizado_em: timestamp,
  });
}

export async function marcarAlertaResolvido(
  db: D1Database,
  id: string,
  userId: string,
  notasResolucao?: string | null,
): Promise<void> {
  const timestamp = now();
  const anterior = await db
    .prepare('SELECT * FROM frms_alerta WHERE id = ? AND deleted_at IS NULL')
    .bind(id)
    .first();
  await db
    .prepare(
      'UPDATE frms_alerta SET resolvido = 1, resolvido_em = ?, resolvido_por = ?, notas_resolucao = COALESCE(?, notas_resolucao), updated_at = ? WHERE id = ? AND deleted_at IS NULL',
    )
    .bind(timestamp, userId, notasResolucao ?? null, timestamp, id)
    .run();
  await logAuditoria(db, 'frms_alerta', id, 'RESOLVIDO', anterior, {
    resolvido_por: userId,
    resolvido_em: timestamp,
    notas_resolucao: notasResolucao ?? null,
  });
}
