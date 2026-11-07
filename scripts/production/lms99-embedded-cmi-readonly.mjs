#!/usr/bin/env node
/** Aggregate-only SCORM evidence recovery leads. Never an authorization to pass/qualify. */
import {spawnSync} from 'node:child_process';
import {fileURLToPath,pathToFileURL} from 'node:url';
import process from 'node:process';
// SCORM serializes CMI numeric fields as JSON strings on many real packages.
// Parse only decimal digits / a single dot, never arbitrary CAST('text')=>0.
const numberFromCmi = (key) =>
  `CASE WHEN ${key} IS NOT NULL
    AND TRIM(CAST(${key} AS TEXT)) GLOB '*[0-9]*'
    AND TRIM(CAST(${key} AS TEXT)) NOT GLOB '*[^0-9.]*'
    AND LENGTH(TRIM(CAST(${key} AS TEXT)))-LENGTH(REPLACE(TRIM(CAST(${key} AS TEXT)),'.','')) <= 1
    THEN CAST(${key} AS REAL) ELSE NULL END`;
export const SQL=`WITH source AS (
 SELECT m.curso_id, COALESCE(NULLIF(c.scorm_mastery_score,0),NULL) AS mastery,
        UPPER(COALESCE(c.scorm_assessment_policy,'SCORED')) AS assessment_policy,
        LOWER(TRIM(COALESCE(ps.lesson_status,''))) AS stored_lesson,
        LOWER(TRIM(COALESCE(ps.success_status,''))) AS stored_success,
        CASE WHEN ps.score_scaled BETWEEN 0 AND 1 THEN ps.score_scaled*100.0
             WHEN ps.score_raw IS NOT NULL AND ps.score_max>COALESCE(ps.score_min,0)
                  AND ps.score_raw BETWEEN COALESCE(ps.score_min,0) AND ps.score_max
               THEN 100.0*(ps.score_raw-COALESCE(ps.score_min,0))/(ps.score_max-COALESCE(ps.score_min,0))
             WHEN ps.score_raw BETWEEN 0 AND 100 AND ps.score_max IS NULL THEN ps.score_raw
             ELSE NULL END AS stored_score_pct,
        CASE WHEN json_valid(COALESCE(ps.cmi_json,'')) THEN 1 ELSE 0 END AS valid_cmi,
        CASE WHEN json_valid(COALESCE(ps.cmi_json,''))
             THEN COALESCE(json_extract(ps.cmi_json,'$."cmi.core.lesson_status"'),
                           json_extract(ps.cmi_json,'$."cmi.completion_status"')) END AS cmi_lesson,
        CASE WHEN json_valid(COALESCE(ps.cmi_json,''))
             THEN COALESCE(json_extract(ps.cmi_json,'$."cmi.core.score.raw"'),
                           json_extract(ps.cmi_json,'$."cmi.score.raw"')) END AS cmi_score_raw,
        CASE WHEN json_valid(COALESCE(ps.cmi_json,''))
             THEN COALESCE(json_extract(ps.cmi_json,'$."cmi.core.score.max"'),
                           json_extract(ps.cmi_json,'$."cmi.score.max"')) END AS cmi_score_max,
        CASE WHEN json_valid(COALESCE(ps.cmi_json,''))
             THEN json_extract(ps.cmi_json,'$."cmi.score.scaled"') END AS cmi_score_scaled
   FROM lms_matriculas m
   JOIN lms_cursos c ON c.id=m.curso_id AND c.empresa_id=m.empresa_id
   LEFT JOIN lms_progresso_scorm ps ON ps.matricula_id=m.id AND ps.empresa_id=m.empresa_id
  WHERE m.empresa_id=6 AND m.deleted_at IS NULL
    AND UPPER(COALESCE(m.status,'')) IN ('EM_ANDAMENTO','REPROVADO')
    AND COALESCE(m.progresso_pct,0)>=99 AND c.tipo_conteudo='scorm'
), numeric_scorm AS (
 SELECT *,
        ${numberFromCmi('cmi_score_raw')} AS raw_n,
        ${numberFromCmi('cmi_score_max')} AS max_n,
        ${numberFromCmi('cmi_score_scaled')} AS scaled_n
 FROM source
), evaluated AS (
 SELECT *,
        CASE WHEN scaled_n BETWEEN 0 AND 1 THEN scaled_n*100.0
             WHEN raw_n BETWEEN 0 AND max_n AND max_n>0 THEN raw_n*100.0/max_n
             WHEN raw_n BETWEEN 0 AND 100 AND max_n IS NULL THEN raw_n
             ELSE NULL END AS cmi_score_pct,
        LOWER(TRIM(CAST(COALESCE(cmi_lesson,'') AS TEXT))) AS cmi_end
   FROM numeric_scorm
)
SELECT curso_id, COUNT(*) AS pending_99,
       SUM(valid_cmi) AS json_present,
       SUM(CASE WHEN assessment_policy='FORMATIVE' THEN 1 ELSE 0 END) AS formative,
       SUM(CASE WHEN cmi_end IN ('passed','completed','complete')
                      AND stored_lesson NOT IN ('passed','completed')
                      AND stored_success!='passed' THEN 1 ELSE 0 END) AS embedded_terminal_drift,
       SUM(CASE WHEN cmi_score_pct IS NOT NULL AND mastery IS NOT NULL
                      AND cmi_score_pct>=mastery AND (stored_score_pct IS NULL OR stored_score_pct<mastery)
                THEN 1 ELSE 0 END) AS embedded_score_above_mastery_drift,
       SUM(CASE WHEN cmi_score_pct IS NOT NULL THEN 1 ELSE 0 END) AS embedded_numeric_score,
       SUM(CASE WHEN stored_score_pct IS NULL THEN 1 ELSE 0 END) AS normalized_score_missing,
       SUM(CASE WHEN stored_score_pct IS NOT NULL AND mastery IS NOT NULL AND stored_score_pct<mastery
                THEN 1 ELSE 0 END) AS normalized_score_below_mastery,
       SUM(CASE WHEN stored_lesson='failed' OR stored_success='failed' THEN 1 ELSE 0 END) AS explicit_failed
FROM evaluated GROUP BY curso_id ORDER BY curso_id`;
const fail=c=>{throw Error('LMS99_CMI_'+c)};
export function assertStaticSql(sql){
 if(!/^\s*WITH\s+source\s+AS\s*\(/i.test(sql) ||
 /\b(?:INSERT|UPDATE|DELETE|DROP|ALTER|CREATE|REPLACE|ATTACH|DETACH|PRAGMA|VACUUM)\s/i.test(sql) ||
 !/m\.empresa_id=6/.test(sql) || !/m\.deleted_at IS NULL/.test(sql) ||
 !/GROUP BY curso_id/.test(sql)) fail('SQL_SCOPE_INVALID');
}
export function validate(rows){
 if(!Array.isArray(rows)||rows.length>100)fail('GROUP_LIMIT');
 let total=0;const seen=new Set();
 for(const r of rows){
  if(!Number.isSafeInteger(r.curso_id)||r.curso_id<=0||seen.has(r.curso_id))fail('COURSE_INVALID');
  seen.add(r.curso_id);
  const n=r.pending_99;
  if(!Number.isSafeInteger(n)||n<1||n>500)fail('COUNT_INVALID');
  total+=n;
  for(const k of ['json_present','formative','embedded_terminal_drift','embedded_score_above_mastery_drift',
                  'embedded_numeric_score','normalized_score_missing','normalized_score_below_mastery','explicit_failed']){
   if(!Number.isSafeInteger(r[k])||r[k]<0||r[k]>n)fail('METRIC_INVALID');
  }
 }
 if(total>500)fail('TOTAL_LIMIT');
 return rows;
}
function select(){
 assertStaticSql(SQL);
 const cwd=fileURLToPath(new URL('../../worker-airtrust/',import.meta.url));
 const r=spawnSync('npx',['wrangler','d1','execute','airtrust-db','--env','production',
  '--remote','--json','--command',SQL],{cwd,env:process.env,encoding:'utf8',maxBuffer:5*1024*1024});
 if(r.status!==0)fail('D1_SELECT_FAILED');
 let d;try{d=JSON.parse(r.stdout)}catch{fail('JSON_INVALID')}
 return validate((Array.isArray(d)?d[0]:d)?.results);
}
async function run(){
 const main=String(process.env.EXPECTED_MAIN_SHA||'').toLowerCase();
 const prod=String(process.env.EXPECTED_PRODUCTION_SHA||'').toLowerCase();
 if(process.env.GITHUB_ACTIONS!=='true'||process.env.GITHUB_REF!=='refs/heads/main')fail('MAIN_ONLY');
 if(!/^[0-9a-f]{40}$/.test(main)||!/^[0-9a-f]{40}$/.test(prod)||process.env.GITHUB_SHA!==main)fail('SHA_INVALID');
 if(process.env.CONFIRMATION!=='AIRTRUST_LMS99_EMBEDDED_CMI_READONLY')fail('CONFIRMATION_INVALID');
 if(!process.env.CLOUDFLARE_API_TOKEN||!process.env.CLOUDFLARE_ACCOUNT_ID)fail('CREDENTIALS_MISSING');
 const res=await fetch('https://api.airtrust.online/api/version',{signal:AbortSignal.timeout(12000)});
 if(!res.ok)fail('VERSION_UNAVAILABLE');
 const v=await res.json();
 if(String(v?.data?.sourceSha||'').toLowerCase()!==prod)fail('PRODUCTION_SHA_MISMATCH');
 const rows=select();
 const totals=rows.reduce((a,r)=>{for(const k of Object.keys(a))a[k]+=r[k];return a;},
 {pending_99:0,json_present:0,formative:0,embedded_terminal_drift:0,embedded_score_above_mastery_drift:0,
  embedded_numeric_score:0,normalized_score_missing:0,normalized_score_below_mastery:0,explicit_failed:0});
 process.stdout.write(JSON.stringify({schema_version:1,source_sha:main,production_sha:prod,tenant:6,
  mode:'read-only',writes:0,personal_data:false,interpretation:'DIAGNOSTIC_ONLY_NOT_PROOF_OF_PASS',
  totals,by_course:rows},null,2)+'\n');
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href)
 run().catch(e=>{console.error(/^LMS99_CMI_[A-Z_]+$/.test(String(e?.message))?e.message:'LMS99_CMI_FAILED');process.exitCode=1;});
