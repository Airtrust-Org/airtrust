#!/usr/bin/env node
// source_reference: PR #110 eDB staging pilot tenant 6; docs/edb/STAGING_PILOT_QA.md
// operational_decision: provision only synthetic staging fixtures needed to authenticate and exercise the tenant-6 shadow gate; never write flight/RDV/eDB domain records or reactivate a non-synthetic tenant.
// dry_run_required: default invocation performs no D1 write; --apply plus AIRTRUST_STAGING_EDB_PILOT_IDENTITY is required.
// rollback_plan_required: --apply --rollback soft-deletes/deactivates only exact QA eDB fixtures, including the synthetic sector and tenant only when their reserved identifiers match.

// Synthetic, staging-only identity for the positive eDB shadow pilot check.
// Never use a real Costa do Sol credential. Dry-run is the default; writes
// require an explicit confirmation and are restricted to the canonical staging D1.

import { createRequire } from 'node:module';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';

const require = createRequire(new URL('../../worker-airtrust/package.json', import.meta.url));
const bcrypt = require('bcryptjs');

const ALLOWED_D1_NAME = 'airtrust-db-staging-baseline-20260701';
const PILOT_TENANT_ID = 6;
const PILOT_TENANT_CODE = 'edb_pilot_smoke';
const PILOT_TENANT_NAME = 'eDB Pilot Smoke Tenant';
const PILOT_SECTOR_CODE = 'QA-EDB-PILOT';
const PILOT_SECTOR_NAME = 'QA eDB Pilot';
const PILOT_SECTOR_DESCRIPTION = 'Fixture sintética de operações para QA eDB.';
const PILOT_SECTOR_RESPONSIBLE = 'QA AirTrust';
const PILOT_SECTOR_DOMAIN = 'OPERACOES';
const CONFIRMATION = 'AIRTRUST_STAGING_EDB_PILOT_IDENTITY';
const EMAIL = 'qa-edb-pilot@staging.airtrust.invalid';
const EMPLOYEE_NAME = 'QA eDB Pilot';
const EMPLOYEE_REGISTRATION = 'QA-EDB-PILOT';

function sqlString(value) {
  return `'${String(value).replaceAll("'", "''")}'`;
}

function targetDb() {
  const value = String(process.env.STAGING_D1_NAME || ALLOWED_D1_NAME).trim();
  if (!value || value !== ALLOWED_D1_NAME || /prod/i.test(value)) {
    throw new Error(`STAGING_D1_REJECTED:${value || 'missing'}`);
  }
  return value;
}

function wrangler(dbName, args) {
  const result = spawnSync('npx', ['wrangler', 'd1', 'execute', dbName, '--remote', ...args, '--json'], {
    cwd: join(process.cwd(), 'worker-airtrust'),
    encoding: 'utf8',
  });
  if (result.status !== 0) throw new Error(result.stderr || result.stdout || 'WRANGLER_D1_FAILED');
  return result.stdout || '[]';
}

function queryOne(dbName, sql) {
  const parsed = JSON.parse(wrangler(dbName, ['--command', sql]));
  return Array.isArray(parsed) ? parsed[0]?.results?.[0] : parsed?.results?.[0];
}

