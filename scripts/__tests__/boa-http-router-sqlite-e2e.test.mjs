/**
 * Hono HTTP request/response over actual BOA SQL in ephemeral SQLite.
 * source_reference: docs/frms/BOA_CBMMG_AUDITORIA_FUNCIONAL_CIENTIFICA_CADEIA_DADOS_20261021.md
 * operational_decision: check the full API using both simulated upstream
 * context and real signed access JWT + auth() + tenantMiddleware(),
 * live employee-sector grant lookup and report crew scope with revocation checks.
 * Regulatory assignment and parameters resolve against real SQLite governance;\n * all QA approval references and values are synthetic, never scientific approval.
 * dry_run_required: fictitious local identities only; ALL SQL writes to :memory:.
 * rollback_plan_required: sqlite.close() destroys every inserted event.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import Module from 'node:module';

const require=createRequire(import.meta.url);
const esbuild=require('esbuild');
const root=fileURLToPath(new URL('../..',import.meta.url));
const output=(await esbuild.build({
 stdin:{
  contents:[
   "import router from './routes/frms-bombeiros';",
   "import {auth} from './middleware/auth';",
   "import {tenantMiddleware} from './middleware/tenant';",
   "import {generateJWT} from './utils/security';",
   "import {LIMITES_DEFAULT} from './lib/frms/types';",
   "export {router,auth,tenantMiddleware,generateJWT,LIMITES_DEFAULT};",
  ].join(String.fromCharCode(10)),
  resolveDir:join(root,'worker-airtrust/src'),
  sourcefile:'boa-jwt-integration-entry.ts',loader:'ts',
 },
 bundle:true,platform:'node',format:'cjs',write:false,
})).outputFiles[0].text;
const filename='/tmp/airtrust-boa-hono-real-sqlite-qa.cjs';
const mod=new Module(filename);
mod.filename=filename;mod.paths=Module._nodeModulePaths(dirname(filename));
mod._compile(output,filename);
const {router,auth,tenantMiddleware,generateJWT,LIMITES_DEFAULT}=mod.exports;
// This standalone router is mounted without the app's production error handler.
// Reproduce the HTTP error translation without changing route authorization.
router.onError(error=>new Response(JSON.stringify({success:false,code:error.code??'QA_ROUTE_ERROR'}),{
 status:error.statusCode??error.status??500,
 headers:{'Content-Type':'application/json'},
}));
const {Hono}=require('hono');
function fixture(){
 const sqlite=new DatabaseSync(':memory:');
 sqlite.exec([
  'CREATE TABLE funcionarios(id INTEGER PRIMARY KEY,empresa_id INTEGER,setor_id INTEGER,ativo INTEGER,deleted_at TEXT,status TEXT,cargo TEXT,funcao TEXT)',
  'CREATE TABLE usuarios(id INTEGER PRIMARY KEY,funcionario_id INTEGER,deleted_at TEXT,perfil TEXT,ativo INTEGER)',
  'CREATE TABLE empresas(id INTEGER PRIMARY KEY,codigo TEXT,nome TEXT,plano TEXT,ativo INTEGER,deleted_at TEXT)',
  'CREATE TABLE token_blocklist(jti TEXT,expires_at TEXT)',
  'CREATE TABLE usuarios_empresas(usuario_id INTEGER,empresa_id INTEGER,role TEXT)',
  'CREATE TABLE setores(id INTEGER,empresa_id INTEGER,ativo INTEGER,deleted_at TEXT)',
  'CREATE TABLE setores_gestores(id INTEGER PRIMARY KEY,setor_id INTEGER,usuario_id INTEGER,empresa_id INTEGER,role TEXT,ativo INTEGER,deleted_at TEXT)',
  'CREATE TABLE frms_fadiga_evento(id TEXT PRIMARY KEY,empresa_id INTEGER,checkin_id TEXT,tipo TEXT,payload_json TEXT,created_at TEXT)',
  'CREATE TABLE frms_regulatory_profiles(id TEXT PRIMARY KEY,empresa_id INTEGER,profile_code TEXT,service_category TEXT,approval_reference TEXT,policy_version TEXT,limits_json TEXT,source_document_hash TEXT,active INTEGER,deleted_at TEXT,effective_from TEXT,effective_to TEXT)',
  'CREATE TABLE frms_profile_assignments(id TEXT PRIMARY KEY,empresa_id INTEGER,regulatory_profile_id TEXT,profile_code TEXT,status TEXT,effective_from TEXT,effective_to TEXT)',
  'CREATE TABLE frms_config_revisions(id TEXT PRIMARY KEY,empresa_id INTEGER,profile_code TEXT,revision_number INTEGER,status TEXT,source_type TEXT,source_reference TEXT,regulatory_profile_id TEXT,policy_version TEXT,effective_from TEXT,effective_to TEXT,actor_user_id TEXT,reason TEXT,supersedes_revision_id TEXT,created_at TEXT)',
  'CREATE TABLE frms_config_parameters(id TEXT PRIMARY KEY,revision_id TEXT,parameter_key TEXT,numeric_value REAL,json_value TEXT,unit TEXT,metric TEXT,window_kind TEXT,direction TEXT,required INTEGER,created_at TEXT)',
  "INSERT INTO setores VALUES(9,130,1,NULL),(10,130,1,NULL),(109,6,1,NULL)",
  "INSERT INTO funcionarios VALUES(21,130,9,1,NULL,'ATIVO','PILOTO','Piloto'),(22,130,9,1,NULL,'ATIVO','PILOTO','Piloto'),(23,130,9,1,NULL,'ATIVO','PILOTO','Piloto'),(24,130,9,1,NULL,'ATIVO','PILOTO','Piloto'),(25,130,9,1,NULL,'ATIVO','PILOTO','Piloto'),(26,130,9,1,NULL,'ATIVO','PILOTO','Piloto'),(70,6,109,1,NULL,'ATIVO','Tripulante','Outro')",
  "INSERT INTO usuarios VALUES(101,21,NULL,'student',1),(102,22,NULL,'student',1),(103,23,NULL,'student',1),(104,24,NULL,'student',1),(105,25,NULL,'student',1),(106,26,NULL,'student',1),(190,NULL,NULL,'manager',1),(191,NULL,NULL,'manager',1),(200,NULL,NULL,'admin',1),(600,70,NULL,'student',1)",
  "INSERT INTO empresas VALUES(130,'bombeiros','BOA QA','qa',1,NULL),(6,'costadosol','Costa do Sol','qa',1,NULL)",
  "INSERT INTO usuarios_empresas VALUES(101,130,'student'),(102,130,'student'),(103,130,'student'),(104,130,'student'),(105,130,'student'),(106,130,'student'),(190,130,'manager'),(191,130,'manager'),(200,130,'admin'),(600,6,'student')",
  "INSERT INTO setores_gestores VALUES(1,9,190,130,'manager',1,NULL),(2,10,191,130,'manager',1,NULL)"
 ].join(';')+';');
 // Fictional QA only: the mock operator review bindings exercise guards
 // but ARE NOT a real scientific review, document or legal authorization.
 sqlite.prepare(
  'INSERT INTO frms_regulatory_profiles VALUES (?,?,?,?,?,?,?,?,?,?,?,?)'
 ).run('qa-profile-130',130,'FIREFIGHTER_AVIATION','QA_FIREFIGHTER_TEST',
  'QA-FICTIONAL-APPROVAL','QA_POLICY_NOT_APPROVED','{}','a'.repeat(64),1,null,'2020-01-01',null);
 sqlite.prepare(
  'INSERT INTO frms_profile_assignments VALUES (?,?,?,?,?,?,?)'
 ).run('qa-assignment-130',130,'qa-profile-130','FIREFIGHTER_AVIATION',
  'ACTIVE','2020-01-01',null);
 sqlite.prepare(
  'INSERT INTO frms_config_revisions VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)'
 ).run('qa-revision-130',130,'FIREFIGHTER_AVIATION',1,'ACTIVE',
  'APPROVED_OPERATIONAL_POLICY','qa-fictional-approval-source','qa-profile-130',
  'QA_POLICY_NOT_APPROVED','2020-01-01',null,null,
  'Fixture only; no independent scientific review',null,'2020-01-01');
 const addParameter=sqlite.prepare(
  'INSERT INTO frms_config_parameters VALUES (?,?,?,?,?,?,?,?,?,?,?)'
 );
 for(const [key,value] of Object.entries(LIMITES_DEFAULT)){
  assert.ok(Number.isFinite(value),'QA numeric fixture key '+key);
  addParameter.run('qa-param-'+key,'qa-revision-130',key,value,null,
   'QA_UNIT',null,null,null,1,'2020-01-01');
 }
 const d1={
  prepare(sql){const statement=sqlite.prepare(sql);let vals=[];
   return{bind(...values){vals=values;return this;},
    async first(){return statement.get(...vals)??null;},
    async all(){return {results:statement.all(...vals)};},
    async run(){const x=statement.run(...vals);return {meta:{changes:Number(x.changes)}};},
   };
  },
  async batch(stmts){sqlite.exec('BEGIN');try{
   const result=[];for(const s of stmts)result.push(await s.run());
   sqlite.exec('COMMIT');return result;
  }catch(e){sqlite.exec('ROLLBACK');throw e;}},
 };
 const execution={waitUntil(){},passThroughOnException(){},props:{}};
 const jwtSecret='BOA_LOCAL_TEST_ONLY_NOT_STAGING_SECRET_20261022';
 const realJwt=(user,role='student',tenant=130)=>generateJWT({
   sub:user,email:'qa-only@example.invalid',role,empresa_id:tenant,token_type:'access',
  },jwtSecret,600).then(x=>x.token);
 const actualAuth=(environment='staging',gate='130')=>{
  const app=new Hono();
  app.use('*',async(c,next)=>{
   c.env={DB:d1,ENVIRONMENT:environment,JWT_SECRET:jwtSecret,
    ENABLE_DEV_AUTH_BYPASS:'false',
    BOA_FRMS_QA_SENSITIVE_WRITES_TENANT_ID:gate,
    BOA_FRMS_QA_REVIEWED_DOCUMENT_SHA256:'a'.repeat(64),
    BOA_FRMS_QA_REVIEWED_REVISION_ID:'qa-revision-130'};
   return auth()(c,async()=>tenantMiddleware()(c,next));
  });
  app.onError(error=>new Response(JSON.stringify({success:false,
    code:error.code??'QA_AUTH_ROUTE_ERROR'}),{
     status:error.statusCode??error.status??500,
     headers:{'Content-Type':'application/json'},
  }));
  app.route('/api/bombeiros/frms',router);
  return(token,method,path,body)=>app.fetch(new Request(
   'http://localhost/api/bombeiros/frms'+path,{
    method,headers:{...(token?{Authorization:'Bearer '+token}:{}),
     ...(body?{'Content-Type':'application/json'}:{})},
    ...(body?{body:JSON.stringify(body)}:{}),
   }),{},execution);
 };
 const as=(user,role,tenant=130,environment='staging',gate='130')=>{
  const app=new Hono();
  app.use('*',async(c,next)=>{
   c.env={DB:d1,ENVIRONMENT:environment,BOA_FRMS_QA_SENSITIVE_WRITES_TENANT_ID:gate,
    BOA_FRMS_QA_REVIEWED_DOCUMENT_SHA256:'a'.repeat(64),
    BOA_FRMS_QA_REVIEWED_REVISION_ID:'qa-revision-130'};
   c.set('userId',user);c.set('userRole',role);c.set('empresaId',tenant);
   c.set('tenantContext',{empresaId:tenant,
    empresaCodigo:tenant===130?'bombeiros':'costadosol',
    empresaNome:'BOA QA',role,plano:'qa',permissions:[]});
   await next();
  });
  app.onError(error=>new Response(JSON.stringify({success:false,code:'QA_ROUTE_ERROR'}),{status:error.statusCode??error.status??500}));
  app.route('/api/bombeiros/frms',router);
  return(method,path,body)=>app.fetch(new Request('http://localhost/api/bombeiros/frms'+path,{
   method,headers:body?{'Content-Type':'application/json'}:{},
   ...(body?{body:JSON.stringify(body)}:{}),
  }),{},execution);
 };
 return{sqlite,as,realJwt,actualAuth,count:()=>sqlite.prepare('SELECT COUNT(*) n FROM frms_fadiga_evento').get().n};
}
const checkin={
 mission_type:'RESGATE',duty_period:'NOTURNO',
 standby_activation:true,critical_mission:true,
 sleep_hours_24h:4.5,sleep_fragmented:true,
 kss_reported:8,pvt_60s_completed:null,self_declared_unfit:false,
 acknowledge_confidentiality:true,
};
const treatment={
 responsavel:'Gestor QA fictício',prazo:'2026-10-31',
 acao_mitigacao:'Reorganizar escala com revisão humana.',
 justificativa:'Autorrelato não equivale à medição de fadiga.',
};
const efficacy={avaliacao_eficacia:'Revisão fictícia e documentada, eficácia não cientificamente validada.'};
test('simulated BOA actor hits real Hono checkin, events, case and report with SQLite',async()=>{
 const{sqlite,as,count}=fixture();
 try{
  const crew=as(101,'student'),manager=as(190,'manager'),admin=as(200,'admin');
  assert.equal((await as(600,'student',6)('POST','/checkin',checkin)).status,403);
  assert.equal((await as(101,'student',130,'staging','')('POST','/checkin',checkin)).status,503);
  assert.equal((await as(101,'student',130,'production')('POST','/checkin',checkin)).status,404);
  assert.equal(count(),0);
  const receipts=[];
  for(let user=101;user<=106;user++){
   const response=await as(user,'student')('POST','/checkin',checkin);
   assert.equal(response.status,201,'checkin '+user+': '+await response.clone().text());
   const payload=await response.json();
   assert.equal(payload.data.dispatch_permission,'NOT_GRANTED');
   assert.equal(payload.meta.clinical_validation,'NOT_ESTABLISHED');
   receipts.push(payload.data);
  }
  assert.equal(count(),12);
  const status=await crew('GET','/checkin/status');
  assert.equal(status.status,200);
  assert.equal((await status.json()).data.case_id,receipts[0].case_id);
  assert.equal((await crew('POST','/checkin',checkin)).status,409);
  assert.equal(count(),12);
  const queue=await manager('GET','/casos?limit=50');
  assert.equal(queue.status,200);
  const items=(await queue.json()).data.items;
  assert.equal(items.length,6);
  assert.doesNotMatch(JSON.stringify(items),/sleep_hours_24h|kss_reported|funcionario_id/);
  const id=encodeURIComponent(receipts[0].case_id);
  const evidence=await manager('GET','/casos/'+id+'/evidencias');
  assert.equal(evidence.status,200);
  const flags=(await evidence.json()).data;
  assert.equal(flags.sleep_evidence,'SELF_REPORTED_UNVERIFIED');
  assert.equal(flags.scientific_risk_estimate,null);
  assert.doesNotMatch(JSON.stringify(flags),/sleep_hours_24h|kss_reported|funcionario_id|4\.5/);
  assert.equal((await admin('GET','/casos/'+id)).status,403);
  assert.equal((await crew('GET','/casos')).status,403);
  assert.equal((await as(191,'manager')('GET','/casos/'+id)).status,404);
  assert.equal((await manager('PUT','/casos/'+id+'/tratamento',treatment)).status,200);
  assert.equal((await manager('PUT','/casos/'+id+'/resolver',efficacy)).status,200);
  assert.equal((await manager('PUT','/casos/'+id+'/resolver',efficacy)).status,409);
  assert.equal(count(),14);
  const month=new Intl.DateTimeFormat('en-CA',{timeZone:'America/Sao_Paulo',year:'numeric',month:'2-digit'}).format(new Date()).slice(0,7);
  const report=await admin('GET','/relatorios/gerencial-tecnico-previa?mes='+month);
  assert.equal(report.status,200,'report '+await report.clone().text());
  const data=await report.json();
  assert.equal(data.data.current.checkin_receipts,6);
  // One closure out of six would disclose a small cell. The real report
  // correctly suppresses every case bucket, but preserves receipt coverage.
  assert.equal(data.data.current.cases.privacy,'SMALL_CELL_SUPPRESSED');
  assert.equal(data.data.current.cases.opened,null);
  assert.equal(data.data.current.cases.closed_with_efficacy,null);
  assert.equal(data.meta.signature,'NOT_SIGNED');
  assert.equal(data.meta.checksum_only_not_signature,true);
  assert.doesNotMatch(JSON.stringify(data),/sleep_hours_24h|kss_reported|funcionario_id/);
  assert.equal((await manager('GET','/relatorios/gerencial-tecnico-previa?mes='+month)).status,403);
  sqlite.exec('UPDATE setores_gestores SET ativo=0 WHERE usuario_id=190');
  const revoked=await manager('GET','/casos?limit=50');
  assert.equal(revoked.status,403,
    'real sector scope resolver denies a manager whose last grant was revoked');
  assert.equal((await manager('PUT','/casos/'+encodeURIComponent(receipts[1].case_id)+'/tratamento',treatment)).status,409);
  assert.equal(count(),14);
 }finally{sqlite.close();}
});

test('signed JWT and actual auth + tenant middleware protect BOA checkin and cases',async()=>{
 const {sqlite,actualAuth,realJwt,count}=fixture();
 try{
  const request=actualAuth();
  const token=await realJwt(101,'student',130);
  const manager=await realJwt(190,'manager',130);
  const admin=await realJwt(200,'admin',130);
  const coastal=await realJwt(600,'student',6);
  assert.equal((await request(null,'GET','/checkin/status')).status,401);
  assert.equal((await request('bad.jwt','GET','/checkin/status')).status,401);
  assert.equal((await request(coastal,'POST','/checkin',checkin)).status,403);
  assert.equal((await request(manager,'POST','/checkin',checkin)).status,403);
  assert.equal(count(),0);
  const created=await request(token,'POST','/checkin',checkin);
  assert.equal(created.status,201,'JWT checkin: '+await created.clone().text());
  const payload=await created.json();
  assert.equal(payload.data.dispatch_permission,'NOT_GRANTED');
  assert.equal((await request(token,'GET','/checkin/status')).status,200);
  assert.equal((await request(admin,'GET','/casos')).status,403);
  assert.equal((await request(manager,'GET','/casos')).status,200);

  const otherManager=await realJwt(191,'manager',130);
  assert.equal((await request(otherManager,'GET','/casos/'+encodeURIComponent(payload.data.case_id))).status,404,
    'real employee-sector grant query must deny a manager of another sector');
  assert.equal(count(),2);
  for(let uid=102;uid<=106;uid++){
   const jwt=await realJwt(uid,'student',130);
   assert.equal((await request(jwt,'POST','/checkin',checkin)).status,201);
  }
  assert.equal(count(),12);
  const caseId=encodeURIComponent(payload.data.case_id);
  assert.equal((await request(manager,'GET','/casos/'+caseId+'/evidencias')).status,200);
  assert.equal((await request(manager,'PUT','/casos/'+caseId+'/tratamento',treatment)).status,200);
  assert.equal((await request(manager,'PUT','/casos/'+caseId+'/resolver',efficacy)).status,200);
  assert.equal(count(),14);
  const month=new Intl.DateTimeFormat('en-CA',{
   timeZone:'America/Sao_Paulo',year:'numeric',month:'2-digit',
  }).format(new Date()).slice(0,7);
  const report=await request(admin,'GET','/relatorios/gerencial-tecnico-previa?mes='+month);
  assert.equal(report.status,200,'signed JWT monthly report '+await report.clone().text());
  const data=(await report.json()).data;
  assert.equal(data.current.checkin_receipts,6);
  assert.equal(data.current.cases.privacy,'SMALL_CELL_SUPPRESSED');
  sqlite.exec('DELETE FROM usuarios_empresas WHERE usuario_id=101 AND empresa_id=130');
  assert.equal((await request(token,'GET','/checkin/status')).status,401);
  assert.equal((await request(token,'POST','/checkin',checkin)).status,401);
  assert.equal(count(),14);
  const cross=await realJwt(101,'student',6);
  assert.equal((await request(cross,'GET','/checkin/status')).status,401);
  assert.equal((await actualAuth('production')(manager,'GET','/casos')).status,200);
  assert.equal((await actualAuth('production')(admin,'POST','/checkin',checkin)).status,403);
  const jwtMetadata=JSON.parse(Buffer.from(manager.split('.')[1],'base64url').toString());
  sqlite.prepare('INSERT INTO token_blocklist VALUES(?,?)')
    .run(jwtMetadata.jti,'9999-12-31 23:59:59');
  assert.equal((await request(manager,'GET','/casos')).status,401,
    'authenticated BOA manager must lose access to an explicitly revoked JWT');
  assert.equal(count(),14);
 }finally{sqlite.close();}
});

test('signed admin JWT reads actual SQLite QA roster readiness without write or implied approval',async()=>{
 const {sqlite,actualAuth,realJwt,count}=fixture();
 try {
  const request=actualAuth();
  const admin=await realJwt(200,'admin',130);
  const manager=await realJwt(190,'manager',130);
  const coastal=await realJwt(600,'student',6);
  assert.equal((await request(null,'GET','/qa/prontidao')).status,401);
  assert.equal((await request(manager,'GET','/qa/prontidao')).status,403);
  assert.equal((await request(coastal,'GET','/qa/prontidao')).status,403);
  assert.equal((await actualAuth('production')(admin,'GET','/qa/prontidao')).status,404);
  const ready=await request(admin,'GET','/qa/prontidao');
  assert.equal(ready.status,200,'staging QA readiness '+await ready.clone().text());
  const payload=await ready.json();
  assert.deepEqual(payload.data.accounts,{
    member_accounts:9,crew_links:6,manager_roles:2,admin_roles:1,
  });
  assert.equal(payload.data.status,'QA_PRECONDITIONS_INCOMPLETE');
  assert.equal(payload.data.official_boa_source,'NOT_VERIFIED');
  assert.equal(payload.data.scientific_validation,'NOT_ATTESTED');
  assert.equal(payload.data.operational_poc_accepted,false);
  assert.equal(payload.meta.write_performed,false);
  assert.doesNotMatch(JSON.stringify(payload),/funcionario_id|sleep_hours_24h|kss_reported/);
  assert.equal(count(),0);
 }finally{sqlite.close();}
});

test('real FRMS regulatory evidence and parameters fail closed on absent or ambiguous QA governance',async()=>{
 const {sqlite,as,count}=fixture();
 try{
  const crew=as(101,'student');
  sqlite.exec("UPDATE frms_regulatory_profiles SET active=0 WHERE id='qa-profile-130'");
  const missing=await crew('POST','/checkin',checkin);
  assert.equal(missing.status,503,'inactive governance must block checkin');
  assert.equal((await missing.json()).code,'BOMBEIROS_FRMS_POLICY_NOT_READY');
  assert.equal(count(),0);
  sqlite.exec("UPDATE frms_regulatory_profiles SET active=1 WHERE id='qa-profile-130'");
  sqlite.prepare(
   'INSERT INTO frms_profile_assignments VALUES (?,?,?,?,?,?,?)'
  ).run('qa-assignment-duplicate',130,'qa-profile-130','FIREFIGHTER_AVIATION',
   'ACTIVE','2020-01-01',null);
  assert.equal((await crew('POST','/checkin',checkin)).status,503);
  assert.equal(count(),0);
  sqlite.exec("DELETE FROM frms_profile_assignments WHERE id='qa-assignment-duplicate'");
  sqlite.exec("DELETE FROM frms_config_parameters WHERE revision_id='qa-revision-130' AND parameter_key=(SELECT parameter_key FROM frms_config_parameters LIMIT 1)");
  assert.equal((await crew('POST','/checkin',checkin)).status,503,
   'incomplete revision must block without generic policy fallback');
  assert.equal(count(),0);
 }finally{sqlite.close();}
});

test('QA document and scientific review bindings are mandatory before any health-event write',async()=>{
 const {sqlite,as,actualAuth,realJwt,count}=fixture();
 try {
  const crew=as(101,'student');
  sqlite.exec("UPDATE frms_regulatory_profiles SET source_document_hash=NULL WHERE id='qa-profile-130'");
  assert.equal((await crew('POST','/checkin',checkin)).status,503);
  assert.equal(count(),0);
  sqlite.exec("UPDATE frms_regulatory_profiles SET source_document_hash='"+'b'.repeat(64)+"' WHERE id='qa-profile-130'");
  assert.equal((await crew('POST','/checkin',checkin)).status,503);
  assert.equal(count(),0);
  sqlite.exec("UPDATE frms_regulatory_profiles SET source_document_hash='"+'a'.repeat(64)+"' WHERE id='qa-profile-130'");
  sqlite.exec("UPDATE frms_regulatory_profiles SET approval_reference=NULL WHERE id='qa-profile-130'");
  assert.equal((await crew('POST','/checkin',checkin)).status,503);
  assert.equal(count(),0);
  sqlite.exec("UPDATE frms_regulatory_profiles SET approval_reference='QA-FICTIONAL-APPROVAL' WHERE id='qa-profile-130'");
  sqlite.exec("UPDATE frms_config_revisions SET source_type='QA_UNREVIEWED' WHERE id='qa-revision-130'");
  assert.equal((await crew('POST','/checkin',checkin)).status,503);
  assert.equal(count(),0);
  sqlite.exec("UPDATE frms_config_revisions SET source_type='APPROVED_OPERATIONAL_POLICY' WHERE id='qa-revision-130'");
  const jwt=await realJwt(101,'student',130);
  const request=actualAuth('staging','130');
  assert.equal((await request(jwt,'POST','/checkin',checkin)).status,201);
  assert.equal(count(),2);
  // Revoke documentary binding: no further sensitive case transitions allowed.
  sqlite.exec("UPDATE frms_regulatory_profiles SET source_document_hash=NULL WHERE id='qa-profile-130'");
  const manager=await realJwt(190,'manager',130);
  const get=await request(manager,'GET','/casos?limit=5');
  assert.equal(get.status,200,'sanitized case reads do not imply approved intake');
  const id=(await request(jwt,'GET','/checkin/status')).status;
  assert.equal(id,200);
  assert.equal(count(),2);
 }finally{sqlite.close();}
});
