import {test} from 'node:test';
import assert from 'node:assert/strict';
import {
  CONFIRM,SCOPE,assertBefore,assertAfter,assertAdminGrant,
  assertCandidate,recoverOnlyWebkit,authorize,
} from '../staging/player3-qa-recover-webkit.mjs';
import {GATES} from '../staging/player3-qa-existing-learner-readback.mjs';

const sha='a'.repeat(40),edition='b'.repeat(64);
const fresh=()=>[
  {browser:'chromium',email:'qa-player3-chromium@staging.airtrust.invalid',
    empresa_id:999006,curso_id:327,matricula_id:187,ciclo_id:177,
    funcionario_id:2,status:'EM_ANDAMENTO',ciclo_status:'EM_ANDAMENTO',
    ciclo_atual:1,edition_status:'PUBLISHED',edition_sha256:edition},
  {browser:'webkit',email:'qa-player3-webkit@staging.airtrust.invalid',
    empresa_id:999006,curso_id:327,matricula_id:188,ciclo_id:178,
    funcionario_id:3,status:'NAO_INICIADO',ciclo_status:'NAO_INICIADO',
    ciclo_atual:1,edition_status:'PUBLISHED',edition_sha256:edition},
];
const jwt='hdr.'+Buffer.from(JSON.stringify({
  role:'ALUNO',empresa_id:999006,funcionario_id:3,
})).toString('base64url')+'.sig';
const snapshot=(status)=>({
  empresa_id:999006,matricula_id:188,ciclo_id:178,
  edition_sha256:edition,status,
  completed_unit_ids:[],attempts:[],certificate_id:null,
  qualificacao_historico_id:null,
});
const issueGrant=(when)=>({
  issue_url:'https://api.github.com/repos/Airtrust-Org/airtrust/issues/776',
  body:CONFIRM+' '+sha+' '+SCOPE,
  user:{login:'qa-admin'},created_at:when,updated_at:when,
});
const candidate=()=>({
  pr:{number:1389,state:'open',draft:true,base:{ref:'main'},
    head:{sha,repo:{full_name:'Airtrust-Org/airtrust',fork:false}}},
  checks:{total_count:10,check_runs:GATES.map(name=>({
    name,status:'completed',conclusion:'success',app:{slug:'github-actions'},
  }))},
  version:{environment:'staging',sourceSha:sha,
    workerBundleSha256:'c'.repeat(64),releaseManifestSha256:'d'.repeat(64)},
});

test('physical recovery never restarts Chromium or any other learner',()=>{
  const rows=fresh();
  assert.doesNotThrow(()=>assertBefore(rows));
  const altered=fresh();altered[0].status='NAO_INICIADO';
  assert.throws(()=>assertBefore(altered),/PHYSICAL_QA_STATE_OR_SCOPE_CHANGED/);
  const altered2=fresh();altered2[1].status='EM_ANDAMENTO';
  assert.throws(()=>assertBefore(altered2),/PHYSICAL_QA_STATE_OR_SCOPE_CHANGED/);
  const altered3=fresh();altered3[1].matricula_id=189;
  assert.throws(()=>assertBefore(altered3),/PHYSICAL_QA_STATE_OR_SCOPE_CHANGED/);
  const altered4=fresh();altered4[0].edition_sha256='f'.repeat(64);
  assert.throws(()=>assertBefore(altered4),/QA_IDENTITIES_OR_EDITIONS_NOT_INDEPENDENT/);
});

test('D1 postread demands both started but exactly same cycle and edition',()=>{
  const before=fresh(), after=fresh();
  after[1].status='EM_ANDAMENTO';
  after[1].ciclo_status='EM_ANDAMENTO';
  assert.doesNotThrow(()=>assertAfter(after,before));
  after[1].ciclo_id=179;
  assert.throws(()=>assertAfter(after,before),/D1_POSTREAD_INVALID_OR_CYCLE_REPLACED/);
  after[1].ciclo_id=178;
  after[0].status='NAO_INICIADO';
  assert.throws(()=>assertAfter(after,before),/D1_POSTREAD_INVALID_OR_CYCLE_REPLACED/);
});

test('recovery requires fresh exact unedited admin issue 776 authorization',()=>{
  const t='2026-10-20T22:00:00Z';
  assert.doesNotThrow(()=>assertAdminGrant(issueGrant(t),'admin','qa-admin',
    sha,Date.parse('2026-10-20T22:01:00Z')));
  assert.throws(()=>assertAdminGrant(issueGrant(t),'write','qa-admin',
    sha,Date.parse('2026-10-20T22:01:00Z')),/FRESH_EXACT_ADMIN_GRANT_REQUIRED/);
  const changed=issueGrant(t);changed.updated_at='2026-10-20T22:01:00Z';
  assert.throws(()=>assertAdminGrant(changed,'admin','qa-admin',
    sha,Date.parse('2026-10-20T22:01:00Z')),/FRESH_EXACT_ADMIN_GRANT_REQUIRED/);
  const extra=issueGrant(t);extra.body+=' also chromium';
  assert.throws(()=>assertAdminGrant(extra,'admin','qa-admin',
    sha,Date.parse('2026-10-20T22:01:00Z')),/FRESH_EXACT_ADMIN_GRANT_REQUIRED/);
  assert.throws(()=>assertAdminGrant(issueGrant(t),'admin','qa-admin',
    sha,Date.parse('2026-10-21T02:01:00Z')),/FRESH_EXACT_ADMIN_GRANT_REQUIRED/);
});

