#!/usr/bin/env node

// source_reference: cleanup script for FRMS IOGP demo fixture in Staging.
// Removes ONLY rows matching the QA fixture natural keys (QA-TRIP-IOGP-01,
// QA_IOGP_DEMO_20260821) in tenant 999006. Never touches unrelated rows.
// operational_decision: STAGING_ONLY; strictly blocked on production (airtrust-db);
// dry_run_required: default mode is dry-run; --apply requires
// CONFIRM_STAGING_QA_CLEANUP=AIRTRUST_STAGING_QA_CLEANUP.
// rollback_plan_required: idempotent soft-delete / delete of synthetic fixture.

import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import {
  ALLOWED_D1_NAME,
  ALLOWED_TENANT_ID,
  ALLOWED_TENANT_CODIGO,
  FIXTURE_ORIGEM,
  FIXTURE_TRIPULANTE_MATRICULA,
  validateD1Target,
  validateTenantTarget,
  sqlString,
} from './seed-frms-iogp-demo.mjs';

export const CLEANUP_CONFIRMATION_PHRASE = 'AIRTRUST_STAGING_QA_CLEANUP';

export function buildCleanupSql() {
  const e = sqlString;
  const tId = ALLOWED_TENANT_ID;
  const origem = FIXTURE_ORIGEM;
  const matricula = FIXTURE_TRIPULANTE_MATRICULA;

  return `
-- 1. Remover fatorizações da fixture QA
DELETE FROM frms_fatorizacao_jornada
WHERE id LIKE 'qa-frms-fator-%';

-- 2. Remover jornadas da fixture QA
DELETE FROM frms_jornada
WHERE registrado_por = ${e(origem)}
  AND tripulante_id IN (
    SELECT id FROM funcionarios WHERE empresa_id = ${tId} AND matricula = ${e(matricula)}
  );

-- 3. Remover acúmulo rolling da fixture QA
DELETE FROM frms_acumulo_rolling
WHERE tripulante_id IN (
  SELECT id FROM funcionarios WHERE empresa_id = ${tId} AND matricula = ${e(matricula)}
);

-- 4. Remover lançamentos de horas de voo da fixture QA
DELETE FROM horas_voo_lancamentos
WHERE origem_registro = ${e(origem)}
  AND empresa_id = ${tId};

-- 5. Soft-delete do tripulante sintético QA
UPDATE funcionarios
SET deleted_at = datetime('now'), ativo = 0
WHERE empresa_id = ${tId}
  AND matricula = ${e(matricula)};
`;
}

async function main() {
  const args = new Set(process.argv.slice(2));
  const apply = args.has('--apply');
  const local = args.has('--local');

  const dbName = validateD1Target(process.env.STAGING_D1_NAME || ALLOWED_D1_NAME, local);
  validateTenantTarget(process.env.STAGING_TENANT_ID || ALLOWED_TENANT_ID, process.env.STAGING_TENANT_CODIGO || ALLOWED_TENANT_CODIGO);

  console.log(`TARGET_DB=${dbName}`);
  console.log(`MODE=${apply ? 'cleanup-apply' : 'cleanup-dry-run'}`);
  console.log(`TARGET_TENANT=${ALLOWED_TENANT_ID} (${ALLOWED_TENANT_CODIGO})`);

  const sql = buildCleanupSql();

  if (!apply) {
    console.log('DRY_RUN: nenhuma remoção realizada. SQL validado, pronto para --apply.');
    return;
  }

  if (process.env.CONFIRM_STAGING_QA_CLEANUP !== CLEANUP_CONFIRMATION_PHRASE) {
    throw new Error(`--apply requer CONFIRM_STAGING_QA_CLEANUP=${CLEANUP_CONFIRMATION_PHRASE}.`);
  }

  const tempDir = mkdtempSync(join(tmpdir(), 'airtrust-frms-iogp-cleanup-'));
  const sqlFile = join(tempDir, 'cleanup.sql');
  writeFileSync(sqlFile, sql, 'utf8');

  try {
    const wranglerArgs = [
      'wrangler',
      'd1',
      'execute',
      dbName,
      '--config',
      'worker-airtrust/wrangler.toml',
      ...(local ? ['--local'] : ['--remote', '--env', 'staging']),
      '--file',
      sqlFile,
    ];

    const result = spawnSync('npx', wranglerArgs, {
      stdio: 'inherit',
      env: process.env,
    });

    if (result.status !== 0) {
      throw new Error(`Falha ao aplicar cleanup SQL via wrangler (código ${result.status}).`);
    }

    console.log('CLEANUP_APPLIED');
  } finally {
    rmSync(tempDir, { recursive: true, force: true });
  }
}

if (process.argv[1] && process.argv[1].endsWith('cleanup-frms-iogp-demo.mjs')) {
  main().catch((err) => {
    console.error('ERRO NO CLEANUP:', err.message);
    process.exit(1);
  });
}
