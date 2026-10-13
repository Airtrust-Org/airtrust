#!/usr/bin/env node
// source_reference: AirTrust FRMS staging QA synthetic fixture, user-authorized 2026-10-13; repo main canonical.
// operational_decision: staging-only tenant 999016; generate 14 fictitious crew, seven checkins, two journeys, one case. Never write production.
// dry_run_required: --preflight validates target and baseline without writes; --apply requires workflow confirmation and backed-up staging D1.
// rollback_plan_required: --rollback soft-disables only the QA tenant and its own marked synthetic records; D1 Time Travel recovery bookmark captured beforehand.
/**
 * FRMS UX QA: isolated, synthetic-only tenant on the exact staging D1.
 * No production data, credentials, real identities or historical import.
 * Modes: --preflight (read-only), --apply (governed workflow), --verify,
 * --rollback (soft-disable only this fixture).
 */
import { createRequire } from 'node:module';
import { createHash } from 'node:crypto';
import { mkdtempSync, rmSync, writeFileSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';

const require = createRequire(new URL('../../worker-airtrust/package.json', import.meta.url));
const bcrypt = require('bcryptjs');
export const DB_NAME = 'airtrust-db-staging-baseline-20260701';
export const DB_ID = 'bf9963f4-eb12-439b-a830-20bbf577ac22';
export const BLOCKED_PRODUCTION_ID = '7c8a788e-a4c4-4d5d-8208-ff7ff55e84ae';
export const TENANT_ID = 999016;
export const TENANT_CODE = 'qa_frms_ux_20261013';
export const EMAIL = 'qa-frms-ux@staging.airtrust.invalid';
export const CONFIRM = 'AIRTRUST_STAGING_FRMS_UX_QA';
const FIXTURE_TAG = 'QA_FRMS_UX_20261013';
export const SCOPED_REVISION = 'qa-frms-ux-helicopter-baseline-v1';
const CANONICAL_REVISION = 'frms-helicopter-offshore-baseline-v1';
const DATE = '2026-10-13';
const numbers = Array.from({ length: 14 }, (_, i) => i + 1);
export const escapeSql = value => "'" + String(value).replaceAll("'", "''") + "'";

export function assertTarget(name, id, environment) {
  if (name !== DB_NAME || id !== DB_ID || environment !== 'staging' ||
      id === BLOCKED_PRODUCTION_ID || /prod/i.test(name)) {
    throw new Error('STAGING_FRMS_UX_TARGET_DENIED');
  }
}
export function assertOperation(argv, confirmation) {
  const actions = ['--preflight', '--apply', '--verify', '--rollback'];
  const selected = actions.filter(x => argv.includes(x));
  if (selected.length !== 1 || argv.some(x => !actions.includes(x))) throw new Error('ONE_EXPLICIT_OPERATION_REQUIRED');
  if (['--apply', '--rollback'].includes(selected[0]) && confirmation !== CONFIRM) {
    throw new Error('STAGING_FRMS_UX_CONFIRMATION_REQUIRED');
  }
  return selected[0];
}
function wrangler(args) {
  const r = spawnSync('npx', ['--no-install', 'wrangler', 'd1', 'execute', DB_NAME, '--remote', '--json', ...args], {
    cwd: join(process.cwd(), 'worker-airtrust'), encoding: 'utf8', env: process.env,
    maxBuffer: 20 * 1024 * 1024,
  });
  if (r.status !== 0) throw new Error('D1_STAGING_COMMAND_FAILED_' + r.status);
  return r.stdout;
}
function readCount(sql) {
  if (!/^SELECT COUNT\(\*\) AS total FROM [a-z_]+(?:\s|\n)/i.test(sql)) throw new Error('UNSAFE_PREFLIGHT_SQL');
  const output = wrangler(['--command', sql]);
  const begin = output.indexOf('['), end = output.lastIndexOf(']');
  const parsed = JSON.parse(output.slice(begin, end + 1));
  const total = Number(parsed[0]?.results?.[0]?.total);
  if (!Number.isSafeInteger(total)) throw new Error('INVALID_D1_PREFLIGHT_COUNT');
  return total;
}
export function preflightQueries() {
  return Object.freeze({
    tenantId: "SELECT COUNT(*) AS total FROM empresas WHERE id = " + TENANT_ID,
    tenantCode: "SELECT COUNT(*) AS total FROM empresas WHERE codigo = " + escapeSql(TENANT_CODE),
    email: "SELECT COUNT(*) AS total FROM usuarios WHERE lower(email) = " + escapeSql(EMAIL),
    scopedRevision: "SELECT COUNT(*) AS total FROM frms_config_revisions WHERE id = " + escapeSql(SCOPED_REVISION) + " OR (empresa_id = " + TENANT_ID + " AND profile_code = 'HELICOPTER_OFFSHORE')",
    regulatoryProfile: "SELECT COUNT(*) AS total FROM frms_regulatory_profiles WHERE empresa_id = " + TENANT_ID,
    regulatoryAssignment: "SELECT COUNT(*) AS total FROM frms_profile_assignments WHERE empresa_id = " + TENANT_ID,
  });
}
function preflight() {
  const queries = preflightQueries();
  const counts = Object.fromEntries(Object.entries(queries).map(([k, sql]) => [k, readCount(sql)]));
  if (Object.values(counts).some(count => count !== 0)) throw new Error('SYNTHETIC_QA_TARGET_ALREADY_EXISTS');
  buildScopedRevisionSql(); // Validate reviewed source before remote D1 mutation.
  console.log('FRMS_UX_QA_PREFLIGHT_PASS tenant_unused=true scoped_revision_ready=true');
}
/**
 * The reviewed 128-coefficient HELICOPTER_OFFSHORE source is immutable code.
 * Provision a TENANT-OWNED revision instead of creating a global default that
 * could silently change another staging tenant's regulatory configuration.
 * No formulas, coefficients, thresholds or other tenants are changed.
 */
export function buildScopedRevisionSql() {
  const canonical = readFileSync(new URL('../frms-seeds/frms_helicopter_offshore_baseline_v1.sql', import.meta.url), 'utf8');
  const start = canonical.indexOf('INSERT INTO frms_config_revisions (');
  if (start < 0) throw new Error('REVIEWED_FRMS_REVISION_MISSING');
  let statements = canonical.slice(start).trim();
  if ((statements.match(/INSERT INTO frms_config_revisions\s*\(/g) || []).length !== 1 ||
      (statements.match(/INSERT INTO frms_config_parameters\s*\(/g) || []).length !== 1 ||
      (statements.match(new RegExp("'"+CANONICAL_REVISION+"-[A-Z0-9_]+',", 'g')) || []).length !== 128) {
    throw new Error('REVIEWED_FRMS_PARAMETER_SOURCE_MISMATCH');
  }
  statements = statements.replaceAll(CANONICAL_REVISION, SCOPED_REVISION);
  const before = "'"+SCOPED_REVISION+"', NULL, 'HELICOPTER_OFFSHORE'";
  if (!statements.includes(before)) throw new Error('REVIEWED_FRMS_SCOPE_MISMATCH');
  statements = statements.replace(before, "'"+SCOPED_REVISION+"', "+TENANT_ID+", 'HELICOPTER_OFFSHORE'");
  if (statements.includes(CANONICAL_REVISION) ||
      !statements.includes("'"+SCOPED_REVISION+"', "+TENANT_ID+", 'HELICOPTER_OFFSHORE'")) {
    throw new Error('REVIEWED_FRMS_TENANT_SCOPE_MISMATCH');
  }
  return statements;
}
export function buildApplySql(hash) {
  if (!/^\$2[aby]\$\d{2}\$[./A-Za-z0-9]{53}$/.test(String(hash))) throw new Error('HASH_REQUIRED');
  const e = escapeSql;
  const sql = [];
  sql.push("INSERT INTO empresas (id, codigo, nome, razao_social, ativo, plano, max_funcionarios, max_storage_mb, created_at, updated_at, deleted_at) VALUES ("+
    TENANT_ID+", "+e(TENANT_CODE)+", 'QA FRMS UX Sintetico', 'QA FRMS UX Sintetico', 1, 'basic', 30, 256, datetime('now'), datetime('now'), NULL);");
  sql.push("INSERT INTO setores (codigo, nome, descricao, responsavel, ativo, empresa_id, created_at, updated_at, deleted_at) VALUES ('QA-FRMS-UX-SETOR', 'Operacao FRMS QA', 'Dados sintéticos exclusivos', 'QA AirTrust', 1, "+TENANT_ID+", datetime('now'), datetime('now'), NULL);");
  sql.push(buildScopedRevisionSql());
  sql.push("INSERT INTO frms_regulatory_profiles (id, empresa_id, profile_code, service_category, approval_reference, policy_version, effective_from, effective_to, limits_json, source_document_hash, active, created_at, updated_at, deleted_at) VALUES ('qa-frms-ux-reg-20261013', "+TENANT_ID+", 'HELICOPTER_OFFSHORE', 'QA_SYNTHETIC_ONLY', 'QA_ONLY_NOT_REGULATORY_APPROVAL', 'LEGACY_MODEL_V2', '2026-09-01', NULL, NULL, "+e(createHash('sha256').update('AirTrust synthetic FRMS UX QA; no regulatory approval').digest('hex'))+", 1, datetime('now'), datetime('now'), NULL);");
  sql.push("INSERT INTO frms_profile_assignments (id, empresa_id, regulatory_profile_id, profile_code, status, effective_from, effective_to, reason, source, created_at) VALUES ('qa-frms-ux-assignment-20261013', "+TENANT_ID+", 'qa-frms-ux-reg-20261013', 'HELICOPTER_OFFSHORE', 'ACTIVE', '2026-09-01', NULL, 'Synthetic staging FRMS UX review only', 'QA_GOVERNED', datetime('now'));");
  sql.push("INSERT INTO escalas_quinzenas (empresa_id, ano, mes, numero, data_inicio, data_fim, observacoes) VALUES ("+TENANT_ID+", 2026, 10, 1, '2026-10-01', '2026-10-15', "+e(FIXTURE_TAG)+");");
  for (const n of numbers) {
    const suffix=String(n).padStart(2, '0');
    sql.push("INSERT INTO funcionarios (nome, guerra, matricula, cargo, funcao, setor, setor_id, quinzena, status, is_instrutor, is_examinador, ativo, empresa_id, created_at, updated_at, deleted_at) SELECT "+
      e('QA FRMS Pessoa '+suffix)+", "+e('QA '+suffix)+", "+e('QA-FRMS-UX-'+suffix)+", 'PILOTO', 'PILOTO', 'Operacao FRMS QA', s.id, 'primeira', 'ATIVO', 0, 0, 1, "+TENANT_ID+", datetime('now'), datetime('now'), NULL FROM setores s WHERE s.empresa_id = "+TENANT_ID+" AND s.codigo = 'QA-FRMS-UX-SETOR';");
  }
  // Exactly seven synthetic received check-ins; seven crew in the active fortnight remain pending,
  // independently of flight activity. No protected health fields, symptoms or real data.
  for (const n of numbers.slice(0, 7)) {
    const suffix=String(n).padStart(2, '0');
    const kss=n===7?7:3, risk=n===7?45:16, level=n===7?'ATENCAO':'NORMAL';
    sql.push("INSERT INTO frms_fadiga_checkin (id, empresa_id, funcionario_id, data_checkin, hora_checkin, kss_score, horas_sono, qualidade_sono, sintomas_json, score_fadiga, nivel_fadiga, status_operacional, apto, computed_risk_level, report_source, submitted_at, created_at, updated_at, deleted_at) SELECT "+
      e('qa-frms-ux-checkin-'+suffix)+", "+TENANT_ID+", f.id, "+e(DATE)+", '10:00', "+kss+", 8, 4, NULL, "+risk+", "+e(level)+", "+e(n===7?'AVALIAR':'APTO')+", "+(n===7?0:1)+", "+e(n===7?'attention':'normal')+", 'QA_SYNTHETIC', '2026-10-13 10:00:00', datetime('now'), datetime('now'), NULL FROM funcionarios f WHERE f.empresa_id="+TENANT_ID+" AND f.matricula="+e('QA-FRMS-UX-'+suffix)+";");
  }
  // Synthetic completed journeys and one synthetic case, attached only through
  // employee keys belonging to this QA tenant. Never derive these from production.
  for (const [suffix, day, duty, flight] of [
    ['01','2026-10-11',540,310],
    ['07','2026-10-12',630,390],
  ]) {
    const journeyId='qa-frms-ux-journey-'+day+'-'+suffix;
    sql.push("INSERT INTO frms_jornada (id, tripulante_id, data, status, hora_apresentacao, hora_termino, duracao_jornada_minutos, horas_voo_minutos, registrado_por, origem, observacao, empresa_id, created_at, updated_at, deleted_at) SELECT "+
      e(journeyId)+", f.id, "+e(day)+", 'ES', '07:00:00', '17:00:00', "+duty+", "+flight+", "+e(FIXTURE_TAG)+", 'MANUAL', 'QA SYNTHETIC JOURNEY', "+TENANT_ID+", datetime('now'), datetime('now'), NULL FROM funcionarios f WHERE f.empresa_id="+TENANT_ID+" AND f.matricula="+e('QA-FRMS-UX-'+suffix)+";");
  }
  sql.push("INSERT INTO frms_alerta (id, tripulante_id, jornada_id, tipo_limite, nivel, percentual_atingido, valor_atual_min, valor_limite_min, mensagem, created_at, updated_at, deleted_at) SELECT 'qa-frms-ux-alert-07', f.id, 'qa-frms-ux-journey-2026-10-12-07', 'FDP_DIARIO', 'ATENCAO', 92.3, 600, 650, 'QA SYNTHETIC CASE - review fatigue evidence', datetime('now'), datetime('now'), NULL FROM funcionarios f WHERE f.empresa_id="+TENANT_ID+" AND f.matricula='QA-FRMS-UX-07';");
  sql.push("INSERT INTO usuarios (email, password_hash, nome, perfil, funcionario_id, deleted_at, created_at, updated_at, active) VALUES ("+
    e(EMAIL)+", "+e(hash)+", 'QA Coordenacao FRMS', 'ADMINISTRADOR', NULL, NULL, datetime('now'), datetime('now'), 1);");
  sql.push("INSERT INTO usuarios_empresas (usuario_id, empresa_id, role, is_primary, created_at) SELECT u.id, "+TENANT_ID+", 'admin', 1, datetime('now') FROM usuarios u WHERE u.email = "+e(EMAIL)+";");
  return sql.join('\n')+'\n';
}
export function buildRollbackSql() {
  return [
    "UPDATE usuarios SET active=0, deleted_at=COALESCE(deleted_at,datetime('now')) WHERE email="+escapeSql(EMAIL)+" AND id IN (SELECT usuario_id FROM usuarios_empresas WHERE empresa_id="+TENANT_ID+");",
    "UPDATE frms_fadiga_checkin SET deleted_at=COALESCE(deleted_at,datetime('now')) WHERE empresa_id="+TENANT_ID+" AND id LIKE 'qa-frms-ux-checkin-%';",
    "UPDATE frms_alerta SET deleted_at=COALESCE(deleted_at,datetime('now')) WHERE id='qa-frms-ux-alert-07' AND tripulante_id IN (SELECT id FROM funcionarios WHERE empresa_id="+TENANT_ID+" AND matricula='QA-FRMS-UX-07');",
    "UPDATE frms_jornada SET deleted_at=COALESCE(deleted_at,datetime('now')) WHERE empresa_id="+TENANT_ID+" AND registrado_por="+escapeSql(FIXTURE_TAG)+" AND id LIKE 'qa-frms-ux-journey-%';",
    "UPDATE funcionarios SET ativo=0, status='INATIVO', deleted_at=COALESCE(deleted_at,datetime('now')) WHERE empresa_id="+TENANT_ID+" AND matricula LIKE 'QA-FRMS-UX-%';",
    "UPDATE escalas_quinzenas SET deleted_at=COALESCE(deleted_at,datetime('now')) WHERE empresa_id="+TENANT_ID+" AND observacoes="+escapeSql(FIXTURE_TAG)+";",
    "UPDATE frms_profile_assignments SET status='RETIRED' WHERE id='qa-frms-ux-assignment-20261013' AND empresa_id="+TENANT_ID+";",
    "UPDATE frms_config_revisions SET status='RETIRED' WHERE id="+escapeSql(SCOPED_REVISION)+" AND empresa_id="+TENANT_ID+";",
    "UPDATE frms_regulatory_profiles SET active=0, deleted_at=COALESCE(deleted_at,datetime('now')) WHERE id='qa-frms-ux-reg-20261013' AND empresa_id="+TENANT_ID+";",
    "UPDATE setores SET ativo=0, deleted_at=COALESCE(deleted_at,datetime('now')) WHERE empresa_id="+TENANT_ID+" AND codigo='QA-FRMS-UX-SETOR';",
    "UPDATE empresas SET ativo=0, deleted_at=COALESCE(deleted_at,datetime('now')) WHERE id="+TENANT_ID+" AND codigo="+escapeSql(TENANT_CODE)+";",
  ].join('\n')+'\n';
}
function runFile(sql) {
  const folder = mkdtempSync(join(tmpdir(),'airtrust-frms-ux-'));
  const file = join(folder,'fixture.sql');
  try { writeFileSync(file,sql,{encoding:'utf8',mode:0o600}); wrangler(['--file',file]); }
  finally { rmSync(folder,{recursive:true,force:true}); }
}
function verify() {
  const checks={
    tenant:readCount("SELECT COUNT(*) AS total FROM empresas WHERE id = "+TENANT_ID+" AND codigo = "+escapeSql(TENANT_CODE)+" AND ativo=1 AND deleted_at IS NULL"),
    crew:readCount("SELECT COUNT(*) AS total FROM funcionarios WHERE empresa_id="+TENANT_ID+" AND matricula LIKE 'QA-FRMS-UX-%' AND ativo=1 AND deleted_at IS NULL"),
    received:readCount("SELECT COUNT(*) AS total FROM frms_fadiga_checkin WHERE empresa_id="+TENANT_ID+" AND data_checkin='"+DATE+"' AND deleted_at IS NULL"),
    assignment:readCount("SELECT COUNT(*) AS total FROM frms_profile_assignments WHERE empresa_id="+TENANT_ID+" AND status='ACTIVE' AND effective_from <= '"+DATE+"' AND (effective_to IS NULL OR effective_to >= '"+DATE+"')"),
    scopedRevision:readCount("SELECT COUNT(*) AS total FROM frms_config_revisions WHERE id="+escapeSql(SCOPED_REVISION)+" AND empresa_id="+TENANT_ID+" AND profile_code='HELICOPTER_OFFSHORE' AND status='ACTIVE'"),
    governedParameters:readCount("SELECT COUNT(*) AS total FROM frms_config_parameters WHERE revision_id="+escapeSql(SCOPED_REVISION)),
    journeys:readCount("SELECT COUNT(*) AS total FROM frms_jornada WHERE empresa_id="+TENANT_ID+" AND registrado_por="+escapeSql(FIXTURE_TAG)+" AND deleted_at IS NULL"),
    cases:readCount("SELECT COUNT(*) AS total FROM frms_alerta WHERE id='qa-frms-ux-alert-07' AND deleted_at IS NULL AND tripulante_id IN (SELECT id FROM funcionarios WHERE empresa_id="+TENANT_ID+")"),
    memberships:readCount("SELECT COUNT(*) AS total FROM usuarios_empresas WHERE empresa_id="+TENANT_ID+" AND role='admin'"),
    fortnight:readCount("SELECT COUNT(*) AS total FROM escalas_quinzenas WHERE empresa_id="+TENANT_ID+" AND data_inicio <= '"+DATE+"' AND data_fim >= '"+DATE+"' AND numero=1 AND deleted_at IS NULL"),
  };
  if(checks.tenant!==1||checks.crew!==14||checks.received!==7||checks.assignment!==1||checks.scopedRevision!==1||checks.governedParameters!==128||checks.journeys!==2||checks.cases!==1||checks.memberships!==1||checks.fortnight!==1) throw new Error('FRMS_UX_POSTCONDITIONS_FAILED');
  console.log('FRMS_UX_QA_VERIFY_PASS crew=14 received=7 pending=7 journeys=2 cases=1 effectiveAssignments=1 scopedParameters=128 no_real_data=true');
}
function main() {
  assertTarget(process.env.STAGING_D1_NAME,process.env.STAGING_D1_ID,process.env.ENVIRONMENT);
  const operation=assertOperation(process.argv.slice(2),process.env.CONFIRM_STAGING_FRMS_UX);
  if(operation==='--preflight'){preflight();return;}
  if(operation==='--verify'){verify();return;}
  if(operation==='--apply'){
    preflight();
    const password=process.env.QA_FRMS_PASSWORD;
    if(!password||password.length<12)throw new Error('QA_FRMS_PASSWORD_MISSING');
    const hash=bcrypt.hashSync(password,12);
    runFile(buildApplySql(hash));verify();return;
  }
  if(operation==='--rollback'){
    // Scope guard: never touch a tenant not positively marked as our synthetic fixture.
    if(readCount(preflightQueries().tenantCode)!==1 ||
       readCount("SELECT COUNT(*) AS total FROM empresas WHERE id="+TENANT_ID+" AND codigo="+escapeSql(TENANT_CODE))!==1) throw new Error('QA_TENANT_NOT_OWNED');
    runFile(buildRollbackSql());
    console.log('FRMS_UX_QA_ROLLBACK_PASS tenant_disabled=true');
  }
}
if(process.argv[1]?.endsWith('frms-ux-qa-tenant.mjs'))main();
