#!/usr/bin/env node

// source_reference: seed only the synthetic staging smoke tenant/user required by docs/STAGING_ENVIRONMENT_STABILIZATION_20260701.md and the rebuilt D1 staging target from PR #226.
// operational_decision: write only to the new staging D1, rotate only the fake smoke credential hash from env, and never persist or print the cleartext password/token.
// dry_run_required: run without --apply first to confirm required env vars and target DB before any remote D1 write.
// rollback_plan_required: reseed with a new env-supplied password or soft-delete the synthetic tenant/user rows in the same staging D1 during an approved rollback window.

import { createRequire } from 'node:module';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';

const require = createRequire(new URL('../worker-airtrust/package.json', import.meta.url));
const bcrypt = require('bcryptjs');

// ─────────────────────────────────────────────────────────────
// D1 alvo permitido — apenas o staging reconstruído
// ─────────────────────────────────────────────────────────────
const ALLOWED_D1_NAME = 'airtrust-db-staging-baseline-20260701';
const ALLOWED_D1_DATABASE_ID = 'bf9963f4-eb12-439b-a830-20bbf577ac22';

// Nomes de D1 explicitamente bloqueados (produção e staging antigo)
const BLOCKED_D1_NAMES = [
  'airtrust-db',
  'airtrust-db-staging',
  'airtrust-db-prod',
  'airtrust-db-production',
];

function isBlockedD1Name(name) {
  const lower = name.toLowerCase();
  if (BLOCKED_D1_NAMES.includes(lower)) return true;
  if (lower.includes('prod')) return true;
  if (lower.includes('production')) return true;
  return false;
}

function validateD1Target(name) {
  const trimmed = String(name).trim();
  if (!trimmed) {
    throw new Error('STAGING_D1_NAME vazio — seed bloqueado. Informe o nome do D1 staging reconstruído.');
  }
  if (isBlockedD1Name(trimmed)) {
    throw new Error(
      `D1 alvo "${trimmed}" está na lista de bloqueio de produção. Seed permitido apenas para "${ALLOWED_D1_NAME}".`,
    );
  }
  if (trimmed !== ALLOWED_D1_NAME) {
    throw new Error(
      `D1 alvo "${trimmed}" não é o staging reconstruído esperado. Permitido apenas "${ALLOWED_D1_NAME}".`,
    );
  }
  return trimmed;
}

const DEFAULT_EMPRESA_CODIGO = 'airtrust_smoke';
const DEFAULT_EMPRESA_NOME = 'AirTrust Smoke Tenant';
const DEFAULT_USUARIO_NOME = 'Smoke Staging Admin';

async function main() {
  const args = new Set(process.argv.slice(2));
  const apply = args.has('--apply');
  const hasConfirmFlag = args.has('--confirm-staging-baseline');
  const confirmEnv = String(process.env.CONFIRM_STAGING_D1 || '').trim();

  // Validação explícita do D1 alvo (ocorre sempre, mesmo em dry-run)
  let rawDbName = String(process.env.STAGING_D1_NAME || ALLOWED_D1_NAME);
  const dbName = validateD1Target(rawDbName);

  // Confirmação explícita exigida para --apply
  if (apply && !hasConfirmFlag && confirmEnv !== ALLOWED_D1_NAME) {
    throw new Error(
      [
        '--apply requer confirmação explícita do D1 staging reconstruído.',
        `Use --confirm-staging-baseline ou env CONFIRM_STAGING_D1=${ALLOWED_D1_NAME}.`,
        `Alvo: ${dbName}`,
      ].join('\n'),
    );
  }

  const email = String(process.env.STAGING_SMOKE_EMAIL || '').trim().toLowerCase();
  const password = String(process.env.STAGING_SMOKE_PASSWORD || '');
  const empresaCodigo = String(process.env.STAGING_SMOKE_EMPRESA_CODIGO || DEFAULT_EMPRESA_CODIGO).trim().toLowerCase();
  const empresaNome = String(process.env.STAGING_SMOKE_EMPRESA_NOME || DEFAULT_EMPRESA_NOME).trim();
  const usuarioNome = String(process.env.STAGING_SMOKE_USER_NOME || DEFAULT_USUARIO_NOME).trim();

  const missing = [];
  if (!email) missing.push('STAGING_SMOKE_EMAIL');
  if (!password) missing.push('STAGING_SMOKE_PASSWORD');
  if (!empresaCodigo) missing.push('STAGING_SMOKE_EMPRESA_CODIGO');
  if (!empresaNome) missing.push('STAGING_SMOKE_EMPRESA_NOME');
  if (!usuarioNome) missing.push('STAGING_SMOKE_USER_NOME');

  log(`TARGET_DB=${dbName}`);
  log(`SMOKE_EMAIL=${maskEmail(email)}`);
  log(`MODE=${apply ? 'apply' : 'dry-run'}`);

  if (missing.length > 0) {
    log(`MISSING_ENV=${missing.join(',')}`);
    if (apply) {
      throw new Error(`Segredos/variaveis ausentes para apply: ${missing.join(', ')}`);
    }
    log('SEED_SKIPPED');
    return;
  }

  // Verificação adicional de segurança para empresa soft-deletada com nome não-fixture.
  // Esta checagem é documental (o SQL também protege), mas o log permite detecção precoce.
  const smokeEmpresaCodigo = empresaCodigo;
  const smokeEmpresaNome = empresaNome;
  const isSmokeFixture =
    smokeEmpresaNome.toLowerCase().includes('smoke') || smokeEmpresaCodigo.toLowerCase().includes('smoke');

  if (!isSmokeFixture) {
    throw new Error(
      `Empresa "${smokeEmpresaNome}" (codigo="${smokeEmpresaCodigo}") não parece fixture smoke. ` +
        'Use codigo/nome contendo "smoke" para evitar reativação acidental de dados reais.',
    );
  }

  const passwordHash = bcrypt.hashSync(password, bcrypt.genSaltSync(10));
  const sql = buildSeedSql({
    email,
    passwordHash,
    empresaCodigo,
    empresaNome,
    usuarioNome,
  });

  if (!apply) {
    log('SEED_READY');
    return;
  }

  const tempDir = mkdtempSync(join(tmpdir(), 'airtrust-staging-smoke-'));
  const sqlFile = join(tempDir, 'seed.sql');
  writeFileSync(sqlFile, sql, 'utf8');

  try {
    const result = spawnSync(
      'npx',
      ['wrangler', 'd1', 'execute', dbName, '--remote', '--file', sqlFile, '--json'],
      {
        cwd: join(process.cwd(), 'worker-airtrust'),
        encoding: 'utf8',
      },
    );

    if (result.status !== 0) {
      throw new Error(result.stderr || result.stdout || 'wrangler d1 execute falhou');
    }

    log('SEED_APPLIED');
  } finally {
    rmSync(tempDir, { recursive: true, force: true });
  }
}

