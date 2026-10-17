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
          COUNT(*) OVER (PARTITION BY a.tripulante_id) AS recorrencias_no_filtro,
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
  empresaId: number,
): Promise<boolean> {
  // The read guard at the route is not a substitute for ownership checked
  // again atomically by D1 at the write. Fail closed across tenants.
  const anterior = await db.prepare(`
    SELECT a.* FROM frms_alerta a
    JOIN funcionarios f ON f.id = CAST(a.tripulante_id AS INTEGER)
    WHERE a.id = ? AND a.deleted_at IS NULL AND f.empresa_id = ?
      AND f.deleted_at IS NULL AND COALESCE(f.ativo, 1) = 1
      AND UPPER(COALESCE(NULLIF(TRIM(f.status), ''), 'ATIVO')) = 'ATIVO'
    LIMIT 1
  `).bind(id, empresaId).first();
  if (!anterior) return false;

  const timestamp = now();
  const updated = await db.prepare(`
    UPDATE frms_alerta
    SET visualizado = 1, visualizado_em = ?, visualizado_por = ?, updated_at = ?
    WHERE id = ? AND deleted_at IS NULL
      AND EXISTS (
        SELECT 1 FROM funcionarios f
        WHERE f.id = CAST(frms_alerta.tripulante_id AS INTEGER)
          AND f.empresa_id = ? AND f.deleted_at IS NULL
          AND COALESCE(f.ativo, 1) = 1
          AND UPPER(COALESCE(NULLIF(TRIM(f.status), ''), 'ATIVO')) = 'ATIVO'
      )
  `).bind(timestamp, userId, timestamp, id, empresaId).run();
  if ((updated.meta?.changes ?? 0) !== 1) return false;

  await logAuditoria(db, 'frms_alerta', id, 'VISUALIZADO', anterior, {
    visualizado_por: userId,
    visualizado_em: timestamp,
  });
  return true;
}

async function currentOpenCase(
  db: D1Database,
  id: string,
  empresaId: number,
): Promise<Record<string, unknown> | null> {
  return db.prepare(`
    SELECT a.* FROM frms_alerta a
    JOIN funcionarios f ON f.id = CAST(a.tripulante_id AS INTEGER)
    WHERE a.id = ? AND a.deleted_at IS NULL
      AND f.empresa_id = ? AND f.deleted_at IS NULL
      AND COALESCE(a.resolvido, 0) = 0
    LIMIT 1
  `).bind(id, empresaId).first<Record<string, unknown>>();
}

const CASE_WRITE_SCOPE = `
  id = ? AND deleted_at IS NULL AND COALESCE(resolvido, 0) = 0
  AND EXISTS (
    SELECT 1 FROM funcionarios f
    WHERE f.id = CAST(frms_alerta.tripulante_id AS INTEGER)
      AND f.empresa_id = ? AND f.deleted_at IS NULL
  )`;

export async function registrarTratamentoAlerta(
  db: D1Database,
  id: string,
  userId: string,
  notasTratamento: string,
  empresaId: number,
): Promise<boolean> {
  const anterior = await currentOpenCase(db, id, empresaId);
  if (!anterior) return false;
  const timestamp = now();
  const result = await db.prepare(`
    UPDATE frms_alerta
    SET notas_resolucao = ?, updated_at = ?
    WHERE ${CASE_WRITE_SCOPE}
  `).bind(notasTratamento, timestamp, id, empresaId).run();
  if ((result.meta?.changes ?? 0) !== 1) return false;
  await logAuditoria(db, 'frms_alerta', id, 'TRATAMENTO_REGISTRADO', anterior, {
    registrado_por: userId,
    registrado_em: timestamp,
    notas_resolucao: notasTratamento,
    resolvido: 0,
  });
  return true;
}

export async function marcarAlertaResolvido(
  db: D1Database,
  id: string,
  userId: string,
  notasResolucao: string,
  empresaId: number,
): Promise<boolean> {
  const anterior = await currentOpenCase(db, id, empresaId);
  if (!anterior) return false;
  const timestamp = now();
  const result = await db.prepare(`
    UPDATE frms_alerta
    SET resolvido = 1, resolvido_em = ?, resolvido_por = ?,
        notas_resolucao = ?, updated_at = ?
    WHERE ${CASE_WRITE_SCOPE}
  `).bind(timestamp, userId, notasResolucao, timestamp, id, empresaId).run();
  if ((result.meta?.changes ?? 0) !== 1) return false;
  await logAuditoria(db, 'frms_alerta', id, 'RESOLVIDO', anterior, {
    resolvido_por: userId,
    resolvido_em: timestamp,
    notas_resolucao: notasResolucao,
  });
  return true;
}
