#!/usr/bin/env node

// source_reference: guarded recovery for failed synthetic Controle de Voos staging E2E runs.
// operational_decision: derive cleanup targets only from the exact synthetic
// company-code and user-email conventions; arbitrary empresa/user ids are never accepted.
// dry_run_required: default execution is read-only discovery/dry-run; remote DELETE
// statements execute only with explicit --apply.
// rollback_plan_required: staging-only synthetic fixture cleanup; target is locked
// to canonical staging D1 and every target is reproducible from the 8-hex run id.

import { spawnSync } from 'node:child_process';

const ALLOWED_D1_NAME = 'airtrust-db-staging-baseline-20260701';
const WORKER_DIR = decodeURIComponent(new URL('../../worker-airtrust/', import.meta.url).pathname);

function log(message) {
  process.stderr.write(`[cleanup-cv-e2e-orphan-v2] ${message}\n`);
}

function runWrangler(dbName, sql, label) {
  const result = spawnSync(
    'npx',
    ['wrangler', 'd1', 'execute', dbName, '--env', 'staging', '--remote', '--command', sql, '--json'],
    { cwd: WORKER_DIR, encoding: 'utf8' },
  );
  if (result.status !== 0) throw new Error(`${label}: ${result.stderr || result.stdout || `exit=${result.status}`}`);
  return JSON.parse(result.stdout);
}

function queryRows(dbName, sql, label) {
  return runWrangler(dbName, sql, label)?.[0]?.results ?? [];
}

function sqlString(value) {
  return `'${String(value).replace(/'/g, "''")}'`;
}

const runId = String(process.argv[2] || '').trim().toLowerCase();
const apply = process.argv.includes('--apply');
if (!/^[0-9a-f]{8}$/.test(runId)) {
  throw new Error('Uso: cleanup-controle-voos-e2e-orphan-run-v2.mjs <8-hex-run-id> [--apply]');
}

const dbName = String(process.env.STAGING_D1_NAME || ALLOWED_D1_NAME);
if (dbName !== ALLOWED_D1_NAME || /prod|production/i.test(dbName)) {
  throw new Error(`D1 alvo nao permitido: ${dbName}`);
}

const codeA = `cv_e2e_synth_a_${runId}`;
const codeB = `cv_e2e_synth_b_${runId}`;
const companies = queryRows(
  dbName,
  `SELECT id, codigo, nome FROM empresas WHERE codigo IN (${sqlString(codeA)}, ${sqlString(codeB)}) ORDER BY codigo;`,
  'discover:empresas',
);

if (companies.length === 0) {
  log(`runId=${runId} ja esta limpo; nenhuma empresa sintetica encontrada.`);
  process.exit(0);
}
if (companies.length !== 2) throw new Error(`ORPHAN_COMPANY_SET_INCOMPLETE:${companies.length}`);
for (const company of companies) {
  if (!String(company.codigo || '').startsWith('cv_e2e_synth_')) throw new Error('NON_SYNTHETIC_CODE_REJECTED');
  if (!String(company.nome || '').startsWith('CV E2E Synthetic Tenant ')) throw new Error('NON_SYNTHETIC_NAME_REJECTED');
}

const empresaIds = companies.map((row) => Number(row.id));
if (empresaIds.some((id) => !Number.isInteger(id) || id <= 0)) throw new Error('INVALID_SYNTHETIC_EMPRESA_ID');
const empresaIdList = empresaIds.join(', ');

const expectedEmails = [
  `cv.e2e.admin.a.${runId}@synthetic.invalid`,
  `cv.e2e.coord.a.${runId}@synthetic.invalid`,
  `cv.e2e.aprov.a.${runId}@synthetic.invalid`,
  `cv.e2e.viewer.a.${runId}@synthetic.invalid`,
  `cv.e2e.admin.b.${runId}@synthetic.invalid`,
];
const userRows = queryRows(
  dbName,
  `SELECT id, email FROM usuarios WHERE email IN (${expectedEmails.map(sqlString).join(', ')}) ORDER BY email;`,
  'discover:users-by-exact-email',
);
if (userRows.length !== expectedEmails.length) {
  throw new Error(`SYNTHETIC_USER_SET_INCOMPLETE:${userRows.length}/${expectedEmails.length}`);
}
const allowedEmails = new Set(expectedEmails);
for (const row of userRows) {
  if (!allowedEmails.has(String(row.email || ''))) throw new Error('NON_SYNTHETIC_USER_REJECTED');
}
const userIds = userRows.map((row) => Number(row.id));
if (userIds.some((id) => !Number.isInteger(id) || id <= 0)) throw new Error('INVALID_SYNTHETIC_USER_ID');
const userIdList = userIds.join(', ');

log(`runId=${runId} empresas=${empresaIdList} users=${userIds.length} apply=${apply}`);

