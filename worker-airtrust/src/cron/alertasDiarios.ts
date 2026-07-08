import type { D1Database } from '@cloudflare/workers-types';
import type { Env } from '../types';
import {
  CANCELLED_STATUS_VALUES,
  SCHEDULED_SESSION_STATUS_VALUES,
  sqlStatusEqualsAny,
  sqlStatusNotEqualsAny,
} from '../lib/status/status-codes';
import { publishDomainEvent } from '../shared/domainEvents';
import { getQualificacoesVencimentoExpr } from '../utils/qualificacoes-alerta-config';

export async function alertasDiariosHandler(_event: ScheduledEvent, env: Env): Promise<void> {
  const empresas = await env.DB.prepare(
    `SELECT id FROM empresas WHERE ativo = 1 AND deleted_at IS NULL`,
  ).all<{ id: string | number }>();

  for (const empresa of empresas.results || []) {
    await processarAlertasDiariosEmpresa(env.DB, String(empresa.id));
  }
}

async function processarAlertasDiariosEmpresa(db: D1Database, empresaId: string): Promise<void> {
  const cmaVencendo = await db
    .prepare(
      `SELECT DISTINCT
          CAST(f.id AS TEXT) AS funcionario_id,
          MAX(${getQualificacoesVencimentoExpr()}) AS validade_fim,
          CAST(
            JULIANDAY(MAX(${getQualificacoesVencimentoExpr()})) - JULIANDAY('now')
            AS INTEGER
          ) AS dias
       FROM qualificacoes_historico qh
       JOIN funcionarios f ON f.id = qh.funcionario_id
       LEFT JOIN qualificacoes_tipos qt ON qt.id = qh.qualificacao_id AND qt.deleted_at IS NULL
       WHERE f.empresa_id = ?
         AND f.deleted_at IS NULL
         AND COALESCE(f.ativo, 1) = 1
         AND qh.deleted_at IS NULL
         AND ${sqlStatusNotEqualsAny("UPPER(COALESCE(qh.status, 'CONCLUIDA'))", CANCELLED_STATUS_VALUES)}
         AND UPPER(COALESCE(qh.qualificacao_codigo, qt.codigo, '')) = 'CMA'
       GROUP BY f.id
       HAVING dias BETWEEN 1 AND 30`,
    )
    .bind(Number(empresaId))
    .all<{ funcionario_id: string; validade_fim: string; dias: number }>();

  for (const row of cmaVencendo.results || []) {
    await publishDomainEvent(db, row.dias <= 7 ? 'CMA_VENCENDO_7D' : 'CMA_VENCENDO_30D', {
      funcionario_id: row.funcionario_id,
      empresa_id: empresaId,
      origem_modulo: 'cron',
      validade_fim: row.validade_fim,
      dias_restantes: row.dias,
    });
  }

  const cmaVencido = await db
    .prepare(
      `SELECT DISTINCT CAST(f.id AS TEXT) AS funcionario_id
       FROM qualificacoes_historico qh
       JOIN funcionarios f ON f.id = qh.funcionario_id
       LEFT JOIN qualificacoes_tipos qt ON qt.id = qh.qualificacao_id AND qt.deleted_at IS NULL
       WHERE f.empresa_id = ?
         AND f.deleted_at IS NULL
         AND COALESCE(f.ativo, 1) = 1
         AND qh.deleted_at IS NULL
         AND ${sqlStatusNotEqualsAny("UPPER(COALESCE(qh.status, 'CONCLUIDA'))", CANCELLED_STATUS_VALUES)}
         AND UPPER(COALESCE(qh.qualificacao_codigo, qt.codigo, '')) = 'CMA'
         AND date(${getQualificacoesVencimentoExpr()}) = date('now', '-1 day')`,
    )
    .bind(Number(empresaId))
    .all<{ funcionario_id: string }>();

  for (const row of cmaVencido.results || []) {
    await publishDomainEvent(db, 'CMA_VENCIDO', {
      funcionario_id: row.funcionario_id,
      empresa_id: empresaId,
      origem_modulo: 'cron',
    });
  }

  const simuladoresVencendo = await db
    .prepare(
      `SELECT
          CAST(sp.funcionario_id AS TEXT) AS funcionario_id,
          CAST(JULIANDAY(MIN(sa.data)) - JULIANDAY('now') AS INTEGER) AS dias
       FROM sessoes_participantes sp
       JOIN simulador_agendamentos sa ON sa.id = sp.sessao_id
       JOIN funcionarios f ON f.id = sp.funcionario_id
       WHERE f.empresa_id = ?
         AND f.deleted_at IS NULL
         AND COALESCE(f.ativo, 1) = 1
         AND sp.deleted_at IS NULL
         AND sa.deleted_at IS NULL
         AND ${sqlStatusEqualsAny(
           "UPPER(COALESCE(sa.status, 'AGENDADO'))",
           SCHEDULED_SESSION_STATUS_VALUES,
         )}
         AND CAST(JULIANDAY(sa.data) - JULIANDAY('now') AS INTEGER) BETWEEN 0 AND 15
       GROUP BY sp.funcionario_id`,
    )
    .bind(Number(empresaId))
    .all<{ funcionario_id: string; dias: number }>();

  for (const row of simuladoresVencendo.results || []) {
    await publishDomainEvent(db, 'SIMULADOR_PENDENTE_VENCENDO', {
      funcionario_id: row.funcionario_id,
      empresa_id: empresaId,
      origem_modulo: 'cron',
      dias_restantes: row.dias,
    });
  }
}
