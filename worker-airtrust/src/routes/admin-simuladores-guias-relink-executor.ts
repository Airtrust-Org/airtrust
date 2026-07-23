/**
 * ========================================
 * EXECUTOR SEPARADO — RELINK DOS 51 GUIAS DE INSTRUTOR (MATRIZ AW139/S-76)
 * POST /api/admin/simuladores-matriz-import/guias/dry-run
 * POST /api/admin/simuladores-matriz-import/guias/apply
 * POST /api/admin/simuladores-matriz-import/guias/rollback
 * ========================================
 *
 * Escopo deliberadamente estreito e independente do executor da matriz
 * (admin-simuladores-matriz-executor.ts): toca somente
 * simuladores_modelos_sessao_guias, nunca modelos_sessao, manobras,
 * modelos_sessao_manobras ou modelos_sessao_versionamento. A resolução
 * guia -> modelo usa a MESMA função pura de scripts/lib/matriz-guia-resolution.mjs
 * usada pelo CLI local (relink-simuladores-guias-instrutor.mjs), via
 * scripts/lib/matriz-guia-relink-core.mjs, para que os dois nunca divirjam.
 *
 * Só aceita empresa_id=6. Desabilitado por padrão — requer
 * ENABLE_SIMULADORES_GUIA_RELINK_EXECUTOR=true e autenticação admin do
 * próprio tenant 6. A escrita do apply/rollback é um único D1 batch()
 * atômico; as invariantes terminais são garantidas por trigger (migration
 * 0442), não apenas em código de aplicação.
 */
import { Hono } from 'hono';
import type { Env } from '../types';
import { auth } from '../middleware/auth';
import { requireRole } from '../middleware/rbac';
import { getTenantContext } from '../middleware/tenant';
import {
  buildGuiaRelinkPlan,
  buildGuiaRelinkFingerprint,
  buildGuiaRelinkApplyStatements,
  buildGuiaRelinkRollbackStatements,
} from '../../scripts/lib/matriz-guia-relink-core.mjs';
import sessionContract from '../../data/simuladores-matriz/session-contract-51.json';

const ALLOWED_EMPRESA_ID = 6;

const app = new Hono<{ Bindings: Env }>();
app.use('*', auth(), requireRole('admin'));

class ExecutorError extends Error {}
function fail(message: string): never {
  throw new ExecutorError(message);
}

function requireEnabled(env: Env) {
  if (env.ENABLE_SIMULADORES_GUIA_RELINK_EXECUTOR !== 'true') {
    fail(
      'Executor de relink de guias desabilitado. Defina ENABLE_SIMULADORES_GUIA_RELINK_EXECUTOR=true apenas para a janela de execução autorizada.',
    );
  }
}

function requireTenant(empresaId: number) {
  if (empresaId !== ALLOWED_EMPRESA_ID)
    fail(`empresa_id não autorizado para este executor: ${empresaId}`);
}

async function assertMigrationPresent(db: D1Database) {
  const rows = await db
    .prepare(
      "SELECT name FROM sqlite_master WHERE type='table' AND name IN ('simuladores_matriz_guia_relink','simuladores_matriz_guia_relink_changes')",
    )
    .all<{ name: string }>();
  const names = new Set((rows.results || []).map((r) => r.name));
  if (
    !names.has('simuladores_matriz_guia_relink') ||
    !names.has('simuladores_matriz_guia_relink_changes')
  ) {
    fail('migration 0442 (guia relink) não aplicada');
  }
}

type Entry = {
  codigo_canonico: string;
  guia_id: number;
  aeronave: string;
  modelo_sessao_id_novo: number;
  vinculo_antigo_id: number | null;
  modelo_sessao_id_antigo: number | null;
  already_correct: boolean;
};

