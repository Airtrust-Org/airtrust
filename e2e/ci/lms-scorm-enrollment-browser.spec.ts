/**
 * Authenticated Worker/D1/R2 SCORM learner closure in disposable LOCAL fixtures.
 * Proves browser actions reach the actual backend, unlike API-only SCO probes.
 * This is NOT an attestation for arbitrary uploaded ZIPs or real tenants.
 */
import {expect,test} from '@playwright/test';
import {readFileSync} from 'node:fs';
import {DatabaseSync} from 'node:sqlite';

type Fixture={
  origin:string;companyId:number;courseId:number;dbFile:string;
  enrollments:Record<string,number>;
};
test('SCORM wrong answer, resume, pass, explicit completion and qualification',async({page},testInfo)=>{
  test.setTimeout(120000);
  const fixture=JSON.parse(readFileSync('worker-airtrust/.wrangler/scorm-browser-qa/fixture.json','utf8')) as Fixture;
  expect(fixture.origin).toBe('http://127.0.0.1:8787');
  const id=fixture.enrollments[testInfo.project.name];
  expect(id).toBeGreaterThan(0);
  const api=fixture.origin+'/api';
  const login=await page.request.post(api+'/auth/login',{data:{email:'admin@airtrust.com',senha:'Admin@123'}});
  expect(login.ok()).toBe(true);
  const token=(await login.json()).data.accessToken as string;
  expect(token.length).toBeGreaterThan(20);
  const headers={Authorization:'Bearer '+token};

  async function enrollment(){
    const res=await page.request.get(api+'/lms/matriculas/'+id,{headers});
    expect(res.ok()).toBe(true);
    return (await res.json()).data as {status:string;qualificacao_historico_id:number|null};
  }
  function stored(){
    const db=new DatabaseSync(fixture.dbFile,{readOnly:true});
    try{return {
      m:db.prepare('SELECT status, qualificacao_historico_id, progresso_pct FROM lms_matriculas WHERE id=? AND empresa_id=?').get(id,fixture.companyId) as {status:string;qualificacao_historico_id:number|null;progresso_pct:number},
      scorm:db.prepare('SELECT lesson_status, score_raw, cmi_json FROM lms_progresso_scorm WHERE matricula_id=? AND empresa_id=?').get(id,fixture.companyId) as {lesson_status:string;score_raw:number;cmi_json:string}|undefined,
      history:db.prepare('SELECT COUNT(*) AS n FROM qualificacoes_historico WHERE lms_matricula_id=? AND empresa_id=? AND deleted_at IS NULL').get(id,fixture.companyId) as {n:number},
    };}finally{db.close();}
  }
  async function open(){
    const sess=await page.request.post(api+'/lms/assets/session',{data:{matricula_id:id},headers});
    expect(sess.ok()).toBe(true);
    await page.goto(api+'/health');
    await page.setContent('<iframe id="outer" title="SCORM real" src="'+api+'/lms/scorm/launch/'+id+'" style="height:90vh;width:100vw"></iframe>');
    const outer=page.frameLocator('#outer');
    const sco=outer.frameLocator('#scorm-frame');
    await expect(sco.getByRole('heading',{name:'Avaliação QA'})).toBeVisible({timeout:25000});
    return sco;
  }

  let sco=await open();
  await expect(sco.locator('#submitAssessment')).toBeDisabled();
  await sco.locator('button[data-answer="0"]').click();
  await sco.locator('#submitAssessment').click();
  await expect.poll(()=>stored().scorm?.lesson_status,{timeout:25000}).toBe('failed');
  expect(stored().m.status).not.toBe('CONCLUIDO');
  expect(stored().history.n).toBe(0);

  // Same enrollment, without an administrative reset.
  sco=await open();
  await sco.locator('button[data-answer="1"]').click();
  await sco.locator('#submitAssessment').click();
  await expect(sco.locator('#completeCourse')).toBeVisible();
  await sco.locator('#completeCourse').click();
  await expect.poll(()=>stored().scorm?.lesson_status,{timeout:25000}).toBe('passed');
  expect((await enrollment()).status).not.toBe('CONCLUIDO');

  // React's explicit, user-confirmed finalization message (never synthetic CMI).
  await page.evaluate(matId=>{
    const iframe=document.getElementById('outer') as HTMLIFrameElement;
    iframe.contentWindow!.postMessage({type:'lms:request-completion',matriculaId:matId},location.origin);
  },id);
  await expect.poll(()=>enrollment(),{timeout:35000}).toMatchObject({status:'CONCLUIDO'});
  const final=stored();
  expect(final.m.qualificacao_historico_id).toBeGreaterThan(0);
  expect(final.m.progresso_pct).toBe(100);
  expect(final.history.n).toBe(1);
  expect(final.scorm?.score_raw).toBe(100);

  await open();
  const reopened=stored();
  expect(reopened.m.status).toBe('CONCLUIDO');
  expect(reopened.m.qualificacao_historico_id).toBe(final.m.qualificacao_historico_id);
  expect(reopened.history.n).toBe(1);
});
