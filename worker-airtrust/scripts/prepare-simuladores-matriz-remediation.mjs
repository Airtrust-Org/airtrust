#!/usr/bin/env node
/**
 * Prepares a tenant-scoped, sanitized remediation plan compensating the
 * LEGACY_EQUIVALENT resolutions that the original matrix import mis-resolved
 * as TRUE_MISSING/COLLISION/CROSS_TENANT_ONLY. The private mapping file
 * (canonical code -> correct legacy manobra code) never carries a production
 * database id: every id used in the plan is resolved live from the local D1
 * copy passed via --d1-local, so this script's own inputs stay free of row
 * identifiers even before the "never commit ids" rule applies to its output.
 *
 * Purely a planner: this command performs no writes. Applying the generated
 * plan is the controlled local D1 procedure (apply-simuladores-matriz-remediation.mjs)
 * or, for a tenant-scoped D1-backed run, the reviewed executor route.
 */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { discoverRemediationTargets } from './lib/matriz-remediation-core.mjs';
import { buildRemediationFingerprint, sealRemediationPlan, REMEDIATION_PLAN_SCHEMA_VERSION } from './lib/matriz-remediation-plan.mjs';
import { buildTenantFingerprint } from './lib/matriz-base-fingerprint.mjs';

function fail(message) {
  throw new Error(`Plano de remediação recusado: ${message}`);
}
function arg(name) {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : undefined;
}
function sqliteJson(dbPath, sql) {
  const raw = spawnSync('sqlite3', ['-json', dbPath], { input: `PRAGMA foreign_keys=ON;\n${sql}`, encoding: 'utf8' });
  if (raw.status !== 0) fail(raw.stderr || raw.stdout || 'falha sqlite json');
  const trimmed = raw.stdout.trim();
  return trimmed ? JSON.parse(trimmed) : [];
}

const d1Local = arg('--d1-local');
const mappingsPath = arg('--mappings');
const empresaId = Number(arg('--empresa-id'));
const versaoMatriz = arg('--versao-matriz') || 'M2026.07';
const out = arg('--out');
const remediationUuid = arg('--remediation-uuid') || crypto.randomUUID();

if (!d1Local || !mappingsPath || !Number.isInteger(empresaId) || empresaId <= 0 || !out) {
  fail('uso: --d1-local <sqlite> --mappings <json privado> --empresa-id <tenant> --out <diretório privado> [--versao-matriz] [--remediation-uuid]');
}
if (empresaId !== 6) fail('esta remediação é autorizada somente para empresa_id=6');
if (!fs.existsSync(d1Local)) fail('D1 local inexistente');
if (!fs.existsSync(mappingsPath)) fail('arquivo de mappings inexistente');
if (path.resolve(out).startsWith(path.resolve(process.cwd()))) {
  // Best-effort guard: refuse an --out inside the working tree, so a plan
  // (which embeds resolved database ids) can never land inside the repo by
  // accident. A caller pointing --out outside the repo entirely is expected.
  const gitRoot = spawnSync('git', ['rev-parse', '--show-toplevel'], { encoding: 'utf8' }).stdout.trim();
  if (gitRoot && path.resolve(out).startsWith(gitRoot)) {
    fail('--out não pode estar dentro do repositório git');
  }
}

const mappings = JSON.parse(fs.readFileSync(mappingsPath, 'utf8'));

