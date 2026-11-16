/**
 * FRMS — Queries de alertas.
 */

import type { FrmsAlerta, NivelAlerta } from './types';
import { now, logAuditoria } from './db-service-shared';
import { carryFrmsCaseHistory } from './case-resolution';
import { FRMS_CANONICAL_OPERATIONAL_SOURCE } from './frms-source-policy';
import { getTodayIsoSaoPaulo } from '../../utils/qualificacoes-alerta-config';

export type FrmsCaseStage = 'sem_tratamento' | 'em_tratamento' | 'vencidos';
export interface FrmsCaseGlobalSummary {
  sem_tratamento: number;
  em_tratamento: number;
  vencidos: number;
}

export interface BuscarAlertasFiltro {
  etapa?: FrmsCaseStage;
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
  sectorScope?: { clause: string; bindings: number[] },
): Promise<{ alertas: FrmsAlerta[]; total: number; summary?: FrmsCaseGlobalSummary }> {
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

  if (sectorScope) {
    conditions.push(sectorScope.clause);
    binds.push(...sectorScope.bindings);
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
  const today = getTodayIsoSaoPaulo();

  // Stage classification is server-side BEFORE pagination, in the same tenant scope.
  // Legacy/invalid notes are untreated; invalid JSON must never abort a list query.
  const schemaExpr = `CASE WHEN json_valid(a.notas_resolucao)
    THEN json_extract(a.notas_resolucao, '$.schema') ELSE NULL END`;
  const treated = `COALESCE(a.resolvido, 0) = 0 AND (${schemaExpr}) = 'FRMS_CASE_TREATMENT_V1'`;
  const untreated = `COALESCE(a.resolvido, 0) = 0 AND
    ((${schemaExpr}) IS NULL OR (${schemaExpr}) <> 'FRMS_CASE_TREATMENT_V1')`;
  const dueExpr = `CASE WHEN json_valid(a.notas_resolucao)
    THEN json_extract(a.notas_resolucao, '$.prazo') ELSE NULL END`;
  const overdue = `(${treated}) AND (${dueExpr}) < ?`;
  const stages: Record<FrmsCaseStage, string> = {
    sem_tratamento: `(${untreated})`,
    em_tratamento: `(${treated})`,
    vencidos: `(${overdue})`,
  };
  const stage = filtro.etapa ? stages[filtro.etapa] : null;
  const stageDateBinds = filtro.etapa === 'vencidos' ? [today] : [];

  // Each total is computed on the full eligible population, never a page.
  const countResult = await db
    .prepare(
      `SELECT
          SUM(CASE WHEN ${stage ?? '1 = 1'} THEN 1 ELSE 0 END) AS total,
          SUM(CASE WHEN ${untreated} THEN 1 ELSE 0 END) AS sem_tratamento,
          SUM(CASE WHEN ${treated} THEN 1 ELSE 0 END) AS em_tratamento,
          SUM(CASE WHEN ${overdue} THEN 1 ELSE 0 END) AS vencidos
       FROM frms_alerta a
       LEFT JOIN frms_jornada j ON j.id = a.jornada_id
        AND CAST(j.tripulante_id AS INTEGER) = CAST(a.tripulante_id AS INTEGER)
       LEFT JOIN funcionarios f ON f.id = CAST(a.tripulante_id AS INTEGER)
       WHERE ${where}`,
    )
    .bind(...stageDateBinds, today, ...binds)
    .first<{ total: number | null; sem_tratamento?: number | null; em_tratamento?: number | null; vencidos?: number | null }>();

  const rows = await db
    .prepare(
      `SELECT a.*,
          COUNT(*) OVER (PARTITION BY a.tripulante_id) AS recorrencias_no_filtro,
          j.data as data_jornada,
          j.data as data_fato,
          COALESCE(f.nome, 'Tripulante #' || a.tripulante_id) as nome_tripulante
       FROM frms_alerta a
       LEFT JOIN frms_jornada j ON j.id = a.jornada_id
        AND CAST(j.tripulante_id AS INTEGER) = CAST(a.tripulante_id AS INTEGER)
       LEFT JOIN funcionarios f ON f.id = CAST(a.tripulante_id AS INTEGER)
       WHERE ${where}${stage ? ` AND ${stage}` : ''}
       ORDER BY
         CASE WHEN ${overdue} THEN 0
              WHEN ${untreated} THEN 1
              WHEN ${treated} THEN 2
              ELSE 3 END,
         CASE a.nivel WHEN 'VIOLACAO' THEN 0 WHEN 'CRITICO' THEN 1
           WHEN 'ATENCAO' THEN 2 WHEN 'AVISO' THEN 3 ELSE 4 END,
         date(j.data) ASC, a.created_at ASC, a.id ASC
       LIMIT ? OFFSET ?`,
    )
    .bind(...binds, ...stageDateBinds, today, limit, offset)
    .all<FrmsAlerta & { nome_tripulante?: string }>();

  const summaryAvailable = countResult !== null
    && Object.prototype.hasOwnProperty.call(countResult, 'sem_tratamento')
    && Object.prototype.hasOwnProperty.call(countResult, 'em_tratamento')
    && Object.prototype.hasOwnProperty.call(countResult, 'vencidos');
  return {
    alertas: rows.results || [],
    total: Number(countResult?.total ?? 0),
    ...(summaryAvailable ? { summary: {
      sem_tratamento: Number(countResult.sem_tratamento ?? 0),
      em_tratamento: Number(countResult.em_tratamento ?? 0),
      vencidos: Number(countResult.vencidos ?? 0),
    } } : {}),
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
  // Um caso reaberto carrega o histórico de encerramentos; novo tratamento não o apaga.
  const notas = carryFrmsCaseHistory(anterior.notas_resolucao, notasTratamento);
  const result = await db.prepare(`
    UPDATE frms_alerta
    SET notas_resolucao = ?, updated_at = ?
    WHERE ${CASE_WRITE_SCOPE}
  `).bind(notas, timestamp, id, empresaId).run();
  if ((result.meta?.changes ?? 0) !== 1) return false;
  await logAuditoria(db, 'frms_alerta', id, 'TRATAMENTO_REGISTRADO', anterior, {
    registrado_por: userId,
    registrado_em: timestamp,
    notas_resolucao: notas,
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
  const notas = carryFrmsCaseHistory(anterior.notas_resolucao, notasResolucao);
  const result = await db.prepare(`
    UPDATE frms_alerta
    SET resolvido = 1, resolvido_em = ?, resolvido_por = ?,
        notas_resolucao = ?, updated_at = ?
    WHERE ${CASE_WRITE_SCOPE}
  `).bind(timestamp, userId, notas, timestamp, id, empresaId).run();
  if ((result.meta?.changes ?? 0) !== 1) return false;
  await logAuditoria(db, 'frms_alerta', id, 'RESOLVIDO', anterior, {
    resolvido_por: userId,
    resolvido_em: timestamp,
    notas_resolucao: notas,
  });
  return true;
}

/**
 * Reabre um caso ENCERRADO do próprio tenant. O encerramento anterior fica preservado em
 * `notas_resolucao.historico`; a trilha fica em `auditoria_avancada_v2` (acao REABERTO).
 */
export async function reabrirAlertaResolvido(
  db: D1Database,
  id: string,
  userId: string,
  buildNotes: (previousNotes: unknown) => string | null,
  empresaId: number,
): Promise<'REOPENED' | 'NOT_CLOSED' | 'INVALID'> {
  const anterior = await db.prepare(`
    SELECT a.* FROM frms_alerta a
    JOIN funcionarios f ON f.id = CAST(a.tripulante_id AS INTEGER)
    WHERE a.id = ? AND a.deleted_at IS NULL
      AND f.empresa_id = ? AND f.deleted_at IS NULL
      AND COALESCE(a.resolvido, 0) = 1
    LIMIT 1
  `).bind(id, empresaId).first<Record<string, unknown>>();
  if (!anterior) return 'NOT_CLOSED';
  const notes = buildNotes(anterior.notas_resolucao);
  if (!notes) return 'INVALID';
  const timestamp = now();
  const result = await db.prepare(`
    UPDATE frms_alerta
    SET resolvido = 0, resolvido_em = NULL, resolvido_por = NULL,
        notas_resolucao = ?, updated_at = ?
    WHERE id = ? AND deleted_at IS NULL AND COALESCE(resolvido, 0) = 1
      AND EXISTS (
        SELECT 1 FROM funcionarios f
        WHERE f.id = CAST(frms_alerta.tripulante_id AS INTEGER)
          AND f.empresa_id = ? AND f.deleted_at IS NULL
      )
  `).bind(notes, timestamp, id, empresaId).run();
  if ((result.meta?.changes ?? 0) !== 1) return 'NOT_CLOSED';
  await logAuditoria(db, 'frms_alerta', id, 'REABERTO', anterior, {
    reaberto_por: userId,
    reaberto_em: timestamp,
    notas_resolucao: notes,
    resolvido: 0,
  });
  return 'REOPENED';
}
