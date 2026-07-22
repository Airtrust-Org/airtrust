/**
 * ========================================
 * EXECUTOR CONTROLADO — IMPORTAÇÃO DA MATRIZ DE SIMULADORES AW139/S-76
 * POST /api/admin/simuladores-matriz-import/dry-run
 * POST /api/admin/simuladores-matriz-import/apply
 * POST /api/admin/simuladores-matriz-import/rollback
 * ========================================
 *
 * Contraparte, tenant-scoped e reversível, do aplicador local em
 * worker-airtrust/scripts/apply-simuladores-matriz-import.mjs — usa as MESMAS
 * funções puras de validação e geração de SQL (scripts/lib/matriz-apply-core.mjs
 * e afins), de modo que os dois nunca possam divergir silenciosamente.
 *
 * Escopo deliberadamente estreito: só aceita empresa_id=6 (o único tenant desta
 * importação) — isto não é um executor de migração genérico.
 *
 * Desabilitado por padrão. Requer ENABLE_SIMULADORES_MATRIZ_EXECUTOR=true,
 * autenticação admin do próprio tenant 6, e todas as validações do plano
 * (schema, 61 hashes, 301 resoluções, 51/918/22, fingerprint, migrations
 * 0440/0441) antes de qualquer escrita. A escrita é um único D1 batch()
 * atômico. Nunca habilitar em produção sem autorização explícita e revisada
 * para essa execução específica.
 */
import { Hono } from 'hono';
import type { Env } from '../types';
import { auth } from '../middleware/auth';
import { requireRole } from '../middleware/rbac';
import { getTenantContext } from '../middleware/tenant';
import {
  assertPlanIntegrity,
  EXPECTED_SOURCE_HASH_COUNT,
} from '../../scripts/lib/matriz-import-plan.mjs';
import { validateManoeuvreResolution } from '../../scripts/lib/matriz-manobra-resolution.mjs';
import { buildTenantFingerprint } from '../../scripts/lib/matriz-base-fingerprint.mjs';
import {
  REUSE_RESOLUTION_TYPES,
  buildResolutionStatements,
  buildModelAndLinkStatements,
} from '../../scripts/lib/matriz-apply-core.mjs';

// The only tenant this executor is authorized to touch. Not configurable:
// a different value here would turn a one-off, reviewed migration tool into
// a generic cross-tenant write endpoint.
const ALLOWED_EMPRESA_ID = 6;

const app = new Hono<{ Bindings: Env }>();
app.use('*', auth(), requireRole('admin'));

class ExecutorError extends Error {}
function fail(message: string): never {
  throw new ExecutorError(message);
}

function requireEnabled(env: Env) {
  if (env.ENABLE_SIMULADORES_MATRIZ_EXECUTOR !== 'true') {
    fail(
      'Executor desabilitado. Defina ENABLE_SIMULADORES_MATRIZ_EXECUTOR=true apenas para a janela de execução autorizada.',
    );
  }
}

async function assertMigrationsPresent(db: D1Database) {
  const rows = await db
    .prepare(
      "SELECT name FROM sqlite_master WHERE type='table' AND name IN ('modelos_sessao_versionamento','simuladores_matriz_manobra_resolution')",
    )
    .all<{ name: string }>();
  const names = new Set((rows.results || []).map((r) => r.name));
  if (!names.has('modelos_sessao_versionamento')) fail('migration 0440 não aplicada');
  if (!names.has('simuladores_matriz_manobra_resolution')) fail('migration 0441 não aplicada');
}

