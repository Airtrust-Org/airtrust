// source_reference: #1426/#776; entirely synthetic local Miniflare D1/R2/DO.
// operational_decision: never contacts Cloudflare or uses remote credentials.
// dry_run_required: ephemeral databases only; no deployment.
// rollback_plan_required: actual D1.batch failure must restore all earlier writes.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash, generateKeyPairSync, sign, randomBytes } from 'node:crypto';
import { build } from 'esbuild';
import { Miniflare } from 'miniflare';
import { DatabaseSync } from 'node:sqlite';
import { buildReviewPlan } from '../staging/frms-qa-cases-repair-plan.mjs';
import { expectedQaCases } from '../staging/inspect-frms-ux-cases.mjs';
import { d1ScopeAdapter, timeTravelReader } from '../../ops/frms-qa-repair/adapters.mjs';
import { prepareQaEvidence } from '../staging/frms-qa-repair-controller.mjs';

const days = Array.from({length:30},(_,i)=>({day:new Date(Date.parse('2026-09-14T00:00:00Z')+i*86400000).toISOString().slice(0,10),jornadas:i===29?'0':'5-9'}));
const plan = buildReviewPlan(days), sha = 'c'.repeat(40);
const {privateKey,publicKey} = generateKeyPairSync('ed25519');
const pub = publicKey.export({type:'spki',format:'pem'});
const hash = value => createHash('sha256').update(value).digest('hex');
const pin = hash(publicKey.export({type:'spki',format:'der'}));
const bundle = await build({entryPoints:['ops/frms-qa-repair/worker.mjs'],bundle:true,format:'esm',platform:'node',external:['cloudflare:workers'],write:false});

// Synthetic fixture mirrors the reviewed legacy baseline; never a production dump.
function fixture() {
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
  const tables = sqlite.prepare("SELECT name,sql FROM sqlite_master WHERE type='table' ORDER BY name").all();
  const sql = [];
  for (const table of tables) {
    sql.push(table.sql);
    for (const row of sqlite.prepare('SELECT * FROM '+table.name).all()) {
      sql.push('INSERT INTO '+table.name+' VALUES('+Object.values(row).map(v=>v===null?'NULL':typeof v==='number'?v:"'"+v.replaceAll("'","''")+"'").join(',')+')');
    }
  }
  sqlite.close();
  sql.push('CREATE TABLE usuarios(id INTEGER PRIMARY KEY,active INTEGER)',
    'CREATE TABLE usuarios_empresas(usuario_id INTEGER,empresa_id INTEGER,role TEXT)',
    'CREATE TABLE usuarios_empresas_perfis(usuario_id INTEGER,empresa_id INTEGER,perfil TEXT)',
    'INSERT INTO usuarios VALUES(1,1)',"INSERT INTO usuarios_empresas VALUES(1,999013,'GESTOR')",
    "INSERT INTO usuarios_empresas_perfis VALUES(1,999013,'GESTOR')");
  return sql;
}
async function setup(t, extra = {}) {
  let recoveryCalls = 0;
  const mf = new Miniflare({cf:false,workers:[{
    name:'caller',compatibilityDate:'2026-03-17',modules:true,script:`export default {async fetch(req,env) {try {const {op,input}=await req.json(); const result=await env.REPAIR[op](input); return Response.json(result);}catch(e){return Response.json({error:e.message},{status:409});}}}`,
    serviceBindings:{REPAIR:'repair'},
  },{
    name:'repair',modules:true,script:bundle.outputFiles[0].text,
    compatibilityDate:'2026-03-17',compatibilityFlags:['nodejs_compat'],
    d1Databases:['DB'],r2Buckets:['PREIMAGES'],
    durableObjects:{COORDINATOR:{className:'FrmsQaCoordinator',useSQLite:true}},
    bindings:{ENVIRONMENT:'staging',D1_ID:plan.target.db_id,RELEASE_SHA:sha,
      APPROVAL_KEY_SHA256:pin,PREIMAGE_KEY_HEX:randomBytes(32).toString('hex'),
      APPROVAL_PUBLIC_KEY_PEM:pub,PRIVATE_STORAGE_VERIFIED:'restricted-r2-lifecycle-1d',
      CLOUDFLARE_ACCOUNT_ID:'a'.repeat(32),D1_READ_TOKEN:'local-test-only',...extra},
    outboundService:async request=>{
      assert.equal(request.method,'GET');
      assert.equal(new URL(request.url).pathname,`/client/v4/accounts/${'a'.repeat(32)}/d1/database/${plan.target.db_id}/time_travel/bookmark`);
      recoveryCalls++;
      return Response.json({success:true,result:{bookmark:'local-simulated-recovery-'+recoveryCalls}});
    },
  }]});
  t.after(()=>mf.dispose());
  await mf.ready;
  const db = await mf.getD1Database('DB','repair');
  await db.batch(fixture().map(sql=>db.prepare(sql)));
  const call = async (op,input) => (await mf.dispatchFetch('https://local.invalid',{method:'POST',body:JSON.stringify({op,input})})).json();
  return {mf,db,call,get recoveryCalls(){return recoveryCalls;}};
}
function grant(prepared, overrides={}) {
  const receipt = prepared.receipt;
  const manifest={authority:'AIRTRUST_RELEASE_COORDINATION',coordinationIssue:776,
    scope:'FRMS_QA_999013_4_CASES_4_JOURNEYS',sha,environment:'staging',dbId:plan.target.db_id,
    tenantId:999013,planSha256:plan.sql_sha256,authorizedIds:plan.operations.map(x=>x.id),
    receiptSha256:prepared.receiptId,preimageSha256:receipt.preimageSha256,
    artifactSha256:receipt.artifactSha256,recoveryBookmark:receipt.recoveryBookmark,
    nonce:randomBytes(32).toString('hex'),issuedAt:new Date(Date.now()-1000).toISOString(),
    expiresAt:new Date(Date.now()+600000).toISOString(),...overrides};
  return {receiptId:prepared.receiptId,manifest,signatureBase64:sign(null,Buffer.from(JSON.stringify(manifest)),privateKey).toString('base64')};
}
async function rows(db) {return (await db.prepare('SELECT * FROM frms_jornada ORDER BY id').all()).results;}

