#!/usr/bin/env node
// Staging-only synthetic QA fixture, tenant 999006, 2026-10-27.
// Existing flights, employees and check-ins outside the reserved QA marker are NEVER changed.
// No production credential, employee identity, clinical value or row identifier in logs.
import { spawnSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(fileURLToPath(new URL('../../', import.meta.url)));
const WORKER = join(ROOT, 'worker-airtrust');
export const DB = 'airtrust-db-staging-baseline-20260701';
export const DB_ID = 'bf9963f4-eb12-439b-a830-20bbf577ac22';
export const TENANT = 999006;
export const DAY = '2026-10-27';
export const MARKER = 'QA_FRMS_CV_20261027_V1';
export const PIC = 'QA-PARTICIPANTE-ALFA';
export const SIC = 'QA-PARTICIPANTE-BRAVO';
const FLIGHT_PREFIX = 'QA-FR';
const CHECKIN_ID = 'qa-frms-cv-checkin-20261027-v1';
const JOURNEY_ID = 'qa-frms-cv-jornada-20261027-v1';
const SIC_JOURNEY_ID = 'qa-frms-cv-jornada-sic-20261027-v1';
const CONFIRM = 'AIRTRUST_CV_FRMS_STAGING_FIXTURE_20261027';

function assertTarget() {
  if (process.env.STAGING_D1_NAME !== DB || process.env.STAGING_D1_ID !== DB_ID ||
      !process.env.CLOUDFLARE_API_TOKEN || !process.env.CLOUDFLARE_ACCOUNT_ID ||
      process.env.CLOUDFLARE_ACCOUNT_ID.trim().length < 8) {
    throw new Error('CV_FRMS_STAGING_TARGET_OR_CREDENTIALS_MISSING');
  }
}
function invoke(args) {
  const p = spawnSync('npx', ['--no-install', 'wrangler', 'd1', 'execute', DB, '--remote',
    '--env', 'staging', '--json', ...args], {
    cwd: WORKER, encoding: 'utf8', maxBuffer: 1024 * 1024, timeout: 90000,
  });
  if (p.status !== 0) throw new Error('CV_FRMS_STAGING_D1_EXECUTION_FAILED');
  const start = p.stdout.search(/[\[{]/);
  if (start < 0) throw new Error('CV_FRMS_D1_RESPONSE_NOT_JSON');
  const result = JSON.parse(p.stdout.slice(start));
  const first = Array.isArray(result) ? result[0] : result;
  if (first?.success !== true && first?.success !== undefined) throw new Error('CV_FRMS_D1_QUERY_FAILED');
  return first?.results || [];
}
function select(sql) {
  if (!/^(SELECT|PRAGMA)\s/i.test(sql.trim()) || sql.includes(';') ||
    /\b(INSERT|UPDATE|DELETE|DROP|ALTER|REPLACE|CREATE|ATTACH|DETACH|VACUUM)\b/i.test(sql)) {
    throw new Error('CV_FRMS_READONLY_SQL_GUARD');
  }
  return invoke(['--command', sql]);
}
function count(sql) {
  return Number(select(sql)[0]?.n ?? -1);
}
function exactQueries() {
  return {
    tenant: "SELECT COUNT(*) AS n FROM empresas WHERE id=999006 AND codigo='qa_examiner_training' AND ativo=1 AND deleted_at IS NULL",
    pic: "SELECT COUNT(*) AS n FROM funcionarios WHERE empresa_id=999006 AND matricula='QA-PARTICIPANTE-ALFA' AND ativo=1 AND deleted_at IS NULL",
    sic: "SELECT COUNT(*) AS n FROM funcionarios WHERE empresa_id=999006 AND matricula='QA-PARTICIPANTE-BRAVO' AND ativo=1 AND deleted_at IS NULL",
    templates: "SELECT COUNT(*) AS n FROM cv_voos WHERE empresa_id=999006 AND data_programacao='2026-10-27' AND deleted_at IS NULL",
    flight: "SELECT COUNT(*) AS n FROM cv_voos WHERE empresa_id=999006 AND data_programacao='2026-10-27' AND prefixo='QA-FR' AND observacoes='QA_FRMS_CV_20261027_V1' AND deleted_at IS NULL",
    collision: "SELECT COUNT(*) AS n FROM cv_voos WHERE empresa_id=999006 AND prefixo='QA-FR' AND (observacoes IS NULL OR observacoes<>'QA_FRMS_CV_20261027_V1') AND deleted_at IS NULL",
    foreignCheckins: "SELECT COUNT(*) AS n FROM frms_fadiga_checkin WHERE empresa_id=999006 AND data_checkin='2026-10-27' AND funcionario_id IN (SELECT id FROM funcionarios WHERE empresa_id=999006 AND matricula IN ('QA-PARTICIPANTE-ALFA','QA-PARTICIPANTE-BRAVO')) AND id<>'qa-frms-cv-checkin-20261027-v1' AND deleted_at IS NULL",
    crew: "SELECT COUNT(*) AS n FROM cv_voo_tripulantes t JOIN cv_voos v ON v.id=t.voo_id AND v.empresa_id=t.empresa_id WHERE v.empresa_id=999006 AND v.data_programacao='2026-10-27' AND v.prefixo='QA-FR' AND v.observacoes='QA_FRMS_CV_20261027_V1' AND t.deleted_at IS NULL",
    picLink: "SELECT COUNT(*) AS n FROM cv_voo_tripulantes t JOIN cv_voos v ON v.id=t.voo_id AND v.empresa_id=t.empresa_id JOIN funcionarios f ON f.id=t.funcionario_id AND f.empresa_id=t.empresa_id WHERE v.empresa_id=999006 AND v.data_programacao='2026-10-27' AND v.prefixo='QA-FR' AND v.observacoes='QA_FRMS_CV_20261027_V1' AND t.funcao='PIC' AND f.matricula='QA-PARTICIPANTE-ALFA' AND t.deleted_at IS NULL AND f.deleted_at IS NULL",
    sicLink: "SELECT COUNT(*) AS n FROM cv_voo_tripulantes t JOIN cv_voos v ON v.id=t.voo_id AND v.empresa_id=t.empresa_id JOIN funcionarios f ON f.id=t.funcionario_id AND f.empresa_id=t.empresa_id WHERE v.empresa_id=999006 AND v.data_programacao='2026-10-27' AND v.prefixo='QA-FR' AND v.observacoes='QA_FRMS_CV_20261027_V1' AND t.funcao='SIC' AND f.matricula='QA-PARTICIPANTE-BRAVO' AND t.deleted_at IS NULL AND f.deleted_at IS NULL",
    checkin: "SELECT COUNT(*) AS n FROM frms_fadiga_checkin WHERE id='qa-frms-cv-checkin-20261027-v1' AND empresa_id=999006 AND data_checkin='2026-10-27' AND deleted_at IS NULL",
    journey: "SELECT COUNT(*) AS n FROM frms_jornada WHERE id='qa-frms-cv-jornada-20261027-v1' AND empresa_id=999006 AND data='2026-10-27' AND deleted_at IS NULL",
    sicJourney: "SELECT COUNT(*) AS n FROM frms_jornada WHERE id='qa-frms-cv-jornada-sic-20261027-v1' AND empresa_id=999006 AND data='2026-10-27' AND deleted_at IS NULL",
  };
}
export function fixtureSql() {
  // Entire batch submitted once. The source flight is read only and itself synthetic.
  // No updates or deletes of existing flights/people/check-ins are ever used.
  return [
    "INSERT INTO cv_voos (empresa_id,prefixo,data_programacao,origem_id,destino_id,tipo_voo_id,natureza_voo_id,aeronave_id,horario_previsto_partida,horario_previsto_chegada,status,observacoes,versao,origem_importacao,created_at,updated_at,deleted_at)",
    "SELECT 999006,'QA-FR','2026-10-27',v.origem_id,v.destino_id,v.tipo_voo_id,v.natureza_voo_id,v.aeronave_id,'2026-10-27T10:10:00.000Z','2026-10-27T11:00:00.000Z','planejado','QA_FRMS_CV_20261027_V1',1,'MANUAL',datetime('now'),datetime('now'),NULL",
    "FROM cv_voos v WHERE v.empresa_id=999006 AND v.data_programacao='2026-10-27' AND v.deleted_at IS NULL AND NOT EXISTS (SELECT 1 FROM cv_voos q WHERE q.empresa_id=999006 AND q.prefixo='QA-FR' AND q.observacoes='QA_FRMS_CV_20261027_V1' AND q.deleted_at IS NULL) ORDER BY v.id LIMIT 1;",
    ...[['PIC',PIC],['SIC',SIC]].map(([role,code]) =>
      "INSERT INTO cv_voo_tripulantes (empresa_id,voo_id,funcionario_id,funcao,horario_apresentacao,created_at,updated_at,deleted_at) " +
      "SELECT 999006,v.id,f.id,'" + role + "','2026-10-27T09:30:00.000Z',datetime('now'),datetime('now'),NULL " +
      "FROM cv_voos v JOIN funcionarios f ON f.empresa_id=v.empresa_id AND f.matricula='" + code + "' AND f.ativo=1 AND f.deleted_at IS NULL " +
      "WHERE v.empresa_id=999006 AND v.data_programacao='2026-10-27' AND v.prefixo='QA-FR' AND v.observacoes='QA_FRMS_CV_20261027_V1' AND v.deleted_at IS NULL " +
      "AND NOT EXISTS (SELECT 1 FROM cv_voo_tripulantes t WHERE t.empresa_id=999006 AND t.voo_id=v.id AND t.funcionario_id=f.id AND t.funcao='" + role + "' AND t.deleted_at IS NULL);"
    ),
    "INSERT INTO frms_jornada (id,tripulante_id,data,status,hora_apresentacao,hora_termino,duracao_jornada_minutos,horas_voo_minutos,registrado_por,origem,observacao,empresa_id,created_at,updated_at,deleted_at) " +
      "SELECT 'qa-frms-cv-jornada-20261027-v1',f.id,'2026-10-27','ES','09:30:00','17:00:00',450,150,'QA_FRMS_CV','MANUAL','QA SINTETICO - SEM VALIDADE OPERACIONAL',999006,datetime('now'),datetime('now'),NULL " +
      "FROM funcionarios f WHERE f.empresa_id=999006 AND f.matricula='QA-PARTICIPANTE-ALFA' AND f.deleted_at IS NULL AND NOT EXISTS (SELECT 1 FROM frms_jornada j WHERE j.id='qa-frms-cv-jornada-20261027-v1');",
    "INSERT INTO frms_jornada (id,tripulante_id,data,status,hora_apresentacao,hora_termino,duracao_jornada_minutos,horas_voo_minutos,registrado_por,origem,observacao,empresa_id,created_at,updated_at,deleted_at) " +
      "SELECT 'qa-frms-cv-jornada-sic-20261027-v1',f.id,'2026-10-27','ES','09:30:00','17:00:00',450,150,'QA_FRMS_CV','MANUAL','QA SINTETICO - SIC SEM CHECKIN',999006,datetime('now'),datetime('now'),NULL " +
      "FROM funcionarios f WHERE f.empresa_id=999006 AND f.matricula='QA-PARTICIPANTE-BRAVO' AND f.deleted_at IS NULL AND NOT EXISTS (SELECT 1 FROM frms_jornada j WHERE j.id='qa-frms-cv-jornada-sic-20261027-v1');",
    "INSERT INTO frms_fadiga_checkin (id,empresa_id,funcionario_id,data_checkin,hora_checkin,kss_score,horas_sono,qualidade_sono,sintomas_json,observacoes,score_fadiga,nivel_fadiga,status_operacional,recomendacao,apto,requires_frat_review,computed_risk_level,requires_operational_review,report_source,submitted_at,wake_time,jornada_inicio_prevista,created_at,updated_at,deleted_at) " +
      "SELECT 'qa-frms-cv-checkin-20261027-v1',999006,f.id,'2026-10-27','06:30:00',3,7.5,4,'[]','QA SINTETICO - RESPOSTAS INVENTADAS PARA TESTE; SEM APTIDAO REAL',20,'VERDE','APTO','Somente teste sintético',1,0,'normal',0,'QA_SYNTHETIC','2026-10-27T09:30:00.000Z','06:00','09:30',datetime('now'),datetime('now'),NULL " +
      "FROM funcionarios f WHERE f.empresa_id=999006 AND f.matricula='QA-PARTICIPANTE-ALFA' AND f.deleted_at IS NULL AND NOT EXISTS (SELECT 1 FROM frms_fadiga_checkin ch WHERE ch.id='qa-frms-cv-checkin-20261027-v1');",
  ].join('\n');
}
function validateStagingSchema(){
  const columnGroups=new Map();
  for(const match of fixtureSql().matchAll(/INSERT INTO\s+([a-z_]+)\s*\(([^)]+)\)/gi)){
    const table=match[1], supplied=new Set(match[2].split(',').map(s=>s.trim()));
    if(!columnGroups.has(table))columnGroups.set(table,supplied);
    else if([...supplied].some(x=>!columnGroups.get(table).has(x)))throw Error('CV_FRMS_INCONSISTENT_TABLE_INSERT');
  }
  if(columnGroups.size!==4)throw Error('CV_FRMS_UNEXPECTED_WRITE_TABLES');
  for(const [table,supplied] of columnGroups){
    const fields=select('PRAGMA table_info('+table+')');
    if(fields.length===0)throw Error('CV_FRMS_REQUIRED_TABLE_ABSENT:'+table);
    const known=new Set(fields.map(x=>String(x.name)));
    if([...supplied].some(x=>!known.has(x)))throw Error('CV_FRMS_INSERT_COLUMN_ABSENT:'+table);
    const required=fields.filter(x=>Number(x.notnull)===1 && Number(x.pk)!==1 && x.dflt_value==null && !supplied.has(String(x.name)));
    if(required.length)throw Error('CV_FRMS_SCHEMA_REQUIRES_ADDITIONAL_COLUMNS:'+table);
  }
  console.log('CV_FRMS_INSERT_SCHEMA_COMPATIBLE');
}

function preflight() {
  validateStagingSchema();
  const q=exactQueries();
  const result=Object.fromEntries(Object.entries(q).map(([name,sql])=>[name,count(sql)]));
  if (result.tenant!==1 || result.pic!==1 || result.sic!==1 || result.templates<1 ||
      result.flight>1 || result.collision!==0 || result.foreignCheckins!==0 ||
      result.crew>2 || result.picLink>1 || result.sicLink>1 || result.crew!==result.picLink+result.sicLink || result.checkin>1 || result.journey>1 || result.sicJourney>1) throw new Error('CV_FRMS_FIXTURE_PREFLIGHT_FAILED');
  console.log(JSON.stringify({scope:'staging:999006:2026-10-27',mode:'read-only',tenant:result.tenant,
    qaEmployees:result.pic+result.sic,syntheticFlightCandidates:result.templates,
    dedicatedFlight:result.flight,existingDedicatedCrew:result.crew,existingDedicatedCheckin:result.checkin,
    existingDedicatedJourney:result.journey,nonFixtureCollisions:result.collision,nonFixtureCheckins:result.foreignCheckins,
    writes:0}));
  return result;
}
function postcondition(){
  const q=exactQueries();
  const state={flight:count(q.flight),crew:count(q.crew),picLink:count(q.picLink),sicLink:count(q.sicLink),checkin:count(q.checkin),journey:count(q.journey),sicJourney:count(q.sicJourney)};
  if(state.flight!==1 || state.crew!==2 || state.picLink!==1 || state.sicLink!==1 || state.checkin!==1 || state.journey!==1 || state.sicJourney!==1) throw new Error('CV_FRMS_FIXTURE_POSTCONDITION_FAILED');
  console.log('CV_FRMS_SYNTHETIC_STAGING_FIXTURE_PASS flight=1 crew=2 checkin=1 journeys=2');
}
function main(){
  const mode=process.argv[2];
  if (!['--inspect','--apply'].includes(mode)) throw new Error('CV_FRMS_MODE_INVALID');
  assertTarget();
  preflight();
  if(mode==='--inspect')return;
  if(process.env.CONFIRM_CV_FRMS_STAGING_FIXTURE!==CONFIRM)throw new Error('CV_FRMS_APPLY_NOT_CONFIRMED');
  // Time Travel bookmark must be captured and verified in the GOVERNED workflow first.
  if(!/^[A-Za-z0-9._=-]{8,256}$/.test(process.env.VERIFIED_STAGING_RECOVERY_BOOKMARK||''))throw new Error('CV_FRMS_RECOVERY_REQUIRED');
  const dir=mkdtempSync(join(tmpdir(),'cv-frms-staging-'));
  try{
    const path=join(dir,'fixture.sql');
    writeFileSync(path,fixtureSql(),{mode:0o600});
    invoke(['--file',path]);
  }finally{rmSync(dir,{recursive:true,force:true});}
  postcondition();
}
if(process.argv[1] && fileURLToPath(import.meta.url)===resolve(process.argv[1])){
  try{main();}catch(error){console.error('CV_FRMS_FIXTURE_ERROR:'+String(error?.message||'unknown'));process.exitCode=1;}
}
