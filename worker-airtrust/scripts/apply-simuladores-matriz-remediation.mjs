#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { discoverRemediationTargets, buildRemediationApplyStatements } from './lib/matriz-remediation-core.mjs';
import { assertRemediationPlanIntegrity, buildRemediationFingerprint } from './lib/matriz-remediation-plan.mjs';
import { buildTenantFingerprint } from './lib/matriz-base-fingerprint.mjs';

function fail(message) {
  throw new Error(`Aplicação de remediação recusada: ${message}`);
}
function arg(name, argv = process.argv) {
  const index = argv.indexOf(name);
  return index >= 0 ? argv[index + 1] : undefined;
}
function hasFlag(name, argv = process.argv) {
  return argv.includes(name);
}
function refuseRemote(argv = process.argv) {
  const joined = argv.join(' ').toLowerCase();
  if (hasFlag('--remote', argv) || joined.includes('--env production') || joined.includes('--env staging') || joined.includes('remote-d1')) {
    fail('indicação de remoto/staging/produção');
  }
}
function sqlite(dbPath, sql) {
  const r = spawnSync('sqlite3', ['-bail', dbPath], { input: `PRAGMA foreign_keys=ON;\nPRAGMA recursive_triggers=OFF;\n${sql}`, encoding: 'utf8' });
  if (r.status !== 0) fail(r.stderr || r.stdout || 'falha sqlite');
  return r.stdout.trim();
}
function sqliteJson(dbPath, sql) {
  const r = spawnSync('sqlite3', ['-json', dbPath], { input: `PRAGMA foreign_keys=ON;\n${sql}`, encoding: 'utf8' });
  if (r.status !== 0) fail(r.stderr || r.stdout || 'falha sqlite json');
  const t = r.stdout.trim();
  return t ? JSON.parse(t) : [];
}
function assertMigrationsPresent(dbPath) {
  const names = new Set(
    sqliteJson(
      dbPath,
      "SELECT name FROM sqlite_master WHERE type='table' AND name IN ('simuladores_matriz_remediations','simuladores_matriz_resolution_corrections')",
    ).map((r) => r.name),
  );
  if (!names.has('simuladores_matriz_remediations') || !names.has('simuladores_matriz_resolution_corrections')) {
    fail('migration 0443 não aplicada');
  }
}

function loadTenantFingerprint(dbPath, empresaId) {
  const currentVersions = sqliteJson(
    dbPath,
    `SELECT modelo_id, codigo_canonico, versao_numero, versao_matriz, is_current FROM modelos_sessao_versionamento WHERE empresa_id=${empresaId} AND is_current=1 ORDER BY codigo_canonico`,
  );
  const manobras = sqliteJson(dbPath, `SELECT id, codigo, empresa_id FROM manobras WHERE empresa_id=${empresaId} AND deleted_at IS NULL`);
  const links = sqliteJson(
    dbPath,
    `SELECT msm.id, msm.modelo_id, msm.manobra_id, msm.ordem, msm.deleted_at
     FROM modelos_sessao_manobras msm JOIN modelos_sessao ms ON ms.id = msm.modelo_id WHERE ms.empresa_id=${empresaId}`,
  );
  const versionamentoCount = sqliteJson(dbPath, `SELECT COUNT(*) AS c FROM modelos_sessao_versionamento WHERE empresa_id=${empresaId}`)[0]?.c || 0;
  return buildTenantFingerprint({
    empresaId,
    currentVersions,
    resolvedManoeuvres: manobras,
    links,
    migrationState: { has_0440: true, versionamento_count: Number(versionamentoCount) },
  });
}

function loadLookups(dbPath, empresaId, versaoMatriz) {
  const resolutionRows = sqliteJson(
    dbPath,
    `SELECT id,codigo_canonico,manobra_id,resolution_type FROM simuladores_matriz_manobra_resolution WHERE empresa_id=${empresaId} AND versao_matriz='${versaoMatriz.replace(/'/g, "''")}'`,
  );
  const manobraRows = sqliteJson(dbPath, `SELECT id,codigo,empresa_id,deleted_at FROM manobras WHERE empresa_id=${empresaId}`);
  const manobraByCode = new Map(manobraRows.map((r) => [r.codigo, r]));
  const manobraById = new Map(manobraRows.map((r) => [r.id, r]));
  // Deliberately NOT filtered by versao_matriz — see the matching comment in
  // prepare-simuladores-matriz-remediation.mjs.
  const currentModelRows = sqliteJson(
    dbPath,
    `SELECT v.modelo_id, v.codigo_canonico, ms.codigo AS codigo_fisico, v.versao_numero
     FROM modelos_sessao_versionamento v JOIN modelos_sessao ms ON ms.id = v.modelo_id
     WHERE v.empresa_id=${empresaId} AND v.is_current=1`,
  );
  const currentModelsByCode = new Map(currentModelRows.map((r) => [r.codigo_canonico, { modelo_id: r.modelo_id, codigo_fisico: r.codigo_fisico }]));
  const versaoNumeroByModeloId = new Map(currentModelRows.map((r) => [Number(r.modelo_id), Number(r.versao_numero)]));
  const linkRows = sqliteJson(
    dbPath,
    `SELECT msm.id,msm.modelo_id,msm.manobra_id,msm.ordem,msm.obrigatoria,msm.tripulante,msm.observacoes
     FROM modelos_sessao_manobras msm JOIN modelos_sessao ms ON ms.id = msm.modelo_id
     WHERE ms.empresa_id=${empresaId} AND msm.deleted_at IS NULL`,
  );
  const activeCorrectionCodes = new Set(
    sqliteJson(
      dbPath,
      `SELECT codigo_canonico FROM simuladores_matriz_resolution_corrections WHERE empresa_id=${empresaId} AND versao_matriz='${versaoMatriz.replace(/'/g, "''")}' AND is_current=1`,
    ).map((r) => r.codigo_canonico),
  );
  return { resolutionRows, manobraByCode, manobraById, currentModelsByCode, versaoNumeroByModeloId, linkRows, activeCorrectionCodes };
}

