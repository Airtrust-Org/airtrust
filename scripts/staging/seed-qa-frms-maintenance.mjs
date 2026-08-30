#!/usr/bin/env node

// source_reference: synthetic staging-only fixture for real PR #126 FRMS maintenance UI/RBAC validation.
// operational_decision: create/update only exact QA-prefixed rows in the canonical rebuilt staging D1; never target production or print cleartext credentials/tokens.
// dry_run_required: default mode performs no write; --apply requires CONFIRM_STAGING_FRMS_QA=AIRTRUST_STAGING_FRMS_QA.
// rollback_plan_required: --rollback only deactivates/soft-deletes the exact synthetic user, employee and maintenance sector; inert membership rows are retained rather than hard-deleted.

import { createRequire } from 'node:module';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';

const require = createRequire(new URL('../../worker-airtrust/package.json', import.meta.url));
const bcrypt = require('bcryptjs');

const ALLOWED_D1_NAME = 'airtrust-db-staging-baseline-20260701';
const CONFIRMATION_PHRASE = 'AIRTRUST_STAGING_FRMS_QA';
const EMPRESA_CODIGO = 'airtrust_smoke';
const SETOR_CODIGO = 'QA-MANUTENCAO-FRMS';
const SETOR_NOME = 'Manutenção QA FRMS';
const FUNCIONARIO_MATRICULA = 'QA-MECANICO-FRMS';
const FUNCIONARIO_NOME = 'QA Mecânico FRMS';
const QA_EMAIL_DEFAULT = 'qa-maintenance@staging.airtrust.invalid';

function sqlString(value) {
  return `'${String(value).replaceAll("'", "''")}'`;
}

function validateTarget(name) {
  const value = String(name || '').trim();
  if (!value) throw new Error('STAGING_D1_NAME vazio');
  if (/prod/i.test(value) || value !== ALLOWED_D1_NAME) {
    throw new Error(`D1 alvo rejeitado: ${value}`);
  }
  return value;
}

