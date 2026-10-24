#!/usr/bin/env node
// source_reference: issue #1325; Schema V2 0557 lms_ciclo_evidencias and previous cycle history.
// dry_run_required: SELECT-only tenant 6 aggregate; no student ID, CMI, score or archival content in output.
// rollback_plan_required: no remote writes; any later credit requires distinct reviewed recovery/approval.
import {pathToFileURL} from 'node:url';
import process from 'node:process';
const reject = code => { throw Error('LMS99_HISTORY_' + code); };
const sql = String.raw;
export const ARCHIVE_SQL=sql`WITH pending AS (
  SELECT m.id, m.empresa_id, m.curso_id
    FROM lms_matriculas m
    JOIN lms_cursos c ON c.id=m.curso_id AND c.empresa_id=m.empresa_id
   WHERE m.empresa_id=6 AND m.deleted_at IS NULL
     AND UPPER(COALESCE(m.status,'')) IN ('EM_ANDAMENTO','REPROVADO')
     AND COALESCE(m.progresso_pct,0)>=99 AND c.tipo_conteudo='scorm'
), indicators AS (
  SELECT p.curso_id,
   EXISTS(SELECT 1 FROM lms_matricula_ciclos cy
          WHERE cy.empresa_id=p.empresa_id AND cy.matricula_id=p.id
            AND cy.ciclo_atual=0 AND UPPER(COALESCE(cy.status,''))='CONCLUIDO') AS prior_completed_cycle,
   EXISTS(SELECT 1 FROM lms_ciclo_evidencias ev JOIN lms_matricula_ciclos cy
             ON cy.id=ev.ciclo_id AND cy.empresa_id=ev.empresa_id
            AND cy.matricula_id=ev.matricula_id AND cy.ciclo_atual=0
          WHERE ev.empresa_id=p.empresa_id AND ev.matricula_id=p.id) AS archived_cycle_snapshot,
   EXISTS(SELECT 1 FROM lms_ciclo_evidencias ev JOIN lms_matricula_ciclos cy
             ON cy.id=ev.ciclo_id AND cy.empresa_id=ev.empresa_id
            AND cy.matricula_id=ev.matricula_id AND cy.ciclo_atual=0
          WHERE ev.empresa_id=p.empresa_id AND ev.matricula_id=p.id
            AND CASE WHEN json_valid(COALESCE(ev.enrollment_json,''))
             THEN LOWER(TRIM(CAST(json_extract(ev.enrollment_json,'$.status') AS TEXT)))
             ELSE '' END='concluido') AS archived_enrollment_complete,
   EXISTS(SELECT 1 FROM lms_ciclo_evidencias ev JOIN lms_matricula_ciclos cy
             ON cy.id=ev.ciclo_id AND cy.empresa_id=ev.empresa_id
            AND cy.matricula_id=ev.matricula_id AND cy.ciclo_atual=0
          WHERE ev.empresa_id=p.empresa_id AND ev.matricula_id=p.id
            AND CASE WHEN json_valid(COALESCE(ev.scorm_json,''))
               THEN (
                 -- Failed SCORM status always precedes a conflicting terminal signal.
                 LOWER(TRIM(CAST(COALESCE(json_extract(ev.scorm_json,'$.lesson_status'),'') AS TEXT)))!='failed'
                 AND LOWER(TRIM(CAST(COALESCE(json_extract(ev.scorm_json,'$.success_status'),'') AS TEXT)))!='failed'
                 AND (
                   LOWER(TRIM(CAST(COALESCE(json_extract(ev.scorm_json,'$.lesson_status'),'') AS TEXT))) IN ('passed','completed')
                   OR (
                     LOWER(TRIM(CAST(COALESCE(json_extract(ev.scorm_json,'$.completion_status'),'') AS TEXT))) IN ('completed','complete')
                     AND LOWER(TRIM(CAST(COALESCE(json_extract(ev.scorm_json,'$.success_status'),'') AS TEXT))) IN ('passed','','unknown')
                   )
                 )
               )
               ELSE 0 END
          ) AS archived_scorm_terminal,
   EXISTS(SELECT 1 FROM lms_ciclo_evidencias ev JOIN lms_matricula_ciclos cy
             ON cy.id=ev.ciclo_id AND cy.empresa_id=ev.empresa_id
            AND cy.matricula_id=ev.matricula_id AND cy.ciclo_atual=0
          WHERE ev.empresa_id=p.empresa_id AND ev.matricula_id=p.id
            AND CASE WHEN json_valid(COALESCE(ev.scorm_json,''))
              THEN json_type(ev.scorm_json,'$.score_raw')
              ELSE NULL END IN ('integer','real')
          ) AS archived_numeric_score
  FROM pending p
)
SELECT curso_id, COUNT(*) AS pending_99,
       SUM(prior_completed_cycle) AS prior_completed_cycle,
       SUM(archived_cycle_snapshot) AS archived_cycle_snapshot,
       SUM(archived_enrollment_complete) AS archived_enrollment_complete,
       SUM(archived_scorm_terminal) AS archived_scorm_terminal,
       SUM(archived_numeric_score) AS archived_numeric_score
  FROM indicators GROUP BY curso_id ORDER BY curso_id`;