const statements = [
  ['cv_voo_eventos', `DELETE FROM cv_voo_eventos WHERE empresa_id IN (${empresaIdList});`],
  ['cv_rdv_aprovacoes', `DELETE FROM cv_rdv_aprovacoes WHERE empresa_id IN (${empresaIdList});`],
  ['cv_rdv_revisoes', `DELETE FROM cv_rdv_revisoes WHERE empresa_id IN (${empresaIdList});`],
  ['cv_rdv_alertas', `DELETE FROM cv_rdv_alertas WHERE empresa_id IN (${empresaIdList});`],
  ['cv_voo_abastecimentos', `DELETE FROM cv_voo_abastecimentos WHERE empresa_id IN (${empresaIdList});`],
  ['cv_voo_tripulantes', `DELETE FROM cv_voo_tripulantes WHERE empresa_id IN (${empresaIdList});`],
  ['cv_voo_etapas', `DELETE FROM cv_voo_etapas WHERE empresa_id IN (${empresaIdList});`],
  ['cv_rdv_operacional', `DELETE FROM cv_rdv_operacional WHERE empresa_id IN (${empresaIdList});`],
  ['cv_voos', `DELETE FROM cv_voos WHERE empresa_id IN (${empresaIdList});`],
  ['cv_aeroportos', `DELETE FROM cv_aeroportos WHERE empresa_id IN (${empresaIdList});`],
  ['cv_tipos_voo', `DELETE FROM cv_tipos_voo WHERE empresa_id IN (${empresaIdList});`],
  ['cv_naturezas_voo', `DELETE FROM cv_naturezas_voo WHERE empresa_id IN (${empresaIdList});`],
  ['cv_motivos_operacionais', `DELETE FROM cv_motivos_operacionais WHERE empresa_id IN (${empresaIdList});`],
  ['aeronaves', `DELETE FROM aeronaves WHERE empresa_id IN (${empresaIdList});`],
  ['modelos_aeronave', `DELETE FROM modelos_aeronave WHERE empresa_id IN (${empresaIdList});`],
  ['auditoria_avancada_v2', `DELETE FROM auditoria_avancada_v2 WHERE usuario_id IN (${userIdList}) OR (tabela = 'domain_events' AND registro_id IN (SELECT id FROM domain_events WHERE empresa_id IN (${empresaIdList})));`],
  ['auditoria', `DELETE FROM auditoria WHERE usuario_id IN (${userIdList});`],
  ['domain_events', `DELETE FROM domain_events WHERE empresa_id IN (${empresaIdList});`],
  ['refresh_tokens', `DELETE FROM refresh_tokens WHERE user_id IN (${userIdList});`],
  ['funcionarios', `DELETE FROM funcionarios WHERE empresa_id IN (${empresaIdList});`],
  ['setores', `DELETE FROM setores WHERE empresa_id IN (${empresaIdList});`],
  ['usuarios_empresas', `DELETE FROM usuarios_empresas WHERE empresa_id IN (${empresaIdList}) OR usuario_id IN (${userIdList});`],
  ['usuarios', `DELETE FROM usuarios WHERE id IN (${userIdList});`],
  ['empresas', `DELETE FROM empresas WHERE id IN (${empresaIdList});`],
];

if (!apply) {
  for (const [label, sql] of statements) log(`[dry-run:${label}] ${sql}`);
  process.exit(0);
}
for (const [label, sql] of statements) {
  log(`delete:${label}`);
  runWrangler(dbName, sql, `cleanup:${label}`);
}

const remaining = queryRows(
  dbName,
  `SELECT
     (SELECT COUNT(*) FROM empresas WHERE id IN (${empresaIdList})) AS empresas_restantes,
     (SELECT COUNT(*) FROM usuarios WHERE id IN (${userIdList})) AS usuarios_restantes,
     (SELECT COUNT(*) FROM refresh_tokens WHERE user_id IN (${userIdList})) AS refresh_tokens_restantes,
     (SELECT COUNT(*) FROM funcionarios WHERE empresa_id IN (${empresaIdList})) AS funcionarios_restantes,
     (SELECT COUNT(*) FROM setores WHERE empresa_id IN (${empresaIdList})) AS setores_restantes;`,
  'verify:cleanup',
)[0];
const residual = {
  empresas: Number(remaining?.empresas_restantes ?? -1),
  usuarios: Number(remaining?.usuarios_restantes ?? -1),
  refreshTokens: Number(remaining?.refresh_tokens_restantes ?? -1),
  funcionarios: Number(remaining?.funcionarios_restantes ?? -1),
  setores: Number(remaining?.setores_restantes ?? -1),
};
if (Object.values(residual).some((value) => value !== 0)) {
  throw new Error(`ORPHAN_CLEANUP_POSTCONDITION_FAILED:${JSON.stringify(residual)}`);
}
log(`runId=${runId} cleanup=PASS`);