test('private RPC prepares encrypted R2 evidence, applies actual D1 batch and verifies 4/4',async t=>{
  const s=await setup(t), before=await rows(s.db);
  const p=await s.call('prepare');
  assert.ok(p.receipt,p.error);
  assert.equal(p.receipt.writes,0);
  assert.deepEqual(await rows(s.db),before);
  const bucket=await s.mf.getR2Bucket('PREIMAGES','repair');
  const stored=await (await bucket.get(p.receipt.artifactReference)).text();
  assert.ok(!stored.includes('tripulante_id'));
  assert.ok(!stored.includes('QA-FRMS-UX-01'));
  assert.equal((await s.call('apply',grant(p))).valid,4);
  assert.equal(s.recoveryCalls,2);
  const adapter=d1ScopeAdapter({db:s.db,plan,expected:expectedQaCases(days)});
  assert.equal((await adapter.postcheck({tenantId:999013,ids:plan.operations.map(x=>x.id)})).valid,4);
  const external=await s.db.prepare('SELECT empresa_id FROM funcionarios WHERE id=100').first();
  assert.equal(external.empresa_id,6);
});

test('signed wrong tenant, SHA, expired grant and forged signature cause zero writes',async t=>{
  const s=await setup(t),p=await s.call('prepare'),before=await rows(s.db);
  assert.ok(p.receipt,p.error);
  for(const changes of [{tenantId:6},{sha:'d'.repeat(40)},{expiresAt:new Date(Date.now()-5000).toISOString()}]) {
    assert.match((await s.call('apply',grant(p,changes))).error,/QA_APPROVAL_SCOPE_OR_TTL_REJECTED/);
  }
  const forged=grant(p);forged.manifest.tenantId=6;
  assert.match((await s.call('apply',forged)).error,/QA_APPROVAL_SIGNATURE_INVALID/);
  assert.deepEqual(await rows(s.db),before);
});

test('cross-tenant preimage cannot be prepared and RPC cannot choose another database',async t=>{
  const s=await setup(t);
  await s.db.prepare('UPDATE frms_alerta SET tripulante_id=100 WHERE id=?').bind('qa-frms-ux-case-1').run();
  assert.match((await s.call('prepare')).error,/QA_PREIMAGE_TENANT_OR_ID_REJECTED/);
  const adapter=d1ScopeAdapter({db:s.db,plan,expected:expectedQaCases(days)});
  await assert.rejects(adapter.readScope({tenantId:6,ids:plan.operations.map(x=>x.id)}),/QA_ADAPTER_SCOPE_REJECTED/);
  await assert.rejects(adapter.getDb('production'),/QA_DATABASE_REJECTED/);
});