export const SCHEMA_PROBE_SQL = `SELECT 'lms_matriculas' AS check_name,
 EXISTS(SELECT 1 FROM sqlite_master WHERE type='table' AND name='lms_matriculas') AS present
UNION ALL SELECT 'lms_cursos', EXISTS(SELECT 1 FROM sqlite_master WHERE type='table' AND name='lms_cursos')
UNION ALL SELECT 'lms_matricula_ciclos', EXISTS(SELECT 1 FROM sqlite_master WHERE type='table' AND name='lms_matricula_ciclos')
UNION ALL SELECT 'lms_ciclo_evidencias', EXISTS(SELECT 1 FROM sqlite_master WHERE type='table' AND name='lms_ciclo_evidencias')
UNION ALL SELECT 'lms_ciclo_evidencias.scorm_json', EXISTS(SELECT 1 FROM pragma_table_info('lms_ciclo_evidencias') WHERE name='scorm_json')
UNION ALL SELECT 'lms_ciclo_evidencias.enrollment_json', EXISTS(SELECT 1 FROM pragma_table_info('lms_ciclo_evidencias') WHERE name='enrollment_json')
UNION ALL SELECT 'lms_matricula_ciclos.ciclo_atual', EXISTS(SELECT 1 FROM pragma_table_info('lms_matricula_ciclos') WHERE name='ciclo_atual')
UNION ALL SELECT 'lms_matriculas.progresso_pct', EXISTS(SELECT 1 FROM pragma_table_info('lms_matriculas') WHERE name='progresso_pct')`;
// Minimal D1 metadata probe: no UNION, virtual pragma table, learner rows, or private data.
// Migration 0346 defines the six selected cycle columns. Production table probes
// confirmed this table exists; query only its existing prior-cycle rows.
export const CYCLES_ONLY_SQL=`WITH pending AS (
 SELECT m.id, m.curso_id, m.empresa_id
 FROM lms_matriculas m
 JOIN lms_cursos c ON c.id=m.curso_id AND c.empresa_id=m.empresa_id
 WHERE m.empresa_id=6 AND m.deleted_at IS NULL
   AND UPPER(COALESCE(m.status,'')) IN ('EM_ANDAMENTO','REPROVADO')
   AND COALESCE(m.progresso_pct,0)>=99 AND c.tipo_conteudo='scorm'
), signals AS (
 SELECT p.curso_id,
   EXISTS(SELECT 1 FROM lms_matricula_ciclos cy
     WHERE cy.matricula_id=p.id AND cy.empresa_id=p.empresa_id AND cy.curso_id=p.curso_id
       AND cy.ciclo_atual=0 AND cy.deleted_at IS NULL
       AND UPPER(COALESCE(cy.status,''))='CONCLUIDO') AS prior_completed,
   EXISTS(SELECT 1 FROM lms_matricula_ciclos cy
     WHERE cy.matricula_id=p.id AND cy.empresa_id=p.empresa_id AND cy.curso_id=p.curso_id
       AND cy.ciclo_atual=0 AND cy.deleted_at IS NULL
       AND UPPER(COALESCE(cy.status,''))='CONCLUIDO'
       AND cy.data_conclusao IS NOT NULL) AS prior_dated_completed,
   EXISTS(SELECT 1 FROM lms_matricula_ciclos cy
     WHERE cy.matricula_id=p.id AND cy.empresa_id=p.empresa_id AND cy.curso_id=p.curso_id
       AND cy.ciclo_atual=0 AND cy.deleted_at IS NULL
       AND cy.score_final IS NOT NULL) AS prior_score_recorded,
   EXISTS(SELECT 1 FROM lms_matricula_ciclos cy
     WHERE cy.matricula_id=p.id AND cy.empresa_id=p.empresa_id AND cy.curso_id=p.curso_id
       AND cy.ciclo_atual=0 AND cy.deleted_at IS NULL
       AND cy.qualificacao_historico_id IS NOT NULL) AS prior_qualification_link
 FROM pending p
)
SELECT curso_id,COUNT(*) AS pending_99,
 SUM(prior_completed) AS prior_completed_cycle,
 SUM(prior_dated_completed) AS prior_dated_completed,
 SUM(prior_score_recorded) AS prior_score_recorded,
 SUM(prior_qualification_link) AS prior_qualification_link
FROM signals GROUP BY curso_id ORDER BY curso_id`;
// Aggregate status/course flags so D1-only candidates omitted from the active
// admin roster can be routed without exposing enrollment or employee IDs.
export const CANDIDATE_BREAKDOWN_SQL=`WITH pending AS (
 SELECT m.empresa_id,m.curso_id,UPPER(TRIM(m.status)) AS enrollment_status,
        c.ativo AS course_active,c.publicado AS course_published,
        CASE WHEN c.deleted_at IS NULL THEN 0 ELSE 1 END AS course_deleted,
        m.id AS matricula_id
 FROM lms_matriculas m JOIN lms_cursos c ON c.id=m.curso_id AND c.empresa_id=m.empresa_id
 WHERE m.empresa_id=6 AND m.deleted_at IS NULL
   AND UPPER(COALESCE(m.status,'')) IN ('EM_ANDAMENTO','REPROVADO')
   AND COALESCE(m.progresso_pct,0)>=99 AND c.tipo_conteudo='scorm'
), indicators AS (
 SELECT p.curso_id,p.enrollment_status,p.course_active,p.course_published,p.course_deleted,
   EXISTS(SELECT 1 FROM lms_matricula_ciclos cy WHERE cy.empresa_id=p.empresa_id
      AND cy.matricula_id=p.matricula_id AND cy.curso_id=p.curso_id AND cy.ciclo_atual=0
      AND cy.deleted_at IS NULL AND UPPER(COALESCE(cy.status,''))='CONCLUIDO') AS prior_completed,
   EXISTS(SELECT 1 FROM lms_matricula_ciclos cy WHERE cy.empresa_id=p.empresa_id
      AND cy.matricula_id=p.matricula_id AND cy.curso_id=p.curso_id AND cy.ciclo_atual=0
      AND cy.deleted_at IS NULL AND cy.data_conclusao IS NOT NULL) AS prior_dated_completed,
   EXISTS(SELECT 1 FROM lms_matricula_ciclos cy WHERE cy.empresa_id=p.empresa_id
      AND cy.matricula_id=p.matricula_id AND cy.curso_id=p.curso_id AND cy.ciclo_atual=0
      AND cy.deleted_at IS NULL AND cy.score_final IS NOT NULL) AS prior_score_recorded,
   EXISTS(SELECT 1 FROM lms_matricula_ciclos cy WHERE cy.empresa_id=p.empresa_id
      AND cy.matricula_id=p.matricula_id AND cy.curso_id=p.curso_id AND cy.ciclo_atual=0
      AND cy.deleted_at IS NULL AND cy.qualificacao_historico_id IS NOT NULL) AS prior_qualification_link
 FROM pending p
)
SELECT curso_id,enrollment_status,course_active,course_published,course_deleted,
 COUNT(*) AS pending_99,SUM(prior_completed) AS prior_completed_cycle,
 SUM(prior_dated_completed) AS prior_dated_completed,SUM(prior_score_recorded) AS prior_score_recorded,
 SUM(prior_qualification_link) AS prior_qualification_link
FROM indicators GROUP BY curso_id,enrollment_status,course_active,course_published,course_deleted
ORDER BY curso_id,enrollment_status`;
export function validateCandidateBreakdownRows(rows){
 const metrics=['pending_99','prior_completed_cycle','prior_dated_completed','prior_score_recorded','prior_qualification_link'];
 if(!Array.isArray(rows)||rows.length>200)reject('CANDIDATE_ROW_LIMIT');
 const seen=new Set();let total=0;
 for(const row of rows){
  if(!row||Object.keys(row).length!==10||Object.keys(row).some(k=>!['curso_id','enrollment_status','course_active','course_published','course_deleted',...metrics].includes(k)))reject('CANDIDATE_RESULT_SHAPE');
  if(!Number.isSafeInteger(row.curso_id)||row.curso_id<1||!['EM_ANDAMENTO','REPROVADO'].includes(row.enrollment_status)||
     ![0,1].includes(row.course_active)||![0,1].includes(row.course_published)||![0,1].includes(row.course_deleted))reject('CANDIDATE_RESULT_INVALID');
  const key=[row.curso_id,row.enrollment_status,row.course_active,row.course_published,row.course_deleted].join(':');
  if(seen.has(key))reject('CANDIDATE_DUPLICATE');seen.add(key);
  for(const metric of metrics)if(!Number.isSafeInteger(row[metric])||row[metric]<0||row[metric]>500)reject('CANDIDATE_METRIC_INVALID');
  if(row.pending_99<1||metrics.slice(1).some(k=>row[k]>row.pending_99))reject('CANDIDATE_BOUNDS');
  total+=row.pending_99;
 }
 if(total>500)reject('CANDIDATE_COHORT_LIMIT');
 return rows;
}
// Read the physical D1 CREATE TABLE definition first. The DDL stays in memory;
// only required column names and availability are ever eligible for output.
export const CYCLES_SCHEMA_PROBE_SQL="SELECT sql FROM sqlite_master WHERE type='table' AND name='lms_matricula_ciclos'";
const CYCLE_REQUIRED_COLUMNS=['empresa_id','matricula_id','curso_id','status','ciclo_atual',
 'data_conclusao','score_final','qualificacao_historico_id','deleted_at'];