const resolutionRows = sqliteJson(
  d1Local,
  `SELECT id,codigo_canonico,manobra_id,resolution_type FROM simuladores_matriz_manobra_resolution WHERE empresa_id=${empresaId} AND versao_matriz='${versaoMatriz.replace(/'/g, "''")}'`,
);
const manobraRows = sqliteJson(d1Local, `SELECT id,codigo,empresa_id,deleted_at FROM manobras WHERE empresa_id=${empresaId}`);
const manobraByCode = new Map(manobraRows.map((r) => [r.codigo, r]));
const manobraById = new Map(manobraRows.map((r) => [r.id, r]));
// Deliberately NOT filtered by versao_matriz: is_current=1 already uniquely
// identifies the one current physical row per codigo_canonico per tenant
// (uq_modelo_canonico_corrente_tenant, migration 0440). A compensatory
// rollback — this remediation's own, or the original matrix import's —
// retags the restored version's versao_matriz as '<...>-COMPENSATE', so
// filtering on the canonical tag here would find nothing after any rollback
// and silently break reapply.
const currentModelRows = sqliteJson(
  d1Local,
  `SELECT v.modelo_id, v.codigo_canonico, ms.codigo AS codigo_fisico, v.versao_numero
   FROM modelos_sessao_versionamento v JOIN modelos_sessao ms ON ms.id = v.modelo_id
   WHERE v.empresa_id=${empresaId} AND v.is_current=1`,
);
const currentModelsByCode = new Map(currentModelRows.map((r) => [r.codigo_canonico, { modelo_id: r.modelo_id, codigo_fisico: r.codigo_fisico }]));
const versaoNumeroByModeloId = new Map(currentModelRows.map((r) => [Number(r.modelo_id), Number(r.versao_numero)]));
const linkRows = sqliteJson(
  d1Local,
  `SELECT msm.id,msm.modelo_id,msm.manobra_id,msm.ordem,msm.obrigatoria,msm.tripulante,msm.observacoes
   FROM modelos_sessao_manobras msm JOIN modelos_sessao ms ON ms.id = msm.modelo_id
   WHERE ms.empresa_id=${empresaId} AND msm.deleted_at IS NULL`,
);
const activeCorrectionCodes = new Set(
  sqliteJson(
    d1Local,
    `SELECT codigo_canonico FROM simuladores_matriz_resolution_corrections WHERE empresa_id=${empresaId} AND versao_matriz='${versaoMatriz.replace(/'/g, "''")}' AND is_current=1`,
  ).map((r) => r.codigo_canonico),
);

const discovered = discoverRemediationTargets({
  empresaId,
  versaoMatriz,
  mappings,
  resolutionRows,
  activeCorrectionCodes,
  manobraByCode,
  manobraById,
  currentModelsByCode,
  linkRows,
});

const affectedModeloIds = discovered.affectedModels.map((m) => m.modelo_id);
const downstreamUsage = sqliteJson(
  d1Local,
  `SELECT
    (SELECT COUNT(*) FROM fichas_sessao WHERE template_id IN (${affectedModeloIds.join(',')})) AS fichas,
    (SELECT COUNT(*) FROM simulador_agendamentos WHERE template_id IN (${affectedModeloIds.join(',')})) AS agendamentos`,
)[0] || { fichas: 0, agendamentos: 0 };

const sourceMatrixImport = sqliteJson(
  d1Local,
  `SELECT uuid FROM simuladores_matriz_imports WHERE empresa_id=${empresaId} AND versao_matriz='${versaoMatriz.replace(/'/g, "''")}' AND status='APPLIED' ORDER BY id DESC LIMIT 1`,
)[0];
if (!sourceMatrixImport) fail('nenhuma importação de matriz APPLIED encontrada para esta versão');
const sourceGuideImport = sqliteJson(
  d1Local,
  `SELECT uuid FROM simuladores_matriz_guia_relink WHERE empresa_id=${empresaId} AND versao_matriz='${versaoMatriz.replace(/'/g, "''")}' AND status='APPLIED' ORDER BY id DESC LIMIT 1`,
)[0];
if (!sourceGuideImport) fail('nenhum relink de guias APPLIED encontrado para esta versão');

