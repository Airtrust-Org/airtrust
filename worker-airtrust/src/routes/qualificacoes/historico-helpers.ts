/**
 * QUALIFICACOES HISTORICO — Shared helpers
 * Extracted from historico.ts
 */

import type { Context } from 'hono';
import type { Env } from '../../types';
import { publishDomainEvent, type DomainEventTipo } from '../../shared/domainEvents';

export function inferModeloCodigoFromQualificacao(
  codigo: string | null | undefined,
): string | null {
  const normalized = String(codigo || '')
    .trim()
    .toUpperCase();
  if (!normalized) return null;
  if (normalized.includes('AW139')) return 'AW139';
  if (normalized.includes('SK76') || normalized.includes('S76')) return 'SK76';
  return null;
}

export async function resolveEmpresaIdByFuncionario(
  db: D1Database,
  funcionarioId: number,
): Promise<number | null> {
  const row = await db
    .prepare('SELECT empresa_id FROM funcionarios WHERE id = ? AND deleted_at IS NULL')
    .bind(funcionarioId)
    .first<{ empresa_id: number | null }>();
  return row?.empresa_id ?? null;
}

export async function publishQualificacaoEvent(
  db: D1Database,
  action: 'created' | 'renewed' | 'revoked',
  funcionarioId: number,
  qualificacaoCodigo: string | null | undefined,
  extras: Record<string, unknown> = {},
): Promise<void> {
  const empresaId = await resolveEmpresaIdByFuncionario(db, funcionarioId);
  if (!empresaId) return;

  const codigo = String(qualificacaoCodigo || '')
    .trim()
    .toUpperCase();

  if (codigo === 'CMA') {
    const tipo: DomainEventTipo =
      action === 'created' ? 'CMA_CRIADO' : action === 'renewed' ? 'CMA_RENOVADO' : 'CMA_REVOGADO';
    await publishDomainEvent(db, 'qualificacoes', tipo, {
      origem_modulo: 'qualificacoes',
      funcionario_id: String(funcionarioId),
      empresa_id: empresaId,
      qualificacao_codigo: codigo,
      ...extras,
    });
    return;
  }

  const modeloCodigo = inferModeloCodigoFromQualificacao(codigo);
  if (!modeloCodigo) return;

  await publishDomainEvent(
    db,
    'qualificacoes',
    action === 'revoked' ? 'HABILITACAO_REVOGADA' : 'HABILITACAO_ADICIONADA',
    {
      origem_modulo: 'qualificacoes',
      funcionario_id: String(funcionarioId),
      empresa_id: empresaId,
      qualificacao_codigo: codigo,
      modelo_codigo: modeloCodigo,
      ...extras,
    },
  );
}

// ===== CACHE E HELPERS =====
export interface HistoricoStatsCacheEntry {
  key: string;
  ts: number;
  data: {
    total: number;
    validas: number;
    vencendo: number;
    vencidas: number;
    renovadas: number;
    planejadas: number;
  };
}
export type StatsCacheData = HistoricoStatsCacheEntry['data'];

// Mutable container so all modules can mutate .cache / .inflight via the same reference
export const histCache: {
  cache: HistoricoStatsCacheEntry | null;
  inflight: Map<string, Promise<StatsCacheData>>;
} = {
  cache: null,
  inflight: new Map(),
};

export function generateETag(parts: unknown[]): string {
  try {
    const base = JSON.stringify(parts);
    const b64 = btoa(base).substring(0, 24);
    return `"qh-${b64}"`;
  } catch {
    return '"qh-etag-fallback"';
  }
}

export function getCacheTtlMs(env: Env): number {
  const raw = (env as unknown as { CACHE_TTL_SECONDS?: string }).CACHE_TTL_SECONDS || '30';
  const n = parseInt(raw);
  if (isNaN(n) || n <= 0) return 30000;
  return n * 1000;
}

export async function invalidateMaterializedStats(db: D1Database) {
  try {
    await db
      .prepare("DELETE FROM qualificacoes_historico_stats_daily WHERE day = date('now')")
      .run();
  } catch (e) {
    console.error('[invalidateMaterializedStats] erro', e);
  }
  histCache.cache = null;
}

// Kept as a compatibility no-op while historico routes still import this helper.
export const ensureHistoricoSchema = async (_db: D1Database) => {};

// Kept as a compatibility no-op while historico routes still import this helper.
export const ensureQualificacoesTiposTrainingSchema = async (_db: D1Database) => {};

export type TipoTreinamento = 'INICIAL' | 'RECORRENTE' | 'SEMESTRAL' | 'UPGRADE' | 'ESPECIFICO';

export function normalizeTipoTreinamento(value?: string | null): TipoTreinamento | null {
  const raw = String(value || '')
    .trim()
    .toUpperCase();

  if (!raw) return null;
  if (raw === 'SEMESTRAL') return 'SEMESTRAL';
  if (raw === 'PERIODICO' || raw === 'PERIÓDICO') return 'RECORRENTE';
  if (raw === 'RECORRENTE') return 'RECORRENTE';
  if (raw === 'INICIAL') return 'INICIAL';
  if (raw === 'UPGRADE') return 'UPGRADE';
  if (raw === 'ESPECIFICO' || raw === 'ESPECÍFICO') return 'ESPECIFICO';
  return null;
}