function buildSeedSql({ email, passwordHash }) {
  const e = sqlString;
  return `
INSERT INTO setores (
  codigo, nome, descricao, responsavel, ativo, created_at, updated_at, deleted_at, empresa_id, dominio_codigo
)
SELECT
  ${e(SETOR_CODIGO)}, ${e(SETOR_NOME)}, 'Fixture sintética de manutenção para QA FRMS.',
  'QA AirTrust', 1, datetime('now'), datetime('now'), NULL, emp.id, 'MANUTENCAO'
FROM empresas emp
WHERE emp.codigo = ${e(EMPRESA_CODIGO)}
  AND emp.ativo = 1
  AND emp.deleted_at IS NULL
  AND NOT EXISTS (
    SELECT 1 FROM setores s
    WHERE s.codigo = ${e(SETOR_CODIGO)} AND s.empresa_id = emp.id AND s.deleted_at IS NULL
  );

UPDATE setores
SET nome = ${e(SETOR_NOME)},
    descricao = 'Fixture sintética de manutenção para QA FRMS.',
    responsavel = 'QA AirTrust',
    ativo = 1,
    dominio_codigo = 'MANUTENCAO',
    deleted_at = NULL,
    updated_at = datetime('now')
WHERE codigo = ${e(SETOR_CODIGO)}
  AND empresa_id = (SELECT id FROM empresas WHERE codigo = ${e(EMPRESA_CODIGO)} AND ativo = 1 AND deleted_at IS NULL LIMIT 1);

INSERT INTO funcionarios (
  nome, matricula, cargo, funcao, setor, setor_id, status,
  is_instrutor, is_examinador, ativo, empresa_id, created_at, updated_at, deleted_at
)
SELECT
  ${e(FUNCIONARIO_NOME)}, ${e(FUNCIONARIO_MATRICULA)}, 'Mecânico', 'Mecânico',
  ${e(SETOR_NOME)}, s.id, 'ATIVO', 0, 0, 1, emp.id, datetime('now'), datetime('now'), NULL
FROM empresas emp
JOIN setores s ON s.empresa_id = emp.id AND s.codigo = ${e(SETOR_CODIGO)} AND s.deleted_at IS NULL
WHERE emp.codigo = ${e(EMPRESA_CODIGO)}
  AND emp.ativo = 1
  AND emp.deleted_at IS NULL
  AND NOT EXISTS (
    SELECT 1 FROM funcionarios f
    WHERE f.matricula = ${e(FUNCIONARIO_MATRICULA)} AND f.empresa_id = emp.id AND f.deleted_at IS NULL
  );

UPDATE funcionarios
SET nome = ${e(FUNCIONARIO_NOME)},
    cargo = 'Mecânico',
    funcao = 'Mecânico',
    setor = ${e(SETOR_NOME)},
    setor_id = (
      SELECT s.id FROM setores s
      JOIN empresas emp ON emp.id = s.empresa_id
      WHERE emp.codigo = ${e(EMPRESA_CODIGO)} AND s.codigo = ${e(SETOR_CODIGO)} AND s.deleted_at IS NULL
      LIMIT 1
    ),
    status = 'ATIVO',
    is_instrutor = 0,
    is_examinador = 0,
    ativo = 1,
    deleted_at = NULL,
    updated_at = datetime('now')
WHERE matricula = ${e(FUNCIONARIO_MATRICULA)}
  AND empresa_id = (SELECT id FROM empresas WHERE codigo = ${e(EMPRESA_CODIGO)} LIMIT 1);

INSERT INTO usuarios (
  email, password_hash, nome, perfil, funcionario_id, deleted_at, created_at, updated_at, active
)
SELECT
  ${e(email)}, ${e(passwordHash)}, ${e(FUNCIONARIO_NOME)}, 'ALUNO', f.id,
  NULL, datetime('now'), datetime('now'), 1
FROM funcionarios f
JOIN empresas emp ON emp.id = f.empresa_id
WHERE f.matricula = ${e(FUNCIONARIO_MATRICULA)}
  AND emp.codigo = ${e(EMPRESA_CODIGO)}
  AND NOT EXISTS (SELECT 1 FROM usuarios u WHERE lower(trim(u.email)) = lower(trim(${e(email)})));

UPDATE usuarios
SET password_hash = ${e(passwordHash)},
    nome = ${e(FUNCIONARIO_NOME)},
    perfil = 'ALUNO',
    funcionario_id = (
      SELECT f.id FROM funcionarios f
      JOIN empresas emp ON emp.id = f.empresa_id
      WHERE f.matricula = ${e(FUNCIONARIO_MATRICULA)} AND emp.codigo = ${e(EMPRESA_CODIGO)}
      LIMIT 1
    ),
    deleted_at = NULL,
    active = 1,
    updated_at = datetime('now')
WHERE lower(trim(email)) = lower(trim(${e(email)}));

INSERT INTO usuarios_empresas (usuario_id, empresa_id, role, is_primary, created_at)
SELECT u.id, emp.id, 'student', 1, datetime('now')
FROM usuarios u
JOIN empresas emp ON emp.codigo = ${e(EMPRESA_CODIGO)}
WHERE lower(trim(u.email)) = lower(trim(${e(email)}))
  AND NOT EXISTS (
    SELECT 1 FROM usuarios_empresas ue WHERE ue.usuario_id = u.id AND ue.empresa_id = emp.id
  );

UPDATE usuarios_empresas
SET role = 'student', is_primary = 1
WHERE usuario_id = (SELECT id FROM usuarios WHERE lower(trim(email)) = lower(trim(${e(email)})) LIMIT 1)
  AND empresa_id = (SELECT id FROM empresas WHERE codigo = ${e(EMPRESA_CODIGO)} LIMIT 1);
`;
}

function buildRollbackSql(email) {
  const e = sqlString;
  return `
UPDATE usuarios
SET active = 0, deleted_at = COALESCE(deleted_at, datetime('now')), updated_at = datetime('now')
WHERE lower(trim(email)) = lower(trim(${e(email)}));

UPDATE funcionarios
SET ativo = 0, status = 'INATIVO', deleted_at = COALESCE(deleted_at, datetime('now')), updated_at = datetime('now')
WHERE matricula = ${e(FUNCIONARIO_MATRICULA)}
  AND empresa_id = (SELECT id FROM empresas WHERE codigo = ${e(EMPRESA_CODIGO)} LIMIT 1);

UPDATE setores
SET ativo = 0, deleted_at = COALESCE(deleted_at, datetime('now')), updated_at = datetime('now')
WHERE codigo = ${e(SETOR_CODIGO)}
  AND empresa_id = (SELECT id FROM empresas WHERE codigo = ${e(EMPRESA_CODIGO)} LIMIT 1);
`;
}

function runWranglerFile(dbName, sql) {
  const tempDir = mkdtempSync(join(tmpdir(), 'airtrust-frms-qa-'));
  const sqlFile = join(tempDir, 'fixture.sql');
  writeFileSync(sqlFile, sql, 'utf8');
  try {
    const result = spawnSync(
      'npx',
      ['wrangler', 'd1', 'execute', dbName, '--remote', '--file', sqlFile, '--json'],
      { cwd: join(process.cwd(), 'worker-airtrust'), encoding: 'utf8' },
    );
    if (result.status !== 0) {
      throw new Error(result.stderr || result.stdout || 'wrangler d1 execute falhou');
    }
  } finally {
    rmSync(tempDir, { recursive: true, force: true });
  }
}