const allCurrentVersions = sqliteJson(
  d1Local,
  `SELECT modelo_id, codigo_canonico, versao_numero, versao_matriz, is_current FROM modelos_sessao_versionamento WHERE empresa_id=${empresaId} AND is_current=1 ORDER BY codigo_canonico`,
);
const allManobras = sqliteJson(d1Local, `SELECT id, codigo, empresa_id FROM manobras WHERE empresa_id=${empresaId} AND deleted_at IS NULL`);
const allLinks = sqliteJson(
  d1Local,
  `SELECT msm.id, msm.modelo_id, msm.manobra_id, msm.ordem, msm.deleted_at
   FROM modelos_sessao_manobras msm JOIN modelos_sessao ms ON ms.id = msm.modelo_id WHERE ms.empresa_id=${empresaId}`,
);
const versionamentoCount = sqliteJson(d1Local, `SELECT COUNT(*) AS c FROM modelos_sessao_versionamento WHERE empresa_id=${empresaId}`)[0]?.c || 0;
const baseFingerprint = buildTenantFingerprint({
  empresaId,
  currentVersions: allCurrentVersions,
  resolvedManoeuvres: allManobras,
  links: allLinks,
  migrationState: { has_0440: true, versionamento_count: Number(versionamentoCount) },
}).fingerprint;

const { fingerprint: expectedHash } = buildRemediationFingerprint({
  empresaId,
  versaoMatriz,
  mappingResolutions: discovered.mappingResolutions,
  affectedLinks: discovered.affectedLinks,
});

const modelPhysicalMeta = Object.fromEntries(
  discovered.affectedModels.map((m) => [m.modelo_id, { versaoNumero: versaoNumeroByModeloId.get(m.modelo_id) }]),
);

const plan = sealRemediationPlan({
  schema_version: REMEDIATION_PLAN_SCHEMA_VERSION,
  generated_at: new Date().toISOString(),
  remediation_uuid: remediationUuid,
  remediation_type: 'LEGACY_EQUIVALENT_COMPENSATION',
  empresa_id: empresaId,
  versao_matriz: versaoMatriz,
  source_matrix_import_uuid: sourceMatrixImport.uuid,
  source_guide_import_uuid: sourceGuideImport.uuid,
  base_fingerprint: baseFingerprint,
  expected_hash: expectedHash,
  mapping_count: discovered.mappingResolutions.length,
  model_count: discovered.affectedModels.length,
  link_count: discovered.affectedLinks.length,
  mappings: discovered.mappingResolutions,
  affected_models: discovered.affectedModels.map((m) => ({
    modelo_id: m.modelo_id,
    codigo_canonico: m.codigo_canonico,
    codigo_fisico: m.codigo_fisico,
    affected_link_count: m.affected_links.length,
  })),
  affected_links: discovered.affectedLinks.map((l) => ({ link_id: l.id, modelo_id: l.modelo_id, ordem: l.ordem, manobra_id: l.manobra_id })),
  model_physical_meta: modelPhysicalMeta,
  downstream_usage_baseline: downstreamUsage,
  safeguards: [
    'tenant obrigatório empresa_id=6',
    'somente D1 local neste comando',
    'requer resolução original TRUE_MISSING/COLLISION/CROSS_TENANT_ONLY, nunca reclassifica resolução já reutilizável',
    'resolução histórica original nunca é sobrescrita — overlay append-only',
    'modelos afetados são versionados via COMPENSATE, nunca sobrescritos',
    'rollback compensatório append-only',
  ],
});

fs.mkdirSync(out, { recursive: true });
fs.writeFileSync(path.join(out, `plan-${remediationUuid}.json`), `${JSON.stringify(plan, null, 2)}\n`);
console.log(
  JSON.stringify(
    {
      ok: true,
      out: path.resolve(out, `plan-${remediationUuid}.json`),
      remediation_uuid: remediationUuid,
      empresa_id: empresaId,
      mapping_count: plan.mapping_count,
      model_count: plan.model_count,
      link_count: plan.link_count,
      expected_hash: plan.expected_hash,
      base_fingerprint: plan.base_fingerprint,
      plan_sha256: plan.plan_sha256,
    },
    null,
    2,
  ),
);
