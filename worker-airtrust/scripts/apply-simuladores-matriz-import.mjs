#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import {
  createDeterministicPlan,
  sha256,
  assertPlanIntegrity,
  EXPECTED_SOURCE_HASH_COUNT,
} from './lib/matriz-import-plan.mjs';
import {
  defaultContractPath,
  loadSessionContract,
  validateSessionContract,
} from './lib/matriz-session-contract.mjs';
import { buildTenantFingerprint } from './lib/matriz-base-fingerprint.mjs';
import { validateManoeuvreResolution } from './lib/matriz-manobra-resolution.mjs';
import {
  REUSE_RESOLUTION_TYPES,
  buildResolutionStatements,
  buildModelAndLinkStatements,
} from './lib/matriz-apply-core.mjs';

function fail(message) {
  throw new Error(`Aplicação de matriz recusada: ${message}`);
}
function arg(name) {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : undefined;
}
function hasFlag(name) {
  return process.argv.includes(name);
}
function refuseRemote() {
  const joined = process.argv.join(' ').toLowerCase();
  if (
    hasFlag('--remote') ||
    joined.includes('--env production') ||
    joined.includes('--env staging') ||
    joined.includes('remote-d1')
  ) {
    fail('indicação de remoto/staging/produção');
  }
}

function sqlite(dbPath, sql) {
  const result = spawnSync('sqlite3', ['-bail', dbPath], {
    input: `PRAGMA foreign_keys=ON;\nPRAGMA recursive_triggers=OFF;\n${sql}`,
    encoding: 'utf8',
  });
  if (result.status !== 0) fail(result.stderr || result.stdout || 'falha sqlite');
  return result.stdout.trim();
}

function sqliteJson(dbPath, sql) {
  const raw = spawnSync('sqlite3', ['-json', dbPath], {
    input: `PRAGMA foreign_keys=ON;\n${sql}`,
    encoding: 'utf8',
  });
  if (raw.status !== 0) fail(raw.stderr || raw.stdout || 'falha sqlite json');
  const trimmed = raw.stdout.trim();
  return trimmed ? JSON.parse(trimmed) : [];
}

function assert0440(dbPath) {
  const rows = sqliteJson(
    dbPath,
    "SELECT name FROM sqlite_master WHERE type='table' AND name='modelos_sessao_versionamento'",
  );
  if (!rows.length) fail('migration 0440 não aplicada');
}

export function loadFingerprint(dbPath, empresaId) {
  const currentVersions = sqliteJson(
    dbPath,
    `SELECT modelo_id, codigo_canonico, versao_numero, versao_matriz, is_current
     FROM modelos_sessao_versionamento WHERE empresa_id=${Number(empresaId)} AND is_current=1 ORDER BY codigo_canonico`,
  );
  const manobras = sqliteJson(
    dbPath,
    `SELECT id, codigo, empresa_id FROM manobras WHERE empresa_id=${Number(empresaId)} AND deleted_at IS NULL`,
  );
  const links = sqliteJson(
    dbPath,
    `SELECT msm.id, msm.modelo_id, msm.manobra_id, msm.ordem, msm.deleted_at
     FROM modelos_sessao_manobras msm
     JOIN modelos_sessao ms ON ms.id = msm.modelo_id
     WHERE ms.empresa_id=${Number(empresaId)}`,
  );
  const migrationState = {
    has_0440: true,
    versionamento_count:
      sqliteJson(
        dbPath,
        `SELECT COUNT(*) AS c FROM modelos_sessao_versionamento WHERE empresa_id=${Number(empresaId)}`,
      )[0]?.c || 0,
  };
  return buildTenantFingerprint({
    empresaId: Number(empresaId),
    currentVersions,
    resolvedManoeuvres: manobras,
    links,
    migrationState,
  });
}