export function applyRemediationPlan({ dbPath, plan, dryRun }) {
  assertMigrationsPresent(dbPath);
  const empresaId = Number(plan.empresa_id);
  if (empresaId !== 6) fail('empresa_id não autorizado para esta remediação');

  const existing = sqliteJson(
    dbPath,
    `SELECT remediation_uuid,status,plan_sha256 FROM simuladores_matriz_remediations WHERE remediation_uuid='${plan.remediation_uuid.replace(/'/g, "''")}'`,
  )[0];
  if (existing?.status === 'APPLIED' && existing.plan_sha256 === plan.plan_sha256) {
    return { ok: true, idempotent: true, status: 'APPLIED' };
  }
  if (existing && existing.plan_sha256 !== plan.plan_sha256) fail('remediation_uuid já usado com plan_sha256 diferente');
  if (existing?.status === 'ROLLED_BACK') fail('remediation_uuid já compensado; use novo remediation-uuid para reapply');
  if (existing?.status === 'FAILED') fail('remediation_uuid em FAILED; use novo remediation-uuid');
  if (existing?.status === 'APPLYING') fail('remediação já em APPLYING; aguarde ou verifique concorrência');

  const inflight = sqliteJson(
    dbPath,
    `SELECT remediation_uuid FROM simuladores_matriz_remediations WHERE empresa_id=${empresaId} AND versao_matriz='${plan.versao_matriz.replace(/'/g, "''")}' AND status='APPLYING'`,
  );
  if (inflight.length) fail('outra remediação em APPLYING para este tenant/versão');

  const fingerprint = loadTenantFingerprint(dbPath, empresaId);
  assertRemediationPlanIntegrity(plan, { baseFingerprint: plan.base_fingerprint, expectedHash: plan.expected_hash });
  if (plan.base_fingerprint !== fingerprint.fingerprint) fail('base_fingerprint divergente do estado corrente');

  const lookups = loadLookups(dbPath, empresaId, plan.versao_matriz);
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

  const affectedModeloIds = discovered.affectedModels.map((m) => m.modelo_id);
  const downstreamNow = sqliteJson(
    dbPath,
    `SELECT
      (SELECT COUNT(*) FROM fichas_sessao WHERE template_id IN (${affectedModeloIds.join(',') || '-1'})) AS fichas,
      (SELECT COUNT(*) FROM simulador_agendamentos WHERE template_id IN (${affectedModeloIds.join(',') || '-1'})) AS agendamentos`,
  )[0] || { fichas: 0, agendamentos: 0 };
  if (
    Number(downstreamNow.fichas) !== Number(plan.downstream_usage_baseline?.fichas ?? 0) ||
    Number(downstreamNow.agendamentos) !== Number(plan.downstream_usage_baseline?.agendamentos ?? 0)
  ) {
    fail('drift: uso posterior (ficha/agendamento) surgiu desde o plano; regenere o plano');
  }

  const { fingerprint: expectedHashNow } = buildRemediationFingerprint({
    empresaId,
    versaoMatriz: plan.versao_matriz,
    mappingResolutions: discovered.mappingResolutions,
    affectedLinks: discovered.affectedLinks,
  });
  if (expectedHashNow !== plan.expected_hash) fail('expected_hash divergente do estado corrente (drift no conjunto alvo)');

  if (dryRun) {
    return { ok: true, mode: 'DRY_RUN', fingerprint: fingerprint.fingerprint, expected_hash: plan.expected_hash };
  }

  const guideLinkRows = sqliteJson(
    dbPath,
    `SELECT id,guia_id,modelo_sessao_id FROM simuladores_modelos_sessao_guias WHERE empresa_id=${empresaId} AND deleted_at IS NULL`,
  );
  const guideLinkByModel = new Map(guideLinkRows.map((r) => [Number(r.modelo_sessao_id), r]));
  const guideRelinkUuid = `${plan.remediation_uuid}-guide`;
  const guideRelinkEntries = discovered.affectedModels.map((m) => {
    const oldLink = guideLinkByModel.get(m.modelo_id);
    if (!oldLink) fail(`${m.codigo_canonico}: sem guia ativo vinculado`);
    return {
      codigo_canonico: m.codigo_canonico,
      guia_id: oldLink.guia_id,
      aeronave: 'AW139',
      modelo_sessao_id_novo: `(SELECT id FROM modelos_sessao WHERE codigo='${m.codigo_canonico}@${plan.versao_matriz}-REMEDIATION-${plan.remediation_uuid}' AND empresa_id=${empresaId})`,
      vinculo_antigo_id: oldLink.id,
      modelo_sessao_id_antigo: m.modelo_id,
      already_correct: false,
    };
  });

  const modelPhysicalMeta = new Map(discovered.affectedModels.map((m) => [m.modelo_id, { versaoNumero: lookups.versaoNumeroByModeloId.get(m.modelo_id) }]));

  const sql = ['BEGIN IMMEDIATE;'];
  if (existing) {
    sql.push(
      `UPDATE simuladores_matriz_remediations SET status='APPLYING', failure_reason=NULL WHERE remediation_uuid='${plan.remediation_uuid.replace(/'/g, "''")}';`,
    );
  } else {
    sql.push(`INSERT INTO simuladores_matriz_remediations(
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
  sql.push(...applyStatements);
  const versaoMatrizEscaped = plan.versao_matriz.replace(/'/g, "''");
  // Effective resolution split = original resolution_type, except for codes
  // with a current correction overlay (which read as LEGACY_EQUIVALENT).
  // Computed and stored for audit/reporting only; the underlying resolution
  // table is untouched either way.
  const effectiveCountExpr = (type) => `(
    SELECT COUNT(*) FROM simuladores_matriz_manobra_resolution r
    WHERE r.empresa_id=${empresaId} AND r.versao_matriz='${versaoMatrizEscaped}'
      AND COALESCE(
        (SELECT c.corrected_resolution_type FROM simuladores_matriz_resolution_corrections c
         WHERE c.empresa_id=r.empresa_id AND c.versao_matriz=r.versao_matriz AND c.codigo_canonico=r.codigo_canonico AND c.is_current=1),
        r.resolution_type
      ) = '${type}'
  )`;
  sql.push(
    `UPDATE simuladores_matriz_remediations SET status='APPLIED', applied_at=CURRENT_TIMESTAMP,
      effective_exact_unique=${effectiveCountExpr('EXACT_UNIQUE')},
      effective_legacy_equivalent=${effectiveCountExpr('LEGACY_EQUIVALENT')},
      effective_true_missing=${effectiveCountExpr('TRUE_MISSING')}
      WHERE remediation_uuid='${plan.remediation_uuid.replace(/'/g, "''")}';`,
  );
  sql.push(
    `UPDATE simuladores_matriz_guia_relink SET status='APPLIED', applied_at=CURRENT_TIMESTAMP WHERE uuid='${guideRelinkUuid.replace(/'/g, "''")}';`,
  );
  sql.push('COMMIT;');

  try {
    sqlite(dbPath, sql.join('\n'));
  } catch (error) {
    spawnSync('sqlite3', [dbPath], { input: 'ROLLBACK;', encoding: 'utf8' });
    sqlite(
      dbPath,
      `UPDATE simuladores_matriz_remediations SET status='FAILED', failure_reason='${String(error.message || error).replace(/'/g, "''").slice(0, 500)}'
       WHERE remediation_uuid='${plan.remediation_uuid.replace(/'/g, "''")}' AND status='APPLYING';`,
    );
    throw error;
  }

  const currents = sqliteJson(
    dbPath,
    `SELECT codigo_canonico, COUNT(*) AS c FROM modelos_sessao_versionamento WHERE empresa_id=${empresaId} AND is_current=1 GROUP BY codigo_canonico HAVING c<>1`,
  );
  if (currents.length) fail('mais de uma versão corrente detectada após apply');

  return { ok: true, mode: 'APPLY', status: 'APPLIED', remediation_uuid: plan.remediation_uuid };
}

export function runApplyCli(argv = process.argv) {
  const previousArgv = process.argv;
  process.argv = argv;
  try {
    refuseRemote();
    const planPath = arg('--plan');
    const d1Local = arg('--d1-local');
    const dryRun = hasFlag('--dry-run');
    const apply = hasFlag('--apply');
    if (!planPath || !d1Local) fail('uso: --plan --d1-local (--dry-run|--apply)');
    if (dryRun === apply) fail('informe exatamente um de --dry-run ou --apply');
    if (!fs.existsSync(d1Local)) fail('D1 local inexistente');
    const plan = JSON.parse(fs.readFileSync(planPath, 'utf8'));
    const result = applyRemediationPlan({ dbPath: d1Local, plan, dryRun });
    console.log(JSON.stringify(result, null, 2));
    return result;
  } finally {
    process.argv = previousArgv;
  }
}

const isMain = process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1]);
if (isMain) {
  runApplyCli(process.argv);
}