export function toPositiveNumber(value: unknown): number | null {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

export function resolveCargaHorariaByTipo(params: {
  cargaHistorico?: unknown;
  tipoTreinamento?: string | null;
  cargaInicial?: unknown;
  cargaRecorrente?: unknown;
  cargaPadrao?: unknown;
}): number | null {
  const cargaHistorico = toPositiveNumber(params.cargaHistorico);
  if (cargaHistorico) return cargaHistorico;

  const cargaInicial = toPositiveNumber(params.cargaInicial);
  const cargaRecorrente = toPositiveNumber(params.cargaRecorrente);
  const cargaPadrao = toPositiveNumber(params.cargaPadrao);
  const tipoTreinamento = normalizeTipoTreinamento(params.tipoTreinamento);

  if (tipoTreinamento === 'RECORRENTE' || tipoTreinamento === 'SEMESTRAL') {
    return cargaRecorrente || cargaInicial || cargaPadrao;
  }

  if (tipoTreinamento === 'INICIAL') {
    return cargaInicial || cargaRecorrente || cargaPadrao;
  }

  return cargaInicial || cargaRecorrente || cargaPadrao;
}

export function calcularDataVencimento(params: {
  dataConclusao?: string | null;
  dataVencimento?: string | null;
  validadeMeses?: number | null;
  vencimentoFimMes?: number | null;
}): string | null {
  if (params.dataVencimento) return params.dataVencimento;

  const dataConclusao = String(params.dataConclusao || '').trim();
  const validadeMeses = toPositiveNumber(params.validadeMeses);
  const vencimentoFimMes = Number(params.vencimentoFimMes || 0) === 1 ? 1 : 0;

  if (!dataConclusao || !validadeMeses) return null;

  const dataBase = new Date(`${dataConclusao}T00:00:00Z`);
  if (Number.isNaN(dataBase.getTime())) return null;

  if (vencimentoFimMes === 1) {
    const year = dataBase.getUTCFullYear();
    const month = dataBase.getUTCMonth();
    const endOfMonth = new Date(Date.UTC(year, month + validadeMeses + 1, 0));
    return endOfMonth.toISOString().slice(0, 10);
  }

  dataBase.setUTCMonth(dataBase.getUTCMonth() + validadeMeses);
  return dataBase.toISOString().slice(0, 10);
}

export function resolveParametrosRenovacaoQualificacao(params: {
  codigoQualificacao?: string | null;
  dataConclusao: string;
  validadeMeses: number;
}): {
  validadeMeses: number;
  dataVencimento: string | null;
  tipoTreinamento: 'RECORRENTE' | 'SEMESTRAL';
  status: 'CONCLUIDA';
} {
  const codigoQualificacao = String(params.codigoQualificacao || '')
    .trim()
    .toUpperCase();
  const validadeMeses = codigoQualificacao === 'G1-SEM' ? 6 : params.validadeMeses;
  const tipoTreinamento = validadeMeses === 6 ? 'SEMESTRAL' : 'RECORRENTE';
  const dataVencimento = calcularDataVencimento({
    dataConclusao: params.dataConclusao,
    validadeMeses,
    vencimentoFimMes: codigoQualificacao === 'G1-SEM' ? 0 : 1,
  });

  return {
    validadeMeses,
    dataVencimento,
    tipoTreinamento,
    status: 'CONCLUIDA',
  };
}

let modelosAeronaveModeloColumnPromise: Promise<boolean> | null = null;

export const ensureModelosAeronaveModeloColumn = async (db: D1Database) => {
  if (!modelosAeronaveModeloColumnPromise) {
    modelosAeronaveModeloColumnPromise = db
      .prepare('PRAGMA table_info(modelos_aeronave)')
      .all()
      .then((col) =>
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (col.results || []).some((r: any) => r.name === 'modelo'),
      )
      .catch((e) => {
        console.warn('[ensureModelosAeronaveModeloColumn] Falha:', (e as Error).message);
        return false;
      });
  }

  await modelosAeronaveModeloColumnPromise;
};

// Mapeamento de colunas para ordenação segura (evita SQL injection)
export const MODELO_AERONAVE_EXPR = `COALESCE(
  NULLIF(
    (
      SELECT REPLACE(
        GROUP_CONCAT(DISTINCT COALESCE(ma_multi.modelo, ma_multi.codigo, ma_multi.nome)),
        ',',
        ' / '
      )
      FROM modelos_aeronave ma_multi
      WHERE ma_multi.deleted_at IS NULL
        AND INSTR(
          ',' || REPLACE(COALESCE(f.modelo_aeronave_id, ''), ' ', '') || ',',
          ',' || CAST(ma_multi.id AS TEXT) || ','
        ) > 0
    ),
    ''
  ),
  NULLIF(
    (
      SELECT REPLACE(
        GROUP_CONCAT(DISTINCT UPPER(TRIM(COALESCE(a.modelo, '')))),
        ',',
        ' / '
      )
      FROM funcionarios_aeronaves fa
      JOIN aeronaves a
        ON a.id = fa.aeronave_id
       AND COALESCE(a.deleted_at, '') = ''
      WHERE fa.funcionario_id = f.id
        AND COALESCE(fa.deleted_at, '') = ''
        AND TRIM(COALESCE(a.modelo, '')) <> ''
    ),
    ''
  ),
  COALESCE(ma.modelo, ma.codigo, ma.nome),
  NULLIF(REPLACE(REPLACE(COALESCE(f.modelo_aeronave_id, ''), ',', ' / '), ' ', ''), '')
)`;

export const SORTABLE_COLUMNS: Record<string, string> = {
  status: `(
    CASE
      WHEN qh.deleted_at IS NOT NULL THEN 'CANCELADA'
      WHEN qh.renovada = 1 THEN 'RENOVADA'
      WHEN qh.data_conclusao IS NULL THEN 'PLANEJADA'
      WHEN COALESCE(qh.data_vencimento, date(qh.data_conclusao, '+' || COALESCE(qh.validade_meses, qt.validade, 12) || ' months')) IS NULL THEN 'INDEFINIDA'
      WHEN COALESCE(qh.data_vencimento, date(qh.data_conclusao, '+' || COALESCE(qh.validade_meses, qt.validade, 12) || ' months')) < date('now') THEN 'VENCIDA'
      WHEN COALESCE(qh.data_vencimento, date(qh.data_conclusao, '+' || COALESCE(qh.validade_meses, qt.validade, 12) || ' months')) <= date('now','+30 days') THEN 'VENCENDO_30'
      ELSE 'VALIDA'
    END
  )`,
  funcionario: 'f.nome',
  funcionario_nome: 'f.nome',
  qualificacao: 'qt.nome',
  qualificacao_nome: 'qt.nome',
  codigo: 'qt.codigo',
  qualificacao_codigo: 'qt.codigo',
  modelo_aeronave: MODELO_AERONAVE_EXPR,
  categoria: 'qt.categoria',
  qualificacao_categoria: 'qt.categoria',
  data_realizacao: 'qh.data_conclusao',
  realizado: 'qh.data_conclusao',
  data_vencimento:
    "COALESCE(qh.data_vencimento, date(qh.data_conclusao, '+' || COALESCE(qh.validade_meses, qt.validade, 12) || ' months'))",
  vencimento:
    "COALESCE(qh.data_vencimento, date(qh.data_conclusao, '+' || COALESCE(qh.validade_meses, qt.validade, 12) || ' months'))",
  validade: 'qt.validade',
  created_at: 'qh.created_at',
  id: 'qh.id',
};

export function buildOrderByClause(orderBy: string, order: string): string {
  const direction = order.toUpperCase() === 'DESC' ? 'DESC' : 'ASC';
  const column = SORTABLE_COLUMNS[orderBy] || SORTABLE_COLUMNS['data_vencimento'];

  if (orderBy === 'status') {
    const tiebreaker = `COALESCE(qh.data_vencimento, date(qh.data_conclusao, '+' || COALESCE(qh.validade_meses, qt.validade, 12) || ' months'))`;
    return `${column} ${direction}, ${tiebreaker} ASC`;
  }

  if (orderBy === 'data_vencimento' || orderBy === 'vencimento') {
    const priorityBucket = `(CASE
      WHEN COALESCE(qh.status, '') = 'PLANEJADA'
       AND qh.data_conclusao IS NOT NULL
       AND date(qh.data_conclusao) <= date('now') THEN 0
      WHEN qh.data_conclusao IS NOT NULL
       AND COALESCE(qh.data_vencimento, date(qh.data_conclusao, '+' || COALESCE(qh.validade_meses, qt.validade, 12) || ' months')) < date('now') THEN 1
      ELSE 2
    END)`;
    return `${priorityBucket} ASC, ${column} ${direction}`;
  }

  return `${column} ${direction}`;
}

export function safe(fn: (c: Context<{ Bindings: Env }>) => Promise<Response> | Response) {
  return async (c: Context<{ Bindings: Env }>) => {
    try {
      return await fn(c);
    } catch (e) {
      const errorMessage = (e as Error).message || String(e);
      console.error('[HISTORICO_ERROR]', errorMessage, (e as Error).stack);
      return c.json({ success: false, error: errorMessage }, 500);
    }
  };
}

export async function historicoPertenceEmpresa(
  db: D1Database,
  historicoId: number,
  empresaId: number,
) {
  return db
    .prepare(
      `SELECT qh.id, qh.funcionario_id, qh.qualificacao_codigo, qh.status, qh.renovada
       FROM qualificacoes_historico qh
       INNER JOIN funcionarios f ON f.id = qh.funcionario_id
       WHERE qh.id = ?
         AND qh.deleted_at IS NULL
         AND f.deleted_at IS NULL
         AND f.empresa_id = ?
       LIMIT 1`,
    )
    .bind(historicoId, empresaId)
    .first<{
      id: number;
      funcionario_id: number;
      qualificacao_codigo: string | null;
      status: string | null;
      renovada: number;
    }>();
}