export function applyPlan({ dbPath, plan, importUuid, dryRun }) {
  assert0440(dbPath);
  const empresaId = Number(plan.empresa_id);
  const tenant = sqliteJson(dbPath, `SELECT id FROM empresas WHERE id=${empresaId}`);
  if (!tenant.length) fail('tenant inválido');

  const existing = sqliteJson(
    dbPath,
    `SELECT uuid,status,plan_sha256 FROM simuladores_matriz_imports WHERE uuid='${importUuid.replace(/'/g, "''")}'`,
  );
  if (existing[0]?.status === 'APPLIED' && existing[0]?.plan_sha256 === plan.plan_sha256) {
    return { ok: true, idempotent: true, status: 'APPLIED' };
  }
  if (existing[0] && existing[0].plan_sha256 !== plan.plan_sha256) {
    fail('UUID de importação já usado com plan_sha256 diferente');
  }
  if (existing[0]?.status === 'ROLLED_BACK') {
    fail('UUID já compensado; use novo import-uuid para reapply');
  }
  if (existing[0]?.status === 'FAILED') {
    fail('UUID em FAILED; use novo import-uuid');
  }

  const fingerprint = loadFingerprint(dbPath, empresaId);
  if (plan.base_fingerprint && plan.base_fingerprint !== fingerprint.fingerprint)
    fail('fingerprint divergente');
  assertPlanIntegrity(plan, {
    sourceHashes: plan.source_hashes,
    baseFingerprint: plan.base_fingerprint,
  });

  if (Object.keys(plan.source_hashes || {}).length !== EXPECTED_SOURCE_HASH_COUNT)
    fail('61 hashes');
  if (plan.totals?.modelos !== 51 || plan.totals?.vinculos !== 918 || plan.totals?.loft !== 22)
    fail('51/918/22');

  const models = [...(plan.matrices?.AW139?.models || []), ...(plan.matrices?.SK76?.models || [])];
  const items = [...(plan.matrices?.AW139?.items || []), ...(plan.matrices?.SK76?.items || [])];
  if (models.length !== 51 || items.length !== 918) fail('contagens do plano');
  const requestedCodes = [...new Set(items.map((item) => String(item.codigo || '')))];
  validateManoeuvreResolution(plan.manobra_resolution, { requestedCodes });
  for (const entry of plan.manobra_resolution) {
    if (!REUSE_RESOLUTION_TYPES.has(entry.resolution_type)) continue;
    const owned = sqliteJson(
      dbPath,
      `SELECT id FROM manobras WHERE id=${Number(entry.existing_manobra_id)} AND empresa_id=${empresaId} AND deleted_at IS NULL`,
    );
    if (!owned.length)
      fail(`${entry.codigo_canonico}: manobra_id ${entry.existing_manobra_id} não pertence ao tenant ou está inativa`);
  }

  if (dryRun) {
    const before = fingerprint.fingerprint;
    const after = loadFingerprint(dbPath, empresaId).fingerprint;
    if (before !== after) fail('versão corrente alterada após dry-run');
    sqlite(
      dbPath,
      `INSERT OR IGNORE INTO simuladores_matriz_imports(
        uuid,empresa_id,versao_matriz,schema_version,status,plan_sha256,source_hashes_json,base_fingerprint,expected_counts_json
      ) VALUES (
        '${importUuid.replace(/'/g, "''")}',${empresaId},'${String(plan.versao_matriz || 'M2026.07').replace(/'/g, "''")}',
        ${Number(plan.schema_version || 2)},'DRY_RUN','${plan.plan_sha256}',
        '${JSON.stringify(plan.source_hashes).replace(/'/g, "''")}',
        '${fingerprint.fingerprint}',
        '${JSON.stringify(plan.totals).replace(/'/g, "''")}'
      );`,
    );
    return { ok: true, mode: 'DRY_RUN', fingerprint: fingerprint.fingerprint };
  }

  const versaoMatriz = String(plan.versao_matriz || 'M2026.07');

  const liveFingerprint = loadFingerprint(dbPath, empresaId).fingerprint;
  if (liveFingerprint !== fingerprint.fingerprint) fail('fingerprint mudou antes do apply');

  return applyPlanJs({
    dbPath,
    plan,
    importUuid,
    empresaId,
    versaoMatriz,
    fingerprint,
    models,
    items,
    existingRow: existing[0] || null,
  });
}

