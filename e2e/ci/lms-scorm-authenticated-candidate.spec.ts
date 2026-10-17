/**
 * Opt-in exact-ZIP local Worker/D1/R2 QA. Never emits a trusted attestation.
 * Requires an outside-ZIP reviewed driver and a short-lived QA access token
 * supplied in the process environment, not checked into this repository.
 */
import {test,expect} from '@playwright/test';
import {DatabaseSync} from 'node:sqlite';
import {createHash} from 'node:crypto';
import {readFileSync,writeFileSync} from 'node:fs';
import {join} from 'node:path';

const digest=(x:Uint8Array)=>createHash('sha256').update(x).digest('hex');
test('external ZIP: learner UI -> authenticated Worker -> D1 -> qualification and PDF',
  async ({page},info)=>{
    test.setTimeout(540000);
    const root='worker-airtrust/.wrangler/scorm-browser-qa';
    const fixture=JSON.parse(readFileSync(join(root,'fixture.json'),'utf8'));
    test.skip(fixture.fixtureKind!=='LOCAL_DISPOSABLE_REAL_ZIP',
      'No external ZIP candidate provided in disposable local QA');
    const driver=JSON.parse(readFileSync(fixture.driverPath,'utf8'));
    const sha=digest(readFileSync(fixture.zipPath));
    expect(sha).toBe(driver.packageSha256);
    expect(sha).toBe(fixture.packageSha256);
    expect(fixture.origin).toBe('http://127.0.0.1:8787');
    const token=process.env.AIRTRUST_SCORM_QA_ACCESS_TOKEN||'';
    expect(token.length,'Short-lived authenticated QA token required').toBeGreaterThan(20);
    const headers={Authorization:'Bearer '+token};
    const api=fixture.origin+'/api';
    await page.route('**/*',r=>r.request().url().startsWith(fixture.origin+'/')?
      r.continue():r.abort('blockedbyclient'));
    const bad=await page.request.post(api+'/lms/assets/session',
      {headers,data:{matricula_id:fixture.foreignTenant.matriculaId}});
    expect(bad.status()).toBe(404);
    const first=fixture.enrollments[info.project.name];
    const success=fixture.passEnrollments[info.project.name];
    expect(first).toBeGreaterThan(0);
    expect(success).toBeGreaterThan(0);
    expect(first).not.toBe(success);
    function state(id:number){
      const db=new DatabaseSync(fixture.dbFile,{readOnly:true});
      try{return {
        enrollment:db.prepare('SELECT status, qualificacao_historico_id FROM lms_matriculas WHERE empresa_id=? AND id=?')
          .get(fixture.companyId,id) as {status:string;qualificacao_historico_id:number|null},
        scorm:db.prepare('SELECT lesson_status,score_raw,suspend_data,cmi_json FROM lms_progresso_scorm WHERE empresa_id=? AND matricula_id=?')
          .get(fixture.companyId,id) as {lesson_status:string;score_raw:number;suspend_data:string;cmi_json:string}|undefined,
        history:db.prepare('SELECT id,certificado_arquivo_id FROM qualificacoes_historico WHERE empresa_id=? AND lms_matricula_id=? AND deleted_at IS NULL')
          .all(fixture.companyId,id) as Array<{id:number;certificado_arquivo_id:number|null}>,
      };} finally{db.close();}
    }
    let id=first;
    async function open(){
      const session=await page.request.post(api+'/lms/assets/session',
        {headers,data:{matricula_id:id}});
      expect(session.ok(),'Asset session HTTP '+session.status()).toBe(true);
      await page.goto(api+'/health');
      await page.setContent('<iframe id="outer" src="'+api+'/lms/scorm/launch/'+id+
        '" style="width:100vw;height:95vh"></iframe>');
      const sco=page.frameLocator('#outer').frameLocator('#scorm-frame');
      await expect(sco.locator('body')).toBeVisible({timeout:30000});
      return sco;
    }
    async function steps(sco:any,actions:any[]){
      for(const a of actions){
        const el=sco.locator(a.selector);
        if(a.op==='click')await el.click({timeout:25000});
        else if(a.op==='fill')await el.fill(a.value,{timeout:25000});
        else if(a.op==='press')await el.press(a.value,{timeout:25000});
        else throw Error('UNSUPPORTED_INDEPENDENT_DRIVER_ACTION');
      }
    }
    let sco=await open();
    for(const required of driver.requiredContent)
      await expect(sco.locator(required.selector)).toBeVisible({timeout:30000});
    await steps(sco,driver.resume.actions);
    await expect.poll(()=>state(first).scorm?.suspend_data,{timeout:35000}).not.toBeFalsy();
    const prior=state(first).scorm!.suspend_data;
    sco=await open();
    const check=driver.resume.assertion,loc=sco.locator(check.selector);
    if(check.state==='visible')await expect(loc).toBeVisible();
    else if(check.state==='hidden')await expect(loc).toBeHidden();
    else if(check.state==='enabled')await expect(loc).toBeEnabled();
    else if(check.state==='text')await expect(loc).toContainText(check.value);
    else throw Error('UNSUPPORTED_RESUME_ASSERTION');
    expect(state(first).scorm?.suspend_data).toBe(prior);
    expect(state(first).history).toHaveLength(0);
    if(driver.requiresAssessment){
      await steps(sco,driver.fail.actions);
      await expect.poll(()=>state(first).scorm?.lesson_status,{timeout:35000})
        .toBe(driver.fail.expectedStatus||'failed');
      expect(state(first).scorm!.score_raw).toBeLessThan(driver.masteryScore);
      expect(state(first).history).toHaveLength(0);
      expect(state(first).enrollment.status).not.toBe('CONCLUIDO');
    }
    id=success;sco=await open();await steps(sco,driver.pass.actions);
    await expect.poll(()=>state(success).scorm?.lesson_status,{timeout:35000})
      .toBe(driver.pass.expectedStatus||(driver.requiresAssessment?'passed':'completed'));
    if(driver.requiresAssessment)
      expect(state(success).scorm!.score_raw).toBeGreaterThanOrEqual(driver.masteryScore);
    expect(state(success).history).toHaveLength(0);
    await page.evaluate(enrollmentId=>{
      const iframe=document.getElementById('outer') as HTMLIFrameElement;
      iframe.contentWindow!.postMessage({type:'lms:request-completion',
        matriculaId:enrollmentId},location.origin);
    },success);
    await expect.poll(()=>state(success).enrollment.status,{timeout:45000})
      .toBe('CONCLUIDO');
    const done=state(success);
    expect(done.history).toHaveLength(1);
    expect(done.enrollment.qualificacao_historico_id).toBe(done.history[0].id);
    await open();
    await page.evaluate(enrollmentId=>{
      const iframe=document.getElementById('outer') as HTMLIFrameElement;
      iframe.contentWindow!.postMessage({type:'lms:request-completion',
        matriculaId:enrollmentId},location.origin);
    },success);
    expect(state(success).enrollment.status).toBe('CONCLUIDO');
    expect(state(success).history).toHaveLength(1);
    expect(state(first).history).toHaveLength(0);
    const report={
      source:'LOCAL_AUTHENTICATED_EXACT_ZIP_BACKEND_PROBE_V1',
      status:'UNCERTIFIED',activationAuthorized:false,
      packageSha256:sha,browser:info.project.name,
      observations:['TENANT_DENIAL','SUSPEND_RESUME','ASSESSMENT','EXPLICIT_CLOSURE',
        'QUALIFICATION_IDEMPOTENCE','REOPEN'],
      pdfSha256:null as string|null,
      missing:['GOVERNED_STAGING_CANDIDATE_ID','AUDITED_CYCLE_ROTATION',
        'TRUSTED_STAGING_ATTESTATION'],
    };
    const doc=state(success).history[0].certificado_arquivo_id;
    if(doc){
      const res=await page.request.get(api+'/pasta-virtual/stream/'+doc,{headers});
      if(res.ok()){
        const bytes=Buffer.from(await res.body());
        if(bytes.length>512&&bytes.subarray(0,5).toString()==='%PDF-')
          report.pdfSha256=digest(bytes);
      }
    }
    writeFileSync(join(root,'backend-'+info.project.name+'.json'),
      JSON.stringify(report,null,2)+'\n',{mode:0o600});
    expect(report.pdfSha256,'Real backend certificate PDF not delivered').toMatch(/^[a-f0-9]{64}$/);
  });
