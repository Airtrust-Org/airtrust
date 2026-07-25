/**
 * ========================================
 * EXECUTOR CONTROLADO — REMEDIAÇÃO COMPENSATÓRIA DAS 5 RESOLUÇÕES
 * LEGACY_EQUIVALENT DA MATRIZ DE SIMULADORES AW139/S-76
 * POST /api/admin/simuladores-matriz-remediation/dry-run
 * POST /api/admin/simuladores-matriz-remediation/apply
 * POST /api/admin/simuladores-matriz-remediation/rollback
 * GET  /api/admin/simuladores-matriz-remediation/status/:uuid
 * ========================================
 *
 * Compensa, via COMPENSATE (nunca UPDATE), as resoluções que o import
 * original classificou como TRUE_MISSING/COLLISION/CROSS_TENANT_ONLY quando
 * na verdade uma manobra legada equivalente já existia. A resolução original
 * em simuladores_matriz_manobra_resolution é imutável por trigger
 * (trg_matriz_manobra_resolution_imutavel, migration 0441) — esta remediação
 * nunca a edita; a correção efetiva vive num overlay append-only
 * (simuladores_matriz_resolution_corrections, migration 0443).
 *
 * Usa as MESMAS funções puras de descoberta e geração de SQL usadas pelo
 * aplicador/rollback local (scripts/lib/matriz-remediation-core.mjs) para que
 * os dois nunca possam divergir silenciosamente.
 *
 * Escopo deliberadamente estreito: só aceita empresa_id=6. Desabilitado por
 * padrão — requer ENABLE_SIMULADORES_MATRIZ_REMEDIATION_EXECUTOR=true,
 * autenticação admin do próprio tenant 6, e todas as validações do plano
 * antes de qualquer escrita. A escrita é um único D1 batch() atômico. Nunca
 * habilitar em produção sem autorização explícita e revisada para essa
 * execução específica.
 */
import { Hono } from 'hono';
import type { Env } from '../types';
import { auth } from '../middleware/auth';
import { requireRole } from '../middleware/rbac';
import { getTenantContext } from '../middleware/tenant';
import { discoverRemediationTargets, buildRemediationApplyStatements, buildRemediationRollbackStatements } from '../../scripts/lib/matriz-remediation-core.mjs';
import type { RemediationLinkRow } from '../../scripts/lib/matriz-remediation-core.mjs';
import { assertRemediationPlanIntegrity, buildRemediationFingerprint } from '../../scripts/lib/matriz-remediation-plan.mjs';
import { buildTenantFingerprint } from '../../scripts/lib/matriz-base-fingerprint.mjs';
import { sha256 } from '../../scripts/lib/matriz-import-plan.mjs';

const ALLOWED_EMPRESA_ID = 6;

const app = new Hono<{ Bindings: Env }>();
app.use('*', auth(), requireRole('admin'));

class ExecutorError extends Error {}
function fail(message: string): never {
  throw new ExecutorError(message);
}

function requireEnabled(env: Env) {
  if (env.ENABLE_SIMULADORES_MATRIZ_REMEDIATION_EXECUTOR !== 'true') {
    fail('Executor de remediação desabilitado. Defina ENABLE_SIMULADORES_MATRIZ_REMEDIATION_EXECUTOR=true apenas para a janela de execução autorizada.');
  }
}

function maskUuid(uuid: string): string {
  return uuid.length <= 8 ? '***' : `${uuid.slice(0, 8)}...`;
}

async function assertMigrationPresent(db: D1Database) {
  const rows = await db
    .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name IN ('simuladores_matriz_remediations','simuladores_matriz_resolution_corrections')")
    .all<{ name: string }>();
  const names = new Set((rows.results || []).map((r) => r.name));
  if (!names.has('simuladores_matriz_remediations')) fail('migration 0443 não aplicada');
  if (!names.has('simuladores_matriz_resolution_corrections')) fail('migration 0443 não aplicada');
}

