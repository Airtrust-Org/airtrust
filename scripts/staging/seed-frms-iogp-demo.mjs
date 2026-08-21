#!/usr/bin/env node

// source_reference: synthetic, tenant-safe fixture for FRMS IOGP 690-2 demo
// in Staging. Populates August 2026 journeys, cumulative rolling hours,
// bio-mathematical fatigue factorization, and operational demand metrics for
// tenant 999006 (qa_examiner_training).
// operational_decision: STAGING_ONLY; strictly blocked on production (airtrust-db);
// strictly isolated to tenant 999006; all fixture entities prefixed with QA;
// zero PII or real credentials used; idempotent upserts by natural QA keys.
// dry_run_required: default mode is dry-run; --apply requires
// CONFIRM_STAGING_QA_SEED=AIRTRUST_STAGING_QA_SEED.
// rollback_plan_required: scripts/staging/cleanup-frms-iogp-demo.mjs removes
// only rows matching the QA fixture natural keys.

import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';

export const ALLOWED_D1_NAME = 'airtrust-db-staging-baseline-20260701';
export const ALLOWED_D1_ID = 'bf9963f4-eb12-439b-a830-20bbf577ac22';
export const BLOCKED_D1_NAMES = ['airtrust-db', 'airtrust-db-dev', 'airtrust-db-production'];

export const ALLOWED_TENANT_ID = 999006;
export const ALLOWED_TENANT_CODIGO = 'qa_examiner_training';
export const FIXTURE_ORIGEM = 'QA_IOGP_DEMO_20260821';
export const FIXTURE_TRIPULANTE_MATRICULA = 'QA-TRIP-IOGP-01';
export const FIXTURE_TRIPULANTE_NOME = 'QA Tripulante IOGP Demo';
export const FIXTURE_TRIPULANTE_GUERRA = 'QA Comandante Demo';

export const CONFIRMATION_PHRASE = 'AIRTRUST_STAGING_QA_SEED';

export function sqlString(value) {
  if (value == null) return 'NULL';
  return `'${String(value).replace(/'/g, "''")}'`;
}

export function validateD1Target(name, isLocal = false) {
  const trimmed = String(name || '').trim();
  if (!trimmed) throw new Error('D1 target vazio — seed bloqueado.');
  if (BLOCKED_D1_NAMES.includes(trimmed.toLowerCase()) || /prod/i.test(trimmed)) {
    throw new Error(`D1 alvo "${trimmed}" está bloqueado (produção). Seed permitido apenas em "${ALLOWED_D1_NAME}".`);
  }
  if (!isLocal && trimmed !== ALLOWED_D1_NAME) {
    throw new Error(`D1 alvo "${trimmed}" não é o staging esperado. Permitido apenas "${ALLOWED_D1_NAME}".`);
  }
  return trimmed;
}

export function validateTenantTarget(tenantId, tenantCodigo) {
  if (Number(tenantId) !== ALLOWED_TENANT_ID) {
    throw new Error(`Tenant ID ${tenantId} não autorizado. Permitido exclusivamente tenant ${ALLOWED_TENANT_ID} (${ALLOWED_TENANT_CODIGO}).`);
  }
  if (tenantCodigo && tenantCodigo !== ALLOWED_TENANT_CODIGO) {
    throw new Error(`Tenant código "${tenantCodigo}" não autorizado. Permitido exclusivamente "${ALLOWED_TENANT_CODIGO}".`);
  }
}

