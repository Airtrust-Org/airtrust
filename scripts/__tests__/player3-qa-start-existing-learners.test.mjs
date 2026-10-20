import {test} from 'node:test';
import assert from 'node:assert/strict';
import {CONFIRM,EXPLANATION,assertGrant,assertFresh,assertStarted,
  assertRuntime,checkedGuard,applyStart} from '../staging/player3-qa-start-existing-learners.mjs';
import {LEARNERS,GATES} from '../staging/player3-qa-existing-learner-readback.mjs';
const sha='a'.repeat(40),edition='b'.repeat(64),actor='qa-admin';
const row=(i)=>({
  email:LEARNERS[i].email,empresa_id:999006,curso_id:327,
  funcionario_id:800+i,matricula_id:300+i,ciclo_id:900+i,
  edition_sha256:edition,status:'NAO_INICIADO',ciclo_status:'NAO_INICIADO',
  ciclo_atual:1,edition_status:'PUBLISHED',
});
const rows=[row(0),row(1)];
const grant=()=>({
  body:CONFIRM+' '+sha+' '+EXPLANATION,
  issue_url:'https://api.github.com/repos/Airtrust-Org/airtrust/issues/776',
  user:{login:actor},
  created_at:'2026-10-20T22:00:00.000Z',
  updated_at:'2026-10-20T22:00:00.000Z',
});
const runtime=()=>({
  sha,pr:{number:1389,state:'open',draft:true,base:{ref:'main'},
    head:{sha,repo:{full_name:'Airtrust-Org/airtrust',fork:false}}},
  checks:{total_count:10,check_runs:GATES.map(name=>({
    name,status:'completed',conclusion:'success',app:{slug:'github-actions'},
  }))},
  version:{environment:'staging',sourceSha:sha,
    workerBundleSha256:'c'.repeat(64),releaseManifestSha256:'d'.repeat(64)},
});
const jwt=(i)=>'header.'+Buffer.from(JSON.stringify({
  role:'ALUNO',empresa_id:999006,funcionario_id:800+i,
})).toString('base64url')+'.signature';
const snap=(r,status)=>({
  empresa_id:999006,matricula_id:r.matricula_id,ciclo_id:r.ciclo_id,
  edition_sha256:edition,status,
  completed_unit_ids:[],attempts:[],
  qualificacao_historico_id:null,certificate_id:null,
});
const session=(r)=>({
  editionSha256:edition,cycleId:r.ciclo_id,completionSupported:false,
  allOfficialStagesPassed:false,
  stages:[{stageId:'synthetic-stage-1',attempts:0,passed:false}],
});

test('grant exact SHA/tenant/learner count from unedited fresh repository admin only',()=>{
  assert.doesNotThrow(()=>assertGrant(grant(),'admin',actor,sha,
    Date.parse('2026-10-20T22:01:00Z')));
  const wrong=grant();wrong.body+=' production';
  assert.throws(()=>assertGrant(wrong,'admin',actor,sha,
    Date.parse('2026-10-20T22:01:00Z')),/FRESH_EXACT_ADMIN_ISSUE_776_GRANT_REQUIRED/);
  assert.throws(()=>assertGrant(grant(),'write',actor,sha,
    Date.parse('2026-10-20T22:01:00Z')),/FRESH_EXACT_ADMIN_ISSUE_776_GRANT_REQUIRED/);
  const edited=grant();edited.updated_at='2026-10-20T22:03:00Z';
  assert.throws(()=>assertGrant(edited,'admin',actor,sha,
    Date.parse('2026-10-20T22:03:00Z')),/FRESH_EXACT_ADMIN_ISSUE_776_GRANT_REQUIRED/);
  assert.throws(()=>assertGrant(grant(),'admin',actor,sha,
    Date.parse('2026-10-21T03:01:00Z')),/FRESH_EXACT_ADMIN_ISSUE_776_GRANT_REQUIRED/);
});

test('only exact 10 green GitHub Actions and matching live staging candidate',()=>{
  assert.doesNotThrow(()=>assertRuntime(runtime()));
  const wrong=runtime();wrong.version.sourceSha='f'.repeat(40);
  assert.throws(()=>assertRuntime(wrong),/STAGING_LIVE_PROVENANCE_MISMATCH/);
  const missing=runtime();missing.checks.check_runs.pop();
  assert.throws(()=>assertRuntime(missing),/NOT_GREEN/);
  const nondraft=runtime();nondraft.pr.draft=false;
  assert.throws(()=>assertRuntime(nondraft),/PR_1389_CANDIDATE_CHANGED/);
});

test('both existing identities must be fresh, independently pinned and not completed',()=>{
  assert.doesNotThrow(()=>assertFresh(rows));
  const wrong=[rows[0],{...rows[1],status:'EM_ANDAMENTO'}];
  assert.throws(()=>assertFresh(wrong),/LEARNER_NOT_FRESH_OR_NOT_PINNED/);
  assert.throws(()=>assertFresh([rows[0],{...rows[1],ciclo_id:rows[0].ciclo_id}]),
    /LEARNER_IDENTITIES_NOT_DISTINCT/);
  assert.throws(()=>assertFresh([rows[0],{...rows[1],empresa_id:5}]),
    /LEARNER_NOT_FRESH_OR_NOT_PINNED/);
  assert.throws(()=>assertFresh([rows[0]]),/TWO_EXACT_QA_LEARNERS_REQUIRED/);
  assertStarted(rows.map(r=>({...r,status:'EM_ANDAMENTO',ciclo_status:'EM_ANDAMENTO'})),rows);
  assert.throws(()=>assertStarted(rows,rows),/ATOMIC_START_NOT_PERSISTED/);
});

