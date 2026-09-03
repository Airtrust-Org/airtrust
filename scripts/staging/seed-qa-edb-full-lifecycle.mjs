#!/usr/bin/env node
// source_reference: PR #110 eDB staging shadow; full synthetic lifecycle QA only.
// operational_decision: write canonical flight/RDV fixtures only when tenant 6 is the reserved synthetic eDB tenant.
// dry_run_required: --apply plus CONFIRM_STAGING_EDB_FULL_LIFECYCLE is required for writes.
// rollback_plan_required: --apply --rollback soft-deletes only exact mutable canonical fixture rows; immutable eDB evidence is never bypassed/deleted.

import { mkdtempSync, rmSync, writeFileSync, writeFileSync as writeManifest } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';

const ALLOWED_D1_NAME = 'airtrust-db-staging-baseline-20260701';
const PILOT_TENANT_ID = 6;
const PILOT_TENANT_CODE = 'edb_pilot_smoke';
const PILOT_EMAIL = 'qa-edb-pilot@staging.airtrust.invalid';
const PILOT_EMPLOYEE_REGISTRATION = 'QA-EDB-PILOT';
const CONFIRMATION = 'AIRTRUST_STAGING_EDB_FULL_LIFECYCLE';
const DEFAULT_MANIFEST = '.qa-edb-full-lifecycle.json';

function sqlString(value) {
  return `'${String(value).replaceAll("'", "''")}'`;
}

function sqlValue(value) {
  if (value && typeof value === 'object' && value.__rawSql) return value.__rawSql;
  if (value === null || value === undefined) return 'NULL';
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) throw new Error('NON_FINITE_SQL_NUMBER');
    return String(value);
  }
  if (typeof value === 'boolean') return value ? '1' : '0';
  return sqlString(value);
}

function rawSql(value) {
  return { __rawSql: value };
}

function targetDb() {
  const value = String(process.env.STAGING_D1_NAME || ALLOWED_D1_NAME).trim();
  if (!value || value !== ALLOWED_D1_NAME || /prod/i.test(value)) {
    throw new Error(`STAGING_D1_REJECTED:${value || 'missing'}`);
  }
  return value;
}

function fixtureId() {
  const value = String(process.env.QA_EDB_FULL_FIXTURE_ID || '').trim().toUpperCase();
  if (!/^QA-EDB-FULL-[A-Z0-9._-]{3,48}$/.test(value)) {
    throw new Error('QA_EDB_FULL_FIXTURE_ID_INVALID');
  }
  return value;
}

function fixtureSuffix(id) {
  return id.replace(/[^A-Z0-9]/g, '').slice(-10).padStart(4, '0');
}

function syncSleep(ms) {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
}

function wrangler(dbName, args) {
  let lastResult = null;
  for (let attempt = 1; attempt <= 4; attempt++) {
    const result = spawnSync('npx', ['wrangler', 'd1', 'execute', dbName, '--remote', ...args, '--json'], {
      cwd: join(process.cwd(), 'worker-airtrust'),
      encoding: 'utf8',
    });
    if (result.status === 0) return result.stdout || '[]';
    lastResult = result;
    const output = `${result.stderr || ''}\n${result.stdout || ''}`;
    const isTransient = /code:\s*7500|internal error|rate limit|fetch failed|econnreset|timeout/i.test(output);
    if (!isTransient || attempt === 4) break;
    const backoffMs = attempt * 1500;
    console.log(`[seed-qa-edb-full-lifecycle] wrangler transient error (attempt ${attempt}/4), retrying in ${backoffMs}ms...`);
    syncSleep(backoffMs);
  }
  throw new Error(lastResult?.stderr || lastResult?.stdout || 'WRANGLER_D1_FAILED');
}

function queryRows(dbName, sql) {
  const parsed = JSON.parse(wrangler(dbName, ['--command', sql]));
  const result = Array.isArray(parsed) ? parsed[0] : parsed;
  return result?.results || [];
}

function queryOne(dbName, sql) {
  return queryRows(dbName, sql)[0] || null;
}