async function computePlan(db: D1Database, empresaId: number, versaoMatriz: string) {
  const guides = (
    await db
      .prepare(
        `SELECT g.id, g.codigo, g.programa, g.ciclo, g.sessao_numero, g.sessao_total,
                g.deleted_at, ma.codigo AS aeronave
         FROM simuladores_guias_instrutor g
         LEFT JOIN modelos_aeronave ma ON ma.id=g.modelo_aeronave_id
         WHERE g.empresa_id=?1 AND g.status='ATIVO' AND g.deleted_at IS NULL`,
      )
      .bind(empresaId)
      .all()
  ).results as Array<Record<string, unknown>>;
  if (guides.length !== 51) fail(`esperados 51 guias ativos; encontrados ${guides.length}`);

  const currentModels = (
    await db
      .prepare(
        `SELECT modelo_id, codigo_canonico FROM modelos_sessao_versionamento
         WHERE empresa_id=?1 AND is_current=1 AND versao_matriz=?2`,
      )
      .bind(empresaId, versaoMatriz)
      .all()
  ).results as Array<Record<string, unknown>>;

  const guiaIds = guides.map((g) => Number(g.id));
  const placeholders = guiaIds.map((_, i) => `?${i + 2}`).join(',') || 'NULL';
  const activeLinks = guiaIds.length
    ? ((
        await db
          .prepare(
            `SELECT id, guia_id, modelo_sessao_id, principal, ordem
             FROM simuladores_modelos_sessao_guias
             WHERE empresa_id=?1 AND deleted_at IS NULL AND guia_id IN (${placeholders})`,
          )
          .bind(empresaId, ...guiaIds)
          .all()
      ).results as Array<Record<string, unknown>>)
    : [];

  const { entries, byAircraft } = buildGuiaRelinkPlan({
    empresaId,
    versaoMatriz,
    contract: sessionContract,
    guides,
    currentModels,
    activeLinks,
  });
  const { fingerprint } = buildGuiaRelinkFingerprint({
    empresaId,
    versaoMatriz,
    entries: entries as Entry[],
  });
  return { entries: entries as Entry[], byAircraft, fingerprint };
}

