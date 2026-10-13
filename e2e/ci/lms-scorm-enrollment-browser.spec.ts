/**
 * Authenticated Worker/D1/R2 SCORM learner closure in disposable LOCAL fixtures.
 * Proves browser actions reach the actual backend, unlike API-only SCO probes.
 * This test is local SHA-bound evidence, not a production ZIP certification.
 * Cross-tenant/cycle isolation and certificate issuance remain unproven.
 */
import {expect,test} from '@playwright/test';
import {readFileSync,writeFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {join} from 'node:path';
import {DatabaseSync} from 'node:sqlite';

type Fixture={
  origin:string;companyId:number;courseId:number;dbFile:string;
  packageSha256:string;zipPath:string;fixtureKind:'LOCAL_DISPOSABLE_ZIP';
  enrollments:Record<string,number>;
  employeeIds:Record<string,number>;
  foreignTenant:{empresaId:number;courseId:number;matriculaId:number};
};
test('SCORM wrong answer, resume, pass, explicit completion and qualification',async({page},testInfo)=>{
  test.setTimeout(120000);
  const fixture=JSON.parse(readFileSync('worker-airtrust/.wrangler/scorm-browser-qa/fixture.json','utf8')) as Fixture;
  expect(fixture.origin).toBe('http://127.0.0.1:8787');
  expect(fixture.fixtureKind).toBe('LOCAL_DISPOSABLE_ZIP');
  const localZipDigest=createHash('sha256').update(readFileSync(fixture.zipPath)).digest('hex');
  expect(localZipDigest).toMatch(/^[0-9a-f]{64}$/);
  expect(localZipDigest).toBe(fixture.packageSha256);
  const id=fixture.enrollments[testInfo.project.name];
  expect(id).toBeGreaterThan(0);
  const api=fixture.origin+'/api';
  const login=await page.request.post(api+'/auth/login',{data:{email:'admin@airtrust.com',senha:'Admin@123'}});
  expect(login.ok()).toBe(true);
  const token=(await login.json()).data.accessToken as string;
  expect(token.length).toBeGreaterThan(20);
  const headers={Authorization:'Bearer '+token};

  // Exercise backend tenant isolation, not merely a direct SQL predicate.
  // The session is authenticated as company 6 and must not receive a token
  // for the independent synthetic company.
  const foreign=fixture.foreignTenant;
  expect(foreign.empresaId).not.toBe(fixture.companyId);
  expect(foreign.matriculaId).not.toBe(id);
  const deniedSession=await page.request.post(api+'/lms/assets/session',{
    headers,data:{matricula_id:foreign.matriculaId},
  });
  expect(deniedSession.status()).toBe(404);
  const deniedEnrollment=await page.request.get(
    api+'/lms/matriculas/'+foreign.matriculaId,{headers});
  expect(deniedEnrollment.status()).toBe(404);
  const deniedCourse=await page.request.get(api+'/lms/cursos/'+foreign.courseId,{headers});
  expect([403,404]).toContain(deniedCourse.status());
  const deniedLaunch=await page.request.get(
    api+'/lms/scorm/launch/'+foreign.matriculaId,{headers});
  expect([401,403,404]).toContain(deniedLaunch.status());

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

  const otherId=Object.values(fixture.enrollments).find(candidate=>candidate!==id);
  expect(otherId).toBeGreaterThan(0);
  function otherEnrollmentSnapshot(){
    const db=new DatabaseSync(fixture.dbFile,{readOnly:true});
    try {
      return {
        enrollment:db.prepare('SELECT status, progresso_pct, qualificacao_historico_id FROM lms_matriculas WHERE id=? AND empresa_id=?').get(otherId,fixture.companyId),
        history:db.prepare('SELECT COUNT(*) AS n FROM qualificacoes_historico WHERE lms_matricula_id=? AND empresa_id=? AND deleted_at IS NULL').get(otherId,fixture.companyId),
      };
    } finally { db.close(); }
  }
  const otherBefore=otherEnrollmentSnapshot();
  const foreignBefore=(()=>{
    const db=new DatabaseSync(fixture.dbFile,{readOnly:true});
    try {return db.prepare(
      'SELECT status, progresso_pct, qualificacao_historico_id FROM lms_matriculas WHERE id=? AND empresa_id=?',
    ).get(foreign.matriculaId,foreign.empresaId);}
    finally {db.close();}
  })();

  let sco=await open();
  await expect(sco.locator('#submitAssessment')).toBeDisabled();
  expect(stored().history.n).toBe(0);
  // Distinct from reopening: the learner must leave an unfinished answer in
  // actual persisted suspend_data and recover the enabled assessment control.
  await sco.locator('button[data-answer="1"]').click();
  await expect.poll(()=>stored().scorm?.cmi_json?.includes('qa-interaction-1'),{timeout:25000}).toBe(true);
  sco=await open();
  await expect(sco.locator('#submitAssessment')).toBeEnabled();
  expect(stored().m.status).not.toBe('CONCLUIDO');

  // A wrong answer still fails and does not create qualification/history.
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
  // Replaying an explicit request must not issue duplicate qualification.
  await page.evaluate(matId=>{
    const iframe=document.getElementById('outer') as HTMLIFrameElement;
    iframe.contentWindow!.postMessage({type:'lms:request-completion',matriculaId:matId},location.origin);
  },id);
  await page.waitForTimeout(1000);
  const replayed=stored();
  expect(replayed.m.status).toBe('CONCLUIDO');
  expect(replayed.m.qualificacao_historico_id).toBe(final.m.qualificacao_historico_id);
  expect(replayed.history.n).toBe(1);
  // A sibling enrollment is never mutated by this learner's pass/fail/reopen.
  expect(otherEnrollmentSnapshot()).toEqual(otherBefore);
  const foreignAfter=(()=>{
    const db=new DatabaseSync(fixture.dbFile,{readOnly:true});
    try {return db.prepare(
      'SELECT status, progresso_pct, qualificacao_historico_id FROM lms_matriculas WHERE id=? AND empresa_id=?',
    ).get(foreign.matriculaId,foreign.empresaId);}
    finally {db.close();}
  })();
  expect(foreignAfter).toEqual(foreignBefore);
  // Exercise the real administrative lifecycle to prove a second enrollment
  // cycle never resumes its predecessor's passed SCO or qualification pointer.
  const deleteResult=await page.request.delete(api+'/lms/matriculas/'+id,{headers});
  expect(deleteResult.status()).toBe(200);
  const reEnroll=await page.request.post(api+'/lms/matriculas',{
    headers,data:{
      curso_id:fixture.courseId,
      funcionario_id:fixture.employeeIds[testInfo.project.name],
      observacoes:'Local-only renewal cycle regression',
    },
  });
  const reEnrolled=await reEnroll.json().catch(()=>null);
  expect(reEnroll.ok(), 'LOCAL_REENROLL_HTTP_'+reEnroll.status()+'_CODE_'+String(reEnrolled?.code||'none')+'_ERROR_'+String(reEnrolled?.error||'').slice(0,100)).toBe(true);
  expect(Number(reEnrolled.data.id)).toBe(id);
  const fresh=stored();
  expect(fresh.m.status).toBe('NAO_INICIADO');
  expect(fresh.m.progresso_pct).toBe(0);
  expect(fresh.m.qualificacao_historico_id).toBeNull();
  expect(fresh.scorm?.cmi_json ?? null).toBeNull();
  expect(fresh.scorm?.score_raw ?? null).toBeNull();
  expect(fresh.history.n).toBe(1); // prior historical proof is not deleted

  const dbCycles=new DatabaseSync(fixture.dbFile,{readOnly:true});
  let cycles: Array<{numero_ciclo:number;ciclo_atual:number;qualificacao_historico_id:number|null}>;
  try{
    cycles=dbCycles.prepare(
      'SELECT numero_ciclo,ciclo_atual,qualificacao_historico_id FROM lms_matricula_ciclos WHERE matricula_id=? AND empresa_id=? AND deleted_at IS NULL ORDER BY numero_ciclo',
    ).all(id,fixture.companyId) as typeof cycles;
  }finally{dbCycles.close();}
  expect(cycles).toHaveLength(2);
  expect(cycles[0].ciclo_atual).toBe(0);
  expect(cycles[1].numero_ciclo).toBe(cycles[0].numero_ciclo+1);
  expect(cycles[1].ciclo_atual).toBe(1);
  expect(cycles[1].qualificacao_historico_id).toBeNull();

  sco=await open();
  await expect(sco.locator('#submitAssessment')).toBeDisabled();
  await expect(sco.locator('#completeCourse')).toBeHidden();
  expect((await enrollment()).status).not.toBe('CONCLUIDO');
  expect(stored().m.qualificacao_historico_id).toBeNull();
  expect(stored().history.n).toBe(1);
  expect(otherEnrollmentSnapshot()).toEqual(otherBefore);


  // Local diagnostics only: this must not be imported as trusted certification.
  const browser=testInfo.project.name==='chromium'?'CHROMIUM':'WEBKIT';
  const proven=['FIRST_ACCESS','SUSPEND_RESUME','ASSESSMENT_INSUFFICIENT',
    'ASSESSMENT_APPROVED','EXPLICIT_FINALIZATION','REOPEN_COMPLETED',
    'NO_STATUS_DOWNGRADE'];
  const evidence={source:'LOCAL_DISPOSABLE_D1_R2_ONLY',browser,
    packageSha256:localZipDigest,enrollmentIsolation:'SAME_TENANT_ONLY',
    certificateDocument:'INCONCLUSIVE',crossTenantAccess:'PASS',cycleIsolation:'PASS',
    cases:[...proven.map(name=>({name,status:'PASS'})),
      {name:'TENANT_CYCLE_ISOLATION',status:'PASS'}]};
  writeFileSync(join('worker-airtrust/.wrangler/scorm-browser-qa',
    'evidence-'+browser.toLowerCase()+'.json'),
    JSON.stringify(evidence,null,2)+'\n',{mode:0o600});
});
