// source_reference: AirTrust FRMS #1426, D1 preflight #39076290801, reviewed PR #1564.
// operational_decision: guarded staging-only QA repair library; never invoke by itself.
// dry_run_required: no CLI, HTTP route, Cloudflare token, deploy, or applied D1 writes.
// rollback_plan_required: encrypted eight-row preimage, D1 Time Travel and inverse CAS.
import {createHash, createCipheriv, randomBytes} from 'node:crypto';
import {assertReviewPlan, EXPECTED_IDS, TARGET} from './frms-qa-cases-repair-plan.mjs';

const HEX_40=/^[a-f0-9]{40}$/;
const HEX_64=/^[a-f0-9]{64}$/;
const DENY="json_extract('FRMS_QA_CAS_ABORT_BAD_JSON','$')";
const digest=s=>createHash('sha256').update(s).digest('hex');
const die=x=>{throw new Error(x);};

export function validateQaPreimage(plan, rows){
  assertReviewPlan(plan);
  if(!Array.isArray(rows) || rows.length!==8)die('QA_EXACT_PREIMAGE_REQUIRED');
  const keys=plan.operations.map(x=>x.table+':'+x.id);
  const actual=rows.map(x=>String(x?.table)+':'+String(x?.id));
  if(keys.some((x,i)=>x!==actual[i]) || new Set(actual).size!==8)
    die('QA_PREIMAGE_IDS_MISMATCH');
  for(const r of rows){
    if(!r.original || typeof r.original!=='object' ||
       r.original.id!==r.id || r.original.updated_at!==r.updated_at ||
       !(r.updated_at===null || typeof r.updated_at==='string'))
      die('QA_PREIMAGE_ROW_INVALID');
  }
  return digest(JSON.stringify(rows));
}

export function encryptQaPreimage({plan,rows,key}){
  const plainHash=validateQaPreimage(plan,rows);
  if(!Buffer.isBuffer(key)||key.length!==32)die('QA_AES256_KEY_REQUIRED');
  const iv=randomBytes(12), cipher=createCipheriv('aes-256-gcm',key,iv);
  const ciphertext=Buffer.concat([cipher.update(Buffer.from(JSON.stringify(rows),'utf8')),cipher.final()]);
  return {format:'AES-256-GCM',iv:iv.toString('base64'),
    tag:cipher.getAuthTag().toString('base64'),
    ciphertext:ciphertext.toString('base64'),sha256:digest(ciphertext),
    plaintextSha256:plainHash,rows:8};
}

export function assertQaAuthorization({plan,preimage,context}){
  const preimageDigest=validateQaPreimage(plan,preimage);
  if(!context || context.environment!=='staging' ||
     context.tenantId!==999013 || context.d1Id!==TARGET.db_id ||
     !HEX_40.test(String(context.sha??'')) ||
     !context.approval || context.approval.approved!==true ||
     context.approval.sha!==context.sha ||
     context.approval.dbId!==TARGET.db_id ||
     context.approval.tenantId!==999013 ||
     context.approval.scope!=='FRMS_QA_999013_4_CASES_4_JOURNEYS' ||
     context.approval.planSha256!==plan.sql_sha256 ||
     context.approval.preimageSha256!==preimageDigest ||
     context.approval.authorizedIds?.join('|')!==plan.operations.map(x=>x.id).join('|') ||
     !String(context.approval.reference??'').startsWith('AIRTRUST-STAGING-') ||
     !context.recovery || context.recovery.dbId!==TARGET.db_id ||
     !String(context.recovery.timeTravelBookmark??'').trim() ||
     !context.artifact || context.artifact.encryptedAndStored!==true ||
     !String(context.artifact.restrictedReference??'').trim() ||
     !HEX_64.test(String(context.artifact.sha256??'')))
    die('QA_WRITE_APPROVAL_OR_RECOVERY_REQUIRED');
  // The future approved workflow must verify signature/authority/TTL separately.
  return preimageDigest;
}

const guard=(test,label)=>"SELECT CASE WHEN ("+test+") THEN '"+label+
  "' ELSE "+DENY+" END AS qa_guard";

function finalGuard(){
  const ids=EXPECTED_IDS.map(x=>"'"+x+"'").join(',');
  return guard("(SELECT COUNT(*) FROM frms_alerta a "+
    "JOIN frms_jornada j ON j.id=a.jornada_id AND j.tripulante_id=a.tripulante_id "+
    "JOIN funcionarios f ON f.id=a.tripulante_id AND f.empresa_id=999013 "+
    "WHERE a.id IN ("+ids+") AND a.deleted_at IS NULL AND a.resolvido=0 "+
    "AND j.deleted_at IS NULL AND j.empresa_id=999013 AND j.origem='SIGVOOS' "+
    "AND j.registrado_por='QA_FRMS_UX' AND j.observacao="+
    "'CENARIO SINTETICO - FONTE SIMULADA SEM VALIDADE OPERACIONAL' "+
    "AND a.valor_atual_min=j.duracao_jornada_minutos)=4",'QA_FOUR_VALID');
}