test('exact F4 OPEN/DRAFT and all ten green checks plus live provenance',()=>{
  let c=candidate();assert.doesNotThrow(()=>assertCandidate(c.pr,c.checks,c.version,sha));
  c=candidate();c.version.sourceSha='e'.repeat(40);
  assert.throws(()=>assertCandidate(c.pr,c.checks,c.version,sha),
    /LIVE_STAGING_PROVENANCE_MISMATCH/);
  c=candidate();c.checks.check_runs.pop();
  assert.throws(()=>assertCandidate(c.pr,c.checks,c.version,sha),
    /CI_GATE_NOT_GREEN/);
  c=candidate();c.pr.head.sha='f'.repeat(40);
  assert.throws(()=>assertCandidate(c.pr,c.checks,c.version,sha),
    /F4_HEAD_OR_REVIEW_CHANGED/);
});

test('only WebKit POST /iniciar is issued, then empty own evidence and session',async()=>{
  let status='NAO_INICIADO',writeCount=0,seenGet=0;
  const stub=async(path,opts={})=>{
    if(path==='/api/auth/login'){
      assert.deepEqual({method:opts.method,email:opts.body.email},
        {method:'POST',email:'qa-player3-webkit@staging.airtrust.invalid'});
      return {accessToken:jwt};
    }
    assert.equal(opts.token,jwt);
    assert.match(path,/\/matriculas\/188\//);
    if(path.endsWith('/iniciar')){
      writeCount++;
      assert.equal(opts.method,'POST');
      assert.deepEqual(opts.body,{});
      assert.equal(status,'NAO_INICIADO');
      status='EM_ANDAMENTO';
      return {status:201,state:'STARTED',ciclo_id:178,edition_sha256:edition,
        completion_supported:false};
    }
    if(path.endsWith('/etapas/qa-evidencias')){
      seenGet++;
      return snapshot(status);
    }
    if(path.endsWith('/etapas/sessao'))return {
      editionSha256:edition,cycleId:178,completionSupported:false,
      allOfficialStagesPassed:false,
      stages:[{stageId:'m1',attempts:0,passed:false,lastScorePct:null}],
    };
    throw Error('unexpected API route');
  };
  await recoverOnlyWebkit(fresh(),stub,'synthetic-password');
  assert.equal(writeCount,1);
  assert.equal(seenGet,2);
  await assert.rejects(()=>recoverOnlyWebkit(fresh(),stub,''),/PROTECTED_WEBKIT_QA_PASSWORD_REQUIRED/);
});

test('a denied/malformed Worker receipt stops without declaring success',async()=>{
  let writeCount=0;
  const stub=async(path)=>{
    if(path==='/api/auth/login')return {accessToken:jwt};
    if(path.endsWith('/qa-evidencias'))return snapshot('NAO_INICIADO');
    if(path.endsWith('/iniciar')){writeCount++;return {
      status:409,state:'ALREADY_STARTED',ciclo_id:178,edition_sha256:edition,
      completion_supported:false,
    }}
    throw Error('unexpected route');
  };
  await assert.rejects(()=>recoverOnlyWebkit(fresh(),stub,'pw'),
    /WEBKIT_START_RECEIPT_UNEXPECTED/);
  assert.equal(writeCount,1);
});

test('trusted guard binds main, fresh grant and exact live staged release',async()=>{
  const now=new Date(Date.now()-60000).toISOString();
  const e={GITHUB_EVENT_NAME:'workflow_dispatch',GITHUB_REF:'refs/heads/main',
    GITHUB_REPOSITORY:'Airtrust-Org/airtrust',GITHUB_TOKEN:'synthetic',
    GITHUB_ACTOR:'qa-admin',GITHUB_SHA:'e'.repeat(40),
    PLAYER3_RECOVERY_CONFIRMATION:CONFIRM,
    PLAYER3_RECOVERY_RELEASE_SHA:sha,PLAYER3_RECOVERY_GRANT_ID:'9001'};
  const c=candidate();
  const mock={
    async gh(path){
      if(path==='/git/ref/heads/main')return {object:{sha:e.GITHUB_SHA}};
      if(path==='/issues/comments/9001')return issueGrant(now);
      if(path.includes('/collaborators/'))return {permission:'admin'};
      if(path==='/pulls/1389')return c.pr;
      if(path.includes('/check-runs?'))return c.checks;
      throw Error('Unexpected GitHub path');
    },
    async fetch(path){
      assert.equal(path,'https://airtrust-api-staging.airtrust.workers.dev/api/version');
      return new Response(JSON.stringify({data:c.version}),{status:200});
    },
  };
  await assert.doesNotReject(()=>authorize(e,mock));
  await assert.rejects(()=>authorize({...e,GITHUB_REF:'refs/heads/feature'},mock),
    /TRUSTED_MAIN_DISPATCH_REQUIRED/);
});
