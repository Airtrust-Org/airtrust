/**
 * Hono HTTP request/response over actual BOA SQL in ephemeral SQLite.
 * source_reference: docs/frms/BOA_CBMMG_AUDITORIA_FUNCIONAL_CIENTIFICA_CADEIA_DADOS_20261021.md
 * operational_decision: check the full API boundary using simulated upstream login,
 * fake readiness configuration and real domain handlers/SQL. No real JWT or approval.
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
const stubs={
 'parameter-governance':"export const FRMS_FIREFIGHTER_AVIATION_PROFILE='FIREFIGHTER_AVIATION'; export async function resolveFrmsRegulatoryProfileEvidence(_db,{empresaId}) { return {empresaId,profileCode:'FIREFIGHTER_AVIATION',regulatoryProfileId:'QA_UNAPPROVED_ONLY'}; }",
 'db-service':"export async function loadEffectiveFrmsConfiguration(_db,empresaId) {return {empresaId,profileCode:'FIREFIGHTER_AVIATION',regulatoryProfileId:'QA_UNAPPROVED_ONLY',revision:{id:'qa-not-authorized',policy_version:'QA_TEST_ONLY'}};}",
 'employee-sector-access':"export async function getEmployeeSectorAccess(c) {return c.get('userRole')==='manager'?{mode:'restricted',setorIds:[9],funcionarioId:null}:{mode:'all',setorIds:[],funcionarioId:null};}",
 'report-access':"export async function loadFrmsReportCrewScope(db,empresaId) {const x=await db.prepare('SELECT id FROM funcionarios WHERE empresa_id=? AND ativo=1 AND deleted_at IS NULL').bind(empresaId).all();return {ids:new Set(x.results.map(r=>r.id))};}",
};
const mockPaths={
 'parameter-governance':/lib\/frms\/parameter-governance$/,
 'db-service':/lib\/frms\/db-service$/,
 'employee-sector-access':/services\/employee-sector-access$/,
 'report-access':/lib\/frms\/report-access$/,
};
const output=(await esbuild.build({
 stdin:{
  contents:[
   "import router from './routes/frms-bombeiros';",
   "import {auth} from './middleware/auth';",
   "import {tenantMiddleware} from './middleware/tenant';",
   "import {generateJWT} from './utils/security';",
   "export {router,auth,tenantMiddleware,generateJWT};",
  ].join(String.fromCharCode(10)),
  resolveDir:join(root,'worker-airtrust/src'),
  sourcefile:'boa-jwt-integration-entry.ts',loader:'ts',
 },
 bundle:true,platform:'node',format:'cjs',write:false,
 plugins:[{name:'BOA-QA-scoped-stubs',setup(build){
  for(const [name,pattern] of Object.entries(mockPaths)){
   build.onResolve({filter:pattern},args=>{
    if(!args.importer.endsWith('/routes/frms-bombeiros.ts'))return;
    return {path:name,namespace:'boa-qa-module'};
   });
  }
  build.onLoad({filter:/.*/,namespace:'boa-qa-module'},args=>({
   contents:stubs[args.path],loader:'js',
  }));
 }}],
})).outputFiles[0].text;
const filename='/tmp/airtrust-boa-hono-real-sqlite-qa.cjs';
const mod=new Module(filename);
mod.filename=filename;mod.paths=Module._nodeModulePaths(dirname(filename));
mod._compile(output,filename);
const {router,auth,tenantMiddleware,generateJWT}=mod.exports;
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
  "INSERT INTO setores VALUES(9,130,1,NULL),(10,130,1,NULL),(109,6,1,NULL)",
  "INSERT INTO funcionarios VALUES(21,130,9,1,NULL,'ATIVO','PILOTO','Piloto'),(22,130,9,1,NULL,'ATIVO','PILOTO','Piloto'),(23,130,9,1,NULL,'ATIVO','PILOTO','Piloto'),(24,130,9,1,NULL,'ATIVO','PILOTO','Piloto'),(25,130,9,1,NULL,'ATIVO','PILOTO','Piloto'),(26,130,9,1,NULL,'ATIVO','PILOTO','Piloto'),(70,6,109,1,NULL,'ATIVO','Tripulante','Outro')",
  "INSERT INTO usuarios VALUES(101,21,NULL,'student',1),(102,22,NULL,'student',1),(103,23,NULL,'student',1),(104,24,NULL,'student',1),(105,25,NULL,'student',1),(106,26,NULL,'student',1),(190,NULL,NULL,'manager',1),(191,NULL,NULL,'manager',1),(200,NULL,NULL,'admin',1),(600,70,NULL,'student',1)",
  "INSERT INTO empresas VALUES(130,'bombeiros','BOA QA','qa',1,NULL),(6,'costadosol','Costa do Sol','qa',1,NULL)",
  "INSERT INTO usuarios_empresas VALUES(101,130,'student'),(102,130,'student'),(103,130,'student'),(104,130,'student'),(105,130,'student'),(106,130,'student'),(190,130,'manager'),(191,130,'manager'),(200,130,'admin'),(600,6,'student')",
  "INSERT INTO setores_gestores VALUES(1,9,190,130,'manager',1,NULL),(2,10,191,130,'manager',1,NULL)"
 ].join(';')+';');
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
    BOA_FRMS_QA_SENSITIVE_WRITES_TENANT_ID:gate};
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
   c.env={DB:d1,ENVIRONMENT:environment,BOA_FRMS_QA_SENSITIVE_WRITES_TENANT_ID:gate};
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
  assert.equal(revoked.status,200);
  assert.equal((await revoked.json()).data.items.length,0);
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
  assert.equal(count(),2);
  sqlite.exec('DELETE FROM usuarios_empresas WHERE usuario_id=101 AND empresa_id=130');
  assert.equal((await request(token,'GET','/checkin/status')).status,401);
  assert.equal((await request(token,'POST','/checkin',checkin)).status,401);
  assert.equal(count(),2);
  const cross=await realJwt(101,'student',6);
  assert.equal((await request(cross,'GET','/checkin/status')).status,401);
  assert.equal((await actualAuth('production')(manager,'GET','/casos')).status,200);
  assert.equal((await actualAuth('production')(admin,'POST','/checkin',checkin)).status,403);
 }finally{sqlite.close();}
});
