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
import { recordLegacyAndCanonicalAudit } from '../lib/audit/record-legacy-and-canonical-audit';
import {
  buildAuditMetadata,
  buildLegacyAuditPayload,
  buildLegacyAuditoriaActor,
} from '../lib/audit/context';

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
  const payload =
    typeof body === 'object' && body !== null ? (body as Record<string, unknown>) : {};
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

// Exported so horas-voo-simulador-schema.test.ts's sibling for this endpoint
// (deduplicate-schema.test.ts) can run the literal query against a real sqlite3
// process instead of a string-matching D1 mock.
export const DEDUPLICATE_GROUP_QUERY_SQL = `
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
    `;

export const DEDUPLICATE_RECORDS_QUERY_SQL = `
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
    `;

export function buildDeduplicateSoftDeleteSql(idCount: number): string {
  const placeholders = Array.from({ length: idCount }, () => '?').join(', ');
  return `
      UPDATE qualificacoes_historico
      SET
        deleted_at = datetime('now'),
        updated_at = datetime('now')
      WHERE empresa_id = ?
        AND deleted_at IS NULL
        AND id IN (${placeholders})
    `;
}

async function listDuplicateGroups(
  db: D1Database,
  empresaId: number,
): Promise<DeduplicateGroupRow[]> {
  const { results } = await db
    .prepare(DEDUPLICATE_GROUP_QUERY_SQL)
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
    .prepare(DEDUPLICATE_RECORDS_QUERY_SQL)
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

// D1 counts every statement in a batch against the Worker invocation query budget
// (see simuladores-fichas.ts MANOBRAS_PER_UPDATE for the same constraint). A dedupe
// pass can touch far more rows than a single ficha, so removal is consolidated into
// `id IN (...)` chunks and run through db.batch — one all-or-nothing transaction
// instead of one UPDATE per row, so a mid-run failure can't leave half the
// duplicates removed and half still active.
const DEDUPLICATE_IDS_PER_STATEMENT = 200;

async function softDeleteManyByEmpresa(
  db: D1Database,
  ids: number[],
  empresaId: number,
): Promise<number> {
  if (ids.length === 0) return 0;

  const statements: D1PreparedStatement[] = [];
  for (let offset = 0; offset < ids.length; offset += DEDUPLICATE_IDS_PER_STATEMENT) {
    const chunk = ids.slice(offset, offset + DEDUPLICATE_IDS_PER_STATEMENT);
    statements.push(
      db.prepare(buildDeduplicateSoftDeleteSql(chunk.length)).bind(empresaId, ...chunk),
    );
  }

  const results = await db.batch(statements);
  return results.reduce(
    (sum, result) => sum + Number((result.meta as { changes?: number } | undefined)?.changes || 0),
    0,
  );
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
      const idsToRemove = candidateGroups.flatMap((group) => group.remover_ids);
      totalRemoved = await softDeleteManyByEmpresa(db, idsToRemove, empresaId);

      if (totalRemoved > 0) {
        const actorUserId = Number((c.get('userId' as never) as unknown) || 0) || null;
        const actorRoleRaw = c.get('userRole' as never) as unknown;
        const actorRole = typeof actorRoleRaw === 'string' ? actorRoleRaw : null;
        const auditMetadata = buildAuditMetadata(c, {
          operation: 'QUALIFICACOES_HISTORICO_DEDUPLICATE',
          total_grupos: totalCandidates,
          total_removidos: totalRemoved,
        });

        await recordLegacyAndCanonicalAudit({
          db,
          legacyAuditoria: {
            tabela: 'qualificacoes_historico',
            acao: 'BULK_UPDATE',
            registro_id: empresaId,
            dados_novos: buildLegacyAuditPayload(c, { ids_removidos: idsToRemove }, auditMetadata),
            ...buildLegacyAuditoriaActor(c),
          },
          canonicalEvent: {
            empresaId,
            targetEmpresaId: empresaId,
            actorUserId,
            actorEmpresaId: empresaId,
            actorRole,
            eventCategory: 'ADMIN_OPERATION',
            eventAction: 'QUALIFICACOES_HISTORICO_DEDUPLICATE',
            entityType: 'qualificacoes_historico',
            entityId: empresaId,
            riskLevel: 'high',
            metadata: auditMetadata,
            retentionClass: 'SECURITY_LONG',
          },
        });
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
        details: 'Detalhes internos omitidos',
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
        details: 'Detalhes internos omitidos',
      },
      500,
    );
  }
});

export default app;