function runWranglerQuery(dbName, sql) {
  const result = spawnSync(
    'npx',
    ['wrangler', 'd1', 'execute', dbName, '--remote', '--command', sql, '--json'],
    { cwd: join(process.cwd(), 'worker-airtrust'), encoding: 'utf8' },
  );
  if (result.status !== 0) {
    throw new Error(result.stderr || result.stdout || 'wrangler d1 query falhou');
  }
  const parsed = JSON.parse(result.stdout || '[]');
  return Array.isArray(parsed) ? parsed[0]?.results?.[0] : parsed?.results?.[0];
}

function verifyPostconditions(dbName, email) {
  const e = sqlString;
  const row = runWranglerQuery(
    dbName,
    `SELECT
      (SELECT COUNT(*) FROM empresas WHERE codigo = ${e(EMPRESA_CODIGO)} AND ativo = 1 AND deleted_at IS NULL) AS empresa_count,
      (SELECT COUNT(*) FROM setores s JOIN empresas emp ON emp.id = s.empresa_id WHERE emp.codigo = ${e(EMPRESA_CODIGO)} AND s.codigo = ${e(SETOR_CODIGO)} AND s.dominio_codigo = 'MANUTENCAO' AND s.ativo = 1 AND s.deleted_at IS NULL) AS setor_count,
      (SELECT COUNT(*) FROM funcionarios f JOIN empresas emp ON emp.id = f.empresa_id WHERE emp.codigo = ${e(EMPRESA_CODIGO)} AND f.matricula = ${e(FUNCIONARIO_MATRICULA)} AND f.cargo = 'Mecânico' AND f.ativo = 1 AND f.deleted_at IS NULL) AS funcionario_count,
      (SELECT COUNT(*) FROM usuarios u JOIN usuarios_empresas ue ON ue.usuario_id = u.id JOIN empresas emp ON emp.id = ue.empresa_id WHERE lower(trim(u.email)) = lower(trim(${e(email)})) AND emp.codigo = ${e(EMPRESA_CODIGO)} AND u.funcionario_id IS NOT NULL AND u.active = 1 AND u.deleted_at IS NULL) AS usuario_count;`,
  );

  if (!row) throw new Error('QA_FRMS_POSTCONDITION_ROW_MISSING');
  for (const key of ['empresa_count', 'setor_count', 'funcionario_count', 'usuario_count']) {
    if (Number(row[key]) !== 1) throw new Error(`QA_FRMS_POSTCONDITION_FAILED:${key}=${row[key]}`);
  }
}

async function main() {
  const args = new Set(process.argv.slice(2));
  const apply = args.has('--apply');
  const rollback = args.has('--rollback');
  const dbName = validateTarget(process.env.STAGING_D1_NAME || ALLOWED_D1_NAME);
  const email = String(process.env.QA_MAINTENANCE_EMAIL || QA_EMAIL_DEFAULT).trim().toLowerCase();
  const password = String(process.env.QA_MAINTENANCE_PASSWORD || '');

  console.log(`TARGET_DB=${dbName}`);
  console.log(`MODE=${rollback ? 'rollback' : apply ? 'apply' : 'dry-run'}`);
  console.log('QA_IDENTITY=qa***@staging.airtrust.invalid');

  if (!email.endsWith('@staging.airtrust.invalid')) {
    throw new Error('QA_MAINTENANCE_EMAIL deve usar domínio sintético staging.airtrust.invalid');
  }
  if (apply && process.env.CONFIRM_STAGING_FRMS_QA !== CONFIRMATION_PHRASE) {
    throw new Error(`--apply requer CONFIRM_STAGING_FRMS_QA=${CONFIRMATION_PHRASE}`);
  }
  if (apply && !rollback && !password) {
    throw new Error('QA_MAINTENANCE_PASSWORD ausente');
  }

  if (!apply) {
    console.log('DRY_RUN: nenhuma escrita realizada.');
    return;
  }

  if (rollback) {
    runWranglerFile(dbName, buildRollbackSql(email));
    console.log('QA_FRMS_MAINTENANCE_FIXTURE_ROLLED_BACK');
    return;
  }

  const passwordHash = bcrypt.hashSync(password, bcrypt.genSaltSync(10));
  runWranglerFile(dbName, buildSeedSql({ email, passwordHash }));
  verifyPostconditions(dbName, email);
  console.log('QA_FRMS_MAINTENANCE_FIXTURE_READY');
}

main().catch((error) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`[seed-qa-frms-maintenance][ERROR] ${message}`);
  process.exitCode = 1;
});