test('guard checks admin grant, immutable main, 10 gates, exact live staging',async()=>{
  const old=process.env.GITHUB_SHA;
  const env={
    GITHUB_TOKEN:'synthetic-test-token',GITHUB_EVENT_NAME:'workflow_dispatch',
    GITHUB_REF:'refs/heads/main',GITHUB_REPOSITORY:'Airtrust-Org/airtrust',
    PLAYER3_QA_START_CONFIRMATION:CONFIRM,PLAYER3_QA_RELEASE_SHA:sha,
    PLAYER3_QA_START_GRANT_ID:'9001',GITHUB_ACTOR:actor,
    GITHUB_SHA:'e'.repeat(40),
  };
  const live=runtime();
  const mocks={
    async gh(path){
      if(path==='/git/ref/heads/main')return {object:{sha:env.GITHUB_SHA}};
      if(path==='/issues/comments/9001')return {...grant(),
        created_at:new Date(Date.now()-60000).toISOString(),
        updated_at:new Date(Date.now()-60000).toISOString()};
      if(path.includes('/collaborators/'))return {permission:'admin'};
      if(path==='/pulls/1389')return live.pr;
      if(path.includes('/check-runs?'))return live.checks;
      throw Error('UNEXPECTED_GITHUB_PATH');
    },
    async fetch(url){assert.equal(url,'https://airtrust-api-staging.airtrust.workers.dev/api/version');
      return new Response(JSON.stringify({data:live.version}),{status:200});
    },
  };
  await assert.doesNotReject(()=>checkedGuard(env,mocks));
  await assert.rejects(()=>checkedGuard({...env,GITHUB_REF:'refs/heads/branch'},mocks),
    /TRUSTED_MAIN_DISPATCH_REQUIRED/);
  await assert.rejects(()=>checkedGuard(env,{...mocks,
    fetch:async()=>new Response('{}',{status:401})}),/VERSION_HTTP/);
});

test('uses independently scoped bearer POST /iniciar and verifies ungraded state',async()=>{
  const states=new Map(rows.map(x=>[x.matricula_id,'NAO_INICIADO']));
  const calls=[];
  const client={
    async post(path,token,body){
      calls.push({kind:'POST',path});
      if(path==='/api/auth/login'){
        const i=LEARNERS.findIndex(l=>l.email===body.email);
        assert.ok(i>=0);
        return {accessToken:jwt(i)};
      }
      const m=path.match(/^\/api\/lms\/native\/matriculas\/(\d+)\/iniciar$/);
      assert.ok(m,'Only the exact Worker start route can be mutated');
      const id=Number(m[1]);
      const i=rows.findIndex(r=>r.matricula_id===id);
      assert.equal(token,jwt(i));
      assert.deepEqual(body,{});
      assert.equal(states.get(id),'NAO_INICIADO');
      states.set(id,'EM_ANDAMENTO');
      return {status:201,state:'STARTED',ciclo_id:rows[i].ciclo_id,
        edition_sha256:edition,completion_supported:false};
    },
    async get(path,token){
      calls.push({kind:'GET',path});
      const m=path.match(/\/matriculas\/(\d+)\//);
      assert.ok(m);
      const id=Number(m[1]);
      const i=rows.findIndex(r=>r.matricula_id===id);
      assert.equal(token,jwt(i));
      if(path.endsWith('/qa-evidencias'))return snap(rows[i],states.get(id));
      if(path.endsWith('/sessao'))return session(rows[i]);
      throw Error('UNKNOWN_READ');
    },
  };
  await applyStart(rows,client,{chromium:'synthetic-A',webkit:'synthetic-B'});
  assert.equal(calls.filter(x=>x.kind==='POST'&&x.path.endsWith('/iniciar')).length,2);
  assert.equal(calls.filter(x=>x.kind==='GET'&&x.path.endsWith('/sessao')).length,2);
  assert.equal(calls.filter(x=>x.kind==='GET'&&x.path.endsWith('/qa-evidencias')).length,4);
  await assert.rejects(()=>applyStart(rows,client,
    {chromium:'synthetic-A',webkit:'synthetic-A'}),/DISTINCT_STAGING_QA_SECRETS_REQUIRED/);
});

test('never proceeds after disallowed snapshot, partial Worker receipt or forbidden grade',async()=>{
  let starts=0;
  const client={
    async post(path,token,body){
      if(path==='/api/auth/login'){
        const i=LEARNERS.findIndex(l=>l.email===body.email);
        return {accessToken:jwt(i)};
      }
      starts++;
      return {status:200,state:'ALREADY_STARTED',ciclo_id:900,
        edition_sha256:edition,completion_supported:false};
    },
    async get(path,token){
      const i=token===jwt(0)?0:1;
      return snap(rows[i],'NAO_INICIADO');
    },
  };
  await assert.rejects(()=>applyStart(rows,client,
    {chromium:'A',webkit:'B'}),/WORKER_START_RECEIPT_INVALID/);
  assert.equal(starts,1);
});
