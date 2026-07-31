#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

import { buildTenantFingerprint } from './lib/matriz-base-fingerprint.mjs';
import { REUSE_RESOLUTION_TYPES, buildResolutionStatements } from './lib/matriz-apply-core.mjs';
import { assertPtoRev10Plan, sha256 } from './lib/simuladores-pto-rev10-plan.mjs';
import { buildPtoRev10ModelAndLinkStatements } from './lib/simuladores-pto-rev10-apply-core.mjs';

const APPLY_CONFIRMATION = 'APLICAR_PTO_REV10_LOCAL';

function fail(message) {
  throw new Error(`Aplicação PTO Rev10 recusada: ${message}`);
}

function arg(argv, name) {
  const index = argv.indexOf(name);
  return index >= 0 ? argv[index + 1] : undefined;
}

function hasFlag(argv, name) {
  return argv.includes(name);
}

function refuseRemote(argv) {
  const joined = argv.join(' ').toLowerCase();
  if (
    hasFlag(argv, '--remote') ||
    joined.includes('--env production') ||
    joined.includes('--env staging') ||
    joined.includes('remote-d1') ||
    joined.includes('wrangler d1 execute')
  ) {
    fail('indicação de remoto/staging/produção');
  }
}

function esc(value) {
  return String(value).replace(/'/g, "''");
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
  const result = spawnSync('sqlite3', ['-json', dbPath], {
    input: `PRAGMA foreign_keys=ON;\n${sql}`,
    encoding: 'utf8',
  });
  if (result.status !== 0) fail(result.stderr || result.stdout || 'falha sqlite json');
  const raw = result.stdout.trim();
  return raw ? JSON.parse(raw) : [];
}

function assertRequiredSchema(dbPath) {
  const required = [
    'modelos_sessao_versionamento',
    'simuladores_matriz_imports',
    'simuladores_matriz_import_changes',
    'simuladores_matriz_manobra_resolution',
    'modelos_sessao_manobras_contexto',
  ];
  const quoted = required.map((name) => `'${name}'`).join(',');
  const rows = sqliteJson(
    dbPath,
    `SELECT name FROM sqlite_master WHERE type='table' AND name IN (${quoted})`,
  );
  const found = new Set(rows.map((row) => row.name));
  const missing = required.filter((name) => !found.has(name));
  if (missing.length) fail(`schema incompleto: ${missing.join(', ')}`);
}

function loadActiveAircraftModels(dbPath, empresaId) {
  return sqliteJson(
    dbPath,
    `SELECT ms.id,
            ms.codigo,
            COALESCE(msv.codigo_canonico,ms.codigo) AS codigo_canonico,
            CASE
              WHEN upper(COALESCE(ms.modelo_aeronave,'')) IN ('S76','SK76') THEN 'SK76'
              ELSE upper(COALESCE(ms.modelo_aeronave,''))
            END AS modelo_aeronave,
            CASE WHEN msv.is_current=1 THEN 1 ELSE 0 END AS is_current_version
       FROM modelos_sessao ms
       LEFT JOIN modelos_sessao_versionamento msv
         ON msv.modelo_id=ms.id AND msv.empresa_id=ms.empresa_id AND msv.is_current=1
      WHERE ms.empresa_id=${empresaId} AND ms.ativo=1 AND ms.deleted_at IS NULL
        AND upper(COALESCE(ms.modelo_aeronave,'')) IN ('AW139','S76','SK76')
      ORDER BY ms.id`,
  ).map((row) => ({
    id: Number(row.id),
    codigo: String(row.codigo || '').trim(),
    codigo_canonico: String(row.codigo_canonico || row.codigo || '').trim(),
    modelo_aeronave: String(row.modelo_aeronave || '').trim(),
    is_current_version: Number(row.is_current_version || 0) === 1,
  }));
}

export function loadPtoRev10Fingerprint(dbPath, empresaId) {
  const currentVersions = sqliteJson(
    dbPath,
    `SELECT modelo_id,codigo_canonico,versao_numero,versao_matriz,is_current
       FROM modelos_sessao_versionamento
      WHERE empresa_id=${empresaId} AND is_current=1
      ORDER BY codigo_canonico`,
  );
  const resolvedManoeuvres = sqliteJson(
    dbPath,
    `SELECT id,codigo,empresa_id FROM manobras
      WHERE empresa_id=${empresaId} AND deleted_at IS NULL ORDER BY id`,
  );
  const links = sqliteJson(
    dbPath,
    `SELECT msm.id,msm.modelo_id,msm.manobra_id,msm.ordem,msm.deleted_at
       FROM modelos_sessao_manobras msm
       JOIN modelos_sessao ms ON ms.id=msm.modelo_id
      WHERE ms.empresa_id=${empresaId}
      ORDER BY msm.id`,
  );
  const migrationState = {
    has_0440: true,
    versionamento_count: Number(
      sqliteJson(
        dbPath,
        `SELECT COUNT(*) AS c FROM modelos_sessao_versionamento WHERE empresa_id=${empresaId}`,
      )[0]?.c || 0,
    ),
  };
  return buildTenantFingerprint({
    empresaId,
    currentVersions,
    resolvedManoeuvres,
    links,
    migrationState,
  });
}

function validateReuseOwnership(dbPath, plan, empresaId) {
  for (const entry of plan.manobra_resolution) {
    if (!REUSE_RESOLUTION_TYPES.has(entry.resolution_type)) continue;
    const rows = sqliteJson(
      dbPath,
      `SELECT id FROM manobras
        WHERE id=${Number(entry.existing_manobra_id)}
          AND empresa_id=${empresaId} AND deleted_at IS NULL`,
    );
    if (rows.length !== 1) {
      fail(`${entry.codigo_canonico}: manobra reutilizada não pertence ao tenant`);
    }
  }
}

function gatherResolutionState(dbPath, plan, empresaId) {
  const version = esc(plan.versao_matriz);
  const existingRows = sqliteJson(
    dbPath,
    `SELECT codigo_canonico,manobra_id,resolution_type,source_hash
       FROM simuladores_matriz_manobra_resolution
      WHERE empresa_id=${empresaId} AND versao_matriz='${version}'`,
  );
  const manobraRows = sqliteJson(
    dbPath,
    `SELECT id,codigo,empresa_id,nome,categoria,tipo_aeronave,descricao,deleted_at
       FROM manobras WHERE empresa_id=${empresaId}`,
  );
  return {
    existingResolutionByCode: new Map(existingRows.map((row) => [row.codigo_canonico, row])),
    manobraById: new Map(manobraRows.map((row) => [Number(row.id), row])),
  };
}

function gatherMaxVersions(dbPath, empresaId) {
  const rows = sqliteJson(
    dbPath,
    `SELECT codigo_canonico,modelo_id,versao_numero
       FROM modelos_sessao_versionamento
      WHERE empresa_id=${empresaId}`,
  );
  const result = new Map();
  for (const row of rows) {
    const current = result.get(row.codigo_canonico);
    if (!current || Number(row.versao_numero) > Number(current.versao_numero)) {
      result.set(row.codigo_canonico, row);
    }
  }
  return result;
}

function codesSql(values) {
  return [...values].map((value) => `'${esc(value)}'`).join(',');
}

function assertPostconditions(dbPath, plan, empresaId) {
  const canonicalCodes = plan.models.map((model) => model.codigo);
  const codeList = codesSql(canonicalCodes);
  const currentCount = Number(
    sqliteJson(
      dbPath,
      `SELECT COUNT(*) AS c FROM modelos_sessao_versionamento
        WHERE empresa_id=${empresaId} AND is_current=1
          AND codigo_canonico IN (${codeList})`,
    )[0]?.c || 0,
  );
  if (currentCount !== plan.totals.models) {
    fail(
      `pós-condição: esperados ${plan.totals.models} modelos correntes; encontrados ${currentCount}`,
    );
  }

  const invalidLinkCounts = sqliteJson(
    dbPath,
    `SELECT msv.codigo_canonico,COUNT(msm.id) AS c
       FROM modelos_sessao_versionamento msv
       JOIN modelos_sessao_manobras msm
         ON msm.modelo_id=msv.modelo_id AND msm.deleted_at IS NULL
      WHERE msv.empresa_id=${empresaId} AND msv.is_current=1
        AND msv.codigo_canonico IN (${codeList})
      GROUP BY msv.codigo_canonico HAVING COUNT(msm.id)<>18`,
  );
  if (invalidLinkCounts.length) fail('pós-condição: modelo corrente sem 18 vínculos técnicos');

  const resolutionCount = Number(
    sqliteJson(
      dbPath,
      `SELECT COUNT(*) AS c FROM simuladores_matriz_manobra_resolution
        WHERE empresa_id=${empresaId} AND versao_matriz='${esc(plan.versao_matriz)}'`,
    )[0]?.c || 0,
  );
  if (resolutionCount !== plan.manobra_resolution.length) {
    fail('pós-condição: resolução de manobras incompleta');
  }

  const crossTenant = sqliteJson(
    dbPath,
    `SELECT r.codigo_canonico
       FROM simuladores_matriz_manobra_resolution r
       JOIN manobras m ON m.id=r.manobra_id
      WHERE r.empresa_id=${empresaId} AND r.versao_matriz='${esc(plan.versao_matriz)}'
        AND m.empresa_id<>${empresaId}`,
  );
  if (crossTenant.length) fail('pós-condição: vínculo de manobra entre tenants');

  if (plan.superseded_models.length > 0) {
    const ids = plan.superseded_models.map((row) => Number(row.id)).join(',');
    const remaining = sqliteJson(
      dbPath,
      `SELECT id FROM modelos_sessao
        WHERE empresa_id=${empresaId} AND id IN (${ids}) AND ativo=1 AND deleted_at IS NULL`,
    );
    if (remaining.length) fail('pós-condição: modelo substituído permaneceu ativo');
  }
}

export function applyPtoRev10Plan({ dbPath, plan, importUuid, dryRun, confirmation }) {
  assertRequiredSchema(dbPath);
  assertPtoRev10Plan(plan);
  const empresaId = Number(plan.empresa_id);
  const tenant = sqliteJson(dbPath, `SELECT id FROM empresas WHERE id=${empresaId}`);
  if (tenant.length !== 1) fail('tenant inexistente');

  const fingerprint = loadPtoRev10Fingerprint(dbPath, empresaId);
  if (fingerprint.fingerprint !== plan.base_fingerprint) fail('fingerprint divergente');
  const activeAircraftModels = loadActiveAircraftModels(dbPath, empresaId);
  if (sha256(activeAircraftModels) !== plan.catalog_fingerprint) {
    fail('catálogo ativo AW139/S-76 divergiu do plano');
  }
  validateReuseOwnership(dbPath, plan, empresaId);

  if (dryRun) {
    return {
      ok: true,
      mode: 'DRY_RUN_READ_ONLY',
      empresa_id: empresaId,
      fingerprint: fingerprint.fingerprint,
      plan_sha256: plan.plan_sha256,
      totals: plan.totals,
      unique_manoeuvres: plan.manobra_resolution.length,
    };
  }
  if (confirmation !== APPLY_CONFIRMATION) fail('confirmação explícita de apply local ausente');

  const existingImport = sqliteJson(
    dbPath,
    `SELECT uuid,status,plan_sha256 FROM simuladores_matriz_imports WHERE uuid='${esc(importUuid)}'`,
  )[0];
  if (existingImport?.status === 'APPLIED' && existingImport.plan_sha256 === plan.plan_sha256) {
    return { ok: true, idempotent: true, status: 'APPLIED' };
  }
  if (existingImport) fail('import-uuid já utilizado');

  const { existingResolutionByCode, manobraById } = gatherResolutionState(
    dbPath,
    plan,
    empresaId,
  );
  const maxVersionByCode = gatherMaxVersions(dbPath, empresaId);
  const resolutionStatements = buildResolutionStatements({
    plan,
    empresaId,
    versaoMatriz: plan.versao_matriz,
    importUuid,
    fail,
    existingResolutionByCode,
    manobraById,
  });
  const { statements: modelStatements } = buildPtoRev10ModelAndLinkStatements({
    plan,
    empresaId,
    importUuid,
    maxVersionByCode,
  });
  const supersededIds = plan.superseded_models.map((row) => Number(row.id));
  const supersededStatements =
    supersededIds.length === 0
      ? []
      : [
          `UPDATE modelos_sessao_versionamento
              SET is_current=0,efetivo_ate=CURRENT_TIMESTAMP
            WHERE empresa_id=${empresaId} AND is_current=1
              AND modelo_id IN (${supersededIds.join(',')});`,
          `UPDATE modelos_sessao SET ativo=0,updated_at=CURRENT_TIMESTAMP
            WHERE empresa_id=${empresaId} AND id IN (${supersededIds.join(',')})
              AND ativo=1 AND deleted_at IS NULL;`,
        ];

  const sql = [
    'BEGIN IMMEDIATE;',
    `INSERT INTO simuladores_matriz_imports(
       uuid,empresa_id,versao_matriz,schema_version,status,plan_sha256,source_hashes_json,base_fingerprint,expected_counts_json
     ) VALUES(
       '${esc(importUuid)}',${empresaId},'${esc(plan.versao_matriz)}',${Number(plan.schema_version)},'DRY_RUN','${esc(plan.plan_sha256)}','${esc(JSON.stringify(plan.source_hashes))}','${esc(plan.base_fingerprint)}','${esc(JSON.stringify(plan.totals))}'
     );`,
    `UPDATE simuladores_matriz_imports SET status='APPLYING'
      WHERE uuid='${esc(importUuid)}' AND status='DRY_RUN';`,
    ...resolutionStatements,
    ...supersededStatements,
    ...modelStatements,
    `UPDATE simuladores_matriz_imports
        SET status='APPLIED',
            applied_at=CURRENT_TIMESTAMP,
            applied_counts_json='${esc(
              JSON.stringify({
                ...plan.totals,
                unique_manoeuvres: plan.manobra_resolution.length,
              }),
            )}'
      WHERE uuid='${esc(importUuid)}' AND status='APPLYING';`,
    'COMMIT;',
  ];

  try {
    sqlite(dbPath, sql.join('\n'));
  } catch (error) {
    spawnSync('sqlite3', [dbPath], { input: 'ROLLBACK;', encoding: 'utf8' });
    throw error;
  }
  assertPostconditions(dbPath, plan, empresaId);
  return {
    ok: true,
    mode: 'APPLY_LOCAL',
    status: 'APPLIED',
    empresa_id: empresaId,
    plan_sha256: plan.plan_sha256,
    import_uuid: importUuid,
  };
}

export function runCli(argv = process.argv) {
  refuseRemote(argv);
  const planPath = arg(argv, '--plan');
  const dbPath = arg(argv, '--d1-local');
  const importUuid = arg(argv, '--import-uuid');
  const dryRun = hasFlag(argv, '--dry-run');
  const apply = hasFlag(argv, '--apply');
  const confirmation = arg(argv, '--confirm');
  if (!planPath || !dbPath || !importUuid || dryRun === apply) {
    fail(
      'uso: --plan <json> --d1-local <sqlite> --import-uuid <uuid> (--dry-run|--apply --confirm APLICAR_PTO_REV10_LOCAL)',
    );
  }
  if (!fs.existsSync(planPath)) fail('plano inexistente');
  if (!fs.existsSync(dbPath)) fail('D1 local inexistente');
  const plan = JSON.parse(fs.readFileSync(planPath, 'utf8'));
  const result = applyPtoRev10Plan({ dbPath, plan, importUuid, dryRun, confirmation });
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  return result;
}

const direct = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (direct) runCli(process.argv);