type RemediationPlan = {
  schema_version: number;
  plan_sha256: string;
  remediation_uuid: string;
  empresa_id: number;
  versao_matriz: string;
  source_matrix_import_uuid: string;
  source_guide_import_uuid: string;
  base_fingerprint: string;
  expected_hash: string;
  mapping_count: number;
  model_count: number;
  link_count: number;
  mappings: Array<{ codigo_canonico: string; correct_manobra_codigo: string }>;
  downstream_usage_baseline?: { fichas?: number; agendamentos?: number };
};

async function loadTenantFingerprint(db: D1Database, empresaId: number) {
  const currentVersions = (
    await db
      .prepare(`SELECT modelo_id, codigo_canonico, versao_numero, versao_matriz, is_current FROM modelos_sessao_versionamento WHERE empresa_id=?1 AND is_current=1 ORDER BY codigo_canonico`)
      .bind(empresaId)
      .all()
  ).results as unknown[];
  const manobras = (
    await db.prepare(`SELECT id, codigo, empresa_id FROM manobras WHERE empresa_id=?1 AND deleted_at IS NULL`).bind(empresaId).all()
  ).results as unknown[];
  const links = (
    await db
      .prepare(
        `SELECT msm.id, msm.modelo_id, msm.manobra_id, msm.ordem, msm.deleted_at
         FROM modelos_sessao_manobras msm JOIN modelos_sessao ms ON ms.id = msm.modelo_id WHERE ms.empresa_id=?1`,
      )
      .bind(empresaId)
      .all()
  ).results as unknown[];
  const versionamentoCount = (
    await db.prepare(`SELECT COUNT(*) AS c FROM modelos_sessao_versionamento WHERE empresa_id=?1`).bind(empresaId).all<{ c: number }>()
  ).results?.[0]?.c;
  return buildTenantFingerprint({
    empresaId,
    currentVersions,
    resolvedManoeuvres: manobras,
    links,
    migrationState: { has_0440: true, versionamento_count: Number(versionamentoCount || 0) },
  });
}

async function loadLookups(db: D1Database, empresaId: number, versaoMatriz: string) {
  const resolutionRows = (
    await db
      .prepare(`SELECT id,codigo_canonico,manobra_id,resolution_type FROM simuladores_matriz_manobra_resolution WHERE empresa_id=?1 AND versao_matriz=?2`)
      .bind(empresaId, versaoMatriz)
      .all<{ id: number; codigo_canonico: string; manobra_id: number; resolution_type: string }>()
  ).results;
  const manobraRows = (
    await db.prepare(`SELECT id,codigo,empresa_id,deleted_at FROM manobras WHERE empresa_id=?1`).bind(empresaId).all<{ id: number; codigo: string; empresa_id: number; deleted_at: string | null }>()
  ).results;
  const manobraByCode = new Map(manobraRows.map((r) => [r.codigo, r]));
  const manobraById = new Map(manobraRows.map((r) => [Number(r.id), r]));
  // Deliberately NOT filtered by versao_matriz — see the matching comment in
  // prepare-simuladores-matriz-remediation.mjs: is_current=1 already
  // uniquely identifies the one current row per codigo_canonico per tenant,
  // and a compensatory rollback retags versao_matriz as '<...>-COMPENSATE'.
  const currentModelRows = (
    await db
      .prepare(
        `SELECT v.modelo_id, v.codigo_canonico, ms.codigo AS codigo_fisico, v.versao_numero
         FROM modelos_sessao_versionamento v JOIN modelos_sessao ms ON ms.id = v.modelo_id
         WHERE v.empresa_id=?1 AND v.is_current=1`,
      )
      .bind(empresaId)
      .all<{ modelo_id: number; codigo_canonico: string; codigo_fisico: string; versao_numero: number }>()
  ).results;
  const currentModelsByCode = new Map(currentModelRows.map((r) => [r.codigo_canonico, { modelo_id: Number(r.modelo_id), codigo_fisico: r.codigo_fisico }]));
  const versaoNumeroByModeloId = new Map(currentModelRows.map((r) => [Number(r.modelo_id), Number(r.versao_numero)]));
  const linkRows = (
    await db
      .prepare(
        `SELECT msm.id,msm.modelo_id,msm.manobra_id,msm.ordem,msm.obrigatoria,msm.tripulante,msm.observacoes
         FROM modelos_sessao_manobras msm JOIN modelos_sessao ms ON ms.id = msm.modelo_id
         WHERE ms.empresa_id=?1 AND msm.deleted_at IS NULL`,
      )
      .bind(empresaId)
      .all<RemediationLinkRow>()
  ).results;
  const activeCorrectionCodes = new Set(
    (
      await db
        .prepare(`SELECT codigo_canonico FROM simuladores_matriz_resolution_corrections WHERE empresa_id=?1 AND versao_matriz=?2 AND is_current=1`)
        .bind(empresaId, versaoMatriz)
        .all<{ codigo_canonico: string }>()
    ).results.map((r) => r.codigo_canonico),
  );
  return { resolutionRows, manobraByCode, manobraById, currentModelsByCode, versaoNumeroByModeloId, linkRows, activeCorrectionCodes };
}

