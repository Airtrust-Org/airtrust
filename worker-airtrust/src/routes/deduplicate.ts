/**
 * ========================================
 * ENDPOINT: DEDUPLICATE HISTÓRICO
 * POST /api/qualificacoes-historico/deduplicate
 * ========================================
 * Remove duplicatas mantendo o registro mais recente
 */

import { Hono } from 'hono';
import type { Context } from 'hono';
import type { Env } from '../types';
import { auth } from '../middleware/auth';
import { requireRole } from '../middleware/rbac';
import { getEmpresaIdSafe } from './escalas-shared';
import { AppError } from '../utils/errors';

const app = new Hono<{ Bindings: Env }>();
app.use('*', auth(), requireRole('admin'));

type DeduplicateGroupRow = {
  funcionario_cpf: string | null;
  qualificacao_codigo: string | null;
  data_vencimento: string | null;
  total: number;
};

type DeduplicateRecordRow = {
  id: number;
  data_conclusao: string | null;
  created_at: string | null;
};

type DeduplicateCandidateGroup = {
  funcionario_cpf: string | null;
  qualificacao_codigo: string | null;
  data_vencimento: string | null;
  total: number;
  manter_id: number;
  remover_ids: number[];
};

function toBooleanFlag(value: unknown): boolean | undefined {
  if (typeof value === 'boolean') return value;
  if (typeof value === 'number') return value !== 0;
  if (typeof value !== 'string') return undefined;
  const normalized = value.trim().toLowerCase();
  if (['true', '1', 'yes', 'y', 'on'].includes(normalized)) return true;
  if (['false', '0', 'no', 'n', 'off'].includes(normalized)) return false;
  return undefined;
}

function resolveApplyMode(c: Context, body: unknown): boolean {
  const payload = typeof body === 'object' && body !== null ? (body as Record<string, unknown>) : {};
  const queryApply = toBooleanFlag(c.req.query('apply'));
  const queryDryRun = toBooleanFlag(c.req.query('dryRun') ?? c.req.query('dry_run'));
  const bodyApply = toBooleanFlag(payload.apply);
  const bodyDryRun = toBooleanFlag(payload.dryRun ?? payload.dry_run);

  if (queryApply === true || bodyApply === true) return true;
  if (queryDryRun === false || bodyDryRun === false) return true;
  return false;
}

function resolveEmpresaIdOrThrow(c: Context): number {
  const empresaId = Number(getEmpresaIdSafe(c));
  if (!Number.isFinite(empresaId) || empresaId <= 0) {
    throw new AppError('empresa_id inválido para deduplicate', 400, 'EMPRESA_ID_REQUIRED');
  }
  return empresaId;
}

async function listDuplicateGroups(
  db: D1Database,
  empresaId: number,
): Promise<DeduplicateGroupRow[]> {
  const { results } = await db
    .prepare(
      `
      SELECT
        funcionario_cpf,
        qualificacao_codigo,
        data_vencimento,
        COUNT(*) as total
      FROM qualificacoes_historico
      WHERE deleted_at IS NULL
        AND empresa_id = ?
      GROUP BY funcionario_cpf, qualificacao_codigo, data_vencimento
      HAVING COUNT(*) > 1
      ORDER BY funcionario_cpf, qualificacao_codigo
    `,
    )
    .bind(empresaId)
    .all<DeduplicateGroupRow>();

  return (results || []).map((row) => ({
    funcionario_cpf: row.funcionario_cpf ?? null,
    qualificacao_codigo: row.qualificacao_codigo ?? null,
    data_vencimento: row.data_vencimento ?? null,
    total: Number(row.total || 0),
  }));
}

async function listGroupRecords(
  db: D1Database,
  empresaId: number,
  group: DeduplicateGroupRow,
): Promise<DeduplicateRecordRow[]> {
  const { results } = await db
    .prepare(
      `
      SELECT id, data_conclusao, created_at
      FROM qualificacoes_historico
      WHERE empresa_id = ?
        AND funcionario_cpf = ?
        AND qualificacao_codigo = ?
        AND (
          data_vencimento = ?
          OR (data_vencimento IS NULL AND ? IS NULL)
        )
        AND deleted_at IS NULL
      ORDER BY
        data_conclusao DESC NULLS LAST,
        created_at DESC,
        id DESC
    `,
    )
    .bind(
      empresaId,
      group.funcionario_cpf,
      group.qualificacao_codigo,
      group.data_vencimento,
      group.data_vencimento,
    )
    .all<DeduplicateRecordRow>();

  return (results || []).map((row) => ({
    id: Number(row.id),
    data_conclusao: row.data_conclusao ?? null,
    created_at: row.created_at ?? null,
  }));
}

