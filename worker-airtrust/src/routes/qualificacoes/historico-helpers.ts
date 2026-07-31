/**
 * QUALIFICACOES HISTORICO — Shared helpers
 * Extracted from historico.ts
 */

import type { Context } from 'hono';
import type { Env } from '../../types';
import { publishDomainEvent, type DomainEventTipo } from '../../shared/domainEvents';
import { getQualificacoesVencimentoExpr } from '../../utils/qualificacoes-alerta-config';

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
    let hash = 2166136261;
    for (let index = 0; index < base.length; index += 1) {
      hash ^= base.charCodeAt(index);
      hash = Math.imul(hash, 16777619);
    }
    return `"qh-${(hash >>> 0).toString(36)}"`;
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

/** Expressão canônica de vencimento — NULL = sem vencimento, sem fallback 12 */
const VENCIMENTO_SQL = getQualificacoesVencimentoExpr();

export const SORTABLE_COLUMNS: Record<string, string> = {
  // PLANEJADA records created via integration have data_conclusao set (= data_prevista),
  // so we must check qh.status directly before falling through to date-based logic.
  // RENOVADA: somente se existe sucessora real (NÃO é a vigente operacional).
  // renovada=1 e status='RENOVADA' são legado informativo, nunca critério final.
  status: `(
    CASE
      WHEN qh.deleted_at IS NOT NULL THEN 'CANCELADA'
      WHEN UPPER(COALESCE(qh.status,'')) IN ('PLANEJADA','PLANEJADO') OR qh.data_conclusao IS NULL THEN 'PLANEJADA'
      WHEN NOT (qh.deleted_at IS NULL AND UPPER(COALESCE(qh.status,'')) NOT IN ('CANCELADA','CANCELADO') AND COALESCE(qh.data_vencimento, qh.data_conclusao) IS NOT NULL AND NOT EXISTS (
        SELECT 1 FROM qualificacoes_historico qh_newer
        LEFT JOIN qualificacoes_tipos qt_newer ON qt_newer.id = qh_newer.qualificacao_id
        WHERE qh_newer.funcionario_id = qh.funcionario_id
          AND qh_newer.deleted_at IS NULL
          AND UPPER(COALESCE(qh_newer.status,'')) NOT IN ('CANCELADA','CANCELADO')
          AND COALESCE(qh_newer.data_vencimento, qh_newer.data_conclusao) IS NOT NULL
          AND UPPER(TRIM(COALESCE(
            NULLIF(CAST(qh.qualificacao_id AS TEXT), ''),
            NULLIF(qh.qualificacao_codigo, ''),
            NULLIF(qt.codigo, ''),
            NULLIF(qh.tipo, ''),
            NULLIF(qt.nome, '')
          ))) <> ''
          AND UPPER(TRIM(COALESCE(
            NULLIF(CAST(qh_newer.qualificacao_id AS TEXT), ''),
            NULLIF(qh_newer.qualificacao_codigo, ''),
            NULLIF(qt_newer.codigo, ''),
            NULLIF(qh_newer.tipo, ''),
            NULLIF(qt_newer.nome, '')
          ))) = UPPER(TRIM(COALESCE(
            NULLIF(CAST(qh.qualificacao_id AS TEXT), ''),
            NULLIF(qh.qualificacao_codigo, ''),
            NULLIF(qt.codigo, ''),
            NULLIF(qh.tipo, ''),
            NULLIF(qt.nome, '')
          )))
          AND (datetime(COALESCE(qh_newer.data_vencimento, qh_newer.data_conclusao, qh_newer.updated_at, qh_newer.created_at)) > datetime(COALESCE(qh.data_vencimento, qh.data_conclusao, qh.updated_at, qh.created_at)) OR (datetime(COALESCE(qh_newer.data_vencimento, qh_newer.data_conclusao, qh_newer.updated_at, qh_newer.created_at)) = datetime(COALESCE(qh.data_vencimento, qh.data_conclusao, qh.updated_at, qh.created_at)) AND qh_newer.id > qh.id))
      )) THEN 'RENOVADA'
      WHEN ${VENCIMENTO_SQL} IS NULL THEN 'INDEFINIDA'
      WHEN ${VENCIMENTO_SQL} < date('now') THEN 'VENCIDA'
      WHEN ${VENCIMENTO_SQL} <= date('now','+30 days') THEN 'VENCENDO_30'
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
  data_vencimento: VENCIMENTO_SQL,
  vencimento: VENCIMENTO_SQL,
  validade: 'qt.validade',
  created_at: 'qh.created_at',
  id: 'qh.id',
};

export function buildOrderByClause(orderBy: string, order: string): string {
  const direction = order.toUpperCase() === 'DESC' ? 'DESC' : 'ASC';
  const column = SORTABLE_COLUMNS[orderBy] || SORTABLE_COLUMNS['data_vencimento'];

  if (orderBy === 'status') {
    // Sort by numeric priority rank so PLANEJADA always comes first (rank 1) when ASC.
    // Checking qh.status directly is critical: PLANEJADA records have data_conclusao set
    // (= data_prevista), so relying on data_conclusao IS NULL alone would misclassify them.
    // RENOVADA (rank 5): somente se existe sucessora real (NÃO é vigente operacional).
    const vencimento = VENCIMENTO_SQL;
    const rankExpr = `(CASE
      WHEN qh.deleted_at IS NOT NULL THEN 6
      WHEN UPPER(COALESCE(qh.status,'')) IN ('PLANEJADA','PLANEJADO') OR qh.data_conclusao IS NULL THEN 1
      WHEN NOT (qh.deleted_at IS NULL AND UPPER(COALESCE(qh.status,'')) NOT IN ('CANCELADA','CANCELADO') AND COALESCE(qh.data_vencimento, qh.data_conclusao) IS NOT NULL AND NOT EXISTS (
        SELECT 1 FROM qualificacoes_historico qh_newer2
        LEFT JOIN qualificacoes_tipos qt_newer2 ON qt_newer2.id = qh_newer2.qualificacao_id
        WHERE qh_newer2.funcionario_id = qh.funcionario_id
          AND qh_newer2.deleted_at IS NULL
          AND UPPER(COALESCE(qh_newer2.status,'')) NOT IN ('CANCELADA','CANCELADO')
          AND COALESCE(qh_newer2.data_vencimento, qh_newer2.data_conclusao) IS NOT NULL
          AND UPPER(TRIM(COALESCE(NULLIF(CAST(qh.qualificacao_id AS TEXT), ''), NULLIF(qh.qualificacao_codigo, ''), NULLIF(qt.codigo, ''), NULLIF(qh.tipo, ''), NULLIF(qt.nome, '')))) <> ''
          AND UPPER(TRIM(COALESCE(NULLIF(CAST(qh_newer2.qualificacao_id AS TEXT), ''), NULLIF(qh_newer2.qualificacao_codigo, ''), NULLIF(qt_newer2.codigo, ''), NULLIF(qh_newer2.tipo, ''), NULLIF(qt_newer2.nome, '')))) = UPPER(TRIM(COALESCE(NULLIF(CAST(qh.qualificacao_id AS TEXT), ''), NULLIF(qh.qualificacao_codigo, ''), NULLIF(qt.codigo, ''), NULLIF(qh.tipo, ''), NULLIF(qt.nome, ''))))
          AND (datetime(COALESCE(qh_newer2.data_vencimento, qh_newer2.data_conclusao, qh_newer2.updated_at, qh_newer2.created_at)) > datetime(COALESCE(qh.data_vencimento, qh.data_conclusao, qh.updated_at, qh.created_at)) OR (datetime(COALESCE(qh_newer2.data_vencimento, qh_newer2.data_conclusao, qh_newer2.updated_at, qh_newer2.created_at)) = datetime(COALESCE(qh.data_vencimento, qh.data_conclusao, qh.updated_at, qh.created_at)) AND qh_newer2.id > qh.id))
      )) THEN 5
      WHEN ${vencimento} < date('now') THEN 2
      WHEN ${vencimento} <= date('now','+30 days') THEN 3
      ELSE 4
    END)`;
    return `${rankExpr} ${direction}, ${vencimento} ASC`;
  }

  if (orderBy === 'data_vencimento' || orderBy === 'vencimento') {
    const priorityBucket = `(CASE
      WHEN COALESCE(qh.status, '') = 'PLANEJADA'
       AND qh.data_conclusao IS NOT NULL
       AND date(qh.data_conclusao) <= date('now') THEN 0
      WHEN qh.data_conclusao IS NOT NULL
       AND ${VENCIMENTO_SQL} < date('now') THEN 1
      ELSE 2
    END)`;
    return `${priorityBucket} ASC, ${column} ${direction}`;
  }

  return `${column} ${direction}`;
}

/**
 * Resolves a qualification category without allowing a name match to fan out
 * one history row into several rows.  `qc` is the only resolved category;
 * the two reference joins exist solely to make inconsistent legacy data
 * observable to the caller.
 */
export function buildCategoriaResolutionJoinClause(
  hasTipoCategoriaId: boolean,
  hasCategoriaEmpresaId: boolean,
): string {
  const targetName = `UPPER(TRIM(COALESCE(NULLIF(qh.categoria, ''), NULLIF(qt.categoria, ''), '')))`;
  const tenant = hasCategoriaEmpresaId ? 'empresa_id = f.empresa_id' : '1 = 1';
  const tipoReference = hasTipoCategoriaId ? 'qt.categoria_id' : 'NULL';

  return `
    LEFT JOIN qualificacoes_categorias qh_categoria_ref
      ON qh_categoria_ref.id = qh.categoria_id
      AND qh_categoria_ref.deleted_at IS NULL
      AND qh_categoria_ref.${tenant}
    LEFT JOIN qualificacoes_categorias qt_categoria_ref
      ON qt_categoria_ref.id = ${tipoReference}
      AND qt_categoria_ref.deleted_at IS NULL
      AND qt_categoria_ref.${tenant}
    LEFT JOIN qualificacoes_categorias qc
      ON qc.id = (
        SELECT candidate.id
        FROM qualificacoes_categorias candidate
        WHERE candidate.deleted_at IS NULL
          AND candidate.ativo = 1
          AND candidate.empresa_id = f.empresa_id
          AND (
            (${targetName} <> ''
              AND UPPER(TRIM(candidate.nome)) = ${targetName}
              AND 1 = (
                SELECT COUNT(*)
                FROM qualificacoes_categorias candidate_count
                WHERE candidate_count.deleted_at IS NULL
                  AND candidate_count.ativo = 1
                  AND candidate_count.empresa_id = f.empresa_id
                  AND UPPER(TRIM(candidate_count.nome)) = ${targetName}
              ))
            OR (${targetName} = '' AND candidate.id = COALESCE(qh.categoria_id, ${tipoReference}))
          )
      )`;
}

export function categoriaCandidatosAtivosExpr(hasCategoriaEmpresaId: boolean): string {
  const tenant = hasCategoriaEmpresaId ? 'candidate_count.empresa_id = f.empresa_id' : '1 = 1';
  return `(SELECT COUNT(*)
    FROM qualificacoes_categorias candidate_count
    WHERE candidate_count.deleted_at IS NULL
      AND candidate_count.ativo = 1
      AND ${tenant}
      AND UPPER(TRIM(candidate_count.nome)) = UPPER(TRIM(COALESCE(NULLIF(qh.categoria, ''), NULLIF(qt.categoria, '')))))`;
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
