#!/usr/bin/env node
/**
 * QA-only production purge preflight/postflight and exact-key R2 cleanup.
 * Never deletes D1 itself: D1 writes belong ONLY to Schema V2 0581.
 * Preserve sanitized QA results in docs/qa/lms-synthetic-production-snapshot-20261112.json.
 */
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

const MODE = process.argv[2] || 'preflight';
const FIRST_EMPLOYEE = 194;
const LAST_EMPLOYEE = 221;
const FIRST_USER = 162;
const LAST_USER = 189;
const QA_IDS = Array.from({length:28},(_,i)=>FIRST_EMPLOYEE+i);
const USER_IDS = Array.from({length:28},(_,i)=>FIRST_USER+i);
const QA = "SELECT id FROM funcionarios WHERE empresa_id=6 AND id BETWEEN 194 AND 221 AND matricula LIKE 'QA-LMS-%' AND matricula <> 'QA-LMS-202611' AND nome LIKE 'AIRTRUST_QA_LMS_%'";
const USERS = `SELECT id FROM usuarios WHERE id BETWEEN 162 AND 189 AND funcionario_id IN (${QA}) AND email LIKE 'qa.lms.%@airtrust.online'`;
const MATRICULAS = `SELECT id FROM lms_matriculas WHERE empresa_id=6 AND funcionario_id IN (${QA})`;
const HIST = `SELECT id FROM qualificacoes_historico WHERE empresa_id=6 AND funcionario_id IN (${QA})`;
const CYCLES = `SELECT id FROM lms_matricula_ciclos WHERE empresa_id=6 AND funcionario_id IN (${QA})`;
const KEYS_PATH=join(process.env.RUNNER_TEMP || '/tmp','airtrust-qa-lms-0581-r2-keys.json');
const TARGETS_PATH=join(process.env.RUNNER_TEMP || '/tmp','airtrust-qa-lms-0581-target-ids.json');