test('concurrent apply and replay cannot apply the same grant twice',async t=>{
  const s=await setup(t),p=await s.call('prepare');assert.ok(p.receipt,p.error);
  const input=grant(p), results=await Promise.all([s.call('apply',input),s.call('apply',input)]);
  assert.equal(results.filter(r=>r.valid===4).length,1);
  assert.equal(results.filter(r=>r.error).length,1);
  assert.ok((await s.call('apply',input)).error);
});

test('late D1 failure rolls back and quarantines the repair lock',async t=>{
  const s=await setup(t),p=await s.call('prepare');assert.ok(p.receipt,p.error);
  const before=await rows(s.db),input=grant(p);
  await s.db.prepare("CREATE TRIGGER synthetic_abort BEFORE UPDATE ON frms_alerta WHEN NEW.id='qa-frms-ux-case-4' BEGIN SELECT RAISE(ABORT,'local test fault'); END").run();
  assert.match((await s.call('apply',input)).error,/QA_PRIVATE_EXECUTION_FAILED/);
  assert.deepEqual(await rows(s.db),before);
  await s.db.prepare('DROP TRIGGER synthetic_abort').run();
  // After a failed/indeterminate write, do not permit any grant or new
  // preimage preparation until a separately authorized reconciliation.
  assert.match((await s.call('apply',input)).error,/QA_EXCLUSIVE_LOCK_REQUIRED/);
  assert.match((await s.call('prepare')).error,/QA_EXCLUSIVE_LOCK_REQUIRED/);
});

test('plan SQL tampering is rejected despite a copied approved digest',async()=>{
  const mutated=structuredClone(plan);mutated.operations[0].sql=mutated.operations[0].sql.replace('empresa_id=999013','empresa_id=6');
  await assert.rejects(prepareQaEvidence({plan:mutated,adapters:{},key:randomBytes(32)}),/QA_REVIEW_DIGEST_MISMATCH/);
});

test('Time Travel fails closed on bad API response and rejects other DB IDs',async()=>{
  const read=timeTravelReader({accountId:'a'.repeat(32),token:'local-only',fetcher:async()=>Response.json({success:false})});
  await assert.rejects(read(plan.target.db_id),/QA_TIME_TRAVEL_UNAVAILABLE/);
  await assert.rejects(read('production'),/QA_RECOVERY_DATABASE_REJECTED/);
});


test('R2 corruption, expiration and identity drift reject apply without writes',async t=>{
  const s=await setup(t),p=await s.call('prepare'),before=await rows(s.db);
  assert.ok(p.receipt,p.error);
  const bucket=await s.mf.getR2Bucket('PREIMAGES','repair'),ref=p.receipt.artifactReference;
  const original=await (await bucket.get(ref)).json();
  await bucket.put(ref,JSON.stringify({...original,expiresAt:'2000-01-01T00:00:00Z'}));
  assert.match((await s.call('apply',grant(p))).error,/QA_ARTIFACT_EXPIRED/);
  await bucket.put(ref,JSON.stringify({...original,encrypted:{...original.encrypted,ciphertext:'AAAA'}}));
  assert.match((await s.call('apply',grant(p))).error,/QA_ENCRYPTED_PREIMAGE_INTEGRITY_FAILURE/);
  await bucket.put(ref,JSON.stringify(original));
  await s.db.prepare("UPDATE usuarios_empresas SET role='ALUNO' WHERE empresa_id=999013").run();
  assert.match((await s.call('apply',grant(p))).error,/QA_QA_IDENTITY_CHANGED/);
  assert.deepEqual(await rows(s.db),before);
});

test('deployment without approved staging bindings is closed; HTTP never applies',async t=>{
  const s=await setup(t,{ENVIRONMENT:'production'});
  assert.match((await s.call('prepare')).error,/QA_DEPLOYMENT_NOT_READY/);
  const worker=await s.mf.getWorker('repair');
  assert.equal((await worker.fetch('https://local.invalid/apply',{method:'POST'})).status,404);
});