export function validateCyclesSchemaRows(rows){
 if(!Array.isArray(rows)||rows.length!==1||!rows[0]||Object.keys(rows[0]).length!==1||typeof rows[0].sql!=='string')
  reject('CYCLE_SCHEMA_RESULT_INVALID');
 const ddl=rows[0].sql;
 if(!/^\s*CREATE\s+TABLE\b/i.test(ddl)||!/\blms_matricula_ciclos\b/i.test(ddl))reject('CYCLE_SCHEMA_RESULT_INVALID');
 const checks=CYCLE_REQUIRED_COLUMNS.map(column=>({
  column,
  present:new RegExp(`(?:^|[,\\s(])\\s*["\u0060\\[]?${column}["\u0060\\]]?\\s+(?:INTEGER|TEXT|REAL|NUMERIC|BLOB|VARCHAR)\\b`,'i').test(ddl),
 }));
 if(checks.some(check=>!check.present))reject('CYCLE_SCHEMA_REQUIRED_COLUMN_MISSING');
 return checks;
}
export function validateCycleRows(rows){
 if(!Array.isArray(rows)||rows.length>100)reject('CYCLE_ROW_LIMIT');
 const names=['pending_99','prior_completed_cycle','prior_dated_completed',
 'prior_score_recorded','prior_qualification_link'];
 const seen=new Set();let total=0;
 for(const row of rows){
  if(!row||Object.keys(row).length!==6||Object.keys(row).some(key=>!['curso_id',...names].includes(key)))
   reject('CYCLE_RESULT_SHAPE');
  if(!Number.isSafeInteger(row.curso_id)||row.curso_id<1||seen.has(row.curso_id))reject('CYCLE_ID_INVALID');
  seen.add(row.curso_id);
  for(const key of names){
   if(!Number.isSafeInteger(row[key])||row[key]<0||row[key]>500)reject('CYCLE_METRIC_INVALID');
  }
  if(row.pending_99<1 || names.slice(1).some(k=>row[k]>row.pending_99))reject('CYCLE_BOUNDS');
  total+=row.pending_99;
 }
 if(total>500)reject('CYCLE_COHORT_LIMIT');
 return rows;
}