function check(b, code) {if (!b) throw Error(code);}
function query(sql) {
  const cli=existsSync('worker-airtrust/node_modules/.bin/wrangler') ? './node_modules/.bin/wrangler' : 'wrangler';
  const p=spawnSync(cli,['d1','execute','airtrust-db','--env','production',
    '--remote','--json','--command',sql],{cwd:'worker-airtrust',encoding:'utf8',maxBuffer:20e6});
  if(p.status!==0) throw Error('D1_READONLY_QUERY_FAILED');
  const data=JSON.parse(p.stdout);
  check(data?.[0]?.success===true && Array.isArray(data[0].results),'D1_RESPONSE_INVALID');
  return data[0].results;
}
function count(table, where) {
  check(/^[a-z0-9_]+$/.test(table),'TABLE_NOT_ALLOWLISTED_GRAMMAR');
  return Number(query(`SELECT COUNT(*) AS n FROM "${table}" WHERE ${where}`)[0]?.n);
}
function checkCanonical() {
  const x=query("SELECT id,matricula FROM funcionarios WHERE empresa_id=6 AND matricula='QA-LMS-202611' AND deleted_at IS NULL");
  check(x.length===1 && Number(x[0].id)>0,'QA_CANONICAL_MISSING_OR_COLLISION');
  const linked=query(`SELECT COUNT(*) AS n FROM usuarios WHERE funcionario_id=${Number(x[0].id)} AND email='qa.lms.202611@airtrust.online' AND deleted_at IS NULL`);
  check(Number(linked[0].n)===1,'QA_CANONICAL_LOGIN_MISSING');
}
function preflightRoster() {
  const rows=query(`SELECT f.id AS id,f.empresa_id,f.nome,f.matricula,
     u.id AS user_id,u.email AS user_email,u.perfil AS perfil
    FROM funcionarios f JOIN usuarios u ON u.funcionario_id=f.id
    WHERE f.empresa_id=6 AND f.matricula LIKE 'QA-LMS-%'
      AND f.matricula<>'QA-LMS-202611'
    ORDER BY f.id`);
  check(rows.length===28,'QA_EXPECTED_EMPLOYEE_COUNT_DRIFT');
  check(rows.every((r,i)=>Number(r.id)===QA_IDS[i] && Number(r.user_id)===USER_IDS[i]
    && Number(r.empresa_id)===6 && /^(?:QA-LMS-(?:CHR|WBK)-[0-9-]+)$/.test(r.matricula)
    && /^AIRTRUST_QA_LMS_(?:CHR|WBK)_[0-9_]+$/.test(r.nome)
    && /^qa\.lms\.[a-z0-9._-]+@airtrust\.online$/.test(r.user_email)
    && ['ALUNO','student'].includes(String(r.perfil))),'QA_IDENTITY_OWNERSHIP_DRIFT');
  const hash=createHash('sha256').update(JSON.stringify(rows.map(r=>[r.id,r.user_id,r.matricula]))).digest('hex');
  return {count:rows.length,hash};
}
const REFERENCES = Object.freeze({
 'notificacoes_log':`funcionario_id IN (${QA}) OR qualificacao_historico_id IN (${HIST})`,
 'notificacoes_inapp':`funcionario_id IN (${QA})`,
 'lms_pptx_slide_evidences':`matricula_id IN (${MATRICULAS}) OR funcionario_id IN (${QA})`,
 'lms_scorm_edition_handoffs':`matricula_id IN (${MATRICULAS}) OR ciclo_id IN (${CYCLES})`,
 'lms_xapi_statements':`matricula_id IN (${MATRICULAS})`,
 'lms_progresso_scorm':`matricula_id IN (${MATRICULAS})`,
 'documentos':`funcionario_id IN (${QA})`,
 'pasta_virtual':`funcionario_id IN (${QA})`,
 'qualificacoes_historico':`funcionario_id IN (${QA})`,
 'lms_matricula_ciclos':`funcionario_id IN (${QA})`,
 'lms_matriculas':`funcionario_id IN (${QA})`,
 'refresh_tokens':`user_id IN (${USERS})`,
 'password_reset_tokens':`user_id IN (${USERS})`,
 'convites_usuarios':`usuario_id IN (${USERS})`,
 'usuarios_empresas_perfis':`usuario_id IN (${USERS})`,
 'usuarios_empresas':`usuario_id IN (${USERS})`,
 'usuarios':`id IN (${USERS})`,
 'funcionarios':`id IN (${QA})`
});
const EXPECTED_STABLE = {
 funcionarios:28,usuarios:28,usuarios_empresas:28,usuarios_empresas_perfis:28,
 convites_usuarios:28,lms_matriculas:409,lms_matricula_ciclos:409,
 lms_progresso_scorm:143,qualificacoes_historico:144,
 documentos:132,pasta_virtual:132
};
const EXPECTED_POSITIVE_KEYS=new Set([
 'audit_logs.user_id','auditoria.usuario_id','auditoria_avancada_v2.usuario_id',
 'notificacoes_inapp.funcionario_id','lms_matriculas.funcionario_id',
 'lms_matriculas.qualificacao_historico_id',
 'lms_matricula_ciclos.funcionario_id','lms_matricula_ciclos.matricula_id',
 'lms_matricula_ciclos.qualificacao_historico_id','refresh_tokens.user_id',
 'qualificacoes_historico.funcionario_id','qualificacoes_historico.lms_matricula_id',
 'lms_progresso_scorm.matricula_id','documentos.funcionario_id',
 'pasta_virtual.funcionario_id','usuarios_empresas.usuario_id',
 'usuarios_empresas_perfis.usuario_id','convites_usuarios.usuario_id',
 'usuarios.funcionario_id','notificacoes_log.funcionario_id'
]);
function findUnexpectedRefs() {
  const tables=query("SELECT name,sql FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'");
  const scopes={funcionario_id:QA,employee_id:QA,usuario_id:USERS,user_id:USERS,
    matricula_id:MATRICULAS,lms_matricula_id:MATRICULAS,ciclo_id:CYCLES,
    qualificacao_historico_id:HIST,historico_id:HIST};
  // Batch bounded read-only reference checks to reduce D1 network round-trips.
  const probes=[];
  for(const t of tables) {
    if(!/^[a-z_][a-z0-9_]*$/i.test(t.name) || t.name.startsWith('_') || t.name.startsWith('bkp_')) continue;
    for(const [key,scope] of Object.entries(scopes)) {
      const column = new RegExp('(?:^|[,(\\n])\\s*["'+String.fromCharCode(96)+']?'+key+'["'+String.fromCharCode(96)+']?\\s+(?:INTEGER|TEXT|REAL|NUMERIC|BLOB|VARCHAR|DATETIME|BOOLEAN|INT)\\b','i');
      if(!column.test(t.sql||'')) continue;
      const ref=t.name+'.'+key;
      if(EXPECTED_POSITIVE_KEYS.has(ref)) continue;
      probes.push({table:t.name,key,scope,ref});
    }
  }
  for(let i=0;i<probes.length;i+=3) {
    const chunk=probes.slice(i,i+3);
    const sql=chunk.map(x=>`SELECT '${x.ref}' AS ref,COUNT(*) AS n FROM "${x.table}" WHERE "${x.key}" IN (${x.scope})`).join(' UNION ALL ');
    check(query(sql).every(x=>Number(x.n)===0),'UNEXPECTED_QA_REFERENCES');
  }
}
function documentKeys() {
  const docs=query(`SELECT d.id AS document_id,d.r2_key,d.funcionario_id,
        h.id AS history_id,d.empresa_id
      FROM documentos d JOIN qualificacoes_historico h
      ON h.certificado_arquivo_id=d.id AND h.funcionario_id=d.funcionario_id
      WHERE d.empresa_id=6 AND d.funcionario_id IN (${QA}) ORDER BY d.id`);
  check(docs.length===132,'QA_R2_DOCUMENTS_NOT_EXACT');
  check(new Set(docs.map(x=>x.r2_key)).size===132,'QA_R2_KEY_COLLISION');
  for(const d of docs) {
    const prefix=`certificados/empresa-6/funcionario-${d.funcionario_id}/historico-${d.history_id}/`;
    check(d.r2_key.startsWith(prefix) &&
      /^(?:[0-9a-f]{8}|[0-9a-f-]{36})\.pdf$/i.test(d.r2_key.slice(prefix.length)),
      'QA_R2_KEY_OUTSIDE_SYNTHETIC_SCOPE');
  }
  writeFileSync(KEYS_PATH,JSON.stringify(docs.map(d=>({
    key:d.r2_key,employeeId:d.funcionario_id,historyId:d.history_id}))),{mode:0o600});
}
function validateSummary() {
  const f=JSON.parse(readFileSync('docs/qa/lms-synthetic-production-snapshot-20261112.json','utf8'));
  check(f.total_enrollments===409 && f.total_courses===52
    && f.counts_by_status?.CONCLUIDO===80
    && f.educational_certification_validated===false,
    'QA_SAVED_RESULTS_NOT_VERIFIED');
}
async function r2Cleanup() {
  check(process.env.GITHUB_ACTIONS==='true' && process.env.GITHUB_REF==='refs/heads/main',
    'R2_GOVERNED_WORKFLOW_REQUIRED');
  const preflight = MODE==='r2-preflight';
  if (!preflight) check(process.env.QA_R2_PURGE_CONFIRMATION==='AIRTRUST_QA_R2_0581_POST_D1',
    'R2_CONFIRMATION_REQUIRED');
  const items=JSON.parse(readFileSync(KEYS_PATH,'utf8'));
  check(items.length===132,'R2_KEYS_COUNT_DRIFT');
  const token=process.env.CLOUDFLARE_WORKER_API_TOKEN;
  const accountId=process.env.CLOUDFLARE_ACCOUNT_ID;
  check(token && /^[0-9a-f]{32}$/.test(accountId||''),'R2_SCOPE_CREDENTIAL_REQUIRED');
  let deleted=0;
  for(const item of items) {
    const prefix=`certificados/empresa-6/funcionario-${item.employeeId}/historico-${item.historyId}/`;
    check(QA_IDS.includes(Number(item.employeeId)) && item.key.startsWith(prefix)
      && /^(?:[0-9a-f]{8}|[0-9a-f-]{36})\.pdf$/i.test(item.key.slice(prefix.length)),
      'R2_KEY_NOT_QA');
    const url=`https://api.cloudflare.com/client/v4/accounts/${accountId}/r2/buckets/airtrust-storage/objects/${item.key}`;
    const headers={Authorization:`Bearer ${token}`};
    if (preflight) {
      const pre=await fetch(url,{method:'GET',headers:{...headers,Range:'bytes=0-0'},
        signal:AbortSignal.timeout(20000)});
      if(pre.body)await pre.body.cancel();
      check(pre.status===200 || pre.status===206 || pre.status===404,'R2_PREFLIGHT_READ_DENIED');
      continue;
    }
    const resp=await fetch(url,{method:'DELETE',headers,signal:AbortSignal.timeout(20000)});
    check(resp.ok || resp.status===404,'R2_DELETE_FAILED');
    const checkResp=await fetch(url,{method:'GET',headers:{...headers,Range:'bytes=0-0'},
      signal:AbortSignal.timeout(20000)});
    if(checkResp.body) await checkResp.body.cancel();
    check(checkResp.status===404,'R2_DELETE_READBACK_FAILED');
    deleted++;
  }
  console.log(JSON.stringify({mode:MODE,checked:items.length,deleted,validated:true,pii_emitted:false}));
}
function verify() {
  checkCanonical();
  const remaining=Object.fromEntries(Object.entries(REFERENCES).map(([t,w])=>[t,count(t,w)]));
  if(MODE==='preflight') {
    const r=preflightRoster();
    validateSummary();
    findUnexpectedRefs();
    for(const [t,n] of Object.entries(EXPECTED_STABLE))
      check(remaining[t]===n,'QA_COUNT_DRIFT_'+t);
    check(count('funcionarios',"empresa_id=6 AND matricula LIKE 'QA-LMS-%'")===29,
      'QA_UNEXPECTED_ADDITIONAL_IDENTITIES');
    documentKeys();
    const targets={
      employee:QA_IDS,user:USER_IDS,
      matricula:query(`SELECT id FROM lms_matriculas WHERE funcionario_id IN (${QA})`).map(x=>x.id),
      ciclo:query(`SELECT id FROM lms_matricula_ciclos WHERE funcionario_id IN (${QA})`).map(x=>x.id),
      historico:query(`SELECT id FROM qualificacoes_historico WHERE funcionario_id IN (${QA})`).map(x=>x.id),
      documento:query(`SELECT id FROM documentos WHERE funcionario_id IN (${QA})`).map(x=>x.id)
    };
    check(targets.matricula.length===409 && targets.ciclo.length===409 &&
      targets.historico.length===144 && targets.documento.length===132,'QA_TARGETS_COUNT_DRIFT');
    writeFileSync(TARGETS_PATH,JSON.stringify(targets),{mode:0o600});
    console.log(JSON.stringify({mode:MODE,candidate_count:r.count,candidate_hash:r.hash,
      report_preserved:true,rows_by_table:remaining,r2_keys:132,pii_emitted:false}));
  } else if(MODE==='postflight') {
    check(Object.values(remaining).every(x=>x===0),'QA_PURGE_REFERENCES_REMAIN');
    const ids=JSON.parse(readFileSync(TARGETS_PATH,'utf8'));
    function scopedCount(table,col,values) {
      check(Array.isArray(values) && values.length>0 &&
        values.every(x=>Number.isSafeInteger(Number(x)) && Number(x)>0),'QA_POST_IDS_INVALID');
      return count(table,`"${col}" IN (${values.join(',')})`);
    }
    const checks=[
      ['funcionarios','id',ids.employee],['usuarios','id',ids.user],
      ['lms_matriculas','id',ids.matricula],['lms_matricula_ciclos','id',ids.ciclo],
      ['qualificacoes_historico','id',ids.historico],['documentos','id',ids.documento],
      ['pasta_virtual','funcionario_id',ids.employee],['notificacoes_inapp','funcionario_id',ids.employee],
      ['notificacoes_log','funcionario_id',ids.employee],
      ['notificacoes_log','qualificacao_historico_id',ids.historico],
      ['lms_progresso_scorm','matricula_id',ids.matricula],
      ['lms_xapi_statements','matricula_id',ids.matricula],
      ['lms_pptx_slide_evidences','matricula_id',ids.matricula],
      ['lms_scorm_edition_handoffs','matricula_id',ids.matricula],
      ['refresh_tokens','user_id',ids.user],
      ['password_reset_tokens','user_id',ids.user],
      ['convites_usuarios','usuario_id',ids.user],
      ['usuarios_empresas_perfis','usuario_id',ids.user],
      ['usuarios_empresas','usuario_id',ids.user]
    ];
    for(const [table,col,values] of checks)
      check(scopedCount(table,col,values)===0,'QA_PHYSICAL_PURGE_NOT_COMPLETE_'+table+'.'+col);

    check(count('funcionarios',"empresa_id=6 AND matricula LIKE 'QA-LMS-%'")===1,
      'QA_NOT_REDUCED_TO_ONE_EMPLOYEE');
    check(Number(query('SELECT COUNT(*) AS n FROM pragma_foreign_key_check')[0]?.n)===0,
      'QA_PURGE_FOREIGN_KEY_VIOLATIONS');
    console.log(JSON.stringify({mode:MODE,remaining,canonical_count:1,
      postconditions_verified:true,pii_emitted:false}));
  } else throw Error('INVALID_MODE');
}
if(import.meta.url===`file://${process.argv[1]}`) {
  try {
    if(MODE==='r2-cleanup' || MODE==='r2-preflight') await r2Cleanup();
    else verify();
  } catch(err) {
    const raw=String(err?.message||'ERROR');
    console.error(/^[A-Z0-9_.-]{4,120}$/.test(raw)?raw:'QA_PURGE_VALIDATION_FAILED');
    process.exitCode=1;
  }
}