export function buildQaAtomicStatements({plan,preimage,context}){
  assertQaAuthorization({plan,preimage,context});
  const sql=[{sql:guard("(SELECT COUNT(*) FROM funcionarios "+
    "WHERE empresa_id=999013 AND ativo=1 AND deleted_at IS NULL "+
    "AND matricula LIKE 'QA-FRMS-UX-%')=14",'QA_SCOPE_14'),params:[]}];
  for(const [i,op] of plan.operations.entries()){
    sql.push({sql:op.sql.trim()+' AND updated_at IS ?',params:[preimage[i].updated_at]});
    sql.push({sql:guard('changes()=1','QA_ONE_ROW'),params:[]});
  }
  sql.push({sql:finalGuard(),params:[]});
  return sql;
}

/** Prepared for D1Database.batch only. No deploy/HTTP route or workflow apply. */
export async function executeQaAtomicRepair({db,plan,preimage,context}){
  if(typeof db?.prepare!=='function'||typeof db?.batch!=='function')die('QA_D1_BINDING_REQUIRED');
  const steps=buildQaAtomicStatements({plan,preimage,context});
  const prepared=steps.map(s=>{
    const stmt=db.prepare(s.sql);
    return s.params.length ? stmt.bind(...s.params) : stmt;
  });
  await db.batch(prepared);
  return {status:'QA_CASES_REPAIRED',updatedRows:8,dbId:TARGET.db_id,
    tenantId:999013,planSha256:plan.sql_sha256,sha:context.sha};
}


/** Compensating rollback, without D1 Time Travel global restore.
 * Requires independently approved compensation + exact encrypted preimage.
 * The caller must fetch a live postimage before each attempt; drift is fatal.
 * No CLI or route invokes this function. */
export function buildQaCompensationStatements({plan,preimage,postimage,context}){
  assertQaAuthorization({plan,preimage,context});
  if(!context.compensationApproval || context.compensationApproval.approved!==true ||
     context.compensationApproval.sha!==context.sha ||
     context.compensationApproval.planSha256!==plan.sql_sha256 ||
     context.compensationApproval.scope!=='FRMS_QA_999013_SELECTIVE_COMPENSATION')
    die('QA_COMPENSATION_AUTHORIZATION_REQUIRED');
  if(!Array.isArray(postimage) || postimage.length!==8 ||
     postimage.some((r,i)=>r.id!==plan.operations[i].id ||
       r.table!==plan.operations[i].table || !r.original || !Object.hasOwn(r.original,'updated_at')))
    die('QA_COMPENSATION_POSTIMAGE_SCOPE_MISMATCH');
  const statements=[{sql:guard("(SELECT COUNT(*) FROM funcionarios WHERE empresa_id=999013 "+
    "AND matricula LIKE 'QA-FRMS-UX-%' AND deleted_at IS NULL AND ativo=1)=14",'QA_ROLLBACK_SCOPE'),params:[]}];
  for(const [i,op] of plan.operations.entries()){
    const was=preimage[i].original,now=postimage[i].original;
    let sql,params;
    if(op.table==='frms_jornada'){
      if(was.origem!=='MANUAL' || now.origem!=='SIGVOOS' ||
         was.observacao!=='CENARIO SINTETICO - SEM VALIDADE OPERACIONAL' ||
         now.observacao!=='CENARIO SINTETICO - FONTE SIMULADA SEM VALIDADE OPERACIONAL')
        die('QA_COMPENSATION_SOURCE_DRIFT');
      sql="UPDATE frms_jornada SET origem=?,observacao=?,updated_at=? "+
        "WHERE id=? AND empresa_id=999013 AND registrado_por='QA_FRMS_UX' "+
        "AND deleted_at IS NULL AND origem=? AND observacao=? AND updated_at IS ?";
      params=[was.origem,was.observacao,was.updated_at,op.id,
        now.origem,now.observacao,now.updated_at];
    }else if(op.table==='frms_alerta'){
      if(was.jornada_id!==null || now.jornada_id===null ||
         was.tripulante_id===now.tripulante_id ||
         was.resolvido!==0 || now.resolvido!==0)
        die('QA_COMPENSATION_CASE_DRIFT');
      sql="UPDATE frms_alerta SET tripulante_id=?,jornada_id=?,valor_atual_min=?,updated_at=? "+
        "WHERE id=? AND deleted_at IS NULL AND resolvido=0 "+
        "AND tripulante_id=? AND jornada_id=? AND valor_atual_min=? AND updated_at IS ?";
      params=[was.tripulante_id,was.jornada_id,was.valor_atual_min,was.updated_at,op.id,
        now.tripulante_id,now.jornada_id,now.valor_atual_min,now.updated_at];
    }else die('QA_COMPENSATION_TABLE_REJECTED');
    statements.push({sql,params});
    statements.push({sql:guard('changes()=1','QA_ROLLBACK_ONE_ROW'),params:[]});
  }
  return statements;
}

export async function compensateQaAtomicRepair({db,plan,preimage,postimage,context}){
  if(typeof db?.prepare!=='function'||typeof db?.batch!=='function')die('QA_D1_BINDING_REQUIRED');
  const steps=buildQaCompensationStatements({plan,preimage,postimage,context});
  await db.batch(steps.map(s=>{
    const stmt=db.prepare(s.sql);
    return s.params.length?stmt.bind(...s.params):stmt;
  }));
  return {status:'QA_SYNTHETIC_COMPENSATED',updatedRows:8,
    dbId:TARGET.db_id,tenantId:999013,planSha256:plan.sql_sha256,sha:context.sha};
}
