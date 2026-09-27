/**
 * FRMS — Relatórios (individual, compliance, mapa de fadiga).
 */

import type { FrmsJornada, FrmsFatorizacao, FrmsAcumuloRolling, FrmsAlerta } from './types';
import { buscarJornadas } from './db-service-jornadas';
import { buscarAcumuloFrota } from './db-service-acumulo';
import { listFrmsOperationalSnapshot, type FrmsOperationalSnapshotItem } from './operational-snapshot';
import { getTodayIsoSaoPaulo } from '../../utils/qualificacoes-alerta-config';

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

export interface FrmsComplianceReportRow {
  tripulante_id: string;
  nome: string;
  dias_avaliados: number;
  dias_conformes: number;
  dias_violacao: number;
  dias_nao_avaliados: number;
  dias_mitigacao: number;
  dias_atencao: number;
  violacoes_normativas: string[];
  fontes_normativas: string[];
  // Aliases legados mantidos para consumidores antigos; agora derivam da decisão canônica.
  violacoes: number;
  alertas_criticos: number;
  alertas_atencao: number;
  alertas_aviso: number;
}

function lastDayOfMonth(month: string): string {
  const match = /^(\d{4})-(\d{2})$/.exec(month);
  if (!match) throw new Error('INVALID_MONTH');
  const year = Number(match[1]);
  const monthNumber = Number(match[2]);
  if (monthNumber < 1 || monthNumber > 12) throw new Error('INVALID_MONTH');
  return new Date(Date.UTC(year, monthNumber, 0)).toISOString().slice(0, 10);
}

export function aggregateCanonicalComplianceReport(
  items: readonly FrmsOperationalSnapshotItem[],
): FrmsComplianceReportRow[] {
  const byCrew = new Map<string, FrmsComplianceReportRow>();
  for (const item of items) {
    const id = String(item.funcionario_id);
    let row = byCrew.get(id);
    if (!row) {
      row = {
        tripulante_id: id,
        nome: item.nome_guerra || item.nome || `Tripulante #${id}`,
        dias_avaliados: 0,
        dias_conformes: 0,
        dias_violacao: 0,
        dias_nao_avaliados: 0,
        dias_mitigacao: 0,
        dias_atencao: 0,
        violacoes_normativas: [],
        fontes_normativas: [],
        violacoes: 0,
        alertas_criticos: 0,
        alertas_atencao: 0,
        alertas_aviso: 0,
      };
      byCrew.set(id, row);
    }
    row.dias_avaliados += 1;
    if (item.compliance_status === 'VIOLATION') row.dias_violacao += 1;
    else if (item.compliance_status === 'COMPLIANT') row.dias_conformes += 1;
    else row.dias_nao_avaliados += 1;

    if (item.estado_operacional === 'MITIGACAO_NECESSARIA') row.dias_mitigacao += 1;
    if (item.estado_operacional === 'ATENCAO') row.dias_atencao += 1;

    for (const violation of item.violacoes_normativas ?? []) {
      const label = `${violation.code}: ${violation.message}`;
      if (!row.violacoes_normativas.includes(label)) row.violacoes_normativas.push(label);
      const source = `${violation.source} — ${violation.reference}`;
      if (!row.fontes_normativas.includes(source)) row.fontes_normativas.push(source);
    }
  }

  for (const row of byCrew.values()) {
    row.violacoes = row.dias_violacao;
    row.alertas_criticos = row.dias_mitigacao;
    row.alertas_atencao = row.dias_atencao;
    row.alertas_aviso = 0;
  }

  return [...byCrew.values()].sort((a, b) =>
    b.dias_violacao - a.dias_violacao ||
    b.dias_nao_avaliados - a.dias_nao_avaliados ||
    b.dias_mitigacao - a.dias_mitigacao ||
    a.nome.localeCompare(b.nome),
  );
}

export async function relatorioCompliance(
  db: D1Database,
  mes: string,
  empresaId?: number,
): Promise<FrmsComplianceReportRow[]> {
  if (!empresaId || !Number.isInteger(empresaId) || empresaId <= 0) {
    throw new Error('FRMS_COMPLIANCE_REPORT_TENANT_REQUIRED');
  }
  if (!/^\d{4}-\d{2}$/.test(mes)) throw new Error('INVALID_MONTH');
  const today = getTodayIsoSaoPaulo();
  const currentMonth = today.slice(0, 7);
  if (mes > currentMonth) return [];
  const dataInicio = `${mes}-01`;
  const dataFim = mes === currentMonth ? today : lastDayOfMonth(mes);
  const snapshot = await listFrmsOperationalSnapshot(db, {
    empresaId,
    dataInicio,
    dataFim,
    hoje: dataFim,
  });
  return aggregateCanonicalComplianceReport(snapshot.items);
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