function applyPlanJs({
  dbPath,
  plan,
  importUuid,
  empresaId,
  versaoMatriz,
  fingerprint,
  models,
  items,
  existingRow,
}) {
  const sql = [];
  sql.push('BEGIN IMMEDIATE;');
  if (existingRow) {
    sql.push(
      `UPDATE simuladores_matriz_imports SET status='APPLYING', failure_reason=NULL
       WHERE uuid='${importUuid.replace(/'/g, "''")}' AND status IN ('DRY_RUN','APPLYING');`,
    );
  } else {
    sql.push(`INSERT INTO simuladores_matriz_imports(
        uuid,empresa_id,versao_matriz,schema_version,status,plan_sha256,source_hashes_json,base_fingerprint,expected_counts_json
      ) VALUES (
        '${importUuid.replace(/'/g, "''")}',${empresaId},'${versaoMatriz.replace(/'/g, "''")}',
        ${Number(plan.schema_version || 2)},'DRY_RUN','${plan.plan_sha256}',
        '${JSON.stringify(plan.source_hashes).replace(/'/g, "''")}',
        '${fingerprint.fingerprint}',
        '${JSON.stringify(plan.totals).replace(/'/g, "''")}'
      );`);
    sql.push(
      `UPDATE simuladores_matriz_imports SET status='APPLYING' WHERE uuid='${importUuid.replace(/'/g, "''")}';`,
    );
  }

  // Gather phase: every read this apply needs, fetched up front as plain
  // lookups, so the actual statement generation (matriz-apply-core.mjs) is a
  // pure function shared verbatim with the D1-backed production executor —
  // the two can never silently drift apart because they run the same code.
  const existingResolutionRows = sqliteJson(
    dbPath,
    `SELECT codigo_canonico, manobra_id, resolution_type, source_hash FROM simuladores_matriz_manobra_resolution
     WHERE empresa_id=${empresaId} AND versao_matriz='${versaoMatriz.replace(/'/g, "''")}'`,
  );
  const existingResolutionByCode = new Map(existingResolutionRows.map((r) => [r.codigo_canonico, r]));
  const manobraRows = sqliteJson(
    dbPath,
    `SELECT id, codigo, empresa_id, nome, categoria, tipo_aeronave, descricao FROM manobras WHERE empresa_id=${empresaId}`,
  );
  const manobraById = new Map(manobraRows.map((r) => [Number(r.id), r]));

  // Resolve every canonical manoeuvre code to exactly one tenant-scoped
  // manobra_id *before* any model/link is created: reuse the approved
  // existing_manobra_id for EXACT_UNIQUE/FORMAL_ALIAS/LEGACY_EQUIVALENT, or
  // create the manobra for TRUE_MISSING/COLLISION/CROSS_TENANT_ONLY — unless
  // a prior (rolled-back) import for this same versao_matriz already resolved
  // it, in which case that resolution is reused, never duplicated. A prior
  // resolution is reused only after an exact field-by-field match against
  // this plan's entry; any divergence fails the whole apply closed rather
  // than silently keeping (or silently overwriting) the old row.
  sql.push(
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

  const versionamentoRows = sqliteJson(
    dbPath,
    `SELECT codigo_canonico, modelo_id, versao_numero FROM modelos_sessao_versionamento WHERE empresa_id=${empresaId}`,
  );
  const maxVersionByCode = new Map();
  for (const row of versionamentoRows) {
    const current = maxVersionByCode.get(row.codigo_canonico);
    if (!current || Number(row.versao_numero) > Number(current.versao_numero)) {
      maxVersionByCode.set(row.codigo_canonico, row);
    }
  }
  sql.push(
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
  sql.push('COMMIT;');

  try {
    sqlite(dbPath, sql.join('\n'));
  } catch (error) {
    spawnSync('sqlite3', [dbPath], { input: 'ROLLBACK;', encoding: 'utf8' });
    throw error;
  }

  const currents = sqliteJson(
    dbPath,
    `SELECT codigo_canonico, COUNT(*) AS c FROM modelos_sessao_versionamento WHERE empresa_id=${empresaId} AND is_current=1 GROUP BY codigo_canonico HAVING c<>1`,
  );
  if (currents.length) fail('mais de uma versão corrente detectada');

  const requestedCodeCount = new Set(items.map((item) => String(item.codigo || ''))).size;
  const resolutionCount = sqliteJson(
    dbPath,
    `SELECT COUNT(*) AS c FROM simuladores_matriz_manobra_resolution WHERE empresa_id=${empresaId} AND versao_matriz='${versaoMatriz.replace(/'/g, "''")}'`,
  )[0]?.c;
  if (Number(resolutionCount) !== requestedCodeCount) {
    fail(`resolução de manobras incompleta: esperadas ${requestedCodeCount}; encontradas ${resolutionCount}`);
  }
  const resolutionCrossTenant = sqliteJson(
    dbPath,
    `SELECT r.codigo_canonico FROM simuladores_matriz_manobra_resolution r
     JOIN manobras m ON m.id = r.manobra_id
     WHERE r.empresa_id=${empresaId} AND r.versao_matriz='${versaoMatriz.replace(/'/g, "''")}' AND m.empresa_id<>${empresaId}`,
  );
  if (resolutionCrossTenant.length) fail('manobra de outro tenant referenciada na resolução');

  return { ok: true, mode: 'APPLY', status: 'APPLIED', fingerprint: fingerprint.fingerprint };
}

export function runApplyCli(argv = process.argv) {
  const previousArgv = process.argv;
  process.argv = argv;
  try {
    refuseRemote();
    const planPath = arg('--plan');
    const aw139 = arg('--aw139');
    const sk76 = arg('--sk76');
    const empresaId = Number(arg('--empresa-id'));
    const d1Local = arg('--d1-local');
    const importUuid = arg('--import-uuid');
    const dryRun = hasFlag('--dry-run');
    const apply = hasFlag('--apply');
    if (
      !planPath ||
      !aw139 ||
      !sk76 ||
      !Number.isInteger(empresaId) ||
      empresaId <= 0 ||
      !d1Local ||
      !importUuid
    ) {
      fail('uso: --plan --aw139 --sk76 --empresa-id --d1-local --import-uuid (--dry-run|--apply)');
    }
    if (dryRun === apply) fail('informe exatamente um de --dry-run ou --apply');
    if (!fs.existsSync(d1Local)) fail('D1 local inexistente');
    if (!fs.existsSync(aw139) || !fs.existsSync(sk76)) fail('fontes AW139/S-76 ausentes');

    const plan = JSON.parse(fs.readFileSync(planPath, 'utf8'));
    if (Number(plan.empresa_id) !== empresaId) fail('tenant do plano diverge');
    const contract = loadSessionContract(
      defaultContractPath(path.join(path.dirname(fileURLToPath(import.meta.url)), '..')),
    );
    validateSessionContract(contract);

    const result = applyPlan({ dbPath: d1Local, plan, importUuid, dryRun });
    console.log(JSON.stringify(result, null, 2));
    return result;
  } finally {
    process.argv = previousArgv;
  }
}

const isMain =
  process.argv[1] &&
  fileURLToPath(import.meta.url) === path.resolve(process.argv[1]);
if (isMain) {
  runApplyCli(process.argv);
}