function buildSeedSql({ email, passwordHash, empresaCodigo, empresaNome, usuarioNome }) {
  const e = sqlString;
  // D1 não suporta BEGIN TRANSACTION/COMMIT — cada statement é
  // executado individualmente. A atomicidade é garantida pelo wrangler.
  return `
-- ======================================================================
-- EMPRESA: upsert idempotente da fixture smoke.
--
-- Proteção contra reativação acidental de empresa real soft-deletada:
-- O INSERT só executa se não existir empresa ATIVA com o mesmo codigo.
-- O UPDATE reativa empresa soft-deletada se o codigo coincidir.
--
-- Política de segurança:
-- - O codigo "airtrust_smoke"  é reservado exclusivamente para fixture
--   fake. Nunca haverá empresa real com este codigo em staging/produção.
-- - Se houver empresa soft-deletada com codigo "airtrust_smoke", foi
--   criada por execução anterior DESTE mesmo script — reativar é seguro.
-- - Se houver empresa soft-deletada com codigo "airtrust_smoke" cujo
--   nome NÃO contenha "Smoke" ou "smoke", o seed falha e exige
--   saneamento manual (é um cenário improvável, mas o guard existe).
-- ======================================================================
INSERT INTO empresas (
  nome, razao_social, ativo, created_at, updated_at, deleted_at,
  codigo, plano, max_funcionarios, max_storage_mb
)
SELECT
  ${e(empresaNome)}, ${e(empresaNome)}, 1, datetime('now'), datetime('now'), NULL,
  ${e(empresaCodigo)}, 'basic', 25, 256
WHERE NOT EXISTS (
  SELECT 1 FROM empresas WHERE codigo = ${e(empresaCodigo)} AND deleted_at IS NULL
);

UPDATE empresas SET
  nome = ${e(empresaNome)},
  razao_social = ${e(empresaNome)},
  ativo = 1,
  plano = 'basic',
  deleted_at = NULL,
  updated_at = datetime('now')
WHERE codigo = ${e(empresaCodigo)};

INSERT INTO usuarios (
  email,
  password_hash,
  nome,
  perfil,
  funcionario_id,
  deleted_at,
  created_at,
  updated_at,
  active
)
SELECT
  ${e(email)},
  ${e(passwordHash)},
  ${e(usuarioNome)},
  'ADMIN',
  NULL,
  NULL,
  datetime('now'),
  datetime('now'),
  1
WHERE NOT EXISTS (
  SELECT 1 FROM usuarios WHERE email = ${e(email)}
);

UPDATE usuarios
SET
  password_hash = ${e(passwordHash)},
  nome = ${e(usuarioNome)},
  perfil = 'ADMIN',
  deleted_at = NULL,
  active = 1,
  updated_at = datetime('now')
WHERE email = ${e(email)};

INSERT INTO usuarios_empresas (
  usuario_id,
  empresa_id,
  role,
  is_primary,
  created_at
)
SELECT
  u.id,
  emp.id,
  'admin',
  1,
  datetime('now')
FROM usuarios u
JOIN empresas emp ON emp.codigo = ${e(empresaCodigo)}
WHERE u.email = ${e(email)}
  AND NOT EXISTS (
    SELECT 1
    FROM usuarios_empresas ue
    WHERE ue.usuario_id = u.id
      AND ue.empresa_id = emp.id
  );

UPDATE usuarios_empresas
SET
  role = 'admin',
  is_primary = 1
WHERE usuario_id = (SELECT id FROM usuarios WHERE email = ${e(email)} LIMIT 1)
  AND empresa_id = (SELECT id FROM empresas WHERE codigo = ${e(empresaCodigo)} LIMIT 1);
`.trim();
}

function sqlString(value) {
  return `'${String(value).replaceAll("'", "''")}'`;
}

function maskEmail(value) {
  const [local, domain] = String(value).split('@');
  if (!local || !domain) return 'missing';
  return `${local.slice(0, 2)}***@${domain}`;
}

function log(message) {
  process.stdout.write(`[seed-staging-smoke-user] ${message}\n`);
}

main().catch((error) => {
  const message = error instanceof Error ? error.message : String(error);
  process.stderr.write(`[seed-staging-smoke-user][ERROR] ${message}\n`);
  process.exitCode = 1;
});
