import {spawnSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

export const SCOPE='AIRTRUST_LMS_2215_TENANT6_TARGETED_CYCLE_PROGRESS';
const EXPECTED=[
 {m:385,course:34,c:508,mp:58,cp:100,cs:'EM_ANDAMENTO'},
 {m:1390,course:22,c:2671,mp:2,cp:0,cs:'NAO_INICIADO'},
 {m:2057,course:68,c:2305,mp:5,cp:2,cs:'EM_ANDAMENTO'},
];
const SELECT=[
 'SELECT m.id m,m.empresa_id tenant,m.curso_id course,m.status ms,m.progresso_pct mp,m.data_inicio mi,',
 'c.id c,c.status cs,c.progresso_pct cp,c.data_inicio ci,c.score_final score,',
 'c.tentativas tries,c.qualificacao_historico_id qual',
 'FROM lms_matriculas m JOIN lms_matricula_ciclos c ON c.matricula_id=m.id AND c.empresa_id=m.empresa_id',
 'WHERE m.empresa_id=6 AND m.deleted_at IS NULL AND c.deleted_at IS NULL AND c.ciclo_atual=1',
 'AND m.id IN (385,1390,2057) ORDER BY m.id'
].join(' ');
function requireTrue(v,reason){if(!v)throw Error(reason);}
function hash(v){return createHash('sha256').update(JSON.stringify(v)).digest('hex');}
export function validateBefore(rows){
 requireTrue(Array.isArray(rows)&&rows.length===3,'CYCLE2215_COUNT_DRIFT');
 for(let i=0;i<3;i++){
  const x=rows[i],e=EXPECTED[i];
  requireTrue(Number(x.tenant)===6&&Number(x.m)===e.m&&Number(x.course)===e.course&&
   Number(x.c)===e.c&&x.ms==='EM_ANDAMENTO'&&Number(x.mp)===e.mp&&
   x.cs===e.cs&&Number(x.cp)===e.cp&&typeof x.mi==='string'&&x.mi.length>=10,
   'CYCLE2215_PRESTATE_DRIFT');
 }
 return hash(rows);
}
export function validateAfter(rows,prior){
 requireTrue(rows.length===3,'CYCLE2215_POST_COUNT_DRIFT');
 for(let i=0;i<3;i++){
  const x=rows[i],p=prior[i],e=EXPECTED[i];
  requireTrue(Number(x.c)===e.c&&Number(x.cp)===Math.max(e.mp,e.cp)&&x.cs==='EM_ANDAMENTO'&&
   x.ms===p.ms&&Number(x.mp)===Number(p.mp)&&x.mi===p.mi&&
   x.score===p.score&&x.tries===p.tries&&x.qual===p.qual,
   'CYCLE2215_POST_EVIDENCE_DRIFT');
  if(e.m===385)requireTrue(x.ci===p.ci&&Number(x.cp)===100,'CYCLE2215_SCORM100_CHANGED');
 }
}
export function checkChangedIds(rows){
 requireTrue(rows.length===2&&rows.map(r=>Number(r.id)).sort((a,b)=>a-b).join(',')==='2305,2671',
 'CYCLE2215_UPDATE_NOT_EXACTLY_TWO');
}
function query(sql){
 const cli=path.resolve('worker-airtrust/node_modules/.bin/wrangler');
 requireTrue(fs.existsSync(cli),'WRANGLER_MISSING');
 const out=spawnSync(cli,['d1','execute','airtrust-db','--env','production','--remote','--json','--command',sql],
 {cwd:path.resolve('worker-airtrust'),encoding:'utf8',timeout:120000,maxBuffer:8000000,env:process.env});
 requireTrue(out.status===0,'D1_COMMAND_FAILED');
 let parsed;try{parsed=JSON.parse(out.stdout);}catch{throw Error('D1_JSON_INVALID');}
 requireTrue(Array.isArray(parsed)&&parsed.length===1&&parsed[0]?.success===true&&
  Array.isArray(parsed[0].results),'D1_RESPONSE_INVALID');
 return parsed[0].results;
}
export const UPDATE=[
 'WITH eligible AS (SELECT COUNT(*) n FROM lms_matricula_ciclos c',
 'JOIN lms_matriculas m ON m.id=c.matricula_id AND m.empresa_id=c.empresa_id',
 "WHERE c.empresa_id=6 AND c.ciclo_atual=1 AND c.deleted_at IS NULL AND m.deleted_at IS NULL AND m.status='EM_ANDAMENTO'",
 "AND ((c.id=2671 AND m.id=1390 AND m.curso_id=22 AND m.progresso_pct=2 AND c.status='NAO_INICIADO' AND c.progresso_pct=0 AND m.data_inicio IS NOT NULL)",
 "OR (c.id=2305 AND m.id=2057 AND m.curso_id=68 AND m.progresso_pct=5 AND c.status='EM_ANDAMENTO' AND c.progresso_pct=2)))",
 'UPDATE lms_matricula_ciclos SET',
 'progresso_pct=CASE WHEN id=2671 THEN 2 WHEN id=2305 THEN 5 ELSE progresso_pct END,',
 "status=CASE WHEN id=2671 THEN 'EM_ANDAMENTO' ELSE status END,",
 'data_inicio=CASE WHEN id=2671 THEN (SELECT data_inicio FROM lms_matriculas WHERE id=1390 AND empresa_id=6) ELSE data_inicio END,',
 "updated_at=datetime('now')",
 'WHERE empresa_id=6 AND ciclo_atual=1 AND deleted_at IS NULL AND id IN (2671,2305)',
 'AND (SELECT n FROM eligible)=2 RETURNING id'
].join(' ');
export const AUDIT=[
 'INSERT INTO audit_logs(action,entity_type,entity_id,empresa_id,old_values,new_values,detalhes,created_at)',
 "SELECT 'LMS_CYCLE_PROGRESS_GOVERNED_REPAIR_2215','lms_matricula_ciclos',id,6,",
 "CASE id WHEN 2671 THEN '{\"status\":\"NAO_INICIADO\",\"progresso_pct\":0}' ELSE '{\"status\":\"EM_ANDAMENTO\",\"progresso_pct\":2}' END,",
 "CASE id WHEN 2671 THEN '{\"status\":\"EM_ANDAMENTO\",\"progresso_pct\":2}' ELSE '{\"status\":\"EM_ANDAMENTO\",\"progresso_pct\":5}' END,",
 "'{\"scope\":\"2215\",\"scores_qualifications_scorm_untouched\":true}',datetime('now')",
 'FROM lms_matricula_ciclos WHERE empresa_id=6 AND deleted_at IS NULL AND id IN (2671,2305)',
 "AND status='EM_ANDAMENTO' AND ((id=2671 AND progresso_pct=2) OR (id=2305 AND progresso_pct=5))",
 'RETURNING entity_id'
].join(' ');
const AUDIT_READ="SELECT entity_id id FROM audit_logs WHERE empresa_id=6 AND action='LMS_CYCLE_PROGRESS_GOVERNED_REPAIR_2215' AND entity_id IN (2671,2305) AND deleted_at IS NULL ORDER BY entity_id";
export function main(env=process.env){
 const mode=env.CYCLE2215_MODE;
 requireTrue(mode==='dry-run'||mode==='apply','CYCLE2215_MODE_INVALID');
 requireTrue(env.CYCLE2215_CONFIRMATION===(mode==='dry-run'?'AIRTRUST_LMS_CYCLE_2215_DRY_RUN':'AIRTRUST_LMS_CYCLE_2215_APPLY_EXACT_2'),'CYCLE2215_CONFIRMATION_INVALID');
 requireTrue(/^[0-9a-f]{40}$/.test(env.CYCLE2215_SOURCE_SHA||''),'CYCLE2215_SHA_INVALID');
 const prior=query(SELECT),beforeHash=validateBefore(prior);
 const result={scope:SCOPE,sourceSha:env.CYCLE2215_SOURCE_SHA,mode,tenant:6,
  matriculaIds:[385,1390,2057],cycleIds:[508,2671,2305],beforeHash,plannedChanges:2,
  writes:0,postconditionsVerified:false};
 if(mode==='apply'){
  requireTrue(beforeHash===env.CYCLE2215_REVIEWED_HASH,'CYCLE2215_REVIEWED_HASH_DRIFT');
  requireTrue(query(AUDIT_READ).length===0,'CYCLE2215_ALREADY_APPLIED');
  checkChangedIds(query(UPDATE));
  result.writes=2;
  checkChangedIds(query(AUDIT).map(r=>({id:r.entity_id})));
  validateAfter(query(SELECT),prior);
  requireTrue(query(AUDIT_READ).length===2,'CYCLE2215_AUDIT_INCOMPLETE');
  result.postconditionsVerified=true;
 }
 const output=env.CYCLE2215_REPORT_PATH||'qa-state/lms-cycle-progress-2215.json';
 fs.mkdirSync(path.dirname(output),{recursive:true});
 fs.writeFileSync(output,JSON.stringify(result,null,2)+'\n',{mode:0o600});
 process.stdout.write(JSON.stringify(result)+'\n');
}
if(process.argv[1]?.endsWith('lms-cycle-progress-2215.mjs')){
 try{main();}catch(e){console.error(/^[A-Z][A-Z0-9_]+$/.test(e.message)?e.message:'CYCLE2215_FAILED');process.exitCode=1;}
}