export const TABLES_PROBE_SQL="SELECT name FROM sqlite_master WHERE type='table' AND name IN ('lms_matriculas','lms_cursos','lms_matricula_ciclos','lms_ciclo_evidencias') ORDER BY name";
export function validateTableNames(rows) {
 const allowed=['lms_matriculas','lms_cursos','lms_matricula_ciclos','lms_ciclo_evidencias'];
 if(!Array.isArray(rows)||rows.length>allowed.length)reject('TABLE_ROW_LIMIT');
 const found=new Set();
 for(const row of rows) {
  if(!row||Object.keys(row).length!==1||!allowed.includes(row.name)||found.has(row.name))
   reject('TABLE_RESULT_INVALID');
  found.add(row.name);
 }
 return allowed.map(name=>({check_name:name,present:found.has(name)?1:0}));
}

export function validateSchemaRows(rows) {
 const names=['lms_matriculas','lms_cursos','lms_matricula_ciclos','lms_ciclo_evidencias',
 'lms_ciclo_evidencias.scorm_json','lms_ciclo_evidencias.enrollment_json',
 'lms_matricula_ciclos.ciclo_atual','lms_matriculas.progresso_pct'];
 if(!Array.isArray(rows)||rows.length!==names.length)reject('SCHEMA_ROW_COUNT');
 const map=new Map();
 for(const row of rows){
  if(!names.includes(row.check_name)||map.has(row.check_name)||![0,1].includes(row.present))
   reject('SCHEMA_RESULT_INVALID');
  map.set(row.check_name,row.present);
 }
 return names.map(name=>({check_name:name,present:map.get(name)}));
}

