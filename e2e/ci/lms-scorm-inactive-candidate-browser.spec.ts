/**
 * SECURITY REGRESSION: inactive SCORM QA edition opens in real disposable
 * Worker/D1/R2 with an HttpOnly scoped cookie, without changing active
 * course or learner CMI. Only synthetic QA ZIPs, NEVER functional certification.
 */
import {expect,test} from '@playwright/test';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {DatabaseSync} from 'node:sqlite';
import {unzipSync} from 'fflate';

const digest=(data:Uint8Array)=>createHash('sha256').update(data).digest('hex');
test('inactive candidate QA: SHA, role, tenant, scoped cookie, active isolation',
  async({page})=>{
    test.setTimeout(120000);
    const fixture=JSON.parse(readFileSync(
      'worker-airtrust/.wrangler/scorm-browser-qa/fixture.json','utf8'));
    test.skip(fixture.fixtureKind!=='LOCAL_DISPOSABLE_ZIP',
      'This is the existing synthetic fixture; external ZIP QA has separate evidence');
    expect(fixture.origin).toBe('http://127.0.0.1:8787');
    const bytes=readFileSync(fixture.zipPath);
    const sha=digest(bytes);
    expect(sha).toBe(fixture.packageSha256);
    const indexBytes=unzipSync(new Uint8Array(bytes))['index.html'];
    expect(indexBytes).toBeTruthy();
    const root=fixture.origin+'/api';
    const login=await page.request.post(root+'/auth/login',
      {data:{email:'admin@airtrust.com',senha:'Admin@123'}});
    expect(login.ok()).toBe(true);
    const accessToken=(await login.json()).data.accessToken;
    const headers={Authorization:'Bearer '+accessToken};
    const db=new DatabaseSync(fixture.dbFile,{readOnly:true});
    function snapshot(){
      return {
        course:db.prepare('SELECT scorm_package_r2_prefix FROM lms_cursos WHERE id=? AND empresa_id=?')
          .get(fixture.courseId,fixture.companyId) as {scorm_package_r2_prefix:string},
        progress:(db.prepare('SELECT COUNT(*) AS n FROM lms_progresso_scorm WHERE empresa_id=?')
          .get(fixture.companyId) as {n:number}).n,
      };
    }
    try{
      const prior=snapshot();
      const upload=await page.request.post(root+'/lms/cursos/'+fixture.courseId+'/upload/scorm',
        {headers:{...headers,'Content-Type':'application/zip'},data:bytes});
      expect(upload.status()).toBe(202);
      const candidate=(await upload.json()).data as {
        packageId:string;packageSha256:string;status:string;
      };
      expect(candidate.status).toBe('VALIDATED');
      expect(candidate.packageSha256).toBe(sha);
      expect(candidate.packageId).toMatch(/^[a-f0-9-]{36}$/);
      const asset='/lms/scorm/qa-assets/'+fixture.companyId+'/'+fixture.courseId+
        '/'+candidate.packageId+'/index.html';
      const preview='/lms/scorm/qa-preview/'+fixture.courseId+'/'+candidate.packageId;
      const anonymous=await page.request.get(root+asset);
      expect(anonymous.status()).toBe(401);
      const wrong=await page.request.post(root+'/lms/assets/session',{
        headers,data:{curso_id:fixture.courseId,preview:true,
          candidate_package_id:candidate.packageId,
          candidate_package_sha256:'0'.repeat(64)},
      });
      expect(wrong.status()).toBe(409);
      const session=await page.request.post(root+'/lms/assets/session',{
        headers,data:{curso_id:fixture.courseId,preview:true,
          candidate_package_id:candidate.packageId,
          candidate_package_sha256:sha},
      });
      expect(session.status()).toBe(200);
      expect(session.headers()['set-cookie']).toContain('HttpOnly');
      expect(session.headers()['set-cookie']).toContain('Path=/api/lms/');
      const escaped=await page.request.get(
        root+'/lms/scorm/assets/'+fixture.companyId+'/'+fixture.courseId+'/index.html');
      expect(escaped.status()).toBe(403);
      const foreign=await page.request.get(
        root+'/lms/scorm/qa-assets/'+fixture.foreignTenant.empresaId+'/'+fixture.courseId+
          '/'+candidate.packageId+'/index.html');
      expect([403,404]).toContain(foreign.status());
      const assetResponse=await page.request.get(root+asset);
      expect(assetResponse.status()).toBe(200);
      expect(digest(new Uint8Array(await assetResponse.body()))).toBe(digest(indexBytes));
      await page.goto(root+'/health');
      await page.setContent('<iframe id="outer" src="'+root+preview+
        '" title="Candidato inativo" style="width:100vw;height:90vh"></iframe>');
      const sco=page.frameLocator('#outer').frameLocator('#scorm-frame');
      await expect(sco.getByRole('heading',{name:'Avaliação QA'})).toBeVisible({timeout:30000});
      const after=snapshot();
      expect(after.course).toEqual(prior.course);
      expect(after.progress).toBe(prior.progress);
    }finally{db.close();}
  });
