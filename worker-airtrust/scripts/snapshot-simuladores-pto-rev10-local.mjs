#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

function fail(message) {
  throw new Error(`Snapshot PTO Rev10 recusado: ${message}`);
}

function arg(argv, name) {
  const index = argv.indexOf(name);
  return index >= 0 ? argv[index + 1] : undefined;
}

function refuseRemote(argv) {
  const joined = argv.join(' ').toLowerCase();
  if (
    argv.includes('--remote') ||
    joined.includes('--env production') ||
    joined.includes('--env staging') ||
    joined.includes('remote-d1') ||
    joined.includes('wrangler d1 execute')
  ) {
    fail('indicação de remoto/staging/produção');
  }
}

function sqliteJson(dbPath, sql) {
  const result = spawnSync('sqlite3', ['-json', dbPath], {
    input: `PRAGMA foreign_keys=ON;\n${sql}`,
    encoding: 'utf8',
  });
  if (result.status !== 0) fail(result.stderr || result.stdout || 'falha sqlite');
  const raw = result.stdout.trim();
  return raw ? JSON.parse(raw) : [];
}

function tableExists(dbPath, tableName) {
  const rows = sqliteJson(
    dbPath,
    `SELECT name FROM sqlite_master WHERE type='table' AND name='${String(tableName).replace(/'/g, "''")}'`,
  );
  return rows.length === 1;
}

const FUNCTIONAL_MODEL_CODES = [
  'INST-E01',
  'INST-E02',
  'EXA-E01',
  'EXA-E02',
  'EXA-V01',
  'EXA-V02',
  'EXA-V03',
  'EXA-V04',
  'EXA-01/04',
  'EXA-02/04',
  'EXA-03/04',
  'EXA-04/04',
];

export function collectPtoRev10LocalTenantState(dbPath, empresaId) {
  if (!fs.existsSync(dbPath)) fail('D1 local inexistente');
  if (!Number.isInteger(empresaId) || empresaId <= 0) fail('empresa_id inválido');
  const tenant = sqliteJson(
    dbPath,
    `SELECT id FROM empresas WHERE id=${empresaId} AND deleted_at IS NULL`,
  );
  if (tenant.length !== 1) fail('tenant inexistente');

  const has0440 = [
    'modelos_sessao_versionamento',
    'simuladores_matriz_imports',
    'simuladores_matriz_import_changes',
    'modelos_sessao_manobras_contexto',
  ].every((table) => tableExists(dbPath, table));
  const has0441 = tableExists(dbPath, 'simuladores_matriz_manobra_resolution');
  if (!has0440 || !has0441) fail('migrations 0440/0441 não estão integralmente aplicadas');

  const currentVersions = sqliteJson(
    dbPath,
    `SELECT modelo_id,codigo_canonico,versao_numero,versao_matriz,is_current
       FROM modelos_sessao_versionamento
      WHERE empresa_id=${empresaId} AND is_current=1
      ORDER BY codigo_canonico,modelo_id`,
  );
  const resolvedManoeuvres = sqliteJson(
    dbPath,
    `SELECT id,codigo,empresa_id,nome,categoria,tipo_aeronave,descricao,deleted_at
       FROM manobras
      WHERE empresa_id=${empresaId} AND deleted_at IS NULL
      ORDER BY codigo,id`,
  );
  const links = sqliteJson(
    dbPath,
    `SELECT msm.id,msm.modelo_id,msm.manobra_id,msm.ordem,msm.deleted_at
       FROM modelos_sessao_manobras msm
       JOIN modelos_sessao ms ON ms.id=msm.modelo_id
      WHERE ms.empresa_id=${empresaId}
      ORDER BY msm.id`,
  );
  const activeAircraftModels = sqliteJson(
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
  );
  if (activeAircraftModels.length === 0) fail('tenant sem catálogo ativo AW139/S-76');
  const functionalCodesSql = FUNCTIONAL_MODEL_CODES.map((code) => `'${code}'`).join(',');
  const activeFunctionalModels = sqliteJson(
    dbPath,
    `SELECT ms.id,
            ms.codigo,
            COALESCE(msv.codigo_canonico,ms.codigo) AS codigo_canonico,
            COALESCE(ms.modelo_aeronave,'') AS modelo_aeronave,
            CASE WHEN msv.is_current=1 THEN 1 ELSE 0 END AS is_current_version
       FROM modelos_sessao ms
       LEFT JOIN modelos_sessao_versionamento msv
         ON msv.modelo_id=ms.id AND msv.empresa_id=ms.empresa_id AND msv.is_current=1
      WHERE ms.empresa_id=${empresaId} AND ms.ativo=1 AND ms.deleted_at IS NULL
        AND (ms.codigo IN (${functionalCodesSql}) OR msv.codigo_canonico IN (${functionalCodesSql}))
      ORDER BY ms.id`,
  );

  return {
    empresa_id: empresaId,
    current_versions: currentVersions,
    resolved_manoeuvres: resolvedManoeuvres,
    all_manoeuvres: resolvedManoeuvres,
    links,
    active_aircraft_models: activeAircraftModels,
    active_functional_models: activeFunctionalModels,
    migration_state: {
      has_0440: has0440,
      has_0441: has0441,
      versionamento_count: Number(
        sqliteJson(
          dbPath,
          `SELECT COUNT(*) AS c FROM modelos_sessao_versionamento WHERE empresa_id=${empresaId}`,
        )[0]?.c || 0,
      ),
    },
    existing_manobra_resolutions: sqliteJson(
      dbPath,
      `SELECT versao_matriz,codigo_canonico,manobra_id,resolution_type,source_hash
         FROM simuladores_matriz_manobra_resolution
        WHERE empresa_id=${empresaId}
        ORDER BY versao_matriz,codigo_canonico`,
    ),
    manobra_resolution_overrides: {},
  };
}

export function runCli(argv = process.argv) {
  refuseRemote(argv);
  const dbPath = arg(argv, '--d1-local');
  const empresaId = Number(arg(argv, '--empresa-id'));
  const out = arg(argv, '--out');
  if (!dbPath || !out) {
    fail('uso: --d1-local <sqlite> --empresa-id <id> --out <tenant-state.json>');
  }
  const state = collectPtoRev10LocalTenantState(dbPath, empresaId);
  fs.mkdirSync(path.dirname(path.resolve(out)), { recursive: true });
  fs.writeFileSync(out, `${JSON.stringify(state, null, 2)}\n`, 'utf8');
  process.stdout.write(
    `${JSON.stringify(
      {
        ok: true,
        mode: 'LOCAL_READ_ONLY',
        out,
        empresa_id: empresaId,
        active_aircraft_models: state.active_aircraft_models.length,
        active_functional_models: state.active_functional_models.length,
        manoeuvres: state.resolved_manoeuvres.length,
        links: state.links.length,
      },
      null,
      2,
    )}\n`,
  );
  return state;
}

const direct = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (direct) runCli(process.argv);