export function validateQuery(statement=ARCHIVE_SQL){
 if(!/^\s*WITH\s+pending\s+AS/i.test(statement) || !/m\.empresa_id=6/.test(statement) ||
 !/m\.deleted_at IS NULL/.test(statement) || !/GROUP BY curso_id/.test(statement) ||
 /\b(INSERT|UPDATE|DELETE|DROP|ALTER|CREATE|REPLACE|ATTACH|DETACH|PRAGMA|VACUUM)\b/i.test(statement))
 reject('SQL_SCOPE');
 return statement;
}
const fields=['pending_99','prior_completed_cycle','archived_cycle_snapshot',
 'archived_enrollment_complete','archived_scorm_terminal','archived_numeric_score'];
export function validateRows(rows){
 if(!Array.isArray(rows)||rows.length>100)reject('ROW_LIMIT');
 const seen=new Set();let total=0;
 for(const r of rows){
  if(!Number.isSafeInteger(r.curso_id)||r.curso_id<1||seen.has(r.curso_id))reject('COURSE_ID');
  seen.add(r.curso_id);
  if(!Number.isSafeInteger(r.pending_99)||r.pending_99<1||r.pending_99>500)reject('PENDING_COUNT');
  total+=r.pending_99;
  for(const k of fields.slice(1))if(!Number.isSafeInteger(r[k])||r[k]<0||r[k]>r.pending_99)reject('AGGREGATE_COUNT');
 }
 if(total>500)reject('COHORT_LIMIT');
 return rows;
}
// Fixed-category errors only: no stderr, SQL, URL, token, roster or backend response
// is ever logged. D1's official SELECT-only workflow remains the sole transport.
export function classifyD1Failure(stderr){
 const s=String(stderr??'').slice(0,16000);
 if(/no such table[^\n]*lms_ciclo_evidencias|table[^\n]*lms_ciclo_evidencias[^\n]*does not exist/i.test(s))
  return 'D1_ARCHIVE_SCHEMA_MISSING';
 if(/no such column|SQLITE_ERROR[^\n]*column/i.test(s))return 'D1_COLUMN_SCHEMA_MISMATCH';
 if(/unauthorized|forbidden|authentication error|permission denied|error[^\n]*code[^\n]*403/i.test(s))
  return 'D1_ACCESS_DENIED';
 if(/npx[^\n]*not found|wrangler[^\n]*not found/i.test(s))return 'D1_CLIENT_UNAVAILABLE';
 return 'D1_SELECT_FAILED';
}
// Only fixed classifications and numeric HTTP / Cloudflare error codes leave the runner.
// Never print the provider's message, request SQL, token, account, or response payload.
export function classifyD1RestRejection(httpStatus,payload){
 const status=Number(httpStatus);
 const errors=Array.isArray(payload?.errors)?payload.errors:[];
 const msg=errors.map(e=>String(e?.message??'')).slice(0,4).join(' ').slice(0,4000);
 if(/no such table|table .* does not exist/i.test(msg))return 'D1_SCHEMA_TABLE_MISSING';
 if(/no such column|SQLITE_ERROR.*column/i.test(msg))return 'D1_SCHEMA_COLUMN_MISSING';
 if(/syntax error|near .*syntax/i.test(msg))return 'D1_SQL_SYNTAX_REJECTED';
 if([401,403].includes(status)||/permission|forbidden|unauthorized/i.test(msg))return 'D1_ACCESS_DENIED';
 if(status===429)return 'D1_RATE_LIMITED';
 const errorCode=errors.map(e=>e?.code).find(c=>Number.isSafeInteger(c)&&c>=100&&c<=99999);
 if(errorCode)return 'D1_CF_CODE_'+errorCode;
 if(Number.isSafeInteger(status)&&status>=400&&status<=599)return 'D1_HTTP_'+status;
 return 'D1_READ_REJECTED';
}
export function safePublicError(error){
 const s=String(error?.message??'');
 return /^LMS99_HISTORY_[A-Z0-9_]+$/.test(s)?s:'LMS99_HISTORY_FAILED';
}
// Same pinned production D1 REST read transport as frms-assignment-readonly-inventory.mjs.
// Static reviewed statements only; this function cannot execute a caller-supplied query.
export const PRODUCTION_D1_ID='7c8a788e-a4c4-4d5d-8208-ff7ff55e84ae';
export const NON_PRODUCTION_D1_IDS=[
 'bf9963f4-eb12-439b-a830-20bbf577ac22',
 'a72fb05b-0912-4ad9-9686-e7948c8b09eb',
];
export function assertSqlTransportScope(statement,databaseId=PRODUCTION_D1_ID){
 if(statement===ARCHIVE_SQL)validateQuery();
 else if(statement!==SCHEMA_PROBE_SQL && statement!==TABLES_PROBE_SQL && statement!==CYCLES_ONLY_SQL && statement!==CYCLES_SCHEMA_PROBE_SQL && statement!==CANDIDATE_BREAKDOWN_SQL)reject('SQL_NOT_REVIEWED');
 if(databaseId!==PRODUCTION_D1_ID||NON_PRODUCTION_D1_IDS.includes(databaseId))
  reject('D1_TARGET_DENIED');
 if(/;|\\b(?:INSERT|UPDATE|DELETE|REPLACE|CREATE|ALTER|DROP|ATTACH|DETACH|PRAGMA\\s+[\\w]+\\s*=)\\b/i.test(statement))
  reject('D1_SQL_MUTATION_OR_MULTI_STATEMENT');
}
export async function d1(statement=ARCHIVE_SQL,{fetcher=fetch,accountId=process.env.CLOUDFLARE_ACCOUNT_ID,token=process.env.CLOUDFLARE_API_TOKEN}={}){
 assertSqlTransportScope(statement);
 if(!/^[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12}$/.test(PRODUCTION_D1_ID))reject('D1_TARGET_DENIED');
 if(!accountId||!token)reject('CREDENTIALS');
 const endpoint=`https://api.cloudflare.com/client/v4/accounts/${encodeURIComponent(accountId)}/d1/database/${PRODUCTION_D1_ID}/query`;
 let response;
 try{
  response=await fetcher(endpoint,{
   method:'POST',headers:{Authorization:`Bearer ${token}`,'Content-Type':'application/json',Accept:'application/json'},
   body:JSON.stringify({sql:statement}),signal:AbortSignal.timeout(25000),
  });
 }catch{reject('D1_TRANSPORT_FAILED')}
 let data;try{data=await response.json()}catch{reject('D1_RESPONSE_INVALID')}
 if(!response.ok||data?.success!==true)reject(classifyD1RestRejection(response.status,data));
 const first=Array.isArray(data?.result)?data.result[0]:data?.result;
 if(!first||first.success===false||!Array.isArray(first.results))reject('D1_STATEMENT_REJECTED');
 if(statement===TABLES_PROBE_SQL)return validateTableNames(first.results);
 if(statement===CYCLES_ONLY_SQL)return validateCycleRows(first.results);
 if(statement===CANDIDATE_BREAKDOWN_SQL)return validateCandidateBreakdownRows(first.results);
 if(statement===CYCLES_SCHEMA_PROBE_SQL)return validateCyclesSchemaRows(first.results);
 return statement===SCHEMA_PROBE_SQL?validateSchemaRows(first.results):validateRows(first.results);
}
async function main(){
 const src=String(process.env.EXPECTED_MAIN_SHA||'').toLowerCase();
 const prod=String(process.env.EXPECTED_PRODUCTION_SHA||'').toLowerCase();
 if(process.env.GITHUB_ACTIONS!=='true'||process.env.GITHUB_REF!=='refs/heads/main' ||
 process.env.GITHUB_SHA!==src || !/^[0-9a-f]{40}$/.test(src) || !/^[0-9a-f]{40}$/.test(prod))
 reject('SHA_SCOPE');
 if(process.env.CONFIRMATION!=='AIRTRUST_LMS99_HISTORY_READONLY')reject('CONFIRM');
 if(!process.env.CLOUDFLARE_API_TOKEN||!process.env.CLOUDFLARE_ACCOUNT_ID)reject('CREDENTIALS');
 const response=await fetch('https://api.airtrust.online/api/version',{signal:AbortSignal.timeout(12000)});
 if(!response.ok)reject('PROD_VERSION');
 const version=await response.json();
 if(String(version?.data?.sourceSha??'').toLowerCase()!==prod)reject('PROD_SHA_DRIFT');
 const mode=String(process.env.LMS99_HISTORY_MODE||'read');
 if(!['read','schema-probe','tables-probe','cycles-only','candidate-breakdown'].includes(mode))reject('MODE_INVALID');
 if(mode==='cycles-only'){
  const schema=await d1(CYCLES_SCHEMA_PROBE_SQL);
  const rows=await d1(CYCLES_ONLY_SQL);
  const totals=Object.fromEntries(['pending_99','prior_completed_cycle','prior_dated_completed','prior_score_recorded','prior_qualification_link']
    .map(k=>[k,rows.reduce((n,r)=>n+r[k],0)]));
  process.stdout.write(JSON.stringify({schema_version:1,source_sha:src,production_sha:prod,
   tenant:6,mode:'cycles-only',writes:0,personal_data:false,
   schema_columns_present:true,schema_columns_checked:schema.map(x=>x.column),
   interpretation:'PRIOR_CYCLE_INDICATORS_ONLY_NOT_CURRENT_COURSE_PASS',
   totals,by_course:rows},null,2)+'\n');
  return;
 }
 if(mode==='candidate-breakdown'){
  const schema=await d1(CYCLES_SCHEMA_PROBE_SQL);
  const rows=await d1(CANDIDATE_BREAKDOWN_SQL);
  const totals=Object.fromEntries(['pending_99','prior_completed_cycle','prior_dated_completed','prior_score_recorded','prior_qualification_link']
    .map(k=>[k,rows.reduce((n,r)=>n+r[k],0)]));
  process.stdout.write(JSON.stringify({schema_version:1,source_sha:src,production_sha:prod,
   tenant:6,mode:'candidate-breakdown',writes:0,personal_data:false,
   schema_columns_present:true,schema_columns_checked:schema.map(x=>x.column),
   interpretation:'AGGREGATE_STATUS_AND_COURSE_FLAGS_ONLY_NO_INDIVIDUAL_COMPLETION_CREDIT',
   totals,by_course_status:rows},null,2)+'\n');
  return;
 }
 if(mode==='tables-probe'){
  const checks=await d1(TABLES_PROBE_SQL);
  process.stdout.write(JSON.stringify({schema_version:1,source_sha:src,production_sha:prod,
   tenant:6,mode:'tables-probe',writes:0,personal_data:false,
   missing_required:checks.filter(x=>x.present===0).map(x=>x.check_name),checks},null,2)+'\n');
  return;
 }
 if(mode==='schema-probe'){
  const checks=await d1(SCHEMA_PROBE_SQL);
  process.stdout.write(JSON.stringify({schema_version:1,source_sha:src,production_sha:prod,
   tenant:6,mode:'schema-probe',writes:0,personal_data:false,
   missing_required:checks.filter(x=>x.present===0).map(x=>x.check_name),
   checks},null,2)+'\n');
  return;
 }
 const rows=await d1();
 const totals=Object.fromEntries(fields.map(k=>[k,rows.reduce((n,r)=>n+r[k],0)]));
 process.stdout.write(JSON.stringify({schema_version:1,source_sha:src,production_sha:prod,
  tenant:6,mode:'read-only',writes:0,personal_data:false,
  interpretation:'HISTORICAL_LEADS_ONLY_NOT_SCORM_PASS_OR_CURRENT_EDITION_CREDIT',
  totals,by_course:rows},null,2)+'\n');
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href)
 main().catch(e=>{console.error(safePublicError(e));process.exitCode=1});