async function buildDeduplicateCandidates(
  db: D1Database,
  empresaId: number,
): Promise<DeduplicateCandidateGroup[]> {
  const duplicateGroups = await listDuplicateGroups(db, empresaId);
  const candidates: DeduplicateCandidateGroup[] = [];

  for (const group of duplicateGroups) {
    const records = await listGroupRecords(db, empresaId, group);
    if (records.length <= 1) continue;

    const keepId = Number(records[0]?.id);
    const removeIds = records
      .slice(1)
      .map((record) => Number(record.id))
      .filter((id) => Number.isFinite(id) && id > 0);

    if (!Number.isFinite(keepId) || keepId <= 0 || removeIds.length === 0) continue;

    candidates.push({
      funcionario_cpf: group.funcionario_cpf,
      qualificacao_codigo: group.qualificacao_codigo,
      data_vencimento: group.data_vencimento,
      total: group.total,
      manter_id: keepId,
      remover_ids: removeIds,
    });
  }

  return candidates;
}

async function softDeleteByIdAndEmpresa(
  db: D1Database,
  id: number,
  empresaId: number,
): Promise<number> {
  const result = await db
    .prepare(
      `
      UPDATE qualificacoes_historico
      SET
        deleted_at = datetime('now'),
        updated_at = datetime('now')
      WHERE id = ?
        AND empresa_id = ?
        AND deleted_at IS NULL
    `,
    )
    .bind(id, empresaId)
    .run();

  return Number((result.meta as { changes?: number } | undefined)?.changes || 0);
}

/**
 * POST /deduplicate
 * Dry-run por padrão.
 * Apply só quando explicitamente solicitado.
 */
app.post('/', async (c) => {
  try {
    const db = c.env.DB;
    const empresaId = resolveEmpresaIdOrThrow(c);
    const startTime = Date.now();
    const body = await c.req.json().catch(() => ({}));
    const applyRequested = resolveApplyMode(c, body);
    const mode = applyRequested ? 'apply' : 'dry_run';

    const candidateGroups = await buildDeduplicateCandidates(db, empresaId);
    const totalCandidates = candidateGroups.length;
    const totalWouldRemove = candidateGroups.reduce(
      (sum, group) => sum + group.remover_ids.length,
      0,
    );
    let totalRemoved = 0;

    if (applyRequested) {
      for (const group of candidateGroups) {
        for (const id of group.remover_ids) {
          totalRemoved += await softDeleteByIdAndEmpresa(db, id, empresaId);
        }
      }
    }

    return c.json({
      success: true,
      message:
        mode === 'apply'
          ? 'Deduplicate aplicado com escopo de tenant'
          : 'Dry-run executado; nenhuma mutação realizada',
      data: {
        mode,
        empresa_id: empresaId,
        total_grupos_candidatos: totalCandidates,
        total_registros_a_remover: totalWouldRemove,
        total_registros_removidos: totalRemoved,
        grupos: candidateGroups,
        execution_time_ms: Date.now() - startTime,
      },
    });
  } catch (error) {
    console.error('[DEDUPLICATE] Erro:', error);

    if (error instanceof AppError) {
      return c.json(
        {
          success: false,
          error: error.message,
          code: error.code,
        },
        error.status as 400 | 403 | 404 | 500,
      );
    }

    return c.json(
      {
        success: false,
        error: 'Erro ao remover duplicatas',
        details: error instanceof Error ? error.message : 'Erro desconhecido',
      },
      500,
    );
  }
});

/**
 * GET /deduplicate/preview
 * Sempre dry-run.
 */
app.get('/preview', async (c) => {
  try {
    const db = c.env.DB;
    const empresaId = resolveEmpresaIdOrThrow(c);
    const candidateGroups = await buildDeduplicateCandidates(db, empresaId);
    const totalWouldRemove = candidateGroups.reduce(
      (sum, group) => sum + group.remover_ids.length,
      0,
    );

    return c.json({
      success: true,
      data: {
        mode: 'dry_run',
        empresa_id: empresaId,
        total_grupos_duplicados: candidateGroups.length,
        total_registros_a_remover: totalWouldRemove,
        grupos: candidateGroups,
      },
    });
  } catch (error) {
    if (error instanceof AppError) {
      return c.json(
        {
          success: false,
          error: error.message,
          code: error.code,
        },
        error.status as 400 | 403 | 404 | 500,
      );
    }
    console.error('[DEDUPLICATE] Erro ao buscar preview:', error);
    return c.json(
      {
        success: false,
        error: 'Erro ao buscar preview de duplicatas',
        details: error instanceof Error ? error.message : 'Erro desconhecido',
      },
      500,
    );
  }
});

export default app;
