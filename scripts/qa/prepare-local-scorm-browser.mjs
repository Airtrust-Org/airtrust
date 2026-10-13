#!/usr/bin/env node
// Disposable local-only D1/R2 setup. Never contact remote Cloudflare.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
import { DatabaseSync } from 'node:sqlite';
import { buildInteractiveM8QaFiles } from '../staging/lms-scorm-m8-fixture.mjs';

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
  const dbFile=findDb(stateDir);
  const db=new DatabaseSync(dbFile);
  const prefix='local-browser-qa/scorm/'+companyId+'/'+courseId+'/';
  db.prepare("UPDATE lms_cursos SET titulo='SCORM Browser QA', tipo_conteudo='scorm', scorm_versao='1.2', scorm_mastery_score=70, scorm_package_r2_prefix=?, scorm_launch_file='index.html', gerar_qualificacao_ao_concluir=1, ativo=1, publicado=1 WHERE id=? AND empresa_id=?").run(prefix,courseId,companyId);
  const secondEmployee=Number(db.prepare("INSERT INTO funcionarios (nome, empresa_id, ativo, is_examinador, matricula) VALUES ('QA SCORM WEBKIT SINTETICO', ?, 1, 0, '99051')").run(companyId).lastInsertRowid);
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

  fs.mkdirSync(fixtureRoot,{recursive:true});
  const files=buildInteractiveM8QaFiles('qa-'+courseId,'local-browser-qa-v1');
  for(const [filename,bytes] of Object.entries(files)){
    const file=path.resolve(fixtureRoot,filename);
    assert(file.startsWith(fixtureRoot+path.sep),'QA_FILE_PATH_INVALID');
    fs.mkdirSync(path.dirname(file),{recursive:true});
    fs.writeFileSync(file,bytes,{mode:0o600});
    run('npx',['wrangler','r2','object','put',
      'airtrust-storage-local/'+prefix+filename,'--local','--config',
      'worker-airtrust/wrangler.dev.toml','--persist-to','worker-airtrust/.wrangler/state',
      '--file',file],90000);
  }
  fs.writeFileSync(path.join(fixtureRoot,'fixture.json'),JSON.stringify({
    origin:'http://127.0.0.1:8787',companyId,courseId,dbFile,
    enrollments:{chromium:firstId,'webkit-ipad':secondId},
    employeeIds:{chromium:firstEmployee,'webkit-ipad':secondEmployee},
  },null,2)+'\n',{mode:0o600});
  console.log('LOCAL_SCORM_BROWSER_FIXTURE_READY=2');
}
main().catch(e=>{console.error('LOCAL_SCORM_BROWSER_SETUP_FAILED:'+String(e.message).slice(0,200));process.exitCode=1;});
