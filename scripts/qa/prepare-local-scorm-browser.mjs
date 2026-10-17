#!/usr/bin/env node
// source_reference: scripts/seed-lms-pdf-demo.sh and lms-scorm-m8-fixture.mjs.
// operational_decision: mutate synthetic local Worker/D1/R2 QA fixtures only.
// dry_run_required: local D1 reset and no remote Cloudflare credentials.
// rollback_plan_required: discard the disposable local Miniflare QA state.
// Disposable local-only D1/R2 setup. Never contact remote Cloudflare.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { strToU8, zipSync, unzipSync } from 'fflate';
import { DatabaseSync } from 'node:sqlite';
import { buildInteractiveM8QaFiles } from '../staging/lms-scorm-m8-fixture.mjs';
import { validateIndependentDriver, unzipCandidate } from './scorm-independent-zip-producer.mjs';
import { validateNavigationDiagnostic } from './scorm-navigation-diagnostic-driver.mjs';
// External candidate is never published. This isolated QA course exists only
// in disposable local D1/R2; the original course/edition is untouched.

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const api='http://127.0.0.1:8787/api';
const stateDir=path.join(root,'worker-airtrust/.wrangler/state');
const fixtureRoot=path.join(root,'worker-airtrust/.wrangler/scorm-browser-qa');
function assert(condition,code){ if(!condition)throw Error(code); }
function run(program,args,timeout=90000){
  return execFileSync(program,args,{cwd:root,encoding:'utf8',timeout,
    env:{...process.env,AIRTRUST_LOCAL_API_BASE:api},
    stdio:['ignore','pipe','pipe']});
}
function findDb(dir){
  const files=[];
  function walk(folder){
    if(!fs.existsSync(folder))return;
    for(const e of fs.readdirSync(folder,{withFileTypes:true})){
      const p=path.join(folder,e.name);
      if(e.isDirectory())walk(p);
      else if(e.name.endsWith('.sqlite') && p.includes('miniflare-D1DatabaseObject'))files.push(p);
    }
  }
  walk(dir);
  assert(files.length===1,'LOCAL_D1_COUNT_INVALID');
  return files[0];
}
async function main(){
  assert(!process.env.CLOUDFLARE_API_TOKEN && !process.env.AIRTRUST_REMOTE_DB,
    'REMOTE_CREDENTIALS_NOT_ALLOWED_IN_LOCAL_QA');
  const health=await fetch(api+'/health');
  assert(health.ok,'LOCAL_WORKER_NOT_READY');
  const text=run('bash',['scripts/seed-lms-pdf-demo.sh']);
  const vals=Object.fromEntries(text.split('\n').filter(x=>/^[A-Z_]+=/.test(x)).map(x=>{
    const n=x.indexOf('=');return [x.slice(0,n),x.slice(n+1)];
  }));
  const companyId=Number(vals.EMPRESA_ID);
  const courseId=Number(vals.CURSO_ID);
  const firstId=Number(vals.MATRICULA_ID);
  const firstEmployee=Number(vals.FUNCIONARIO_ID);
  assert([companyId,courseId,firstId,firstEmployee].every(x=>Number.isSafeInteger(x)&&x>0),'LOCAL_IDS_INVALID');
  const externalZip=process.env.AIRTRUST_SCORM_QA_ZIP_PATH;
  const externalDriverPath=process.env.AIRTRUST_SCORM_QA_DRIVER_PATH;
  assert(Boolean(externalZip)===Boolean(externalDriverPath),
    'EXTERNAL_ZIP_AND_DRIVER_MUST_BE_PAIRED');
  const externalBytes=externalZip?fs.readFileSync(path.resolve(externalZip)):null;
  const externalSha=externalBytes?
    createHash('sha256').update(externalBytes).digest('hex'):null;
  const externalFiles=externalBytes?unzipCandidate(externalBytes):null;
  const externalDriver=externalDriverPath?
    JSON.parse(fs.readFileSync(path.resolve(externalDriverPath),'utf8')):null;
  if(externalDriver?.kind==='LOCAL_NAVIGATION_DIAGNOSTIC_ONLY')
    validateNavigationDiagnostic(externalDriver,externalSha,externalFiles);
  else if(externalDriver)validateIndependentDriver(externalDriver,externalSha,externalFiles);
  const launchFile=externalDriver?.launchFile??'index.html';
  const masteryScore=externalDriver?.masteryScore??70;
  assert(typeof launchFile==='string'&&launchFile.length<300,'LAUNCH_FILE_INVALID');
  assert(externalFiles===null||Object.keys(externalFiles).length<=2500,
    'EXTERNAL_ZIP_ENTRY_COUNT_EXCEEDED');
  if(externalBytes)assert(externalBytes.length<=80*1024*1024,'EXTERNAL_ZIP_TOO_LARGE');
  const dbFile=findDb(stateDir);
  const db=new DatabaseSync(dbFile);
  const prefix='local-browser-qa/scorm/'+companyId+'/'+courseId+'/';
  db.prepare("UPDATE lms_cursos SET titulo='SCORM Browser QA', tipo_conteudo='scorm', scorm_versao='1.2', scorm_mastery_score=?, scorm_package_r2_prefix=?, scorm_launch_file=?, gerar_qualificacao_ao_concluir=1, ativo=1, publicado=1 WHERE id=? AND empresa_id=?").run(masteryScore,prefix,launchFile,courseId,companyId);
  const secondEmployee=Number(db.prepare("INSERT INTO funcionarios (nome, empresa_id, ativo, is_examinador, matricula) VALUES ('QA SCORM WEBKIT SINTETICO', ?, 1, 0, '99051')").run(companyId).lastInsertRowid);
  // Disposable foreign tenant: never share the authenticated operator's company.
  // The API must not resolve this enrollment even for a manager in tenant 6.
  const foreignCompany=Number(db.prepare(
    "INSERT INTO empresas (nome, razao_social, codigo, email, ativo, created_at, updated_at) VALUES ('QA TENANT ISOLATION', 'QA TENANT ISOLATION', 'qa-lms-foreign', 'qa-foreign@example.invalid', 1, datetime('now'), datetime('now'))",
  ).run().lastInsertRowid);
  const foreignEmployee=Number(db.prepare(
    "INSERT INTO funcionarios (empresa_id, nome, matricula, ativo, status) VALUES (?, 'QA CROSS TENANT', 'QA-CROSS-001', 1, 'ATIVO')",
  ).run(foreignCompany).lastInsertRowid);
  const foreignCourse=Number(db.prepare(
    "INSERT INTO lms_cursos (empresa_id,titulo,tipo_conteudo,ativo,publicado,scorm_package_r2_prefix,scorm_launch_file,scorm_versao) VALUES (?,'QA FOREIGN SCORM','scorm',1,1,?,'index.html','1.2')",
  ).run(foreignCompany,'lms/scorm/'+foreignCompany+'/1/foreign/').lastInsertRowid);
  const foreignEnrollment=Number(db.prepare(
    "INSERT INTO lms_matriculas (empresa_id,curso_id,funcionario_id,status) VALUES (?,?,?,'NAO_INICIADO')",
  ).run(foreignCompany,foreignCourse,foreignEmployee).lastInsertRowid);
  assert([foreignCompany,foreignCourse,foreignEmployee,foreignEnrollment].every(Number.isSafeInteger),
    'CROSS_TENANT_FIXTURE_INVALID');
  // A failed assessment cannot be silently erased by rematriculation. Use
  // independent synthetic learners for the eventual passing journey.
  const passEmployees={};
  for(const browser of ['chromium','webkit-ipad']){
    passEmployees[browser]=Number(db.prepare(
      "INSERT INTO funcionarios (nome, empresa_id, ativo, is_examinador, matricula) VALUES (?, ?, 1, 0, ?)",
    ).run('QA SCORM PASS '+browser,companyId,'QA-PASS-'+browser).lastInsertRowid);
  }
  db.close();

  const login=await fetch(api+'/auth/login',{method:'POST',headers:{'Content-Type':'application/json'},
    body:JSON.stringify({email:'admin@airtrust.com',senha:'Admin@123'})});
  assert(login.ok,'LOCAL_QA_LOGIN_FAILED');
  const token=(await login.json())?.data?.accessToken;
  assert(typeof token==='string' && token.length>20,'LOCAL_QA_TOKEN_MISSING');
  const enrollment=await fetch(api+'/lms/matriculas',{method:'POST',headers:{
    Authorization:'Bearer '+token,'Content-Type':'application/json'},
    body:JSON.stringify({curso_id:courseId,funcionario_id:secondEmployee,observacoes:'QA SCORM browser descartavel'})});
  assert(enrollment.ok,'LOCAL_ENROLLMENT_HTTP_'+enrollment.status);
  const secondId=Number((await enrollment.json())?.data?.id);
  assert(Number.isSafeInteger(secondId)&&secondId>0&&secondId!==firstId,'LOCAL_SECOND_ENROLLMENT_INVALID');
  const passEnrollments={};
  for(const browser of ['chromium','webkit-ipad']){
    const response=await fetch(api+'/lms/matriculas',{method:'POST',headers:{
      Authorization:'Bearer '+token,'Content-Type':'application/json'},
      body:JSON.stringify({curso_id:courseId,funcionario_id:passEmployees[browser],
        observacoes:'QA SCORM passing journey separado da tentativa reprovada'})});
    assert(response.ok,'LOCAL_PASS_ENROLLMENT_HTTP_'+browser+'_'+response.status);
    const id=Number((await response.json())?.data?.id);
    assert(Number.isSafeInteger(id)&&id>0&&!Object.values(passEnrollments).includes(id)&&
      id!==firstId&&id!==secondId,'LOCAL_PASS_ENROLLMENT_INVALID_'+browser);
    passEnrollments[browser]=id;
  }

  fs.mkdirSync(fixtureRoot,{recursive:true});
  // SHA is calculated on the exact ZIP from which R2 browser assets are extracted.
  const id='qa-'+courseId, version='local-browser-qa-v1';
  const content=buildInteractiveM8QaFiles(id,version);
  const xml='<manifest xmlns="http://www.imsproject.org/xsd/imscp_rootv1p1p2" xmlns:adlcp="http://www.adlnet.org/xsd/adlcp_rootv1p2" identifier="LOCAL-QA"><organizations default="ORG"><organization identifier="ORG"><title>QA</title><item identifier="I" identifierref="R"><title>QA</title></item></organization></organizations><resources><resource identifier="R" type="webcontent" adlcp:scormtype="sco" href="index.html"><file href="index.html"/></resource></resources></manifest>';
  const completion={schemaVersion:1,diagnosticsVersion:'AIRTRUST_COMPLETION_DIAGNOSTICS_V1',scormVersion:'1.2',courseId:id,packageVersion:version,content:{requiredSlides:['qa-slide-1']},assessment:{requiredInteractions:['qa-interaction-1'],masteryScore:70,successStatus:'passed',failureStatus:'failed'},completion:{strategy:'AIRTRUST_COMPLETION_CONTRACT_V1'},diagnostics:{currentSlide:true,slides:true,assessment:true,packageStatus:true,updatedAt:true}};
  const zipBytes=externalBytes??zipSync({...content,'imsmanifest.xml':strToU8(xml),'airtrust-completion-manifest.json':strToU8(JSON.stringify(completion))},{level:6});
  const zipPath=path.join(fixtureRoot,'candidate.zip');
  fs.writeFileSync(zipPath,zipBytes,{mode:0o600});
  const packageSha256=createHash('sha256').update(zipBytes).digest('hex');
  const files=externalFiles??unzipSync(new Uint8Array(fs.readFileSync(zipPath)));
  for(const [filename,bytes] of Object.entries(files)){
    if(filename.endsWith('/'))continue; // ZIP directory entries are not R2 objects.
    const file=path.resolve(fixtureRoot,filename);
    assert(file.startsWith(fixtureRoot+path.sep),'QA_FILE_PATH_INVALID');
    fs.mkdirSync(path.dirname(file),{recursive:true});
    fs.writeFileSync(file,bytes,{mode:0o600});
    run('npx',['wrangler','r2','object','put',
      'airtrust-storage-local/'+prefix+filename,'--local','--config',
      'worker-airtrust/wrangler.dev.toml','--persist-to','worker-airtrust/.wrangler/state',
      '--file',file],90000);
  }
  if(externalDriver)fs.writeFileSync(path.join(fixtureRoot,'driver.json'),
    JSON.stringify(externalDriver,null,2)+'\n',{mode:0o600});
  fs.writeFileSync(path.join(fixtureRoot,'fixture.json'),JSON.stringify({
    origin:'http://127.0.0.1:8787',companyId,courseId,dbFile,
    packageSha256,zipPath,fixtureKind:externalDriver?'LOCAL_DISPOSABLE_REAL_ZIP':'LOCAL_DISPOSABLE_ZIP',
    ...(externalDriver?{driverPath:path.join(fixtureRoot,'driver.json')}:{}),
    enrollments:{chromium:firstId,'webkit-ipad':secondId},
    employeeIds:{chromium:firstEmployee,'webkit-ipad':secondEmployee},
    passEnrollments,
    foreignTenant:{empresaId:foreignCompany,courseId:foreignCourse,matriculaId:foreignEnrollment},
  },null,2)+'\n',{mode:0o600});
  console.log('LOCAL_SCORM_BROWSER_FIXTURE_READY=2');
}
main().catch(e=>{console.error('LOCAL_SCORM_BROWSER_SETUP_FAILED:'+String(e.message).slice(0,200));process.exitCode=1;});
