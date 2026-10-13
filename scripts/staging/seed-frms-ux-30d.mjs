#!/usr/bin/env node
// source_reference: FRMS UX staging QA #1426, sanitized aggregate workflow #1430.
// operational_decision: stage isolated synthetic FRMS records, never a copy of production persons or health reports.
// dry_run_required: default mode builds SQL and verifies metadata without any D1 write.
// rollback_plan_required: --rollback operates only on exact reserved QA fixture rows, after an official backup.
import { readFileSync, mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { spawnSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';

export const DB_NAME = 'airtrust-db-staging-baseline-20260701';
export const DB_ID = 'bf9963f4-eb12-439b-a830-20bbf577ac22';
export const TENANT_ID = 999013;
export const TENANT_CODE = 'qa_frms_ux_30d';
export const PROFILE_ID = 'qa-frms-ux-profile-999013';
export const ASSIGNMENT_ID = 'qa-frms-ux-assignment-999013';
export const CONFIRM = 'AIRTRUST_STAGING_FRMS_UX_30D';
export const FROM = '2026-09-14';
export const TO = '2026-10-13';
const PREFIX = 'QA-FRMS-UX-';
export const QA_REVISION_ID = 'qa-frms-ux-999013-helicopter-offshore-v1';
const CANONICAL_REVISION_ID = 'frms-helicopter-offshore-baseline-v1';
const BASELINE_SOURCE_URL = new URL('../frms-seeds/frms_helicopter_offshore_baseline_v1.sql', import.meta.url);
const SAFE_BANDS = new Set(['0','1-4','5-9','10-19','20-49','50+']);
const quote = (x) => "'" + String(x).replaceAll("'", "''") + "'";
const pad = (n) => String(n).padStart(2,'0');
const stmt = (x) => x.trim().replace(/;?$/, ';');

export function validateSource(payload, expectedSha) {
  if (payload?.source !== 'PRODUCTION_AGGREGATES_NOT_INDIVIDUAL_RECORDS' ||
      payload?.company !== 'Costa do Sol' || payload?.from !== FROM || payload?.to !== TO ||
      payload?.suppressedSmallCells !== true || payload?.writes !== 0 ||
      payload?.reviewedSourceSha !== expectedSha || !/^[a-f0-9]{40}$/.test(expectedSha)) {
    throw new Error('SANITIZED_SOURCE_CONTRACT_MISMATCH');
  }
  if (!Array.isArray(payload.days) || payload.days.length !== 30) throw new Error('SOURCE_DAY_COUNT_INVALID');
  for (const [i, day] of payload.days.entries()) {
    const expectedDay = new Date(Date.parse(FROM+'T00:00:00Z') + i * 86400000).toISOString().slice(0,10);
    if (day.day !== expectedDay || Object.keys(day).sort().join('|') !== 'casos|checkins|day|jornadas|voos') {
      throw new Error('SOURCE_DAY_FIELDS_INVALID');
    }
    for (const key of ['jornadas','checkins','casos','voos']) {
      if (!SAFE_BANDS.has(day[key])) throw new Error('SOURCE_BAND_INVALID');
    }
  }
  return payload.days;
}
export function approximation(band) {
  const result = { '0':0, '1-4':2, '5-9':7, '10-19':14, '20-49':24, '50+':40 }[band];
  if (result === undefined) throw new Error('BAND_INVALID');
  return result;
}

export function buildTenantScopedBaselineSql(sqlSource = readFileSync(BASELINE_SOURCE_URL, 'utf8')) {
  // Baseline values come from the reviewed versioned 128-key source. Do not
  // copy tenant data, hand-author thresholds, or create a global revision.
  const stripped = sqlSource.replace(/^(?:\s*--[^\n]*\n)+/, '').trim();
  const statements = stripped.split(/;\s*(?:\n|$)/).map(x=>x.trim()).filter(Boolean);
  if(statements.length!==2 ||
     !/^INSERT INTO frms_config_revisions\s*\(/.test(statements[0]) ||
     !/^INSERT INTO frms_config_parameters\s*\(/.test(statements[1])) {
    throw new Error('BASELINE_SOURCE_STATEMENTS_CHANGED');
  }
  const marker = "'" + CANONICAL_REVISION_ID + "', NULL, 'HELICOPTER_OFFSHORE', 1, 'ACTIVE'";
  if (statements[0].split(marker).length !== 2) throw new Error('BASELINE_SOURCE_SCOPE_CHANGED');
  const matches=[...statements[1].matchAll(new RegExp(
    "'" + CANONICAL_REVISION_ID + "-([A-Z][A-Z0-9_]*)',\\s*'" + CANONICAL_REVISION_ID + "',\\s*'([A-Z][A-Z0-9_]*)'", 'g'
  ))];
  if(matches.length!==128 ||
     new Set(matches.map(match=>match[1])).size!==128 ||
     matches.some(match=>match[1]!==match[2])) throw new Error('BASELINE_SOURCE_128_KEYS_INVALID');
  const revision = statements[0].replace(marker,
    "'" + QA_REVISION_ID + "', " + TENANT_ID + ", 'HELICOPTER_OFFSHORE', 1, 'ACTIVE'");
  // The global reviewed source is unchanged. Only the QA revision's IDs and
  // tenant scope differ; "INTERNAL_POLICY" is not operational approval.
  const paramSql = statements[1].replaceAll(CANONICAL_REVISION_ID, QA_REVISION_ID);
  const revisionSql = revision.replaceAll(CANONICAL_REVISION_ID, QA_REVISION_ID);
  if (/\b(CREATE|ALTER|DROP|UPDATE|DELETE|PRAGMA|ATTACH)\b/i.test(
    revisionSql.replace(/'[^']*'/g,"''")+' '+paramSql.replace(/'[^']*'/g,"''")
  )) throw new Error('BASELINE_SOURCE_MUTATION_REJECTED');
  return [stmt(revisionSql),stmt(paramSql)];
}

export function buildSeedSql(days, governedRevisionId = QA_REVISION_ID) {
  if (!Array.isArray(days) || days.length !== 30) throw new Error('DAYS_REQUIRED');
  if (governedRevisionId !== QA_REVISION_ID) throw new Error('QA_TENANT_SCOPED_REVISION_REQUIRED');
  const dataRows=days.map((d)=>"("+quote(d.day)+","+Math.min(14,approximation(d.jornadas))+","+
    Math.min(14,approximation(d.checkins))+")").join(',\n');
  const fields=['empresas','setores','funcionarios','frms_regulatory_profiles','frms_profile_assignments',
    'frms_escala_quinzenal','frms_jornada','frms_fadiga_checkin','frms_alerta'];
  const sql=[];
  sql.push('-- QA only: '+fields.join(', ') + '. Derived from broad daily count bands, not individual production records.');
  sql.push(stmt("INSERT INTO empresas (id,nome,razao_social,ativo,created_at,updated_at,deleted_at,codigo,plano,max_funcionarios,max_storage_mb) "+
    "VALUES ("+TENANT_ID+",'QA FRMS UX - Dados Ficticios','QA FRMS UX - Dados Ficticios',1,datetime('now'),datetime('now'),NULL,"+quote(TENANT_CODE)+",'basic',30,256)"));
  sql.push(...buildTenantScopedBaselineSql());
  sql.push(stmt("INSERT INTO setores (codigo,nome,descricao,responsavel,ativo,created_at,updated_at,deleted_at,empresa_id,dominio_codigo) "+
    "VALUES ('QA-FRMS-UX-SETOR','Setor Operacional QA','Dados ficticios FRMS','QA AirTrust',1,datetime('now'),datetime('now'),NULL,"+TENANT_ID+",'OPERACOES')"));
  for(let i=1;i<=14;i++){
    const code=PREFIX+pad(i),name='QA Tripulante '+pad(i);
    sql.push(stmt("INSERT INTO funcionarios (nome,guerra,matricula,cargo,funcao,setor,setor_id,status,is_instrutor,is_examinador,ativo,empresa_id,created_at,updated_at,deleted_at) "+
      "SELECT "+quote(name)+","+quote('QA'+pad(i))+","+quote(code)+",'PILOTO','PILOTO','Setor Operacional QA',s.id,'ATIVO',0,0,1,"+TENANT_ID+
      ",datetime('now'),datetime('now'),NULL FROM setores s WHERE s.empresa_id="+TENANT_ID+" AND s.codigo='QA-FRMS-UX-SETOR' AND s.deleted_at IS NULL"));
  }
  sql.push(stmt("INSERT INTO frms_regulatory_profiles (id,empresa_id,profile_code,service_category,approval_reference,policy_version,effective_from,effective_to,limits_json,source_document_hash,active,created_at,updated_at,deleted_at) "+
    "VALUES ("+quote(PROFILE_ID)+","+TENANT_ID+",'HELICOPTER_OFFSHORE','QA_FIXTURE',NULL,'LEGACY_MODEL_V2','1970-01-01',NULL,NULL,NULL,1,datetime('now'),datetime('now'),NULL)"));
  sql.push(stmt("INSERT INTO frms_profile_assignments (id,empresa_id,regulatory_profile_id,profile_code,status,effective_from,effective_to,created_by,approved_at,approved_by,reason,source,created_at) "+
    "VALUES ("+quote(ASSIGNMENT_ID)+","+TENANT_ID+","+quote(PROFILE_ID)+",'HELICOPTER_OFFSHORE','ACTIVE','1970-01-01',NULL,NULL,datetime('now'),NULL,'QA synthetic UX verification only','STAGING_FRMS_UX_30D',datetime('now'))"));
  sql.push(stmt("INSERT INTO frms_escala_quinzenal (id,tripulante_id,ano,ciclo,data_inicio_embarque,data_fim_embarque,data_inicio_folga,data_fim_folga,dias_embarcado,dias_folga,status_ciclo,observacao,created_at,updated_at,deleted_at) "+
    "SELECT 'qa-frms-ux-ciclo-'||f.matricula,f.id,2026,101,'2026-09-29','2026-10-13','2026-10-14','2026-10-28',15,15,'ATIVO','QA SINTETICO - sem validade operacional',datetime('now'),datetime('now'),NULL "+
    "FROM funcionarios f WHERE f.empresa_id="+TENANT_ID+" AND f.matricula LIKE 'QA-FRMS-UX-%' AND f.deleted_at IS NULL"));
  sql.push(stmt("WITH source_days(day,j_count,c_count) AS (VALUES "+dataRows+") "+
    "INSERT INTO frms_jornada (id,tripulante_id,data,status,hora_apresentacao,hora_termino,duracao_jornada_minutos,horas_voo_minutos,registrado_por,origem,observacao,empresa_id,created_at,updated_at,deleted_at) "+
    "SELECT 'qa-frms-ux-j-'||d.day||'-'||f.matricula,f.id,d.day,'ES',"+
    "CASE WHEN CAST(substr(f.matricula,-2) AS INTEGER)%4=0 THEN '04:30:00' ELSE '07:00:00' END,"+
    "'16:00:00',CASE WHEN CAST(substr(f.matricula,-2) AS INTEGER)%4=0 THEN 690 ELSE 540 END,"+
    "CASE WHEN CAST(substr(f.matricula,-2) AS INTEGER)%4=0 THEN 385 ELSE 270 END,'QA_FRMS_UX',"+
    "'MANUAL','CENARIO SINTETICO - SEM VALIDADE OPERACIONAL',"+TENANT_ID+",datetime('now'),datetime('now'),NULL "+
    "FROM source_days d JOIN funcionarios f ON f.empresa_id="+TENANT_ID+
    " AND f.matricula LIKE 'QA-FRMS-UX-%' AND f.deleted_at IS NULL "+
    "WHERE CAST(substr(f.matricula,-2) AS INTEGER) <= d.j_count"));
  sql.push(stmt("WITH source_days(day,j_count,c_count) AS (VALUES "+dataRows+") "+
    "INSERT INTO frms_fadiga_checkin (id,empresa_id,funcionario_id,data_checkin,hora_checkin,kss_score,horas_sono,qualidade_sono,sintomas_json,observacoes,score_fadiga,nivel_fadiga,status_operacional,recomendacao,apto,requires_frat_review,computed_risk_level,requires_operational_review,report_source,profile_code,regulatory_profile_id,config_revision_id,model_version,created_at,updated_at,deleted_at) "+
    "SELECT 'qa-frms-ux-checkin-'||d.day||'-'||f.matricula,"+TENANT_ID+",f.id,d.day,'06:00:00',"+
    "CASE WHEN CAST(substr(f.matricula,-2) AS INTEGER)%7=0 THEN 8 WHEN CAST(substr(f.matricula,-2) AS INTEGER)%5=0 THEN 6 ELSE 3 END,"+
    "CASE WHEN CAST(substr(f.matricula,-2) AS INTEGER)%7=0 THEN 4.0 WHEN CAST(substr(f.matricula,-2) AS INTEGER)%5=0 THEN 5.5 ELSE 7.5 END,"+
    "CASE WHEN CAST(substr(f.matricula,-2) AS INTEGER)%7=0 THEN 1 ELSE 4 END,"+
    "'[]','QA SINTETICO - DADOS NAO REAIS',"+
    "CASE WHEN CAST(substr(f.matricula,-2) AS INTEGER)%7=0 THEN 85 WHEN CAST(substr(f.matricula,-2) AS INTEGER)%5=0 THEN 55 ELSE 20 END,"+
    "CASE WHEN CAST(substr(f.matricula,-2) AS INTEGER)%7=0 THEN 'VERMELHO' WHEN CAST(substr(f.matricula,-2) AS INTEGER)%5=0 THEN 'AMARELO' ELSE 'VERDE' END,"+
    "CASE WHEN CAST(substr(f.matricula,-2) AS INTEGER)%7=0 THEN 'NAO_APTO' ELSE 'APTO' END,"+
    "'Revisar com coordenacao - apenas simulacao QA',"+
    "CASE WHEN CAST(substr(f.matricula,-2) AS INTEGER)%7=0 THEN 0 ELSE 1 END,"+
    "CASE WHEN CAST(substr(f.matricula,-2) AS INTEGER)%7=0 THEN 1 ELSE 0 END,"+
    "CASE WHEN CAST(substr(f.matricula,-2) AS INTEGER)%7=0 THEN 'critical' WHEN CAST(substr(f.matricula,-2) AS INTEGER)%5=0 THEN 'high' ELSE 'normal' END,"+
    "CASE WHEN CAST(substr(f.matricula,-2) AS INTEGER)%7=0 THEN 1 ELSE 0 END,"+
    "'QA_SYNTHETIC','HELICOPTER_OFFSHORE',"+quote(PROFILE_ID)+","+quote(governedRevisionId)+",'LEGACY_MODEL_V2',datetime('now'),datetime('now'),NULL "+
    "FROM source_days d JOIN funcionarios f ON f.empresa_id="+TENANT_ID+
    " AND f.matricula LIKE 'QA-FRMS-UX-%' AND f.deleted_at IS NULL "+
    "WHERE CAST(substr(f.matricula,-2) AS INTEGER) <= d.c_count"));
  for(const [n,idx,day,level,type] of [
      [1,7,'2026-10-13','CRITICO','REPOUSO'],[2,5,'2026-10-12','ATENCAO','FDP_DIARIO'],
      [3,4,'2026-10-10','AVISO','HV_7D'],[4,14,'2026-10-09','CRITICO','REPOUSO']
    ]){
    sql.push(stmt("INSERT INTO frms_alerta (id,tripulante_id,jornada_id,tipo_limite,nivel,percentual_atingido,valor_atual_min,valor_limite_min,mensagem,visualizado,resolvido,created_at,updated_at,deleted_at) "+
      "SELECT "+quote('qa-frms-ux-case-'+n)+",f.id,NULL,"+quote(type)+","+quote(level)+
      ",112,620,540,'QA SINTETICO: revisar contexto e registrar providencia',0,0,"+
      quote(day+' 10:00:00')+",datetime('now'),NULL FROM funcionarios f WHERE f.empresa_id="+TENANT_ID+
      " AND f.matricula="+quote(PREFIX+pad(idx))+" AND f.deleted_at IS NULL"));
  }
  return sql.join('\n')+'\n';
}

export function buildRollbackSql(){
  return [
    "DELETE FROM frms_alerta WHERE id LIKE 'qa-frms-ux-case-%' AND tripulante_id IN (SELECT id FROM funcionarios WHERE empresa_id="+TENANT_ID+" AND matricula LIKE 'QA-FRMS-UX-%')",
    "DELETE FROM frms_fadiga_checkin WHERE empresa_id="+TENANT_ID+" AND id LIKE 'qa-frms-ux-checkin-%'",
    "DELETE FROM frms_jornada WHERE empresa_id="+TENANT_ID+" AND id LIKE 'qa-frms-ux-j-%'",
    "DELETE FROM frms_escala_quinzenal WHERE id LIKE 'qa-frms-ux-ciclo-%' AND tripulante_id IN (SELECT id FROM funcionarios WHERE empresa_id="+TENANT_ID+" AND matricula LIKE 'QA-FRMS-UX-%')",
    "DELETE FROM frms_profile_assignments WHERE id="+quote(ASSIGNMENT_ID)+" AND empresa_id="+TENANT_ID,
    "DELETE FROM frms_regulatory_profiles WHERE id="+quote(PROFILE_ID)+" AND empresa_id="+TENANT_ID,
    "DELETE FROM frms_config_parameters WHERE revision_id="+quote(QA_REVISION_ID)+" AND id LIKE "+quote(QA_REVISION_ID+'-%'),
    "DELETE FROM frms_config_revisions WHERE id="+quote(QA_REVISION_ID)+" AND empresa_id="+TENANT_ID,
    "UPDATE funcionarios SET deleted_at=datetime('now'),ativo=0 WHERE empresa_id="+TENANT_ID+" AND matricula LIKE 'QA-FRMS-UX-%'",
    "UPDATE setores SET deleted_at=datetime('now'),ativo=0 WHERE empresa_id="+TENANT_ID+" AND codigo='QA-FRMS-UX-SETOR'",
    "UPDATE empresas SET ativo=0,deleted_at=datetime('now') WHERE id="+TENANT_ID+" AND codigo="+quote(TENANT_CODE)
  ].map(stmt).join('\n')+'\n';
}

function query(db,sql){
  if(!(/^(?:SELECT\s|PRAGMA table_info\([a-z][a-z0-9_]*\)$)/i.test(sql))||sql.includes(';'))
    throw new Error('READONLY_PREFLIGHT_REJECTED');
  const x=spawnSync('npx',['wrangler','d1','execute',db,'--remote','--json','--command',sql],
    {cwd:join(process.cwd(),'worker-airtrust'),encoding:'utf8'});
  if(x.status!==0)throw new Error('STAGING_D1_PREFLIGHT_FAILED');
  const result=JSON.parse(x.stdout);
  return Array.isArray(result)?result[0]?.results||[]:result.results||[];
}
function assertTarget(){
  if(process.env.STAGING_D1_NAME!==DB_NAME||process.env.STAGING_D1_ID!==DB_ID)throw new Error('STAGING_D1_TARGET_REJECTED');
}
export function extractFixtureInsertColumns(sql) {
  const permitted=new Set([
    'empresas','setores','funcionarios','frms_config_revisions','frms_config_parameters',
    'frms_regulatory_profiles','frms_profile_assignments','frms_escala_quinzenal',
    'frms_jornada','frms_fadiga_checkin','frms_alerta'
  ]);
  const fields=new Map();
  for(const match of sql.matchAll(/\bINSERT\s+INTO\s+([a-z][a-z0-9_]*)\s*\(([^)]+)\)/gi)){
    const table=match[1].toLowerCase();
    if(!permitted.has(table))throw new Error('QA_UNEXPECTED_TABLE_INSERT');
    const cols=match[2].split(',').map(x=>x.trim().toLowerCase());
    if(cols.some(x=>!/^[a-z][a-z0-9_]*$/.test(x)))throw new Error('QA_INVALID_INSERT_COLUMN');
    if(fields.has(table)){
      if(fields.get(table).join(',')!==cols.join(','))throw new Error('QA_INCONSISTENT_INSERT_COLUMNS');
      continue; // Multiple individual crew/case rows use the same reviewed column contract.
    }
    fields.set(table,cols);
  }
  if(fields.size!==permitted.size || [...permitted].some(table=>!fields.has(table)))
    throw new Error('QA_INSERT_TABLE_CONTRACT_CHANGED');
  return fields;
}

function inspectFixtureSchema() {
  // Use only SELECTs and table-valued PRAGMAs. Missing columns are detected
  // before the first staging D1 write, not halfway through a multi-table seed.
  const dryDays=Array.from({length:30},(_,i)=>({
    day:new Date(Date.parse(FROM+'T00:00:00Z')+i*86400000).toISOString().slice(0,10),
    jornadas:'0',checkins:'0',casos:'0',voos:'0'
  }));
  const expected=extractFixtureInsertColumns(buildSeedSql(dryDays));
  // Matches the proven staging FRMS schema-doctor: PRAGMA table_info()
  // individually, not a UNION of table-valued PRAGMAs that D1 rejected.
  for(const [table,required] of expected){
    if(!/^[a-z][a-z0-9_]*$/.test(table))throw new Error('QA_UNSAFE_TABLE_IDENTIFIER');
    const rows=query(DB_NAME,"PRAGMA table_info("+table+")");
    const available=new Set(rows.map(row=>String(row.name).toLowerCase()));
    if(!available.size || required.some(column=>!available.has(column))){
      throw new Error('STAGING_FRMS_QA_SCHEMA_COLUMNS_MISSING:'+table);
    }
  }
  console.log('STAGING_FRMS_QA_TABLE_COLUMNS_READY tables='+expected.size);
}

function inspectQaScopedBaseline() {
  // This is a QA-local revision only. Absence of the production/global
  // revision must not block a synthetic tenant or modify other tenants.
  const sourceStatements=buildTenantScopedBaselineSql();
  if(sourceStatements.length!==2)throw new Error('QA_BASELINE_NOT_REVIEWED');
  inspectFixtureSchema();
  const collisions=query(DB_NAME,
    "SELECT id FROM frms_config_revisions WHERE id="+quote(QA_REVISION_ID)+
    " OR (empresa_id="+TENANT_ID+" AND profile_code='HELICOPTER_OFFSHORE')");
  if(collisions.length)throw new Error('QA_FRMS_REVISION_COLLISION');
  const params=query(DB_NAME,
    "SELECT COUNT(*) AS n FROM frms_config_parameters WHERE revision_id="+quote(QA_REVISION_ID));
  if(Number(params[0]?.n)!==0)throw new Error('QA_FRMS_PARAMETERS_COLLISION');
  console.log('STAGING_FRMS_QA_SCOPED_BASELINE_READY tenant='+TENANT_ID+
    ' parameterKeys=128 globalRevisionCreated=false');
  return QA_REVISION_ID;
}

function assertEmptyTenant(){
  const rows=query(DB_NAME,"SELECT id,codigo FROM empresas WHERE id="+TENANT_ID+" OR codigo="+quote(TENANT_CODE));
  if(rows.length!==0)throw new Error('QA_TENANT_NOT_EMPTY_OR_ALREADY_APPLIED');
  const crew=query(DB_NAME,"SELECT COUNT(*) AS n FROM funcionarios WHERE matricula LIKE 'QA-FRMS-UX-%'");
  if(Number(crew[0]?.n)!==0)throw new Error('QA_EMPLOYEE_CODE_COLLISION');
}

function runSql(db,sql){
  const dir=mkdtempSync(join(tmpdir(),'airtrust-frms-ux-'));
  try{
    const file=join(dir,'fixture.sql');writeFileSync(file,sql,{mode:0o600});
    const p=spawnSync('npx',['wrangler','d1','execute',db,'--remote','--json','--file',file],
      {cwd:join(process.cwd(),'worker-airtrust'),encoding:'utf8',maxBuffer:2*1024*1024});
    if(p.status!==0)throw new Error('STAGING_D1_WRITE_FAILED'); // never print raw SQL/remote error
  } finally {rmSync(dir,{recursive:true,force:true});}
}
async function main(){
  const args=new Set(process.argv.slice(2));
  const apply=args.has('--apply'),rollback=args.has('--rollback'),inspect=args.has('--inspect');
  if([...args].some(arg=>!['--apply','--rollback','--inspect'].includes(arg))||
     Number(apply)+Number(rollback)+Number(inspect)>1)throw new Error('AMBIGUOUS_MODE');
  if(inspect){
    assertTarget();
    if(process.env.GITHUB_ACTIONS!=='true')throw new Error('OFFICIAL_STAGING_WORKFLOW_ONLY');
    assertEmptyTenant();
    inspectQaScopedBaseline();
    return;
  }
  const expectedSha=String(process.env.SOURCE_AGGREGATE_SHA||'');
  const dataPath=String(process.env.SANITIZED_AGGREGATE_PATH||'');
  const data=rollback?null:validateSource(JSON.parse(readFileSync(dataPath,'utf8')),expectedSha);
  if(!apply&&!rollback){
    const sql=buildSeedSql(data);
    console.log('QA_FRMS_UX_SQL_READY mode=dry-run tenant='+TENANT_ID+' syntheticPeople=14 days=30 statements='+sql.split('\n').filter(x=>x.endsWith(';')).length);
    return;
  }
  if(process.env.CONFIRM_STAGING_FRMS_UX!==CONFIRM)throw new Error('STAGING_QA_CONFIRMATION_REQUIRED');
  if(process.env.GITHUB_ACTIONS!=='true')throw new Error('OFFICIAL_STAGING_WORKFLOW_ONLY');
  assertTarget();
  let revisionId=null;
  if(!rollback){
    assertEmptyTenant();
    revisionId=inspectQaScopedBaseline();
  }else{
    const rows=query(DB_NAME,"SELECT id,codigo FROM empresas WHERE id="+TENANT_ID);
    if(rows.length!==1||rows[0].codigo!==TENANT_CODE)throw new Error('ROLLBACK_TENANT_NOT_EXACT');
  }
  const sql=rollback?buildRollbackSql():buildSeedSql(data,revisionId);
  console.log('QA_FRMS_UX_SQL_READY mode='+(rollback?'rollback':'apply')+' tenant='+TENANT_ID+
    ' syntheticPeople=14 days=30 statements='+sql.split('\n').filter(x=>x.endsWith(';')).length);
  runSql(DB_NAME,sql);
  console.log('QA_FRMS_UX_WRITE_COMPLETED synthetic_only=true tenant='+TENANT_ID);
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href)
  main().catch(e=>{console.error('QA_FRMS_UX_FAILED:'+String(e.message));process.exitCode=1;});
