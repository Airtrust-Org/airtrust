// source_reference: AirTrust #1426, reviewed eight-row CAS #1564 and D1 batch #1573.
// operational_decision: require signed staging permission and complete recovery evidence.
// dry_run_required: all writes occur exclusively in an ephemeral SQLite memory database.
// rollback_plan_required: preimage AES-GCM, time-travel bookmark, selective CAS after approval.
import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {createHash,generateKeyPairSync,sign,randomBytes} from 'node:crypto';
import {buildReviewPlan} from '../staging/frms-qa-cases-repair-plan.mjs';
import {prepareQaEvidence,verifyQaApproval,executeApprovedQaStagingRepair}
  from '../staging/frms-qa-repair-controller.mjs';

const days=Array.from({length:30},(_,i)=>({day:new Date(
  Date.parse('2026-09-14T00:00:00Z')+i*86400000).toISOString().slice(0,10),jornadas:'5-9'}));
const plan=buildReviewPlan(days),sha='c'.repeat(40);
const now=new Date('2026-10-17T20:00:00.000Z');
const {privateKey,publicKey}=generateKeyPairSync('ed25519');
const pub=publicKey.export({type:'spki',format:'pem'});
const pin=createHash('sha256').update(publicKey.export({type:'spki',format:'der'})).digest('hex');
const encryptionKey=randomBytes(32);
function setup({dryPostcheck=false,scopeDrift=false,driftBeforeWrite=false}={}){
  const sqlite=new DatabaseSync(':memory:');
  sqlite.exec("CREATE TABLE funcionarios (id INTEGER PRIMARY KEY,empresa_id INTEGER,matricula TEXT,deleted_at TEXT,ativo INTEGER)");
  sqlite.exec("CREATE TABLE frms_jornada (id TEXT PRIMARY KEY,empresa_id INTEGER,tripulante_id INTEGER,data TEXT,deleted_at TEXT,registrado_por TEXT,origem TEXT,observacao TEXT,duracao_jornada_minutos INTEGER,updated_at TEXT)");
  sqlite.exec("CREATE TABLE frms_alerta (id TEXT PRIMARY KEY,tripulante_id INTEGER,jornada_id TEXT,tipo_limite TEXT,nivel TEXT,created_at TEXT,mensagem TEXT,resolvido INTEGER,resolvido_em TEXT,resolvido_por TEXT,visualizado INTEGER,visualizado_em TEXT,visualizado_por TEXT,percentual_atingido REAL,valor_atual_min INTEGER,valor_limite_min INTEGER,notas_resolucao TEXT,updated_at TEXT,deleted_at TEXT)");
  const f=sqlite.prepare("INSERT INTO funcionarios VALUES(?,?,?,NULL,1)");
  for(let n=1;n<=14;n++)f.run(n,999013,'QA-FRMS-UX-'+String(n).padStart(2,'0'));
  f.run(100,6,'QA-FRMS-UX-01');
  const j=sqlite.prepare("INSERT INTO frms_jornada VALUES(?,999013,?,?,NULL,'QA_FRMS_UX','MANUAL','CENARIO SINTETICO - SEM VALIDADE OPERACIONAL',540,'old')");
  for(const op of plan.operations.filter(x=>x.table==='frms_jornada')){
    const [,day,n]=op.id.match(/(2026-\d\d-\d\d)-QA-FRMS-UX-(\d\d)$/);
    j.run(op.id,Number(n),day);
  }
  const a=sqlite.prepare("INSERT INTO frms_alerta VALUES(?,?,NULL,?,?,?,'QA SINTETICO: revisar contexto e registrar providencia',0,NULL,NULL,0,NULL,NULL,112,620,540,NULL,'old',NULL)");
  const oldOwners=[7,5,4,14],oldDates=['2026-10-13','2026-10-12','2026-10-10','2026-10-09'];
  const types=['REPOUSO','FDP_DIARIO','HV_7D','REPOUSO'];
  const levels=['CRITICO','ATENCAO','AVISO','CRITICO'];
  for(let i=0;i<4;i++)a.run('qa-frms-ux-case-'+(i+1),oldOwners[i],types[i],levels[i],oldDates[i]+' 10:00:00');
  const events=[],used=new Set(),data=new Map();
  let batches=0,readCount=0,held=false;
  const binding={
    prepare(sql){return {sql,params:[],bind(...params){this.params=params;return this;}};},
    async batch(stmts){
      batches++;
      sqlite.exec('BEGIN IMMEDIATE');
      try{
        for(const stmt of stmts){
          const compiled=sqlite.prepare(stmt.sql);
          if(stmt.sql.trim().startsWith('UPDATE'))compiled.run(...stmt.params);
          else compiled.all(...stmt.params);
        }
        sqlite.exec('COMMIT');
      }catch(e){sqlite.exec('ROLLBACK');throw e;}
      return [];
    },
  };
  const adapters={
    async acquireLock(name){assert.equal(name,'airtrust-staging-mutations-and-scorm-qa');
      if(held)return {held:false};held=true;return {held:true};},
    async releaseLock(){held=false;},
    async readScope(){
      readCount++;
      const rows=plan.operations.map(op=>{
        const original=sqlite.prepare('SELECT * FROM '+op.table+' WHERE id=?').get(op.id);
        return {table:op.table,id:op.id,updated_at:original.updated_at,original};
      });
      if(scopeDrift&&readCount>1)rows[0].original.observacao='DRIFT';
      return {tenantId:999013,dbId:'bf9963f4-eb12-439b-a830-20bbf577ac22',
        crewCount:14,usersFingerprint:'a'.repeat(64),
        untouchedFingerprint:'b'.repeat(64),rows};
    },
    async captureTimeTravel(){return {dbId:'bf9963f4-eb12-439b-a830-20bbf577ac22',
      bookmark:'mock-bookmark',capturedAt:'2026-10-17T20:00:00.000Z'};},
    async storeProtected(encrypted){
      data.set('secure/artifact',encrypted);
      return {restricted:true,reference:'secure/artifact',sha256:encrypted.sha256,
        expiresAt:'2026-10-18T00:00:00.000Z'};
    },
    async readProtected(ref){return data.get(ref);},
    async audit(event){events.push(event);},
    async reserveNonce({nonce}){if(used.has(nonce))return false;used.add(nonce);return true;},
    async getDb(){if(driftBeforeWrite)sqlite.prepare('UPDATE frms_jornada SET origem=? WHERE id=?')
      .run('NOT_QA',plan.operations[2].id);return binding;},
    async postcheck(){return {tenantId:999013,dbId:'bf9963f4-eb12-439b-a830-20bbf577ac22',
      crewCount:14,usersFingerprint:'a'.repeat(64),untouchedFingerprint:'b'.repeat(64),
      valid:dryPostcheck?0:sqlite.prepare("SELECT COUNT(*) n FROM frms_alerta WHERE jornada_id IS NOT NULL").get().n};},
  };
  return {sqlite,events,adapters,get batchCount(){return batches;}};
}
function signed(receipt,overrides={}){
  const manifest={authority:'AIRTRUST_RELEASE_COORDINATION',coordinationIssue:776,
    scope:'FRMS_QA_999013_4_CASES_4_JOURNEYS',sha,environment:'staging',
    dbId:'bf9963f4-eb12-439b-a830-20bbf577ac22',tenantId:999013,
    planSha256:plan.sql_sha256,authorizedIds:plan.operations.map(x=>x.id),
    preimageSha256:receipt.preimageSha256,artifactSha256:receipt.artifactSha256,
    recoveryBookmark:receipt.recoveryBookmark,
    nonce:'e'.repeat(64),issuedAt:'2026-10-17T19:55:00.000Z',
    expiresAt:'2026-10-17T20:05:00.000Z',...overrides};
  return {manifest,signatureBase64:sign(null,Buffer.from(JSON.stringify(manifest)),
    privateKey).toString('base64'),publicKeyPem:pub,trustedPublicKeySha256:pin};
}
const command=(receipt,adapters,x={})=>({
  plan,receipt,sha,now,adapters,key:encryptionKey,...signed(receipt,x),
});
test('read-only evidence captures exact eight QA preimages under staging lock',async()=>{
  const st=setup();
  const receipt=await prepareQaEvidence({plan,adapters:st.adapters,key:encryptionKey,now});
  assert.equal(receipt.writes,0);
  assert.equal(receipt.authorizedIds.length,8);
  assert.equal(st.batchCount,0);
  assert.equal(st.events[0].event,'FRMS_QA_PREPARED_READONLY');
  st.sqlite.close();
});
test('cryptographic trust anchor rejects forged, changed, expired and mismatched approvals',async()=>{
  const st=setup(),receipt=await prepareQaEvidence({plan,adapters:st.adapters,key:encryptionKey,now});
  const good=signed(receipt);
  assert.equal(verifyQaApproval({...good,receipt,plan,sha,now}),true);
  const tampered={...good,manifest:{...good.manifest,tenantId:6}};
  assert.throws(()=>verifyQaApproval({...tampered,receipt,plan,sha,now}),/SIGNATURE_INVALID/);
  assert.throws(()=>verifyQaApproval({...good,trustedPublicKeySha256:'f'.repeat(64),
    receipt,plan,sha,now}),/UNTRUSTED_APPROVAL_KEY/);
  const expired=signed(receipt,{expiresAt:'2026-10-17T19:57:00.000Z'});
  assert.throws(()=>verifyQaApproval({...expired,receipt,plan,sha,now}),/SCOPE_OR_TTL/);
  const wrong=signed(receipt,{sha:'d'.repeat(40)});
  assert.throws(()=>verifyQaApproval({...wrong,receipt,plan,sha,now}),/SCOPE_OR_TTL/);
  assert.equal(st.batchCount,0);
  st.sqlite.close();
});
test('under signed grant, stage-only binding executes eight rows once and validates four cases',async()=>{
  const st=setup(),receipt=await prepareQaEvidence({plan,adapters:st.adapters,key:encryptionKey,now});
  const args=command(receipt,st.adapters);
  const result=await executeApprovedQaStagingRepair(args);
  assert.equal(result.valid,4);
  assert.equal(st.batchCount,1);
  assert.equal(st.events.at(-1).event,'FRMS_QA_REPAIR_VALIDATED');
  await assert.rejects(()=>executeApprovedQaStagingRepair(args),/PREIMAGE_DRIFT_SINCE_REVIEW/);
  assert.equal(st.batchCount,1);
  st.sqlite.close();
});
test('read drift after approval blocks mutation before touching D1',async()=>{
  const st=setup({scopeDrift:true});
  const receipt=await prepareQaEvidence({plan,adapters:st.adapters,key:encryptionKey,now});
  await assert.rejects(()=>executeApprovedQaStagingRepair(command(receipt,st.adapters)),
    /PREIMAGE_DRIFT_SINCE_REVIEW/);
  assert.equal(st.batchCount,0);
  st.sqlite.close();
});
test('mid-transaction CAS drift makes entire staged batch roll back',async()=>{
  const st=setup({driftBeforeWrite:true});
  const receipt=await prepareQaEvidence({plan,adapters:st.adapters,key:encryptionKey,now});
  await assert.rejects(()=>executeApprovedQaStagingRepair(command(receipt,st.adapters)),
    /malformed JSON/);
  assert.equal(st.sqlite.prepare("SELECT COUNT(*) n FROM frms_jornada WHERE origem='SIGVOOS'").get().n,0);
  assert.equal(st.sqlite.prepare("SELECT COUNT(*) n FROM frms_alerta WHERE jornada_id IS NOT NULL").get().n,0);
  st.sqlite.close();
});
test('postcheck failure never pretends batch was rolled back or approved',async()=>{
  const st=setup({dryPostcheck:true});
  const receipt=await prepareQaEvidence({plan,adapters:st.adapters,key:encryptionKey,now});
  await assert.rejects(()=>executeApprovedQaStagingRepair(command(receipt,st.adapters)),
    /POSTCONDITION_FAILED_RECOVERY_REQUIRED/);
  assert.equal(st.batchCount,1);
  assert.equal(st.events.at(-1).event,'FRMS_QA_POSTCHECK_FAILED_REQUIRES_COMPENSATION');
  st.sqlite.close();
});
test('reused nonce is rejected by persistent-reservation adapter before batch',async()=>{
  const st=setup(),receipt=await prepareQaEvidence({plan,adapters:st.adapters,key:encryptionKey,now});
  const signedCommand=command(receipt,st.adapters);
  await st.adapters.reserveNonce({nonce:signedCommand.manifest.nonce});
  await assert.rejects(()=>executeApprovedQaStagingRepair(signedCommand),/REPLAY_OR_LEDGER_REJECTED/);
  assert.equal(st.batchCount,0);
  st.sqlite.close();
});
test('missing protected storage, bookmark, or approval cannot be bypassed',async()=>{
  const st=setup();
  const orig=st.adapters.storeProtected;
  st.adapters.storeProtected=async()=>({restricted:false,reference:'public',sha256:'f'.repeat(64)});
  await assert.rejects(()=>prepareQaEvidence({plan,adapters:st.adapters,key:encryptionKey,now}),
    /PROTECTED_ARTIFACT_REQUIRED/);
  st.adapters.storeProtected=orig;
  const receipt=await prepareQaEvidence({plan,adapters:st.adapters,key:encryptionKey,now});
  const cmd=command(receipt,st.adapters);
  await assert.rejects(()=>executeApprovedQaStagingRepair({...cmd,signatureBase64:''}),
    /TRUST_ANCHOR_REQUIRED/);
  assert.equal(st.batchCount,0);
  st.sqlite.close();
});