async function loadFingerprintD1(db: D1Database, empresaId: number) {
  const currentVersions = (
    await db
      .prepare(
        `SELECT modelo_id, codigo_canonico, versao_numero, versao_matriz, is_current
         FROM modelos_sessao_versionamento WHERE empresa_id=?1 AND is_current=1 ORDER BY codigo_canonico`,
      )
      .bind(empresaId)
      .all()
  ).results as unknown[];
  const manobras = (
    await db
      .prepare(`SELECT id, codigo, empresa_id FROM manobras WHERE empresa_id=?1 AND deleted_at IS NULL`)
      .bind(empresaId)
      .all()
  ).results as unknown[];
  const links = (
    await db
      .prepare(
        `SELECT msm.id, msm.modelo_id, msm.manobra_id, msm.ordem, msm.deleted_at
         FROM modelos_sessao_manobras msm
         JOIN modelos_sessao ms ON ms.id = msm.modelo_id
         WHERE ms.empresa_id=?1`,
      )
      .bind(empresaId)
      .all()
  ).results as unknown[];
  const versionamentoCount = (
    await db
      .prepare(`SELECT COUNT(*) AS c FROM modelos_sessao_versionamento WHERE empresa_id=?1`)
      .bind(empresaId)
      .all<{ c: number }>()
  ).results?.[0]?.c;
  return buildTenantFingerprint({
    empresaId,
    currentVersions,
    resolvedManoeuvres: manobras,
    links,
    migrationState: { has_0440: true, versionamento_count: Number(versionamentoCount || 0) },
  });
}

type ManobraResolutionEntry = {
  codigo_canonico: string;
  resolution_type: string;
  existing_manobra_id: number | null;
  create_payload: Record<string, unknown> | null;
  source_hash: string;
};
type MatrizPlan = {
  empresa_id: number;
  versao_matriz?: string;
  schema_version?: number;
  plan_sha256: string;
  source_hashes: Record<string, string>;
  base_fingerprint?: string | null;
  totals: { modelos: number; vinculos: number; loft: number };
  matrices: { AW139: { models: unknown[]; items: unknown[] }; SK76: { models: unknown[]; items: unknown[] } };
  manobra_resolution: ManobraResolutionEntry[];
};

async function validatePlanAgainstLiveState(db: D1Database, plan: MatrizPlan, empresaId: number) {
  if (Number(plan.empresa_id) !== empresaId) fail('tenant do plano diverge');
  if (empresaId !== ALLOWED_EMPRESA_ID) fail(`empresa_id não autorizado para este executor: ${empresaId}`);

  const tenant = await db.prepare('SELECT id FROM empresas WHERE id=?1').bind(empresaId).all();
  if (!tenant.results?.length) fail('tenant inválido');

  assertPlanIntegrity(plan, { sourceHashes: plan.source_hashes, baseFingerprint: plan.base_fingerprint ?? undefined });
  if (Object.keys(plan.source_hashes || {}).length !== EXPECTED_SOURCE_HASH_COUNT) fail('61 hashes');
  if (plan.totals?.modelos !== 51 || plan.totals?.vinculos !== 918 || plan.totals?.loft !== 22) fail('51/918/22');

  const models = [...(plan.matrices?.AW139?.models || []), ...(plan.matrices?.SK76?.models || [])];
  const items = [...(plan.matrices?.AW139?.items || []), ...(plan.matrices?.SK76?.items || [])];
  if (models.length !== 51 || items.length !== 918) fail('contagens do plano');
  const requestedCodes = [...new Set(items.map((item: any) => String(item.codigo || '')))];
  validateManoeuvreResolution(plan.manobra_resolution, { requestedCodes });

  for (const entry of plan.manobra_resolution) {
    if (!REUSE_RESOLUTION_TYPES.has(entry.resolution_type)) continue;
    const owned = await db
      .prepare('SELECT id FROM manobras WHERE id=?1 AND empresa_id=?2 AND deleted_at IS NULL')
      .bind(Number(entry.existing_manobra_id), empresaId)
      .all();
    if (!owned.results?.length) {
      fail(`${entry.codigo_canonico}: manobra_id ${entry.existing_manobra_id} não pertence ao tenant ou está inativa`);
    }
  }

  const fingerprint = await loadFingerprintD1(db, empresaId);
  if (plan.base_fingerprint && plan.base_fingerprint !== fingerprint.fingerprint) fail('fingerprint divergente');

  return { models, items, fingerprint };
}

