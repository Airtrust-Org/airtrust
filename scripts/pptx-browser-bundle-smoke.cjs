// Run against a local production build served on 127.0.0.1:4175.
// All API calls are intercepted; this cannot write to a remote tenant.
const { chromium, webkit } = require('playwright');
const { readFileSync } = require('fs');
const assert = require('assert');
const fixture = readFileSync('scripts/staging/fixtures/qa-pptx-3-slides-a.pptx');
(async () => {
 for (const engine of [chromium, webkit]) {
  const b = await engine.launch({headless:true});
  const p = await b.newPage();
  const errors = [];
  const token = ['eyJhbGciOiJub25lIn0',Buffer.from(JSON.stringify({sub:'999',empresa_id:999094,role:'student',exp:Math.floor(Date.now()/1000)+3600})).toString('base64url'),'x'].join('.');
  const user = { id:999, nome:'Synthetic', email:'synthetic@example.invalid', role:'student', perfil:'ALUNO', empresa_id:999094 };
  await p.addInitScript(({token,user})=>{localStorage.setItem('airtrust_persist_login','1');localStorage.setItem('airtrust_token',token);localStorage.setItem('airtrust_refresh_token','synthetic');localStorage.setItem('airtrust_user',JSON.stringify(user));},{token,user});
  let visited = [];
  await p.route('**/api/**', async route => {
   const u = new URL(route.request().url());
   if (u.pathname.includes('/pptx/asset/')) return route.fulfill({status:200,headers:{'content-type':'application/vnd.openxmlformats-officedocument.presentationml.presentation','etag':'"fixture"'},body:fixture});
   let data={};
   if(u.pathname.endsWith('/auth/me')) data=user;
   else if(u.pathname.endsWith('/empresas')) data=[];
   else if(u.pathname.endsWith('/pptx-evidence')) {
     if(route.request().method()==='POST') {const index=route.request().postDataJSON().slide_index; if(!visited.includes(index)) visited.push(index);}
     data={total_slides:3,visited_indexes:visited,next_slide:Math.min(visited.length,2),ready_to_finalize:visited.length===3,asset_etag:'fixture'};
   } else if(u.pathname.includes('/matriculas/')) data={id:99958,curso_id:1,tipo_conteudo:'pptx',titulo:'Synthetic',status:'NAO_INICIADO',gerar_qualificacao_ao_concluir:1};
   await route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({success:true,data})});
  });
  p.on('pageerror',e=>errors.push(e.message));
  p.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
  await p.goto('http://127.0.0.1:4175/lms/player/pptx/99958',{waitUntil:'domcontentloaded'});
  await p.getByText('Slide 1 de 3',{exact:true}).waitFor({timeout:30000});
  await p.getByText('AirTrust QA PPTX A — slide 1 de 3',{exact:true}).waitFor();
  await p.getByRole('button',{name:'Próximo'}).click({timeout:15000});
  await p.getByText('Slide 2 de 3',{exact:true}).waitFor();
  await p.getByText('AirTrust QA PPTX A — slide 2 de 3',{exact:true}).waitFor();
  assert.equal(errors.length,0,errors.join('\n'));
  console.log(`${engine.name()}: fixture rendered slides 1 and 2, synthetic authenticated session, no browser exception`);
  await b.close();
 }
})().catch(e=>{console.error(e);process.exitCode=1});