export function buildSeedSql() {
  const e = sqlString;
  const tId = ALLOWED_TENANT_ID;
  const origem = FIXTURE_ORIGEM;
  const matricula = FIXTURE_TRIPULANTE_MATRICULA;
  const nome = FIXTURE_TRIPULANTE_NOME;
  const guerra = FIXTURE_TRIPULANTE_GUERRA;

  return `
-- 1. TRIPULANTE SINTÉTICO QA
INSERT INTO funcionarios (
  nome, guerra, matricula, cargo, setor, setor_id, status, is_instrutor, is_examinador, ativo, empresa_id, created_at, updated_at, deleted_at
)
SELECT
  ${e(nome)}, ${e(guerra)}, ${e(matricula)}, 'Comandante Offshore QA', 'Setor QA Examinador', 1, 'ATIVO', 0, 0, 1, ${tId}, datetime('now'), datetime('now'), NULL
WHERE NOT EXISTS (
  SELECT 1 FROM funcionarios WHERE matricula = ${e(matricula)} AND empresa_id = ${tId} AND deleted_at IS NULL
);

UPDATE funcionarios
SET nome = ${e(nome)}, guerra = ${e(guerra)}, cargo = 'Comandante Offshore QA', setor = 'Setor QA Examinador', setor_id = 1, status = 'ATIVO', is_instrutor = 0, is_examinador = 0, ativo = 1, updated_at = datetime('now'), deleted_at = NULL
WHERE matricula = ${e(matricula)} AND empresa_id = ${tId};

-- 2. JORNADAS SINTÉTICAS AGOSTO/2026 (Demonstração IOGP 690-2)
-- Dia 1: 2026-08-18 (5h30 voo, 9h00 FDP, 6 setores, 6 pousos)
INSERT OR REPLACE INTO frms_jornada (
  id, tripulante_id, data, status, hora_apresentacao, hora_termino, duracao_jornada_minutos, horas_voo_minutos,
  hora_primeiro_acionamento, hora_primeira_decolagem, hora_ultimo_pouso, hora_corte_motor,
  hora_acordou, hora_dormiu, sono_efetivo_min, fonte_sono, registrado_por, origem, observacao, empresa_id, created_at, updated_at, deleted_at
)
SELECT
  'qa-frms-demo-20260818-01', f.id, '2026-08-18', 'ES', '07:00:00', '16:00:00', 540, 330,
  '07:30:00', '07:45:00', '15:15:00', '15:30:00',
  '05:30:00', '22:00:00', 450, 'INFORMADO', ${e(origem)}, 'MANUAL', 'DEMO_QA_IOGP_690_2', ${tId}, datetime('now'), datetime('now'), NULL
FROM funcionarios f WHERE f.matricula = ${e(matricula)} AND f.empresa_id = ${tId} AND f.deleted_at IS NULL;

-- Dia 2: 2026-08-19 (6h15 voo, 10h15 FDP, 8 setores, 8 pousos)
INSERT OR REPLACE INTO frms_jornada (
  id, tripulante_id, data, status, hora_apresentacao, hora_termino, duracao_jornada_minutos, horas_voo_minutos,
  hora_primeiro_acionamento, hora_primeira_decolagem, hora_ultimo_pouso, hora_corte_motor,
  hora_acordou, hora_dormiu, sono_efetivo_min, fonte_sono, registrado_por, origem, observacao, empresa_id, created_at, updated_at, deleted_at
)
SELECT
  'qa-frms-demo-20260819-01', f.id, '2026-08-19', 'ES', '06:45:00', '17:00:00', 615, 375,
  '07:15:00', '07:30:00', '16:15:00', '16:30:00',
  '05:15:00', '22:30:00', 435, 'INFORMADO', ${e(origem)}, 'MANUAL', 'DEMO_QA_IOGP_690_2', ${tId}, datetime('now'), datetime('now'), NULL
FROM funcionarios f WHERE f.matricula = ${e(matricula)} AND f.empresa_id = ${tId} AND f.deleted_at IS NULL;

-- Dia 3: 2026-08-20 (7h00 voo, 11h00 FDP, 8 setores, 8 pousos, 2 shuttles offshore)
INSERT OR REPLACE INTO frms_jornada (
  id, tripulante_id, data, status, hora_apresentacao, hora_termino, duracao_jornada_minutos, horas_voo_minutos,
  hora_primeiro_acionamento, hora_primeira_decolagem, hora_ultimo_pouso, hora_corte_motor,
  hora_acordou, hora_dormiu, sono_efetivo_min, fonte_sono, registrado_por, origem, observacao, empresa_id, created_at, updated_at, deleted_at
)
SELECT
  'qa-frms-demo-20260820-01', f.id, '2026-08-20', 'ES', '06:30:00', '17:30:00', 660, 420,
  '07:00:00', '07:15:00', '16:45:00', '17:00:00',
  '05:00:00', '22:15:00', 420, 'INFORMADO', ${e(origem)}, 'MANUAL', 'DEMO_QA_IOGP_690_2', ${tId}, datetime('now'), datetime('now'), NULL
FROM funcionarios f WHERE f.matricula = ${e(matricula)} AND f.empresa_id = ${tId} AND f.deleted_at IS NULL;

-- Dia 4: 2026-08-21 (5h45 voo, 9h30 FDP, 6 setores, 6 pousos)
INSERT OR REPLACE INTO frms_jornada (
  id, tripulante_id, data, status, hora_apresentacao, hora_termino, duracao_jornada_minutos, horas_voo_minutos,
  hora_primeiro_acionamento, hora_primeira_decolagem, hora_ultimo_pouso, hora_corte_motor,
  hora_acordou, hora_dormiu, sono_efetivo_min, fonte_sono, registrado_por, origem, observacao, empresa_id, created_at, updated_at, deleted_at
)
SELECT
  'qa-frms-demo-20260821-01', f.id, '2026-08-21', 'ES', '07:00:00', '16:30:00', 570, 345,
  '07:30:00', '07:45:00', '15:45:00', '16:00:00',
  '05:30:00', '22:00:00', 450, 'INFORMADO', ${e(origem)}, 'MANUAL', 'DEMO_QA_IOGP_690_2', ${tId}, datetime('now'), datetime('now'), NULL
FROM funcionarios f WHERE f.matricula = ${e(matricula)} AND f.empresa_id = ${tId} AND f.deleted_at IS NULL;

-- 3. FATORIZAÇÃO BIO-MATEMÁTICA / EFFECTIVENESS
INSERT OR REPLACE INTO frms_fatorizacao_jornada (
  id, jornada_id, effectiveness_pct, effectiveness_nivel, total_fatorizado_jornada, duracao_sono_efetiva_min, processado_com_bug, created_at, updated_at, deleted_at
)
VALUES
  ('qa-frms-fator-20260818-01', 'qa-frms-demo-20260818-01', 91.5, 'PLENA', 540, 450, 0, datetime('now'), datetime('now'), NULL),
  ('qa-frms-fator-20260819-01', 'qa-frms-demo-20260819-01', 87.0, 'ATENÇÃO', 615, 435, 0, datetime('now'), datetime('now'), NULL),
  ('qa-frms-fator-20260820-01', 'qa-frms-demo-20260820-01', 84.5, 'ATENÇÃO', 660, 420, 0, datetime('now'), datetime('now'), NULL),
  ('qa-frms-fator-20260821-01', 'qa-frms-demo-20260821-01', 89.0, 'ATENÇÃO', 570, 450, 0, datetime('now'), datetime('now'), NULL);

-- 4. ACÚMULO ROLLING CONSOLIDADO (Para cálculo rápido dos cards 1d/7d/28d/365d)
INSERT OR REPLACE INTO frms_acumulo_rolling (
  id, tripulante_id, data_referencia, hv_dia_min, hv_7_dias_min, hv_28_dias_min, hv_mes_calendario_min, hv_365_dias_min,
  pct_limite_dia, pct_limite_7d, pct_limite_28d, pct_limite_mes_calendario, pct_limite_365d,
  repouso_anterior_min, repouso_suficiente, updated_at
)
SELECT
  'qa-rolling-20260821-01', f.id, '2026-08-21', 345, 1470, 3600, 3600, 27000,
  57.5, 54.4, 50.0, 50.0, 45.0,
  870, 1, datetime('now')
FROM funcionarios f WHERE f.matricula = ${e(matricula)} AND f.empresa_id = ${tId} AND f.deleted_at IS NULL;

-- 5. LANÇAMENTOS DE HORAS DE VOO / DEMANDA OPERACIONAL (Setores, Pousos, Shuttles)
INSERT OR REPLACE INTO horas_voo_lancamentos (
  funcionario_id, empresa_id, data_voo, duracao_total_min, duracao_pic_min, duracao_instrumento_min,
  pousos_dia, pousos_noite, funcao, observacoes, origem_registro, created_at, updated_at, deleted_at
)
SELECT
  f.id, ${tId}, '2026-08-18', 330, 330, 60,
  6, 0, 'PIC', 'DEMO_QA_IOGP_690_2 - 6 setores / 6 pousos', ${e(origem)}, datetime('now'), datetime('now'), NULL
FROM funcionarios f WHERE f.matricula = ${e(matricula)} AND f.empresa_id = ${tId} AND f.deleted_at IS NULL;

INSERT OR REPLACE INTO horas_voo_lancamentos (
  funcionario_id, empresa_id, data_voo, duracao_total_min, duracao_pic_min, duracao_instrumento_min,
  pousos_dia, pousos_noite, funcao, observacoes, origem_registro, created_at, updated_at, deleted_at
)
SELECT
  f.id, ${tId}, '2026-08-19', 375, 375, 90,
  8, 0, 'PIC', 'DEMO_QA_IOGP_690_2 - 8 setores / 8 pousos', ${e(origem)}, datetime('now'), datetime('now'), NULL
FROM funcionarios f WHERE f.matricula = ${e(matricula)} AND f.empresa_id = ${tId} AND f.deleted_at IS NULL;

INSERT OR REPLACE INTO horas_voo_lancamentos (
  funcionario_id, empresa_id, data_voo, duracao_total_min, duracao_pic_min, duracao_instrumento_min,
  pousos_dia, pousos_noite, funcao, observacoes, origem_registro, created_at, updated_at, deleted_at
)
SELECT
  f.id, ${tId}, '2026-08-20', 420, 420, 120,
  8, 0, 'PIC', 'DEMO_QA_IOGP_690_2 - 8 setores / 8 pousos (2 shuttles offshore)', ${e(origem)}, datetime('now'), datetime('now'), NULL
FROM funcionarios f WHERE f.matricula = ${e(matricula)} AND f.empresa_id = ${tId} AND f.deleted_at IS NULL;

INSERT OR REPLACE INTO horas_voo_lancamentos (
  funcionario_id, empresa_id, data_voo, duracao_total_min, duracao_pic_min, duracao_instrumento_min,
  pousos_dia, pousos_noite, funcao, observacoes, origem_registro, created_at, updated_at, deleted_at
)
SELECT
  f.id, ${tId}, '2026-08-21', 345, 345, 60,
  6, 0, 'PIC', 'DEMO_QA_IOGP_690_2 - 6 setores / 6 pousos', ${e(origem)}, datetime('now'), datetime('now'), NULL
FROM funcionarios f WHERE f.matricula = ${e(matricula)} AND f.empresa_id = ${tId} AND f.deleted_at IS NULL;
`;
}