async function gatherLookups(db: D1Database, empresaId: number, versaoMatriz: string) {
  const existingResolutionRows = (
    await db
      .prepare(
        `SELECT codigo_canonico, manobra_id, resolution_type, source_hash FROM simuladores_matriz_manobra_resolution
         WHERE empresa_id=?1 AND versao_matriz=?2`,
      )
      .bind(empresaId, versaoMatriz)
      .all()
  ).results as any[];
  const existingResolutionByCode = new Map(existingResolutionRows.map((r) => [r.codigo_canonico, r]));

  const manobraRows = (
    await db
      .prepare('SELECT id, codigo, empresa_id, nome, categoria, tipo_aeronave, descricao FROM manobras WHERE empresa_id=?1')
      .bind(empresaId)
      .all()
  ).results as any[];
  const manobraById = new Map(manobraRows.map((r) => [Number(r.id), r]));

  const versionamentoRows = (
    await db
      .prepare('SELECT codigo_canonico, modelo_id, versao_numero FROM modelos_sessao_versionamento WHERE empresa_id=?1')
      .bind(empresaId)
      .all()
  ).results as any[];
  const maxVersionByCode = new Map<string, any>();
  for (const row of versionamentoRows) {
    const current = maxVersionByCode.get(row.codigo_canonico);
    if (!current || Number(row.versao_numero) > Number(current.versao_numero)) {
      maxVersionByCode.set(row.codigo_canonico, row);
    }
  }

  return { existingResolutionByCode, manobraById, maxVersionByCode };
}

app.post('/dry-run', async (c) => {
  try {
    requireEnabled(c.env);
    const empresaId = getTenantContext(c).empresaId;
    const body = await c.req.json<{ plan: MatrizPlan; import_uuid: string }>();
    const { plan, import_uuid: importUuid } = body;
    if (!importUuid) fail('import_uuid obrigatório');

    const db = c.env.DB;
    await assertMigrationsPresent(db);
    const before = await validatePlanAgainstLiveState(db, plan, empresaId);
    const after = await loadFingerprintD1(db, empresaId);
    if (before.fingerprint.fingerprint !== after.fingerprint) fail('versão corrente alterada durante a validação');

    return c.json({ success: true, mode: 'DRY_RUN', fingerprint: after.fingerprint });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return c.json({ success: false, error: message }, 400);
  }
});