async function validatePlanAgainstLiveState(db: D1Database, plan: RemediationPlan, empresaId: number) {
  if (Number(plan.empresa_id) !== empresaId) fail('tenant do plano diverge');
  if (empresaId !== ALLOWED_EMPRESA_ID) fail(`empresa_id não autorizado para este executor: ${empresaId}`);

  const tenant = await db.prepare('SELECT id FROM empresas WHERE id=?1').bind(empresaId).all();
  if (!tenant.results?.length) fail('tenant inválido');

  assertRemediationPlanIntegrity(plan, { baseFingerprint: plan.base_fingerprint, expectedHash: plan.expected_hash });

  const sourceImport = await db
    .prepare(`SELECT status FROM simuladores_matriz_imports WHERE uuid=?1 AND empresa_id=?2`)
    .bind(plan.source_matrix_import_uuid, empresaId)
    .all<{ status: string }>();
  if (sourceImport.results?.[0]?.status !== 'APPLIED') fail('source_matrix_import_uuid não está APPLIED');
  const sourceGuide = await db
    .prepare(`SELECT status FROM simuladores_matriz_guia_relink WHERE uuid=?1 AND empresa_id=?2`)
    .bind(plan.source_guide_import_uuid, empresaId)
    .all<{ status: string }>();
  if (sourceGuide.results?.[0]?.status !== 'APPLIED') fail('source_guide_import_uuid não está APPLIED');

  const fingerprint = await loadTenantFingerprint(db, empresaId);
  if (plan.base_fingerprint !== fingerprint.fingerprint) fail('base_fingerprint divergente do estado corrente');

  const lookups = await loadLookups(db, empresaId, plan.versao_matriz);
  const discovered = discoverRemediationTargets({
    empresaId,
    versaoMatriz: plan.versao_matriz,
    mappings: plan.mappings.map((m) => ({ codigo_canonico: m.codigo_canonico, correct_legacy_manobra_codigo: m.correct_manobra_codigo })),
    resolutionRows: lookups.resolutionRows,
    activeCorrectionCodes: lookups.activeCorrectionCodes,
    manobraByCode: lookups.manobraByCode,
    manobraById: lookups.manobraById,
    currentModelsByCode: lookups.currentModelsByCode,
    linkRows: lookups.linkRows,
  });

  const { fingerprint: expectedHashNow } = buildRemediationFingerprint({
    empresaId,
    versaoMatriz: plan.versao_matriz,
    mappingResolutions: discovered.mappingResolutions,
    affectedLinks: discovered.affectedLinks,
  });
  if (expectedHashNow !== plan.expected_hash) fail('expected_hash divergente do estado corrente (drift no conjunto alvo)');

  const affectedModeloIds = discovered.affectedModels.map((m: { modelo_id: number }) => m.modelo_id);
  const idList = affectedModeloIds.length ? affectedModeloIds.join(',') : '-1';
  const downstream = await db
    .prepare(
      `SELECT
        (SELECT COUNT(*) FROM fichas_sessao WHERE template_id IN (${idList})) AS fichas,
        (SELECT COUNT(*) FROM simulador_agendamentos WHERE template_id IN (${idList})) AS agendamentos`,
    )
    .all<{ fichas: number; agendamentos: number }>();
  const downstreamNow = downstream.results?.[0] || { fichas: 0, agendamentos: 0 };
  if (
    Number(downstreamNow.fichas) !== Number(plan.downstream_usage_baseline?.fichas ?? 0) ||
    Number(downstreamNow.agendamentos) !== Number(plan.downstream_usage_baseline?.agendamentos ?? 0)
  ) {
    fail('drift: uso posterior (ficha/agendamento) surgiu desde o plano; regenere o plano');
  }

  return { discovered, lookups, fingerprint };
}