function executeSqlFile(dbName, sql) {
  const dir = mkdtempSync(join(tmpdir(), 'airtrust-edb-pilot-'));
  const file = join(dir, 'seed.sql');
  writeFileSync(file, sql, 'utf8');
  try {
    wrangler(dbName, ['--file', file]);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

function verifyTenant(dbName) {
  const row = queryOne(
    dbName,
    `SELECT COUNT(*) AS count FROM empresas WHERE id = ${PILOT_TENANT_ID} AND ativo = 1 AND deleted_at IS NULL;`,
  );
  if (Number(row?.count) !== 1) throw new Error('EDB_PILOT_TENANT_6_NOT_READY');
}

function ensurePilotTenant(dbName) {
  const e = sqlString;
  const state = queryOne(
    dbName,
    `SELECT
      (SELECT COUNT(*) FROM empresas WHERE id = ${PILOT_TENANT_ID}) AS id_count,
      (SELECT COUNT(*) FROM empresas WHERE codigo = ${e(PILOT_TENANT_CODE)}) AS code_count,
      (SELECT COUNT(*) FROM empresas WHERE id = ${PILOT_TENANT_ID} AND codigo = ${e(PILOT_TENANT_CODE)}) AS exact_synthetic_count,
      (SELECT COUNT(*) FROM empresas WHERE id = ${PILOT_TENANT_ID} AND ativo = 1 AND deleted_at IS NULL) AS active_id_count;`,
  );
  if (!state) throw new Error('EDB_PILOT_TENANT_STATE_MISSING');

  const idCount = Number(state.id_count || 0);
  const codeCount = Number(state.code_count || 0);
  const exactSyntheticCount = Number(state.exact_synthetic_count || 0);
  const activeIdCount = Number(state.active_id_count || 0);

  if (idCount > 1 || codeCount > 1 || exactSyntheticCount > 1) {
    throw new Error('EDB_PILOT_TENANT_STATE_AMBIGUOUS');
  }

  if (idCount === 1 && exactSyntheticCount === 0) {
    throw new Error(
      activeIdCount === 1
        ? 'EDB_PILOT_TENANT_6_OCCUPIED_NON_SYNTHETIC_ACTIVE'
        : 'EDB_PILOT_TENANT_6_OCCUPIED_NON_SYNTHETIC_INACTIVE',
    );
  }

  if (codeCount === 1 && exactSyntheticCount === 0) {
    throw new Error('EDB_PILOT_SYNTHETIC_CODE_COLLISION');
  }

  if (exactSyntheticCount === 1) {
    executeSqlFile(
      dbName,
      `UPDATE empresas
       SET nome = ${e(PILOT_TENANT_NAME)}, razao_social = ${e(PILOT_TENANT_NAME)}, ativo = 1,
           plano = 'basic', deleted_at = NULL, updated_at = datetime('now')
       WHERE id = ${PILOT_TENANT_ID} AND codigo = ${e(PILOT_TENANT_CODE)};`,
    );
    verifyTenant(dbName);
    console.log('EDB_PILOT_SYNTHETIC_TENANT_READY id=6 mode=reactivated');
    return;
  }

  if (idCount !== 0 || codeCount !== 0) {
    throw new Error('EDB_PILOT_TENANT_STATE_UNEXPECTED');
  }

  executeSqlFile(
    dbName,
    `INSERT INTO empresas (
       id, nome, razao_social, ativo, created_at, updated_at, deleted_at,
       codigo, plano, max_funcionarios, max_storage_mb
     )
     SELECT
       ${PILOT_TENANT_ID}, ${e(PILOT_TENANT_NAME)}, ${e(PILOT_TENANT_NAME)}, 1,
       datetime('now'), datetime('now'), NULL, ${e(PILOT_TENANT_CODE)}, 'basic', 25, 256
     WHERE NOT EXISTS (SELECT 1 FROM empresas WHERE id = ${PILOT_TENANT_ID})
       AND NOT EXISTS (SELECT 1 FROM empresas WHERE codigo = ${e(PILOT_TENANT_CODE)});`,
  );
  verifyTenant(dbName);
  console.log('EDB_PILOT_SYNTHETIC_TENANT_READY id=6 mode=created');
}

function verifyPilotSector(dbName) {
  const e = sqlString;
  const row = queryOne(
    dbName,
    `SELECT COUNT(*) AS count
     FROM setores
     WHERE empresa_id = ${PILOT_TENANT_ID}
       AND codigo = ${e(PILOT_SECTOR_CODE)}
       AND nome = ${e(PILOT_SECTOR_NAME)}
       AND descricao = ${e(PILOT_SECTOR_DESCRIPTION)}
       AND responsavel = ${e(PILOT_SECTOR_RESPONSIBLE)}
       AND dominio_codigo = ${e(PILOT_SECTOR_DOMAIN)}
       AND ativo = 1
       AND deleted_at IS NULL;`,
  );
  if (Number(row?.count) !== 1) throw new Error('EDB_PILOT_SECTOR_NOT_READY');
}

function ensurePilotSector(dbName) {
  const e = sqlString;
  const state = queryOne(
    dbName,
    `SELECT
      (SELECT COUNT(*) FROM setores
       WHERE empresa_id = ${PILOT_TENANT_ID}
         AND codigo = ${e(PILOT_SECTOR_CODE)}) AS code_count,
      (SELECT COUNT(*) FROM setores
       WHERE empresa_id = ${PILOT_TENANT_ID}
         AND codigo = ${e(PILOT_SECTOR_CODE)}
         AND nome = ${e(PILOT_SECTOR_NAME)}
         AND descricao = ${e(PILOT_SECTOR_DESCRIPTION)}
         AND responsavel = ${e(PILOT_SECTOR_RESPONSIBLE)}
         AND dominio_codigo = ${e(PILOT_SECTOR_DOMAIN)}) AS exact_synthetic_count;`,
  );
  if (!state) throw new Error('EDB_PILOT_SECTOR_STATE_MISSING');

  const codeCount = Number(state.code_count || 0);
  const exactSyntheticCount = Number(state.exact_synthetic_count || 0);
  if (codeCount > 1 || exactSyntheticCount > 1) {
    throw new Error('EDB_PILOT_SECTOR_STATE_AMBIGUOUS');
  }
  if (codeCount === 1 && exactSyntheticCount === 0) {
    throw new Error('EDB_PILOT_SECTOR_CODE_COLLISION');
  }

  if (exactSyntheticCount === 1) {
    executeSqlFile(
      dbName,
      `UPDATE setores
       SET ativo = 1, deleted_at = NULL, updated_at = datetime('now')
       WHERE empresa_id = ${PILOT_TENANT_ID}
         AND codigo = ${e(PILOT_SECTOR_CODE)}
         AND nome = ${e(PILOT_SECTOR_NAME)}
         AND descricao = ${e(PILOT_SECTOR_DESCRIPTION)}
         AND responsavel = ${e(PILOT_SECTOR_RESPONSIBLE)}
         AND dominio_codigo = ${e(PILOT_SECTOR_DOMAIN)};`,
    );
    verifyPilotSector(dbName);
    console.log('EDB_PILOT_SYNTHETIC_SECTOR_READY code=QA-EDB-PILOT mode=reactivated');
    return;
  }

  if (codeCount !== 0) throw new Error('EDB_PILOT_SECTOR_STATE_UNEXPECTED');

  executeSqlFile(
    dbName,
    `INSERT INTO setores (
       codigo, nome, descricao, responsavel, ativo, created_at, updated_at, deleted_at, empresa_id, dominio_codigo
     )
     SELECT
       ${e(PILOT_SECTOR_CODE)}, ${e(PILOT_SECTOR_NAME)}, ${e(PILOT_SECTOR_DESCRIPTION)},
       ${e(PILOT_SECTOR_RESPONSIBLE)}, 1, datetime('now'), datetime('now'), NULL,
       emp.id, ${e(PILOT_SECTOR_DOMAIN)}
     FROM empresas emp
     WHERE emp.id = ${PILOT_TENANT_ID}
       AND emp.ativo = 1
       AND emp.deleted_at IS NULL
       AND NOT EXISTS (
         SELECT 1 FROM setores s
         WHERE s.codigo = ${e(PILOT_SECTOR_CODE)} AND s.empresa_id = emp.id
       );`,
  );
  verifyPilotSector(dbName);
  console.log('EDB_PILOT_SYNTHETIC_SECTOR_READY code=QA-EDB-PILOT mode=created');
}

function seedSql(passwordHash) {
  const e = sqlString;
  return `
INSERT INTO funcionarios (
  nome, matricula, cargo, funcao, setor, setor_id, status,
  is_instrutor, is_examinador, ativo, empresa_id, created_at, updated_at, deleted_at
)
SELECT
  ${e(EMPLOYEE_NAME)}, ${e(EMPLOYEE_REGISTRATION)}, 'Gestor QA eDB', 'Gestor QA eDB',
  ${e(PILOT_SECTOR_NAME)}, s.id, 'ATIVO', 0, 0, 1, emp.id, datetime('now'), datetime('now'), NULL
FROM empresas emp
JOIN setores s
  ON s.empresa_id = emp.id
 AND s.codigo = ${e(PILOT_SECTOR_CODE)}
 AND s.ativo = 1
 AND s.deleted_at IS NULL
WHERE emp.id = ${PILOT_TENANT_ID}
  AND emp.ativo = 1
  AND emp.deleted_at IS NULL
  AND NOT EXISTS (
    SELECT 1 FROM funcionarios
    WHERE matricula = ${e(EMPLOYEE_REGISTRATION)} AND empresa_id = ${PILOT_TENANT_ID}
  );

UPDATE funcionarios
SET nome = ${e(EMPLOYEE_NAME)}, cargo = 'Gestor QA eDB', funcao = 'Gestor QA eDB',
    setor = ${e(PILOT_SECTOR_NAME)},
    setor_id = (
      SELECT s.id FROM setores s
      WHERE s.empresa_id = ${PILOT_TENANT_ID}
        AND s.codigo = ${e(PILOT_SECTOR_CODE)}
        AND s.ativo = 1
        AND s.deleted_at IS NULL
      LIMIT 1
    ),
    status = 'ATIVO', is_instrutor = 0,
    is_examinador = 0, ativo = 1, deleted_at = NULL, updated_at = datetime('now')
WHERE matricula = ${e(EMPLOYEE_REGISTRATION)} AND empresa_id = ${PILOT_TENANT_ID};

INSERT INTO usuarios (
  email, password_hash, nome, perfil, funcionario_id, deleted_at, created_at, updated_at, active
)
SELECT
  ${e(EMAIL)}, ${e(passwordHash)}, ${e(EMPLOYEE_NAME)}, 'GESTOR', f.id,
  NULL, datetime('now'), datetime('now'), 1
FROM funcionarios f
WHERE f.matricula = ${e(EMPLOYEE_REGISTRATION)} AND f.empresa_id = ${PILOT_TENANT_ID} AND f.deleted_at IS NULL
  AND NOT EXISTS (SELECT 1 FROM usuarios u WHERE lower(trim(u.email)) = lower(trim(${e(EMAIL)})));

UPDATE usuarios
SET password_hash = ${e(passwordHash)}, nome = ${e(EMPLOYEE_NAME)}, perfil = 'GESTOR',
    funcionario_id = (
      SELECT id FROM funcionarios
      WHERE matricula = ${e(EMPLOYEE_REGISTRATION)} AND empresa_id = ${PILOT_TENANT_ID} AND deleted_at IS NULL
      LIMIT 1
    ),
    deleted_at = NULL, active = 1, updated_at = datetime('now')
WHERE lower(trim(email)) = lower(trim(${e(EMAIL)}));

INSERT INTO usuarios_empresas (usuario_id, empresa_id, role, is_primary, created_at)
SELECT u.id, ${PILOT_TENANT_ID}, 'manager', 1, datetime('now')
FROM usuarios u
WHERE lower(trim(u.email)) = lower(trim(${e(EMAIL)}))
  AND NOT EXISTS (
    SELECT 1 FROM usuarios_empresas ue WHERE ue.usuario_id = u.id AND ue.empresa_id = ${PILOT_TENANT_ID}
  );

UPDATE usuarios_empresas
SET role = 'manager', is_primary = 1
WHERE usuario_id = (SELECT id FROM usuarios WHERE lower(trim(email)) = lower(trim(${e(EMAIL)})) LIMIT 1)
  AND empresa_id = ${PILOT_TENANT_ID};
`;
}

function rollbackSql() {
  const e = sqlString;
  return `
UPDATE usuarios
SET active = 0, deleted_at = COALESCE(deleted_at, datetime('now')), updated_at = datetime('now')
WHERE lower(trim(email)) = lower(trim(${e(EMAIL)}));

UPDATE funcionarios
SET ativo = 0, status = 'INATIVO', deleted_at = COALESCE(deleted_at, datetime('now')), updated_at = datetime('now')
WHERE matricula = ${e(EMPLOYEE_REGISTRATION)} AND empresa_id = ${PILOT_TENANT_ID};

UPDATE setores
SET ativo = 0, deleted_at = COALESCE(deleted_at, datetime('now')), updated_at = datetime('now')
WHERE codigo = ${e(PILOT_SECTOR_CODE)}
  AND empresa_id = ${PILOT_TENANT_ID}
  AND nome = ${e(PILOT_SECTOR_NAME)}
  AND descricao = ${e(PILOT_SECTOR_DESCRIPTION)}
  AND responsavel = ${e(PILOT_SECTOR_RESPONSIBLE)}
  AND dominio_codigo = ${e(PILOT_SECTOR_DOMAIN)};

UPDATE empresas
SET ativo = 0, deleted_at = COALESCE(deleted_at, datetime('now')), updated_at = datetime('now')
WHERE id = ${PILOT_TENANT_ID} AND codigo = ${e(PILOT_TENANT_CODE)};
`;
}

function verifyPostconditions(dbName) {
  const e = sqlString;
  const row = queryOne(
    dbName,
    `SELECT
      (SELECT COUNT(*) FROM empresas WHERE id = ${PILOT_TENANT_ID} AND ativo = 1 AND deleted_at IS NULL) AS tenant_count,
      (SELECT COUNT(*) FROM setores WHERE codigo = ${e(PILOT_SECTOR_CODE)} AND empresa_id = ${PILOT_TENANT_ID} AND dominio_codigo = ${e(PILOT_SECTOR_DOMAIN)} AND ativo = 1 AND deleted_at IS NULL) AS sector_count,
      (SELECT COUNT(*) FROM funcionarios f JOIN setores s ON s.id = f.setor_id AND s.empresa_id = f.empresa_id WHERE f.matricula = ${e(EMPLOYEE_REGISTRATION)} AND f.empresa_id = ${PILOT_TENANT_ID} AND s.codigo = ${e(PILOT_SECTOR_CODE)} AND f.ativo = 1 AND f.deleted_at IS NULL) AS employee_count,
      (SELECT COUNT(*) FROM usuarios u WHERE lower(trim(u.email)) = lower(trim(${e(EMAIL)})) AND u.active = 1 AND u.deleted_at IS NULL AND u.funcionario_id = (SELECT id FROM funcionarios WHERE matricula = ${e(EMPLOYEE_REGISTRATION)} AND empresa_id = ${PILOT_TENANT_ID} AND deleted_at IS NULL LIMIT 1)) AS user_count,
      (SELECT COUNT(*) FROM usuarios u JOIN usuarios_empresas ue ON ue.usuario_id = u.id WHERE lower(trim(u.email)) = lower(trim(${e(EMAIL)})) AND ue.empresa_id = ${PILOT_TENANT_ID} AND lower(trim(ue.role)) = 'manager' AND ue.is_primary = 1) AS membership_count;`,
  );
  for (const key of ['tenant_count', 'sector_count', 'employee_count', 'user_count', 'membership_count']) {
    if (Number(row?.[key]) !== 1) throw new Error(`EDB_PILOT_IDENTITY_POSTCONDITION_FAILED:${key}=${row?.[key]}`);
  }
}

async function main() {
  const args = new Set(process.argv.slice(2));
  const apply = args.has('--apply');
  const rollback = args.has('--rollback');
  if (rollback && !apply) throw new Error('ROLLBACK_REQUIRES_APPLY');

  const dbName = targetDb();
  const password = String(process.env.QA_EDB_PILOT_PASSWORD || '');
  console.log(`TARGET_DB=${dbName}`);
  console.log(`PILOT_TENANT=${PILOT_TENANT_ID}`);
  console.log('QA_IDENTITY=qa***@staging.airtrust.invalid');
  console.log(`MODE=${rollback ? 'rollback' : apply ? 'apply' : 'dry-run'}`);

  if (!apply) {
    console.log('EDB_PILOT_IDENTITY_DRY_RUN_PASS');
    return;
  }
  if (process.env.CONFIRM_STAGING_EDB_PILOT_IDENTITY !== CONFIRMATION) {
    throw new Error(`CONFIRMATION_REQUIRED:${CONFIRMATION}`);
  }

  if (rollback) {
    executeSqlFile(dbName, rollbackSql());
    console.log('EDB_PILOT_IDENTITY_ROLLBACK_PASS');
    return;
  }

  ensurePilotTenant(dbName);
  ensurePilotSector(dbName);
  if (!password) throw new Error('QA_EDB_PILOT_PASSWORD_MISSING');

  const passwordHash = bcrypt.hashSync(password, bcrypt.genSaltSync(10));
  executeSqlFile(dbName, seedSql(passwordHash));
  verifyPostconditions(dbName);
  console.log('EDB_PILOT_IDENTITY_READY tenant=6');
}

main().catch((error) => {
  console.error(`[seed-qa-edb-pilot][ERROR] ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
});