app.post('/apply', async (c) => {
  try {
    requireEnabled(c.env);
    const empresaId = getTenantContext(c).empresaId;
    const body = await c.req.json<{ plan: MatrizPlan; import_uuid: string }>();
    const { plan, import_uuid: importUuid } = body;
    if (!importUuid) fail('import_uuid obrigatório');

    const db = c.env.DB;
    await assertMigrationsPresent(db);

    const existingImport = (
      await db
        .prepare('SELECT uuid,status,plan_sha256 FROM simuladores_matriz_imports WHERE uuid=?1')
        .bind(importUuid)
        .all<{ uuid: string; status: string; plan_sha256: string }>()
    ).results?.[0];
    if (existingImport?.status === 'APPLIED' && existingImport.plan_sha256 === plan.plan_sha256) {
      return c.json({ success: true, idempotent: true, status: 'APPLIED' });
    }
    if (existingImport && existingImport.plan_sha256 !== plan.plan_sha256) {
      fail('UUID de importação já usado com plan_sha256 diferente');
    }
    if (existingImport?.status === 'ROLLED_BACK') fail('UUID já compensado; use novo import_uuid para reapply');
    if (existingImport?.status === 'FAILED') fail('UUID em FAILED; use novo import_uuid');

    const { models, items, fingerprint } = await validatePlanAgainstLiveState(db, plan, empresaId);

    const liveFingerprint = await loadFingerprintD1(db, empresaId);
    if (liveFingerprint.fingerprint !== fingerprint.fingerprint) fail('fingerprint mudou antes do apply');

    const versaoMatriz = String(plan.versao_matriz || 'M2026.07');
    const { existingResolutionByCode, manobraById, maxVersionByCode } = await gatherLookups(db, empresaId, versaoMatriz);

    const statements: string[] = [];
    if (existingImport) {
      statements.push(
        `UPDATE simuladores_matriz_imports SET status='APPLYING', failure_reason=NULL WHERE uuid='${importUuid.replace(/'/g, "''")}' AND status IN ('DRY_RUN','APPLYING');`,
      );
    } else {
      statements.push(`INSERT INTO simuladores_matriz_imports(
          uuid,empresa_id,versao_matriz,schema_version,status,plan_sha256,source_hashes_json,base_fingerprint,expected_counts_json
        ) VALUES (
          '${importUuid.replace(/'/g, "''")}',${empresaId},'${versaoMatriz.replace(/'/g, "''")}',
          ${Number(plan.schema_version || 4)},'DRY_RUN','${plan.plan_sha256}',
          '${JSON.stringify(plan.source_hashes).replace(/'/g, "''")}',
          '${fingerprint.fingerprint}',
          '${JSON.stringify(plan.totals).replace(/'/g, "''")}'
        );`);
      statements.push(
        `UPDATE simuladores_matriz_imports SET status='APPLYING' WHERE uuid='${importUuid.replace(/'/g, "''")}';`,
      );
    }

    statements.push(
      ...buildResolutionStatements({
        plan,
        empresaId,
        versaoMatriz,
        importUuid,
        fail,
        existingResolutionByCode,
        manobraById,
      }),
    );
    statements.push(
      ...buildModelAndLinkStatements({
        plan,
        empresaId,
        versaoMatriz,
        importUuid,
        fail,
        models,
        items,
        maxVersionByCode,
      }),
    );

    // A single D1 batch() is one atomic transaction: either every statement
    // commits, or none do — no manual BEGIN/COMMIT needed or supported here.
    await db.batch(statements.map((sql) => db.prepare(sql)));

    const currents = await db
      .prepare(
        'SELECT codigo_canonico, COUNT(*) AS c FROM modelos_sessao_versionamento WHERE empresa_id=?1 AND is_current=1 GROUP BY codigo_canonico HAVING c<>1',
      )
      .bind(empresaId)
      .all();
    if (currents.results?.length) fail('mais de uma versão corrente detectada');

    const requestedCodeCount = new Set(items.map((item: any) => String(item.codigo || ''))).size;
    const resolutionCount = (
      await db
        .prepare('SELECT COUNT(*) AS c FROM simuladores_matriz_manobra_resolution WHERE empresa_id=?1 AND versao_matriz=?2')
        .bind(empresaId, versaoMatriz)
        .all<{ c: number }>()
    ).results?.[0]?.c;
    if (Number(resolutionCount) !== requestedCodeCount) {
      fail(`resolução de manobras incompleta: esperadas ${requestedCodeCount}; encontradas ${resolutionCount}`);
    }
    const crossTenant = await db
      .prepare(
        `SELECT r.codigo_canonico FROM simuladores_matriz_manobra_resolution r
         JOIN manobras m ON m.id = r.manobra_id
         WHERE r.empresa_id=?1 AND r.versao_matriz=?2 AND m.empresa_id<>?1`,
      )
      .bind(empresaId, versaoMatriz)
      .all();
    if (crossTenant.results?.length) fail('manobra de outro tenant referenciada na resolução');

    console.log(`[SIMULADORES-MATRIZ-EXECUTOR] apply APPLIED empresa=${empresaId} import_uuid=${importUuid}`);
    return c.json({ success: true, mode: 'APPLY', status: 'APPLIED', fingerprint: fingerprint.fingerprint });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return c.json({ success: false, error: message }, 400);
  }
});