function executeSqlFile(dbName, sql) {
  const dir = mkdtempSync(join(tmpdir(), 'airtrust-edb-full-'));
  const file = join(dir, 'fixture.sql');
  writeFileSync(file, sql, 'utf8');
  try {
    wrangler(dbName, ['--file', file]);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

function tableInfo(dbName, table) {
  const safe = String(table);
  if (!/^[a-z0-9_]+$/i.test(safe)) throw new Error('UNSAFE_TABLE_NAME');
  const rows = queryRows(dbName, `PRAGMA table_info('${safe}');`);
  if (rows.length === 0) throw new Error(`REQUIRED_TABLE_MISSING:${safe}`);
  return rows.map((row) => ({
    name: String(row.name),
    notnull: Number(row.notnull || 0),
    dfltValue: row.dflt_value,
    pk: Number(row.pk || 0),
  }));
}

function buildInsert(dbName, table, candidates) {
  const info = tableInfo(dbName, table);
  const columns = [];
  const values = [];
  for (const column of info) {
    if (Object.prototype.hasOwnProperty.call(candidates, column.name)) {
      columns.push(column.name);
      values.push(sqlValue(candidates[column.name]));
      continue;
    }
    const autoIntegerPk = column.pk > 0 && column.name === 'id';
    const hasDefault = column.dfltValue !== null && column.dfltValue !== undefined;
    if (column.notnull === 1 && !autoIntegerPk && !hasDefault) {
      throw new Error(`QA_SCHEMA_UNSUPPORTED:${table}.${column.name}`);
    }
  }
  if (columns.length === 0) throw new Error(`QA_INSERT_NO_COLUMNS:${table}`);
  return `INSERT INTO ${table} (${columns.join(', ')}) VALUES (${values.join(', ')});`;
}

function strictTenantState(dbName, { allowAbsent }) {
  const rows = queryRows(
    dbName,
    `SELECT id, codigo, ativo, deleted_at FROM empresas WHERE id = ${PILOT_TENANT_ID} OR codigo = ${sqlString(PILOT_TENANT_CODE)} ORDER BY id;`,
  );
  const idRow = rows.find((row) => Number(row.id) === PILOT_TENANT_ID) || null;
  const codeRows = rows.filter((row) => String(row.codigo || '') === PILOT_TENANT_CODE);
  if (!idRow) {
    if (codeRows.length > 0) throw new Error('EDB_FULL_SYNTHETIC_CODE_COLLISION');
    if (allowAbsent) return 'absent';
    throw new Error('EDB_FULL_SYNTHETIC_TENANT_REQUIRED');
  }
  if (String(idRow.codigo || '') !== PILOT_TENANT_CODE) {
    throw new Error('EDB_FULL_TENANT_6_IS_NOT_SYNTHETIC');
  }
  if (codeRows.some((row) => Number(row.id) !== PILOT_TENANT_ID)) {
    throw new Error('EDB_FULL_SYNTHETIC_CODE_COLLISION');
  }
  if (!allowAbsent && (Number(idRow.ativo) !== 1 || idRow.deleted_at !== null)) {
    throw new Error('EDB_FULL_SYNTHETIC_TENANT_NOT_ACTIVE');
  }
  return 'synthetic';
}

function exactActor(dbName) {
  const row = queryOne(
    dbName,
    `SELECT u.id AS user_id, f.id AS employee_id
       FROM usuarios u
       JOIN funcionarios f ON f.id = u.funcionario_id
       JOIN usuarios_empresas ue ON ue.usuario_id = u.id AND ue.empresa_id = ${PILOT_TENANT_ID}
      WHERE lower(trim(u.email)) = lower(trim(${sqlString(PILOT_EMAIL)}))
        AND f.empresa_id = ${PILOT_TENANT_ID}
        AND f.matricula = ${sqlString(PILOT_EMPLOYEE_REGISTRATION)}
        AND u.active = 1 AND u.deleted_at IS NULL
        AND f.ativo = 1 AND f.deleted_at IS NULL
        AND lower(trim(ue.role)) = 'manager'
      LIMIT 1;`,
  );
  const userId = Number(row?.user_id || 0);
  const employeeId = Number(row?.employee_id || 0);
  if (!Number.isInteger(userId) || userId < 1 || !Number.isInteger(employeeId) || employeeId < 1) {
    throw new Error('EDB_FULL_SYNTHETIC_ACTOR_NOT_READY');
  }
  return { userId, employeeId };
}

function insertCatalog(dbName, table, candidates, lookupSql) {
  executeSqlFile(dbName, buildInsert(dbName, table, candidates));
  const row = queryOne(dbName, lookupSql);
  const id = Number(row?.id || 0);
  if (!Number.isInteger(id) || id < 1) throw new Error(`EDB_FULL_CATALOG_INSERT_FAILED:${table}`);
  return id;
}

function fixtureValues(id, actor) {
  const suffix = fixtureSuffix(id);
  const date = new Date().toISOString().slice(0, 10);
  const prefix = `QE${suffix}`.slice(0, 14);
  const rdvNumber = `R${suffix}`.slice(0, 18);
  const airportACode = `A${suffix}`.slice(0, 12);
  const airportBCode = `B${suffix}`.slice(0, 12);
  const typeCode = `T${suffix}`.slice(0, 12);
  const natureCode = `N${suffix}`.slice(0, 12);
  return {
    suffix,
    date,
    prefix,
    rdvNumber,
    airportACode,
    airportBCode,
    typeCode,
    natureCode,
    aircraftId: 1900000000 + Number(suffix.replace(/\D/g, '').slice(-6) || 6),
    actor,
  };
}

function seedCanonicalFixture(dbName, id) {
  strictTenantState(dbName, { allowAbsent: false });
  const actor = exactActor(dbName);
  const f = fixtureValues(id, actor);
  const now = rawSql("datetime('now')");

  const airportBase = {
    empresa_id: PILOT_TENANT_ID,
    nome: `QA eDB ${id}`,
    cidade: 'QA',
    municipio: 'QA',
    uf: 'QA',
    estado: 'QA',
    pais: 'BR',
    latitude: 0,
    longitude: 0,
    ativo: 1,
    ordem: 9999,
    created_by: actor.userId,
    updated_by: actor.userId,
    created_at: now,
    updated_at: now,
    deleted_at: null,
  };
  const airportAId = insertCatalog(
    dbName,
    'cv_aeroportos',
    { ...airportBase, codigo: f.airportACode, codigo_icao: f.airportACode },
    `SELECT id FROM cv_aeroportos WHERE empresa_id = ${PILOT_TENANT_ID} AND (codigo = ${sqlString(f.airportACode)} OR codigo_icao = ${sqlString(f.airportACode)}) AND deleted_at IS NULL ORDER BY id DESC LIMIT 1;`,
  );
  const airportBId = insertCatalog(
    dbName,
    'cv_aeroportos',
    { ...airportBase, codigo: f.airportBCode, codigo_icao: f.airportBCode },
    `SELECT id FROM cv_aeroportos WHERE empresa_id = ${PILOT_TENANT_ID} AND (codigo = ${sqlString(f.airportBCode)} OR codigo_icao = ${sqlString(f.airportBCode)}) AND deleted_at IS NULL ORDER BY id DESC LIMIT 1;`,
  );

  const catalogBase = {
    empresa_id: PILOT_TENANT_ID,
    nome: `QA eDB ${id}`,
    descricao: `Synthetic eDB full lifecycle ${id}`,
    ativo: 1,
    ordem: 9999,
    created_by: actor.userId,
    updated_by: actor.userId,
    created_at: now,
    updated_at: now,
    deleted_at: null,
  };
  const typeId = insertCatalog(
    dbName,
    'cv_tipos_voo',
    { ...catalogBase, codigo: f.typeCode },
    `SELECT id FROM cv_tipos_voo WHERE empresa_id = ${PILOT_TENANT_ID} AND codigo = ${sqlString(f.typeCode)} AND deleted_at IS NULL ORDER BY id DESC LIMIT 1;`,
  );
  const natureId = insertCatalog(
    dbName,
    'cv_naturezas_voo',
    { ...catalogBase, codigo: f.natureCode },
    `SELECT id FROM cv_naturezas_voo WHERE empresa_id = ${PILOT_TENANT_ID} AND codigo = ${sqlString(f.natureCode)} AND deleted_at IS NULL ORDER BY id DESC LIMIT 1;`,
  );

  const flightCandidates = {
    empresa_id: PILOT_TENANT_ID,
    prefixo: f.prefix,
    data_programacao: f.date,
    origem_id: airportAId,
    destino_id: airportBId,
    tipo_voo_id: typeId,
    natureza_voo_id: natureId,
    aeronave_id: null,
    horario_previsto_partida: `${f.date}T10:10:00.000Z`,
    horario_previsto_chegada: `${f.date}T11:00:00.000Z`,
    horario_real_partida: `${f.date}T10:10:00.000Z`,
    horario_real_chegada: `${f.date}T11:00:00.000Z`,
    status: 'planejado',
    observacoes: id,
    versao: 1,
    origem_importacao: 'MANUAL',
    created_by: actor.userId,
    updated_by: actor.userId,
    created_at: now,
    updated_at: now,
    deleted_at: null,
  };
  executeSqlFile(dbName, buildInsert(dbName, 'cv_voos', flightCandidates));
  const flight = queryOne(
    dbName,
    `SELECT id FROM cv_voos WHERE empresa_id = ${PILOT_TENANT_ID} AND prefixo = ${sqlString(f.prefix)} AND observacoes = ${sqlString(id)} AND deleted_at IS NULL ORDER BY id DESC LIMIT 1;`,
  );
  const flightId = Number(flight?.id || 0);
  if (!Number.isInteger(flightId) || flightId < 1) throw new Error('EDB_FULL_FLIGHT_INSERT_FAILED');

  const stageCandidates = {
    empresa_id: PILOT_TENANT_ID,
    voo_id: flightId,
    numero_etapa: 1,
    origem_icao: f.airportACode,
    destino_icao: f.airportBCode,
    horario_motor_ligado: `${f.date}T10:00:00.000Z`,
    horario_decolagem: `${f.date}T10:10:00.000Z`,
    horario_pouso: `${f.date}T11:00:00.000Z`,
    horario_motor_desligado: `${f.date}T11:10:00.000Z`,
    tempo_decolagem_pouso: '00:50',
    tempo_total: '01:10',
    tempo_navegacao: '00:50',
    tempo_ifr: '00:10',
    tempo_noturno: '00:00',
    pousos_diurnos: 1,
    pousos_noturnos: 0,
    starts: 1,
    pax: 2,
    combustivel_inicio: 600,
    combustivel_fim: 450,
    origem_dados: 'MANUAL',
    metadata_sigvoos_json: JSON.stringify({ fixtureId: id, externalContact: false }),
    created_by: actor.userId,
    updated_by: actor.userId,
    created_at: now,
    updated_at: now,
    deleted_at: null,
  };
  executeSqlFile(dbName, buildInsert(dbName, 'cv_voo_etapas', stageCandidates));
  const stage = queryOne(
    dbName,
    `SELECT id FROM cv_voo_etapas WHERE empresa_id = ${PILOT_TENANT_ID} AND voo_id = ${flightId} AND numero_etapa = 1 AND deleted_at IS NULL ORDER BY id DESC LIMIT 1;`,
  );
  const stageId = Number(stage?.id || 0);
  if (!Number.isInteger(stageId) || stageId < 1) throw new Error('EDB_FULL_STAGE_INSERT_FAILED');

  const crewCandidates = {
    empresa_id: PILOT_TENANT_ID,
    voo_id: flightId,
    etapa_id: stageId,
    funcionario_id: actor.employeeId,
    funcao: 'PIC',
    horario_apresentacao: `${f.date}T09:30:00.000Z`,
    horario_dispensa: `${f.date}T11:30:00.000Z`,
    codigo_funcao_anac: null,
    created_by: actor.userId,
    updated_by: actor.userId,
    created_at: now,
    updated_at: now,
    deleted_at: null,
  };
  executeSqlFile(dbName, buildInsert(dbName, 'cv_voo_tripulantes', crewCandidates));
  const crew = queryOne(
    dbName,
    `SELECT id FROM cv_voo_tripulantes WHERE empresa_id = ${PILOT_TENANT_ID} AND voo_id = ${flightId} AND etapa_id = ${stageId} AND funcionario_id = ${actor.employeeId} AND funcao = 'PIC' AND deleted_at IS NULL ORDER BY id DESC LIMIT 1;`,
  );
  const crewId = Number(crew?.id || 0);
  if (!Number.isInteger(crewId) || crewId < 1) throw new Error('EDB_FULL_CREW_INSERT_FAILED');

  const rdvCandidates = {
    empresa_id: PILOT_TENANT_ID,
    voo_id: flightId,
    numero: f.rdvNumber,
    data_voo: f.date,
    horario_decolagem_real: `${f.date}T10:10:00.000Z`,
    horario_pouso_real: `${f.date}T11:00:00.000Z`,
    horas_voadas: 0.83,
    numero_pousos: 1,
    ciclos: 1,
    combustivel_decolagem: 600,
    combustivel_pouso: 450,
    combustivel_consumo: 150,
    pob: 2,
    carga_kg: 25,
    ocorrencias: id,
    divergencias: null,
    status: 'rascunho',
    responsavel_preenchimento_id: actor.employeeId,
    workflow_status: 'rascunho',
    versao: 1,
    created_by: actor.userId,
    updated_by: actor.userId,
    created_at: now,
    updated_at: now,
    deleted_at: null,
  };
  executeSqlFile(dbName, buildInsert(dbName, 'cv_rdv_operacional', rdvCandidates));
  const rdv = queryOne(
    dbName,
    `SELECT id FROM cv_rdv_operacional WHERE empresa_id = ${PILOT_TENANT_ID} AND voo_id = ${flightId} AND numero = ${sqlString(f.rdvNumber)} AND deleted_at IS NULL ORDER BY id DESC LIMIT 1;`,
  );
  const rdvId = Number(rdv?.id || 0);
  if (!Number.isInteger(rdvId) || rdvId < 1) throw new Error('EDB_FULL_RDV_INSERT_FAILED');

  const manifest = {
    fixtureId: id,
    tenantId: PILOT_TENANT_ID,
    actorUserId: actor.userId,
    actorEmployeeId: actor.employeeId,
    aircraftId: f.aircraftId,
    aircraftRegistrationMarks: `PT-${f.suffix.slice(-3)}`,
    flightId,
    stageId,
    crewId,
    rdvId,
    airportAId,
    airportBId,
    typeId,
    natureId,
    prefix: f.prefix,
    rdvNumber: f.rdvNumber,
    airportACode: f.airportACode,
    airportBCode: f.airportBCode,
    typeCode: f.typeCode,
    natureCode: f.natureCode,
    date: f.date,
  };
  const manifestPath = String(process.env.QA_EDB_FULL_MANIFEST_PATH || DEFAULT_MANIFEST);
  writeManifest(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');
  console.log(`EDB_FULL_FIXTURE_READY fixture=${id} flight=${flightId} stage=${stageId} rdv=${rdvId}`);
  console.log(`EDB_FULL_MANIFEST=${manifestPath}`);
  return manifest;
}

function softDeleteIfPresent(dbName, table, whereSql) {
  const names = new Set(tableInfo(dbName, table).map((column) => column.name));
  if (!names.has('deleted_at')) throw new Error(`QA_CLEANUP_SOFT_DELETE_UNSUPPORTED:${table}`);
  const sets = [`deleted_at = COALESCE(deleted_at, datetime('now'))`];
  if (names.has('updated_at')) sets.push("updated_at = datetime('now')");
  if (names.has('ativo')) sets.push('ativo = 0');
  executeSqlFile(dbName, `UPDATE ${table} SET ${sets.join(', ')} WHERE ${whereSql};`);
}

function rollbackCanonicalFixture(dbName, id) {
  strictTenantState(dbName, { allowAbsent: false });
  const actor = exactActor(dbName);
  const f = fixtureValues(id, actor);
  const flight = queryOne(
    dbName,
    `SELECT id FROM cv_voos WHERE empresa_id = ${PILOT_TENANT_ID} AND prefixo = ${sqlString(f.prefix)} AND observacoes = ${sqlString(id)} ORDER BY id DESC LIMIT 1;`,
  );
  const flightId = Number(flight?.id || 0);
  if (flightId > 0) {
    softDeleteIfPresent(dbName, 'cv_rdv_operacional', `empresa_id = ${PILOT_TENANT_ID} AND voo_id = ${flightId}`);
    softDeleteIfPresent(dbName, 'cv_voo_tripulantes', `empresa_id = ${PILOT_TENANT_ID} AND voo_id = ${flightId}`);
    softDeleteIfPresent(dbName, 'cv_voo_etapas', `empresa_id = ${PILOT_TENANT_ID} AND voo_id = ${flightId}`);
    softDeleteIfPresent(dbName, 'cv_voos', `empresa_id = ${PILOT_TENANT_ID} AND id = ${flightId} AND prefixo = ${sqlString(f.prefix)} AND observacoes = ${sqlString(id)}`);
  }
  softDeleteIfPresent(dbName, 'cv_aeroportos', `empresa_id = ${PILOT_TENANT_ID} AND (codigo IN (${sqlString(f.airportACode)}, ${sqlString(f.airportBCode)}) OR codigo_icao IN (${sqlString(f.airportACode)}, ${sqlString(f.airportBCode)}))`);
  softDeleteIfPresent(dbName, 'cv_tipos_voo', `empresa_id = ${PILOT_TENANT_ID} AND codigo = ${sqlString(f.typeCode)}`);
  softDeleteIfPresent(dbName, 'cv_naturezas_voo', `empresa_id = ${PILOT_TENANT_ID} AND codigo = ${sqlString(f.natureCode)}`);

  const residue = queryOne(
    dbName,
    `SELECT
      (SELECT COUNT(*) FROM cv_voos WHERE empresa_id = ${PILOT_TENANT_ID} AND prefixo = ${sqlString(f.prefix)} AND observacoes = ${sqlString(id)} AND deleted_at IS NULL) AS flights,
      (SELECT COUNT(*) FROM cv_rdv_operacional r JOIN cv_voos v ON v.id = r.voo_id WHERE r.empresa_id = ${PILOT_TENANT_ID} AND v.prefixo = ${sqlString(f.prefix)} AND r.deleted_at IS NULL) AS rdvs;`,
  );
  if (Number(residue?.flights || 0) !== 0 || Number(residue?.rdvs || 0) !== 0) {
    throw new Error(`EDB_FULL_CANONICAL_CLEANUP_FAILED:${JSON.stringify(residue)}`);
  }
  const immutableEvidence = flightId > 0
    ? queryOne(dbName, `SELECT COUNT(*) AS count FROM edb_registro_revisoes WHERE empresa_id = ${PILOT_TENANT_ID} AND voo_id = ${flightId};`)
    : { count: 0 };
  console.log(`EDB_FULL_CANONICAL_ROLLBACK_PASS fixture=${id} immutable_revisions=${Number(immutableEvidence?.count || 0)}`);
}

async function main() {
  const args = new Set(process.argv.slice(2));
  const apply = args.has('--apply');
  const rollback = args.has('--rollback');
  const preflight = args.has('--preflight');
  if (rollback && !apply) throw new Error('ROLLBACK_REQUIRES_APPLY');
  if (preflight && (apply || rollback)) throw new Error('PREFLIGHT_IS_READ_ONLY');

  const dbName = targetDb();
  const id = fixtureId();
  console.log(`TARGET_DB=${dbName}`);
  console.log(`FIXTURE_ID=${id}`);
  console.log(`MODE=${preflight ? 'preflight' : rollback ? 'rollback' : apply ? 'apply' : 'dry-run'}`);

  if (preflight) {
    const state = strictTenantState(dbName, { allowAbsent: true });
    console.log(`EDB_FULL_PREFLIGHT_PASS tenant6=${state}`);
    return;
  }
  if (!apply) {
    console.log('EDB_FULL_FIXTURE_DRY_RUN_PASS');
    return;
  }
  if (process.env.CONFIRM_STAGING_EDB_FULL_LIFECYCLE !== CONFIRMATION) {
    throw new Error(`CONFIRMATION_REQUIRED:${CONFIRMATION}`);
  }
  if (rollback) {
    rollbackCanonicalFixture(dbName, id);
    return;
  }
  seedCanonicalFixture(dbName, id);
}

main().catch((error) => {
  console.error(`[seed-qa-edb-full-lifecycle][ERROR] ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
});
