#!/usr/bin/env node
// source_reference: issue #1325; Schema V2 0557 lms_ciclo_evidencias and previous cycle history.
// dry_run_required: SELECT-only tenant 6 aggregate; no student ID, CMI, score or archival content in output.
// rollback_plan_required: no remote writes; any later credit requires distinct reviewed recovery/approval.
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
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
export function safePublicError(error){
 const s=String(error?.message??'');
 return /^LMS99_HISTORY_[A-Z0-9_]+$/.test(s)?s:'LMS99_HISTORY_FAILED';
}
function d1(statement=ARCHIVE_SQL){
 if(statement===ARCHIVE_SQL)validateQuery();
 else if(statement!==SCHEMA_PROBE_SQL)reject('SQL_NOT_REVIEWED');
 // Mirror the D1 client transport proven by production-lms99-embedded-cmi-readonly (#40099058169).
 // Do not broaden the SQL contract or add a mutation fallback.
 const cwd=fileURLToPath(new URL('../../worker-airtrust/',import.meta.url));
 const r=spawnSync('npx',['wrangler','d1','execute','airtrust-db',
   '--env','production','--remote','--json','--command',statement],{
   cwd,encoding:'utf8',env:process.env,timeout:120000,maxBuffer:5*1024*1024
 });
 if(r.error)reject('D1_EXECUTOR_ERROR');
 if(r.status!==0)reject(classifyD1Failure((r.stderr||'')+'\n'+(r.stdout||'')));
 // Never echo raw provider output: it can contain SQL text, personal data or secrets.
 let parsed;try{parsed=JSON.parse(r.stdout)}catch{reject('D1_JSON')}
 const rows=(Array.isArray(parsed)?parsed[0]:parsed)?.results;
 return statement===SCHEMA_PROBE_SQL?validateSchemaRows(rows):validateRows(rows);
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
 if(!['read','schema-probe'].includes(mode))reject('MODE_INVALID');
 if(mode==='schema-probe'){
  const checks=d1(SCHEMA_PROBE_SQL);
  process.stdout.write(JSON.stringify({schema_version:1,source_sha:src,production_sha:prod,
   tenant:6,mode:'schema-probe',writes:0,personal_data:false,
   missing_required:checks.filter(x=>x.present===0).map(x=>x.check_name),
   checks},null,2)+'\n');
  return;
 }
 const rows=d1();
 const totals=Object.fromEntries(fields.map(k=>[k,rows.reduce((n,r)=>n+r[k],0)]));
 process.stdout.write(JSON.stringify({schema_version:1,source_sha:src,production_sha:prod,
  tenant:6,mode:'read-only',writes:0,personal_data:false,
  interpretation:'HISTORICAL_LEADS_ONLY_NOT_SCORM_PASS_OR_CURRENT_EDITION_CREDIT',
  totals,by_course:rows},null,2)+'\n');
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href)
 main().catch(e=>{console.error(safePublicError(e));process.exitCode=1});