app.post('/dry-run', async (c) => {
  try {
    requireEnabled(c.env);
    const empresaId = getTenantContext(c).empresaId;
    requireTenant(empresaId);
    const body = await c.req.json<{ versao_matriz: string }>().catch(() => ({ versao_matriz: '' }));
    const versaoMatriz = String(body.versao_matriz || '');
    if (!versaoMatriz) fail('versao_matriz obrigatória');

    const db = c.env.DB;
    await assertMigrationPresent(db);
    const { entries, byAircraft, fingerprint } = await computePlan(db, empresaId, versaoMatriz);

    return c.json({
      success: true,
      mode: 'DRY_RUN',
      hash: fingerprint,
      totals: { total: entries.length, AW139: byAircraft.AW139, 'S-76': byAircraft['S-76'] },
      guia_ids: entries.map((e) => e.guia_id).sort((a, b) => a - b),
      modelo_destino_ids: [...new Set(entries.map((e) => e.modelo_sessao_id_novo))].sort(
        (a, b) => a - b,
      ),
      vinculo_antigo_ids: entries
        .map((e) => e.vinculo_antigo_id)
        .filter((id): id is number => id != null)
        .sort((a, b) => a - b),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return c.json({ success: false, error: message }, 400);
  }
});

app.post('/apply', async (c) => {
  try {
    requireEnabled(c.env);
    const empresaId = getTenantContext(c).empresaId;
    requireTenant(empresaId);
    const body = await c.req.json<{
      import_uuid: string;
      versao_matriz: string;
      expected_hash: string;
    }>();
    const {
      import_uuid: importUuid,
      versao_matriz: versaoMatriz,
      expected_hash: expectedHash,
    } = body;
    if (!importUuid) fail('import_uuid obrigatório');
    if (!versaoMatriz) fail('versao_matriz obrigatória');
    if (!expectedHash) fail('expected_hash obrigatório (produzido pelo dry-run)');

    const db = c.env.DB;
    await assertMigrationPresent(db);

    const existing = (
      await db
        .prepare(
          'SELECT uuid,status,expected_hash FROM simuladores_matriz_guia_relink WHERE uuid=?1 AND empresa_id=?2',
        )
        .bind(importUuid, empresaId)
        .all<{ uuid: string; status: string; expected_hash: string }>()
    ).results?.[0];
    if (existing?.status === 'APPLIED' && existing.expected_hash === expectedHash) {
      return c.json({ success: true, idempotent: true, status: 'APPLIED' });
    }
    if (existing && existing.expected_hash !== expectedHash) {
      fail('import_uuid já usado com expected_hash diferente');
    }
    if (existing?.status === 'ROLLED_BACK')
      fail('import_uuid já compensado; use novo import_uuid para reapply');
    if (existing?.status === 'FAILED') fail('import_uuid em FAILED; use novo import_uuid');

    // CAS: recompute the live plan/fingerprint fresh, right before building
    // the batch, and require it to match the hash the caller obtained from a
    // prior dry-run. Anything that already drifted the live state fails
    // closed here, before any write is attempted.
    const { entries, fingerprint } = await computePlan(db, empresaId, versaoMatriz);
    if (fingerprint !== expectedHash)
      fail('estado ativo mudou desde o dry-run (CAS): refaça o dry-run');

    const statements = buildGuiaRelinkApplyStatements({
      empresaId,
      versaoMatriz,
      importUuid,
      entries,
      expectedHash,
      isNewRelink: !existing,
    });

    // A single D1 batch() is one atomic transaction: the terminal trigger on
    // migration 0442 aborts the whole batch (including every deactivation
    // and insert already queued) if any invariant fails.
    await db.batch(statements.map((sql) => db.prepare(sql)));

    console.log(
      `[SIMULADORES-GUIA-RELINK-EXECUTOR] apply APPLIED empresa=${empresaId} import_uuid=${importUuid}`,
    );
    return c.json({ success: true, mode: 'APPLY', status: 'APPLIED', hash: fingerprint });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return c.json({ success: false, error: message }, 400);
  }
});

app.post('/rollback', async (c) => {
  try {
    requireEnabled(c.env);
    const empresaId = getTenantContext(c).empresaId;
    requireTenant(empresaId);
    const body = await c.req.json<{ import_uuid: string; compensation_uuid?: string }>();
    const importUuid = body.import_uuid;
    const compensationUuid = body.compensation_uuid || `compensate-${importUuid}`;
    if (!importUuid) fail('import_uuid obrigatório');

    const db = c.env.DB;
    await assertMigrationPresent(db);

    const relink = (
      await db
        .prepare('SELECT * FROM simuladores_matriz_guia_relink WHERE uuid=?1 AND empresa_id=?2')
        .bind(importUuid, empresaId)
        .all<Record<string, unknown>>()
    ).results?.[0];
    if (!relink) fail('relink não encontrado para o tenant');
    if (relink.status === 'ROLLED_BACK' && relink.rollback_uuid) {
      return c.json({
        success: true,
        idempotent: true,
        status: 'ROLLED_BACK',
        rollback_uuid: relink.rollback_uuid,
      });
    }
    if (relink.status !== 'APPLIED') fail('somente APPLIED pode ser compensado');

    const changes = (
      await db
        .prepare(
          `SELECT guia_id, modelo_sessao_id, operacao, before_json, after_json
           FROM simuladores_matriz_guia_relink_changes
           WHERE relink_id=?1 AND operacao IN ('GUIDE_LINK_DEACTIVATE','GUIDE_LINK_INSERT')`,
        )
        .bind(Number(relink.id))
        .all<{
          guia_id: number;
          modelo_sessao_id: number | null;
          operacao: string;
          before_json: string | null;
          after_json: string | null;
        }>()
    ).results;
    if (!changes.length) fail('sem alterações para compensar');

    // Fail closed on drift: any active link for a guia this relink touched,
    // pointing at a model this relink did not insert, means something else
    // changed the state after APPLIED — refuse rather than guess.
    const insertedPairs = changes
      .filter((c) => c.operacao === 'GUIDE_LINK_INSERT' && c.after_json)
      .map(
        (c) => JSON.parse(String(c.after_json)) as { guia_id: number; modelo_sessao_id: number },
      );
    for (const pair of insertedPairs) {
      const live = (
        await db
          .prepare(
            `SELECT id FROM simuladores_modelos_sessao_guias
             WHERE empresa_id=?1 AND guia_id=?2 AND deleted_at IS NULL`,
          )
          .bind(empresaId, pair.guia_id)
          .all<{ id: number }>()
      ).results;
      if (live.length !== 1)
        fail(`drift: guia ${pair.guia_id} não tem exatamente um vínculo ativo`);
      const activeModel = (
        await db
          .prepare(`SELECT modelo_sessao_id FROM simuladores_modelos_sessao_guias WHERE id=?1`)
          .bind(live[0].id)
          .all<{ modelo_sessao_id: number }>()
      ).results?.[0]?.modelo_sessao_id;
      if (Number(activeModel) !== Number(pair.modelo_sessao_id)) {
        fail(
          `drift: vínculo posterior não pertencente ao import detectado para guia ${pair.guia_id}`,
        );
      }
    }

    const statements = buildGuiaRelinkRollbackStatements({
      empresaId,
      importUuid,
      compensationUuid,
      changes,
    });

    await db.batch(statements.map((sql) => db.prepare(sql)));

    console.log(
      `[SIMULADORES-GUIA-RELINK-EXECUTOR] rollback ROLLED_BACK empresa=${empresaId} import_uuid=${importUuid}`,
    );
    return c.json({ success: true, status: 'ROLLED_BACK', rollback_uuid: compensationUuid });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return c.json({ success: false, error: message }, 400);
  }
});

export default app;