app.post('/rollback', async (c) => {
  try {
    requireEnabled(c.env);
    const empresaId = getTenantContext(c).empresaId;
    if (empresaId !== ALLOWED_EMPRESA_ID) fail(`empresa_id não autorizado para este executor: ${empresaId}`);
    const body = await c.req.json<{ import_uuid: string; compensation_uuid?: string }>();
    const importUuid = body.import_uuid;
    const compensationUuid = body.compensation_uuid || `compensate-${importUuid}`;
    if (!importUuid) fail('import_uuid obrigatório');

    const db = c.env.DB;
    const imp = (
      await db
        .prepare('SELECT * FROM simuladores_matriz_imports WHERE uuid=?1 AND empresa_id=?2')
        .bind(importUuid, empresaId)
        .all<Record<string, unknown>>()
    ).results?.[0];
    if (!imp) fail('importação não encontrada para o tenant');
    if (imp.status === 'ROLLED_BACK' && imp.rollback_uuid) {
      return c.json({ success: true, idempotent: true, status: 'ROLLED_BACK', rollback_uuid: imp.rollback_uuid });
    }
    if (imp.status !== 'APPLIED') fail('somente APPLIED pode ser compensado');

    const changes = (
      await db
        .prepare(
          "SELECT * FROM simuladores_matriz_import_changes WHERE import_id=?1 AND operacao='INSERT' AND entidade='modelos_sessao'",
        )
        .bind(Number(imp.id))
        .all<Record<string, unknown>>()
    ).results as Record<string, unknown>[];
    if (!changes.length) fail('sem mudanças INSERT para compensar');

    const importedIds = changes.map((row) => Number(row.entity_id)).filter(Boolean);
    const importedIdsSql = importedIds.join(',') || '-1';
    const later = await db
      .prepare(
        `SELECT v.modelo_id FROM modelos_sessao_versionamento v
         WHERE v.empresa_id=?1 AND v.is_current=1 AND v.modelo_id NOT IN (${importedIdsSql})
           AND v.codigo_canonico IN (SELECT codigo_canonico FROM modelos_sessao_versionamento WHERE modelo_id IN (${importedIdsSql}))
           AND v.versao_matriz NOT LIKE 'COMPENSATE%' AND v.versao_matriz <> 'LEGACY'`,
      )
      .bind(empresaId)
      .all();
    if (later.results?.length) fail('drift: versão corrente posterior detectada');

    const statements: string[] = [];
    for (const change of changes) {
      const importedId = Number(change.entity_id);
      const version = (
        await db
          .prepare('SELECT * FROM modelos_sessao_versionamento WHERE modelo_id=?1 AND empresa_id=?2')
          .bind(importedId, empresaId)
          .all<Record<string, unknown>>()
      ).results?.[0];
      if (!version) continue;

      if (!version.modelo_anterior_id) {
        if (Number(version.is_current) === 0) continue;
        statements.push(
          `UPDATE modelos_sessao_versionamento SET is_current=0, efetivo_ate=CURRENT_TIMESTAMP WHERE modelo_id=${importedId} AND empresa_id=${empresaId} AND is_current=1;`,
        );
        statements.push(
          `INSERT INTO simuladores_matriz_import_changes(import_id,entidade,entity_id,operacao,after_json)
           VALUES(${Number(imp.id)}, 'modelos_sessao_versionamento', ${importedId}, 'COMPENSATE',
                  json_object('deactivated_no_predecessor', json('true'), 'codigo_canonico', '${String(version.codigo_canonico).replace(/'/g, "''")}'));`,
        );
        continue;
      }

      const previous = (
        await db
          .prepare('SELECT * FROM modelos_sessao_versionamento WHERE modelo_id=?1 AND empresa_id=?2')
          .bind(Number(version.modelo_anterior_id), empresaId)
          .all<Record<string, unknown>>()
      ).results?.[0];
      if (!previous) fail(`predecessor ausente para modelo ${importedId}`);

      const existingCompensation = await db
        .prepare(
          `SELECT modelo_id FROM modelos_sessao_versionamento
           WHERE empresa_id=?1 AND codigo_canonico=?2 AND modelo_anterior_id=?3 AND versao_matriz LIKE 'COMPENSATE%' LIMIT 1`,
        )
        .bind(empresaId, String(version.codigo_canonico), importedId)
        .all();
      if (existingCompensation.results?.length) continue;

      const nextVersao = Number(version.versao_numero) + 1;
      const codigoFisico = `${version.codigo_canonico}@COMPENSATE-V${nextVersao}`.replace(/'/g, "''");
      const codigoCanonicoEscaped = String(version.codigo_canonico).replace(/'/g, "''");
      statements.push(`INSERT INTO modelos_sessao(codigo,nome,empresa_id,tipo,created_at,updated_at)
        SELECT '${codigoFisico}', ms.nome, ms.empresa_id, ms.tipo, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
        FROM modelos_sessao ms WHERE ms.id=${Number(previous.modelo_id)};`);
      statements.push(`INSERT INTO modelos_sessao_manobras(modelo_id,manobra_id,ordem,obrigatoria,tripulante,observacoes,created_at,updated_at)
        SELECT (SELECT id FROM modelos_sessao WHERE codigo='${codigoFisico}' AND empresa_id=${empresaId}),
               manobra_id, ordem, obrigatoria, tripulante, observacoes, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
        FROM modelos_sessao_manobras WHERE modelo_id=${Number(previous.modelo_id)} AND deleted_at IS NULL;`);
      statements.push(`INSERT INTO modelos_sessao_manobras_contexto(modelo_manobra_id,empresa_id,metadados_json)
        SELECT msm_new.id, ${empresaId}, COALESCE(ctx.metadados_json, json_object('source','compensate'))
        FROM modelos_sessao_manobras msm_new
        JOIN modelos_sessao ms_new ON ms_new.id = msm_new.modelo_id AND ms_new.codigo='${codigoFisico}'
        LEFT JOIN modelos_sessao_manobras msm_old
          ON msm_old.modelo_id=${Number(previous.modelo_id)} AND msm_old.ordem = msm_new.ordem AND msm_old.deleted_at IS NULL
        LEFT JOIN modelos_sessao_manobras_contexto ctx ON ctx.modelo_manobra_id = msm_old.id;`);
      statements.push(`UPDATE modelos_sessao_versionamento SET is_current=0, efetivo_ate=CURRENT_TIMESTAMP
        WHERE modelo_id=${importedId} AND empresa_id=${empresaId};`);
      statements.push(`INSERT INTO modelos_sessao_versionamento(
          modelo_id,empresa_id,codigo_canonico,versao_numero,versao_matriz,is_current,modelo_anterior_id,efetivo_em,efetivo_ate
        )
        SELECT id, ${empresaId}, '${codigoCanonicoEscaped}', ${nextVersao}, 'COMPENSATE-${importUuid.replace(/'/g, "''")}', 1, ${importedId}, CURRENT_TIMESTAMP, NULL
        FROM modelos_sessao WHERE codigo='${codigoFisico}' AND empresa_id=${empresaId};`);
      statements.push(`INSERT INTO simuladores_matriz_import_changes(import_id,entidade,entity_id,operacao,after_json)
        SELECT ${Number(imp.id)}, 'modelos_sessao', id, 'COMPENSATE',
               json_object('restores', ${Number(previous.modelo_id)}, 'from', ${importedId})
        FROM modelos_sessao WHERE codigo='${codigoFisico}' AND empresa_id=${empresaId};`);
    }

    statements.push(
      `UPDATE simuladores_matriz_imports SET status='ROLLED_BACK', rolled_back_at=CURRENT_TIMESTAMP, rollback_uuid='${compensationUuid.replace(/'/g, "''")}' WHERE uuid='${importUuid.replace(/'/g, "''")}' AND empresa_id=${empresaId};`,
    );

    if (statements.length) {
      await db.batch(statements.map((sql) => db.prepare(sql)));
    }

    console.log(`[SIMULADORES-MATRIZ-EXECUTOR] rollback ROLLED_BACK empresa=${empresaId} import_uuid=${importUuid}`);
    return c.json({ success: true, status: 'ROLLED_BACK', rollback_uuid: compensationUuid });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return c.json({ success: false, error: message }, 400);
  }
});

export default app;