async function main() {
  const args = new Set(process.argv.slice(2));
  const apply = args.has('--apply');
  const local = args.has('--local');

  const dbName = validateD1Target(process.env.STAGING_D1_NAME || ALLOWED_D1_NAME, local);
  validateTenantTarget(process.env.STAGING_TENANT_ID || ALLOWED_TENANT_ID, process.env.STAGING_TENANT_CODIGO || ALLOWED_TENANT_CODIGO);

  console.log(`TARGET_DB=${dbName}`);
  console.log(`MODE=${apply ? 'apply' : 'dry-run'}`);
  console.log(`TARGET_TENANT=${ALLOWED_TENANT_ID} (${ALLOWED_TENANT_CODIGO})`);
  console.log(`FIXTURE_ORIGEM=${FIXTURE_ORIGEM}`);

  const sql = buildSeedSql();

  if (!apply) {
    console.log('DRY_RUN: nenhuma escrita realizada. SQL validado, pronto para --apply.');
    return;
  }

  if (process.env.CONFIRM_STAGING_QA_SEED !== CONFIRMATION_PHRASE) {
    throw new Error(`--apply requer CONFIRM_STAGING_QA_SEED=${CONFIRMATION_PHRASE}.`);
  }

  const tempDir = mkdtempSync(join(tmpdir(), 'airtrust-frms-iogp-seed-'));
  const sqlFile = join(tempDir, 'seed.sql');
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
      throw new Error(`Falha ao aplicar seed SQL via wrangler (código ${result.status}).`);
    }

    console.log('SEED_APPLIED');
  } finally {
    rmSync(tempDir, { recursive: true, force: true });
  }
}

if (process.argv[1] && process.argv[1].endsWith('seed-frms-iogp-demo.mjs')) {
  main().catch((err) => {
    console.error('ERRO NO SEED:', err.message);
    process.exit(1);
  });
}
