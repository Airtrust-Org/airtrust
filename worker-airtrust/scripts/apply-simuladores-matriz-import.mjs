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
import {
  validateManoeuvreResolution,
  physicalManoeuvreCode,
} from './lib/matriz-manobra-resolution.mjs';

const REUSE_RESOLUTION_TYPES = new Set(['EXACT_UNIQUE', 'FORMAL_ALIAS', 'LEGACY_EQUIVALENT']);

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

function physicalCode(canonical, versaoMatriz, versaoNumero) {
  return `${canonical}@${versaoMatriz}-V${versaoNumero}`;
}

function resolveStructuredTipo(model) {
  const candidates = [model.tipo_qualificacao_estruturado, model.tipo, model.programa].map((value) =>
    String(value || '')
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .trim()
      .toUpperCase(),
  );
  for (const raw of candidates) {
    if (!raw) continue;
    // Never accept code/title-like tokens (digits, slashes, hyphens).
    if (/[0-9]/.test(raw) || raw.includes('/') || raw.includes('-')) continue;
    if (raw === 'INICIAL' || raw === 'INI') return 'INICIAL';
    if (raw === 'PERIODICO' || raw === 'PER' || raw === 'RECORRENTE') return 'PERIODICO';
    if (raw === 'SEMESTRAL' || raw === 'SEM') return 'SEMESTRAL';
    if (raw === 'CHECK') return 'CHECK';
  }
  fail(`tipo_qualificacao_estruturado ausente/inválido para ${model.codigo}`);
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
  const tx = [];
  tx.push('BEGIN IMMEDIATE;');
  tx.push(`INSERT INTO simuladores_matriz_imports(
      uuid,empresa_id,versao_matriz,schema_version,status,plan_sha256,source_hashes_json,base_fingerprint,expected_counts_json
    ) VALUES (
      '${importUuid.replace(/'/g, "''")}',${empresaId},'${versaoMatriz.replace(/'/g, "''")}',
      ${Number(plan.schema_version || 2)},'DRY_RUN','${plan.plan_sha256}',
      '${JSON.stringify(plan.source_hashes).replace(/'/g, "''")}',
      '${fingerprint.fingerprint}',
      '${JSON.stringify(plan.totals).replace(/'/g, "''")}'
    );`);
  tx.push(
    `UPDATE simuladores_matriz_imports SET status='APPLYING' WHERE uuid='${importUuid.replace(/'/g, "''")}';`,
  );

  const liveFingerprint = loadFingerprint(dbPath, empresaId).fingerprint;
  if (liveFingerprint !== fingerprint.fingerprint) fail('fingerprint mudou antes do apply');

  for (const model of models) {
    const prev = sqliteJson(
      dbPath,
      `SELECT modelo_id, versao_numero, codigo_canonico FROM modelos_sessao_versionamento
       WHERE empresa_id=${empresaId} AND codigo_canonico='${String(model.codigo).replace(/'/g, "''")}' AND is_current=1 LIMIT 1`,
    )[0];
    const nextVersion = prev ? Number(prev.versao_numero) + 1 : 1;
    const codigoFisico = physicalCode(model.codigo, versaoMatriz, nextVersion).replace(/'/g, "''");
    const tipo = resolveStructuredTipo(model);
    tx.push(`INSERT INTO modelos_sessao(codigo,nome,empresa_id,tipo,created_at,updated_at)
      VALUES('${codigoFisico}','${String(model.titulo || model.codigo).replace(/'/g, "''")}',${empresaId},'${tipo}',CURRENT_TIMESTAMP,CURRENT_TIMESTAMP);`);
    tx.push(
      `CREATE TEMP TABLE IF NOT EXISTS _apply_map(codigo TEXT PRIMARY KEY, modelo_id INTEGER, prev_id INTEGER, versao INTEGER);`,
    );
  }

  // Simpler approach for local applicator: execute stepwise in JS with immediate statements inside one BEGIN via sqlite.
  // Rebuild as JS-driven transaction:
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

  // Resolve every canonical manoeuvre code to exactly one tenant-scoped
  // manobra_id *before* any model/link is created: reuse the approved
  // existing_manobra_id for EXACT_UNIQUE/FORMAL_ALIAS/LEGACY_EQUIVALENT, or
  // create the manobra for TRUE_MISSING/COLLISION/CROSS_TENANT_ONLY — unless
  // a prior (rolled-back) import for this same versao_matriz already created
  // and resolved it, in which case that manobra is reused, never duplicated.
  for (const entry of plan.manobra_resolution) {
    const codigoEscaped = entry.codigo_canonico.replace(/'/g, "''");
    if (REUSE_RESOLUTION_TYPES.has(entry.resolution_type)) {
      sql.push(`INSERT OR IGNORE INTO simuladores_matriz_manobra_resolution(
          empresa_id,versao_matriz,codigo_canonico,manobra_id,resolution_type,source_hash,import_uuid
        ) VALUES (
          ${empresaId},'${versaoMatriz.replace(/'/g, "''")}','${codigoEscaped}',
          ${Number(entry.existing_manobra_id)},'${entry.resolution_type}','${entry.source_hash}',
          '${importUuid.replace(/'/g, "''")}'
        );`);
      continue;
    }

    const alreadyResolved = sqliteJson(
      dbPath,
      `SELECT manobra_id FROM simuladores_matriz_manobra_resolution
       WHERE empresa_id=${empresaId} AND versao_matriz='${versaoMatriz.replace(/'/g, "''")}'
         AND codigo_canonico='${codigoEscaped}' LIMIT 1`,
    )[0];
    if (!alreadyResolved) {
      const payload = entry.create_payload;
      const codigoFisico = (
        entry.resolution_type === 'COLLISION'
          ? physicalManoeuvreCode(entry.codigo_canonico, versaoMatriz)
          : entry.codigo_canonico
      ).replace(/'/g, "''");
      const sqlText = (value) => (value == null ? 'NULL' : `'${String(value).replace(/'/g, "''")}'`);
      sql.push(`INSERT INTO manobras(empresa_id,codigo,nome,categoria,tipo_aeronave,created_at,updated_at)
        VALUES(${empresaId},'${codigoFisico}',${sqlText(payload.nome)},${sqlText(payload.categoria)},${sqlText(payload.tipo_aeronave)},CURRENT_TIMESTAMP,CURRENT_TIMESTAMP);`);
      sql.push(`INSERT INTO simuladores_matriz_manobra_resolution(
          empresa_id,versao_matriz,codigo_canonico,manobra_id,resolution_type,source_hash,import_uuid
        )
        SELECT ${empresaId},'${versaoMatriz.replace(/'/g, "''")}','${codigoEscaped}',id,'${entry.resolution_type}','${entry.source_hash}','${importUuid.replace(/'/g, "''")}'
        FROM manobras WHERE codigo='${codigoFisico}' AND empresa_id=${empresaId} AND deleted_at IS NULL;`);
      sql.push(`INSERT INTO simuladores_matriz_import_changes(import_id,entidade,entity_id,operacao,after_json)
        SELECT imp.id, 'manobras', m.id, 'INSERT', json_object('codigo_canonico', '${codigoEscaped}', 'resolution_type', '${entry.resolution_type}')
        FROM manobras m
        JOIN simuladores_matriz_imports imp ON imp.uuid='${importUuid.replace(/'/g, "''")}'
        WHERE m.codigo='${codigoFisico}' AND m.empresa_id=${empresaId} AND m.deleted_at IS NULL;`);
    }
  }

  // Precompute next ids using max+offset in-SQL through a staging table.
  sql.push(`CREATE TEMP TABLE _matriz_apply_models(
    codigo_canonico TEXT PRIMARY KEY,
    codigo_fisico TEXT NOT NULL,
    nome TEXT NOT NULL,
    tipo TEXT NOT NULL,
    prev_id INTEGER,
    versao_numero INTEGER NOT NULL
  );`);

  for (const model of models) {
    // The highest versao_numero ever recorded for this code — not just the
    // current one — is the real predecessor: a code can have no *current*
    // version (e.g. compensated after a rollback with no prior history) while
    // a physical row for it still exists, and reusing versao_numero=1 there
    // would collide with that row's still-existing physical codigo.
    const prev = sqliteJson(
      dbPath,
      `SELECT modelo_id, versao_numero FROM modelos_sessao_versionamento
       WHERE empresa_id=${empresaId} AND codigo_canonico='${String(model.codigo).replace(/'/g, "''")}'
       ORDER BY versao_numero DESC LIMIT 1`,
    )[0];
    const versaoNumero = prev ? Number(prev.versao_numero) + 1 : 1;
    const codigoFisico = physicalCode(model.codigo, versaoMatriz, versaoNumero);
    const tipo = resolveStructuredTipo(model);
    sql.push(`INSERT INTO _matriz_apply_models VALUES(
      '${String(model.codigo).replace(/'/g, "''")}',
      '${codigoFisico.replace(/'/g, "''")}',
      '${String(model.titulo || model.codigo).replace(/'/g, "''")}',
      '${tipo}',
      ${prev ? Number(prev.modelo_id) : 'NULL'},
      ${versaoNumero}
    );`);
  }

  sql.push(`INSERT INTO modelos_sessao(codigo,nome,empresa_id,tipo,created_at,updated_at)
    SELECT codigo_fisico,nome,${empresaId},tipo,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP FROM _matriz_apply_models;`);

  sql.push(`CREATE TEMP TABLE _matriz_apply_ids AS
    SELECT m.codigo_canonico, ms.id AS modelo_id, m.prev_id, m.versao_numero, m.tipo
    FROM _matriz_apply_models m
    JOIN modelos_sessao ms ON ms.codigo = m.codigo_fisico AND ms.empresa_id=${empresaId};`);

  // Resolve manoeuvre ids by code for tenant
  sql.push(`CREATE TEMP TABLE _matriz_apply_links(
    codigo_canonico TEXT, ordem INTEGER, manobra_codigo TEXT, execucao_pf TEXT,
    fase_voo TEXT, tipo_conteudo TEXT, nome TEXT
  );`);
  for (const item of items) {
    sql.push(`INSERT INTO _matriz_apply_links VALUES(
      '${String(item.modelo).replace(/'/g, "''")}',
      ${Number(item.ordem)},
      '${String(item.codigo).replace(/'/g, "''")}',
      '${String(item.execucao_pf || 'AB').replace(/'/g, "''")}',
      '${String(item.fase_voo || '').replace(/'/g, "''")}',
      '${String(item.tipo_conteudo || '').replace(/'/g, "''")}',
      '${String(item.nome || '').replace(/'/g, "''")}'
    );`);
  }

  sql.push(`INSERT INTO modelos_sessao_manobras(modelo_id,manobra_id,ordem,obrigatoria,tripulante,observacoes,created_at,updated_at)
    SELECT i.modelo_id, r.manobra_id, l.ordem, 1,
      CASE WHEN upper(l.execucao_pf) LIKE '%B%' AND upper(l.execucao_pf) NOT LIKE '%A%B%' AND upper(l.execucao_pf) NOT LIKE 'AB' THEN 'B'
           WHEN upper(l.execucao_pf) LIKE '%A%' AND upper(l.execucao_pf) NOT LIKE 'AB' THEN 'A'
           ELSE 'AB' END,
      NULL, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
    FROM _matriz_apply_links l
    JOIN _matriz_apply_ids i ON i.codigo_canonico = l.codigo_canonico
    JOIN simuladores_matriz_manobra_resolution r
      ON r.empresa_id=${empresaId} AND r.versao_matriz='${versaoMatriz.replace(/'/g, "''")}' AND r.codigo_canonico = l.manobra_codigo
    JOIN manobras man ON man.id = r.manobra_id AND man.empresa_id=${empresaId} AND man.deleted_at IS NULL;`);

  sql.push(`INSERT INTO modelos_sessao_manobras_contexto(modelo_manobra_id,empresa_id,metadados_json)
    SELECT msm.id, ${empresaId},
      json_object(
        'fase_voo', l.fase_voo,
        'tipo_conteudo', l.tipo_conteudo,
        'execucao_pf', l.execucao_pf,
        'nome', l.nome,
        'codigo_manobra', l.manobra_codigo
      )
    FROM modelos_sessao_manobras msm
    JOIN _matriz_apply_ids i ON i.modelo_id = msm.modelo_id
    JOIN _matriz_apply_links l ON l.codigo_canonico = i.codigo_canonico AND l.ordem = msm.ordem;`);

  sql.push(`UPDATE modelos_sessao_versionamento
    SET is_current=0, efetivo_ate=CURRENT_TIMESTAMP
    WHERE empresa_id=${empresaId} AND is_current=1
      AND codigo_canonico IN (SELECT codigo_canonico FROM _matriz_apply_ids)
      AND modelo_id IN (SELECT prev_id FROM _matriz_apply_ids WHERE prev_id IS NOT NULL);`);

  sql.push(`INSERT INTO modelos_sessao_versionamento(
      modelo_id,empresa_id,codigo_canonico,versao_numero,versao_matriz,is_current,modelo_anterior_id,efetivo_em,efetivo_ate
    )
    SELECT modelo_id,${empresaId},codigo_canonico,versao_numero,'${versaoMatriz.replace(/'/g, "''")}',1,prev_id,CURRENT_TIMESTAMP,NULL
    FROM _matriz_apply_ids;`);

  sql.push(`INSERT INTO simuladores_matriz_import_changes(import_id,entidade,entity_id,operacao,after_json)
    SELECT imp.id, 'modelos_sessao', i.modelo_id, 'INSERT', json_object('codigo_canonico', i.codigo_canonico, 'versao', i.versao_numero)
    FROM _matriz_apply_ids i
    JOIN simuladores_matriz_imports imp ON imp.uuid='${importUuid.replace(/'/g, "''")}';`);

  sql.push(`INSERT INTO simuladores_matriz_import_changes(import_id,entidade,entity_id,operacao,after_json)
    SELECT imp.id, 'modelos_sessao_versionamento', i.prev_id, 'INACTIVATE', json_object('codigo_canonico', i.codigo_canonico)
    FROM _matriz_apply_ids i
    JOIN simuladores_matriz_imports imp ON imp.uuid='${importUuid.replace(/'/g, "''")}'
    WHERE i.prev_id IS NOT NULL;`);

  sql.push(`UPDATE simuladores_matriz_imports
    SET status='APPLIED', applied_at=CURRENT_TIMESTAMP,
        applied_counts_json='${JSON.stringify({ modelos: 51, vinculos: 918, loft: 22 }).replace(/'/g, "''")}'
    WHERE uuid='${importUuid.replace(/'/g, "''")}';`);
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