app.post('/dry-run', async (c) => {
  try {
    requireEnabled(c.env);
    const empresaId = getTenantContext(c).empresaId;
    const plan = await c.req.json<RemediationPlan>();
    const db = c.env.DB;
    await assertMigrationPresent(db);

    const inflight = await db
      .prepare(`SELECT remediation_uuid FROM simuladores_matriz_remediations WHERE empresa_id=?1 AND versao_matriz=?2 AND status='APPLYING'`)
      .bind(empresaId, plan.versao_matriz)
      .all();
    if (inflight.results?.length) fail('outra remediação em APPLYING para este tenant/versão');

    const { discovered, fingerprint } = await validatePlanAgainstLiveState(db, plan, empresaId);
    const after = await loadTenantFingerprint(db, empresaId);
    if (fingerprint.fingerprint !== after.fingerprint) fail('versão corrente alterada durante a validação');

    return c.json({
      success: true,
      mode: 'DRY_RUN',
      fingerprint: after.fingerprint,
      preview: {
        model_count: discovered.affectedModels.length,
        link_count: discovered.affectedLinks.length,
        mapping_count: discovered.mappingResolutions.length,
        links_copied: discovered.affectedModels.length * 18,
        links_substituted: discovered.affectedLinks.length,
        guides_relinked: discovered.affectedModels.length,
        resolution_overlays: discovered.mappingResolutions.length,
      },
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
    const plan = await c.req.json<RemediationPlan>();
    const db = c.env.DB;
    await assertMigrationPresent(db);

    const existing = (
      await db
        .prepare('SELECT remediation_uuid,status,plan_sha256 FROM simuladores_matriz_remediations WHERE remediation_uuid=?1')
        .bind(plan.remediation_uuid)
        .all<{ remediation_uuid: string; status: string; plan_sha256: string }>()
    ).results?.[0];
    if (existing?.status === 'APPLIED' && existing.plan_sha256 === plan.plan_sha256) {
      return c.json({ success: true, idempotent: true, status: 'APPLIED' });
    }
    if (existing && existing.plan_sha256 !== plan.plan_sha256) fail('remediation_uuid já usado com plan_sha256 diferente');
    if (existing?.status === 'ROLLED_BACK') fail('remediation_uuid já compensado; use novo remediation_uuid para reapply');
    if (existing?.status === 'FAILED') fail('remediation_uuid em FAILED; use novo remediation_uuid');
    if (existing?.status === 'APPLYING') fail('remediação já em APPLYING');

    const inflight = await db
      .prepare(`SELECT remediation_uuid FROM simuladores_matriz_remediations WHERE empresa_id=?1 AND versao_matriz=?2 AND status='APPLYING'`)
      .bind(empresaId, plan.versao_matriz)
      .all();
    if (inflight.results?.length && inflight.results[0].remediation_uuid !== plan.remediation_uuid) {
      fail('outra remediação em APPLYING para este tenant/versão');
    }

    const { discovered, lookups, fingerprint } = await validatePlanAgainstLiveState(db, plan, empresaId);
    const liveFingerprint = await loadTenantFingerprint(db, empresaId);
    if (liveFingerprint.fingerprint !== fingerprint.fingerprint) fail('fingerprint mudou antes do apply');

    const guideLinkRows = (
      await db
        .prepare(`SELECT id,guia_id,modelo_sessao_id FROM simuladores_modelos_sessao_guias WHERE empresa_id=?1 AND deleted_at IS NULL`)
        .bind(empresaId)
        .all<{ id: number; guia_id: number; modelo_sessao_id: number }>()
    ).results;
    const guideLinkByModel = new Map(guideLinkRows.map((r) => [Number(r.modelo_sessao_id), r]));
    const guideRelinkUuid = `${plan.remediation_uuid}-guide`;
    const guideRelinkEntries = discovered.affectedModels.map((m: { modelo_id: number; codigo_canonico: string }) => {
      const oldLink = guideLinkByModel.get(m.modelo_id);
      if (!oldLink) fail(`${m.codigo_canonico}: sem guia ativo vinculado`);
      return {
        codigo_canonico: m.codigo_canonico,
        guia_id: oldLink!.guia_id,
        aeronave: 'AW139',
        modelo_sessao_id_novo: `(SELECT id FROM modelos_sessao WHERE codigo='${m.codigo_canonico}@${plan.versao_matriz}-REMEDIATION-${plan.remediation_uuid}' AND empresa_id=${empresaId})`,
        vinculo_antigo_id: oldLink!.id,
        modelo_sessao_id_antigo: m.modelo_id,
        already_correct: false,
      };
    });

    const modelPhysicalMeta = new Map(
      discovered.affectedModels.map((m: { modelo_id: number }) => {
        const versaoNumero = lookups.versaoNumeroByModeloId.get(m.modelo_id);
        if (versaoNumero == null) fail(`modelo ${m.modelo_id}: versão corrente ausente`);
        return [m.modelo_id, { versaoNumero }] as const;
      }),
    );

    const statements: string[] = [];
    if (existing) {
      statements.push(`UPDATE simuladores_matriz_remediations SET status='APPLYING', failure_reason=NULL WHERE remediation_uuid='${plan.remediation_uuid.replace(/'/g, "''")}';`);
    } else {
      statements.push(`INSERT INTO simuladores_matriz_remediations(
          remediation_uuid,empresa_id,remediation_type,source_matrix_import_uuid,source_guide_import_uuid,
          versao_matriz,expected_hash,base_fingerprint,plan_sha256,status,model_count,link_count,mapping_count
        ) VALUES (
          '${plan.remediation_uuid.replace(/'/g, "''")}',${empresaId},'LEGACY_EQUIVALENT_COMPENSATION',
          '${plan.source_matrix_import_uuid.replace(/'/g, "''")}','${plan.source_guide_import_uuid.replace(/'/g, "''")}',
          '${plan.versao_matriz.replace(/'/g, "''")}','${plan.expected_hash}','${plan.base_fingerprint}','${plan.plan_sha256}',
          'APPLYING',${plan.model_count},${plan.link_count},${plan.mapping_count}
        );`);
    }

    const { statements: applyStatements } = buildRemediationApplyStatements({
      empresaId,
      versaoMatriz: plan.versao_matriz,
      remediationUuid: plan.remediation_uuid,
      guideRelinkUuid,
      guideRelinkExpectedHash: plan.expected_hash,
      affectedModels: discovered.affectedModels,
      mappingResolutions: discovered.mappingResolutions,
      modelPhysicalMeta,
      guideRelinkEntries,
    });
    statements.push(...applyStatements);

    const versaoMatrizEscaped = plan.versao_matriz.replace(/'/g, "''");
    const effectiveCountExpr = (type: string) => `(
      SELECT COUNT(*) FROM simuladores_matriz_manobra_resolution r
      WHERE r.empresa_id=${empresaId} AND r.versao_matriz='${versaoMatrizEscaped}'
        AND COALESCE(
          (SELECT c.corrected_resolution_type FROM simuladores_matriz_resolution_corrections c
           WHERE c.empresa_id=r.empresa_id AND c.versao_matriz=r.versao_matriz AND c.codigo_canonico=r.codigo_canonico AND c.is_current=1),
          r.resolution_type
        ) = '${type}'
    )`;
    statements.push(`UPDATE simuladores_matriz_remediations SET status='APPLIED', applied_at=CURRENT_TIMESTAMP,
        effective_exact_unique=${effectiveCountExpr('EXACT_UNIQUE')},
        effective_legacy_equivalent=${effectiveCountExpr('LEGACY_EQUIVALENT')},
        effective_true_missing=${effectiveCountExpr('TRUE_MISSING')}
      WHERE remediation_uuid='${plan.remediation_uuid.replace(/'/g, "''")}';`);
    statements.push(`UPDATE simuladores_matriz_guia_relink SET status='APPLIED', applied_at=CURRENT_TIMESTAMP WHERE uuid='${guideRelinkUuid.replace(/'/g, "''")}';`);

    try {
      await db.batch(statements.map((sql) => db.prepare(sql)));
    } catch (batchError) {
      const message = batchError instanceof Error ? batchError.message : String(batchError);
      console.error(`[SIMULADORES-MATRIZ-REMEDIATION-EXECUTOR] batch FAILED empresa=${empresaId} remediation_uuid=${maskUuid(plan.remediation_uuid)} statements=${statements.length} message=${message}`);
      await db
        .prepare(`UPDATE simuladores_matriz_remediations SET status='FAILED', failure_reason=?1 WHERE remediation_uuid=?2 AND status='APPLYING'`)
        .bind(message.slice(0, 500), plan.remediation_uuid)
        .run();
      throw batchError;
    }

    const currents = await db
      .prepare('SELECT codigo_canonico, COUNT(*) AS c FROM modelos_sessao_versionamento WHERE empresa_id=?1 AND is_current=1 GROUP BY codigo_canonico HAVING c<>1')
      .bind(empresaId)
      .all();
    if (currents.results?.length) fail('mais de uma versão corrente detectada');

    console.log(`[SIMULADORES-MATRIZ-REMEDIATION-EXECUTOR] apply APPLIED empresa=${empresaId} remediation_uuid=${plan.remediation_uuid}`);
    return c.json({ success: true, mode: 'APPLY', status: 'APPLIED', remediation_uuid: plan.remediation_uuid });
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
    const body = await c.req.json<{ remediation_uuid: string; compensation_uuid?: string }>();
    const remediationUuid = body.remediation_uuid;
    const compensationUuid = body.compensation_uuid || `compensate-${remediationUuid}`;
    if (!remediationUuid) fail('remediation_uuid obrigatório');

    const db = c.env.DB;
    const remediation = (
      await db.prepare('SELECT * FROM simuladores_matriz_remediations WHERE remediation_uuid=?1 AND empresa_id=?2').bind(remediationUuid, empresaId).all<Record<string, unknown>>()
    ).results?.[0];
    if (!remediation) fail('remediação não encontrada para o tenant');
    if (remediation.status === 'ROLLED_BACK' && remediation.rollback_uuid) {
      return c.json({ success: true, idempotent: true, status: 'ROLLED_BACK', rollback_uuid: remediation.rollback_uuid });
    }
    if (remediation.status !== 'APPLIED') fail('somente APPLIED pode ser compensado');

    const changes = (
      await db
        .prepare('SELECT * FROM simuladores_matriz_remediation_changes WHERE remediation_id=?1 ORDER BY change_order')
        .bind(Number(remediation.id))
        .all<Record<string, unknown>>()
    ).results;
    const createChanges = changes.filter((c2) => c2.entity_type === 'modelos_sessao' && c2.action_type === 'COMPENSATE_CREATE');
    if (!createChanges.length) fail('sem mudanças COMPENSATE_CREATE para compensar');
    const lastChangeOrder = changes.reduce((max, c2) => Math.max(max, Number(c2.change_order)), 0);

    const versaoMatriz = String(remediation.versao_matriz);
    const affectedModels = [];
    for (const change of createChanges) {
      const remediatedModeloId = Number(change.after_id);
      const version = (
        await db.prepare('SELECT versao_numero FROM modelos_sessao_versionamento WHERE modelo_id=?1 AND empresa_id=?2').bind(remediatedModeloId, empresaId).all<{ versao_numero: number }>()
      ).results?.[0];
      if (!version) fail(`versionamento ausente para modelo remediado ${remediatedModeloId}`);
      const originalModeloId = Number(change.before_id);
      const originalLinks = (
        await db
          .prepare('SELECT id,manobra_id,ordem,obrigatoria,tripulante,observacoes FROM modelos_sessao_manobras WHERE modelo_id=?1 AND deleted_at IS NULL ORDER BY ordem')
          .bind(originalModeloId)
          .all<RemediationLinkRow>()
      ).results;
      if (originalLinks.length !== 18) fail(`modelo original ${originalModeloId}: esperados 18 vínculos; encontrados ${originalLinks.length}`);
      affectedModels.push({
        codigo_canonico: String(change.logical_code),
        remediated_modelo_id: remediatedModeloId,
        remediated_versao_numero: Number(version.versao_numero),
        original_links: originalLinks,
      });
    }

    const correctionRows = (
      await db
        .prepare('SELECT id, codigo_canonico, corrected_manobra_id, original_manobra_id FROM simuladores_matriz_resolution_corrections WHERE remediation_id=?1 AND is_current=1')
        .bind(Number(remediation.id))
        .all<{ id: number; codigo_canonico: string; corrected_manobra_id: number; original_manobra_id: number }>()
    ).results;

    // The guide relink cannot be literally "undone": the matrix rollback
    // above mints new COMPENSATE model rows rather than reactivating
    // historical ones, so guides must be forward-relinked onto those new
    // rows (see the doc comment on buildRemediationRollbackStatements).
    const guideRelinkRollbackUuid = `${compensationUuid}-guide`;
    const guideLinkRows = (
      await db
        .prepare('SELECT id,guia_id,modelo_sessao_id FROM simuladores_modelos_sessao_guias WHERE empresa_id=?1 AND deleted_at IS NULL')
        .bind(empresaId)
        .all<{ id: number; guia_id: number; modelo_sessao_id: number }>()
    ).results;
    const guideLinkByModel = new Map(guideLinkRows.map((r) => [Number(r.modelo_sessao_id), r]));
    const guideRelinkEntries = affectedModels.map((m) => {
      const currentLink = guideLinkByModel.get(m.remediated_modelo_id);
      if (!currentLink) fail(`${m.codigo_canonico}: sem guia ativo vinculado ao modelo remediado`);
      return {
        codigo_canonico: m.codigo_canonico,
        guia_id: currentLink!.guia_id,
        aeronave: 'AW139',
        vinculo_antigo_id: currentLink!.id,
        modelo_sessao_id_antigo: m.remediated_modelo_id,
        already_correct: false,
      };
    });
    const guideRelinkExpectedHash = sha256(guideRelinkEntries.map((e) => `${e.codigo_canonico}:${e.guia_id}`).join('|'));

    const { statements } = buildRemediationRollbackStatements({
      empresaId,
      versaoMatriz: versaoMatriz.replace('-REMEDIATION', ''),
      remediationUuid,
      compensationUuid,
      affectedModels,
      correctionRows,
      guideRelinkRollbackUuid,
      guideRelinkEntries,
      guideRelinkExpectedHash,
      startChangeOrder: lastChangeOrder + 1,
    });

    statements.push(`UPDATE simuladores_matriz_guia_relink SET status='APPLIED', applied_at=CURRENT_TIMESTAMP WHERE uuid='${guideRelinkRollbackUuid.replace(/'/g, "''")}';`);

    await db.batch(statements.map((sql) => db.prepare(sql)));

    console.log(`[SIMULADORES-MATRIZ-REMEDIATION-EXECUTOR] rollback ROLLED_BACK empresa=${empresaId} remediation_uuid=${remediationUuid}`);
    return c.json({ success: true, status: 'ROLLED_BACK', rollback_uuid: compensationUuid });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return c.json({ success: false, error: message }, 400);
  }
});

app.get('/status/:uuid', async (c) => {
  try {
    const empresaId = getTenantContext(c).empresaId;
    const uuid = c.req.param('uuid');
    const db = c.env.DB;
    const row = (
      await db
        .prepare(
          `SELECT remediation_uuid, status, model_count, link_count, mapping_count,
                  effective_exact_unique, effective_legacy_equivalent, effective_true_missing,
                  created_at, applied_at, rolled_back_at, rollback_uuid, failure_reason
           FROM simuladores_matriz_remediations WHERE remediation_uuid=?1 AND empresa_id=?2`,
        )
        .bind(uuid, empresaId)
        .all()
    ).results?.[0];
    if (!row) return c.json({ success: false, error: 'remediação não encontrada' }, 404);
    return c.json({ success: true, data: row });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return c.json({ success: false, error: message }, 400);
  }
});

export default app;
