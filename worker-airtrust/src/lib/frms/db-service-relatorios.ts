/**
 * FRMS — Relatórios (individual, compliance, mapa de fadiga).
 */

import type { FrmsJornada, FrmsFatorizacao, FrmsAcumuloRolling, FrmsAlerta } from './types';
import { buscarJornadas } from './db-service-jornadas';
import { buscarAcumuloFrota } from './db-service-acumulo';

export async function relatorioIndividual(
  db: D1Database,
  tripulanteId: string,
  mes: string,
  empresaId?: number,
): Promise<{
  tripulante_id: string;
  mes: string;
  jornadas: Array<FrmsJornada & { fatorizacao?: FrmsFatorizacao }>;
  acumulo: FrmsAcumuloRolling | null;
  alertas: FrmsAlerta[];
}> {
  const { data: jornadas } = await buscarJornadas(db, tripulanteId, { mes });
  const rolling = await db
    .prepare(
      "SELECT * FROM frms_acumulo_rolling WHERE tripulante_id = ? AND data_referencia LIKE ? || '%' AND deleted_at IS NULL ORDER BY data_referencia DESC LIMIT 1",
    )
    .bind(tripulanteId, mes)
    .first<FrmsAcumuloRolling>();

  const alertas = await db
    .prepare(
      `SELECT a.* FROM frms_alerta a
       LEFT JOIN frms_jornada j ON j.id = a.jornada_id AND j.deleted_at IS NULL
       LEFT JOIN funcionarios f ON f.id = CAST(a.tripulante_id AS INTEGER)
       WHERE a.tripulante_id = ?
         AND j.data IS NOT NULL
         AND j.data LIKE ? || '%'
         AND a.deleted_at IS NULL
         AND (? IS NULL OR (f.deleted_at IS NULL AND f.empresa_id = ?))
       ORDER BY j.data DESC`,
    )
    .bind(tripulanteId, mes, empresaId ?? null, empresaId ?? null)
    .all<FrmsAlerta>();

  return {
    tripulante_id: tripulanteId,
    mes,
    jornadas,
    acumulo: rolling ?? null,
    alertas: alertas.results || [],
  };
}

export async function relatorioCompliance(
  db: D1Database,
  mes: string,
  empresaId?: number,
): Promise<
  Array<{
    tripulante_id: string;
    nome: string;
    violacoes: number;
    alertas_criticos: number;
    alertas_atencao: number;
    alertas_aviso: number;
  }>
> {
  const rows = await db
    .prepare(
      `SELECT a.tripulante_id,
              COALESCE(p.nome, 'Tripulante #' || a.tripulante_id) as nome,
              SUM(CASE WHEN a.nivel = 'VIOLACAO' THEN 1 ELSE 0 END) as violacoes,
              SUM(CASE WHEN a.nivel = 'CRITICO' THEN 1 ELSE 0 END) as alertas_criticos,
              SUM(CASE WHEN a.nivel = 'ATENCAO' THEN 1 ELSE 0 END) as alertas_atencao,
              SUM(CASE WHEN a.nivel = 'AVISO' THEN 1 ELSE 0 END) as alertas_aviso
       FROM frms_alerta a
       LEFT JOIN frms_jornada j ON j.id = a.jornada_id AND j.deleted_at IS NULL
       LEFT JOIN funcionarios p ON p.id = CAST(a.tripulante_id AS INTEGER)
       WHERE a.deleted_at IS NULL
        AND j.data IS NOT NULL
        AND j.data LIKE ? || '%'
        AND (? IS NULL OR (p.deleted_at IS NULL AND p.empresa_id = ?))
       GROUP BY a.tripulante_id
       ORDER BY violacoes DESC, alertas_criticos DESC`,
    )
    .bind(mes, empresaId ?? null, empresaId ?? null)
    .all();

  return (rows.results || []).map((r: Record<string, unknown>) => ({
    tripulante_id: r.tripulante_id as string,
    nome: r.nome as string,
    violacoes: (r.violacoes as number) || 0,
    alertas_criticos: (r.alertas_criticos as number) || 0,
    alertas_atencao: (r.alertas_atencao as number) || 0,
    alertas_aviso: (r.alertas_aviso as number) || 0,
  }));
}

export async function relatorioMapaFadiga(
  db: D1Database,
  empresaId: number,
): Promise<
  Array<{
    tripulante_id: string;
    nome: string;
    pct_dia: number;
    pct_7d: number;
    pct_mes: number;
    pct_365d: number;
    nivel_max: string;
    repouso_suficiente: number;
  }>
> {
  // Buscar repouso_suficiente da última entrada de acumulo_rolling por tripulante
  const repousoRows = await db
    .prepare(
      `SELECT ar.tripulante_id, ar.repouso_suficiente
       FROM frms_acumulo_rolling ar
       WHERE ar.deleted_at IS NULL
         AND ar.data_referencia = (
           SELECT MAX(ar2.data_referencia)
           FROM frms_acumulo_rolling ar2
           WHERE ar2.tripulante_id = ar.tripulante_id AND ar2.deleted_at IS NULL
         )`,
    )
    .all<{ tripulante_id: string; repouso_suficiente: number }>();
  const repousoMap = new Map<string, number>();
  for (const r of repousoRows.results || []) {
    repousoMap.set(String(r.tripulante_id), r.repouso_suficiente);
  }

  return buscarAcumuloFrota(db, undefined, empresaId).then((frota) =>
    frota.map((f) => ({
      tripulante_id: f.tripulante_id,
      nome: f.nome,
      pct_dia: f.pct_dia,
      pct_7d: f.pct_7d,
      pct_mes: f.pct_mes,
      pct_365d: f.pct_365d,
      nivel_max: f.nivel_max,
      repouso_suficiente: repousoMap.get(String(f.tripulante_id)) ?? 1,
    })),
  );
}
