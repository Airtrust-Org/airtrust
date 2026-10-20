import {test} from 'node:test';
import assert from 'node:assert/strict';
import {
  TENANT,COURSE,GATES,LEARNERS,
  assertGuard,assertRoster,assertClaims,assertOwnSnapshot,
  assertModuleSession,verifyLearners,readVersionResponse,
  requireHttpOk,ownData,github,guard as guardWorkflow,
} from '../staging/player3-qa-existing-learner-readback.mjs';

const sha='a'.repeat(40);
const edition='b'.repeat(64);
const row=(browser,index)=>({
  email:LEARNERS.find(l=>l.browser===browser).email,empresa_id:TENANT,
  curso_id:COURSE,matricula_id:200+index,ciclo_id:900+index,
  funcionario_id:800+index,status:index===1?'NAO_INICIADO':'EM_ANDAMENTO',
  ciclo_status:index===1?'NAO_INICIADO':'EM_ANDAMENTO',ciclo_atual:1,
  edition_status:'PUBLISHED',edition_sha256:edition,
});
const rows=[row('chromium',1),row('webkit',2)];
const meta={changed_db:false,rows_written:0};
const checkRuns=GATES.map(name=>({
  name,status:'completed',conclusion:'success',app:{slug:'github-actions'},
}));
const guard=()=>({
  event:'workflow_dispatch',ref:'refs/heads/main',repo:'Airtrust-Org/airtrust',
  confirmation:'AIRTRUST_PLAYER3_READBACK_ONLY',
  sha,actor:'qa-admin',
  pr:{number:1389,state:'open',draft:true,base:{ref:'main'},
    head:{sha,repo:{full_name:'Airtrust-Org/airtrust',fork:false}}},
  checks:{total_count:10,check_runs:checkRuns},
  live:{environment:'staging',sourceSha:sha,
    releaseManifestSha256:'c'.repeat(64),workerBundleSha256:'d'.repeat(64)},
});
const jwt=(i)=>'hdr.'+Buffer.from(JSON.stringify({
  empresa_id:TENANT,funcionario_id:800+i,role:'ALUNO',
})).toString('base64url')+'.sig';

test('staging gate requires exact current PR + 10 official green checks',()=>{
  assert.doesNotThrow(()=>assertGuard(guard()));
  assert.throws(()=>assertGuard({...guard(),live:{...guard().live,sourceSha:'f'.repeat(40)}}),
    /LIVE_PROVENANCE_MISMATCH/);
  const wrong=guard();wrong.checks.check_runs=checkRuns.slice(1);
  assert.throws(()=>assertGuard(wrong),/GATE_NOT_GREEN/);
  const nondraft=guard();nondraft.pr.draft=false;
  assert.throws(()=>assertGuard(nondraft),/F4_CANDIDATE_CHANGED/);
  const wrongActor=guard();wrongActor.ref='refs/heads/feature';
  assert.throws(()=>assertGuard(wrongActor),/TRUSTED_MAIN_CONFIRMATION/);
});

test('SQL readback proves only two distinct tenant-scoped Native enrollments',()=>{
  assert.equal(assertRoster(rows,meta).length,2);
  assert.throws(()=>assertRoster(rows,{changed_db:true,rows_written:1}),
    /REMOTE_QUERY_NOT_PROVEN_READ_ONLY/);
  assert.throws(()=>assertRoster([rows[0]],meta),/TWO_NATIVE_QA_ENROLLMENTS_REQUIRED/);
  assert.throws(()=>assertRoster([rows[0],{...rows[1],ciclo_id:rows[0].ciclo_id}],meta),
    /NONINDEPENDENT_QA_IDENTITIES/);
  assert.throws(()=>assertRoster([rows[0],{...rows[1],empresa_id:3}],meta),
    /PHYSICAL_LEARNER_EDITION_OR_CYCLE_INVALID/);
  assert.throws(()=>assertRoster([rows[0],{...rows[1],status:'CONCLUIDO'}],meta),
    /PHYSICAL_LEARNER_EDITION_OR_CYCLE_INVALID/);
  assert.throws(()=>assertRoster([rows[0],{...rows[1],ciclo_status:'NAO_INICIADO'}],meta),
    /PHYSICAL_LEARNER_EDITION_OR_CYCLE_INVALID/);
  assert.throws(()=>assertRoster([rows[0],{...rows[1],ciclo_atual:0}],meta),
    /PHYSICAL_LEARNER_EDITION_OR_CYCLE_INVALID/);

});

test('claim and HTTP evidence cannot cross employee, edition or course scope',()=>{
  assertClaims(jwt(1),rows[0]);
  assert.throws(()=>assertClaims(jwt(1),rows[1]),/LEARNER_JWT/);
  const snapshot={empresa_id:TENANT,matricula_id:201,ciclo_id:901,
    edition_sha256:edition,status:'EM_ANDAMENTO',
    completed_unit_ids:[],attempts:[],qualificacao_historico_id:null,
    certificate_id:null};
  assertOwnSnapshot(snapshot,rows[0]);
  assert.throws(()=>assertOwnSnapshot({...snapshot,certificate_id:5},rows[0]),
    /SNAPSHOT_NOT_FRESH/);
  assertModuleSession({editionSha256:edition,cycleId:901,
    completionSupported:false,stages:[{
      stageId:'qa-stage-1',attempts:0,
    }]},rows[0]);
  assert.throws(()=>assertModuleSession({editionSha256:edition,cycleId:901,
    completionSupported:true,stages:[]},rows[0]),/STAGE_SESSION_EDITION_OR_POLICY_MISMATCH/);
});

test('real executor selects two independent JWTs and denies cross-owned reads',async()=>{
  const previous={...process.env};
  process.env.PLAYER3_QA_CHROMIUM_PASSWORD='synthetic-chrome-only';
  process.env.PLAYER3_QA_WEBKIT_PASSWORD='synthetic-webkit-only';
  let attempts=0,foreign=0;
  const tokenByEmail=Object.fromEntries(LEARNERS.map((r,i)=>[r.email,jwt(i+1)]));
  const mock={
    async api(path,options){
      if(path==='/api/auth/login'){
        attempts++;
        const token=tokenByEmail[options.body.email];
        return new Response(JSON.stringify({success:true,data:{accessToken:token}}),{status:200});
      }
      assert.match(path,/qa-evidencias$/);
      foreign++;
      return {status:409};
    },
    async ownData(path,token){
      const index=token===jwt(1)?1:2;
      const r=rows[index-1];
      assert.ok(path.includes(String(r.matricula_id)));
      if(path.endsWith('sessao'))
        return {editionSha256:edition,cycleId:r.ciclo_id,completionSupported:false,
          stages:[{stageId:'qa-stage-1',attempts:0}]};
      if(path.endsWith('qa-evidencias'))
        return {empresa_id:TENANT,matricula_id:r.matricula_id,ciclo_id:r.ciclo_id,
          edition_sha256:edition,status:'EM_ANDAMENTO',
          completed_unit_ids:[],attempts:[],
          qualificacao_historico_id:null,certificate_id:null};
      throw Error('unexpected read route');
    },
  };
  try{
    await verifyLearners(assertRoster(rows,meta),mock);
    assert.equal(attempts,2);
    assert.equal(foreign,2);
    process.env.PLAYER3_QA_WEBKIT_PASSWORD=process.env.PLAYER3_QA_CHROMIUM_PASSWORD;
    await assert.rejects(()=>verifyLearners(rows,mock),/DISTINCT_PROTECTED_PASSWORDS_REQUIRED/);
  }finally{
    for(const k of ['PLAYER3_QA_CHROMIUM_PASSWORD','PLAYER3_QA_WEBKIT_PASSWORD']){
      if(previous[k]===undefined)delete process.env[k];else process.env[k]=previous[k];
    }
  }
});

test('fetch Response.ok is a boolean: real 200 passes, HTTP rejection fails closed',async()=>{
  const ok=new Response(JSON.stringify({success:true,data:{
    environment:'staging',sourceSha:sha,releaseManifestSha256:'c'.repeat(64),
    workerBundleSha256:'d'.repeat(64),
  }}),{status:200,headers:{'Content-Type':'application/json'}});
  assert.equal((await readVersionResponse(ok)).sourceSha,sha);
  await assert.rejects(()=>readVersionResponse(new Response('{}',{status:503})),
    /VERSION_HTTP/);
  await assert.rejects(()=>readVersionResponse(new Response('invalid json',{status:200})),
    /VERSION_JSON_INVALID/);
  await assert.rejects(()=>readVersionResponse(new Response('{}',{status:200})),
    /VERSION_DATA_MISSING/);
});

test('all HTTP result checks require native boolean Response.ok, never a function',()=>{
  assert.doesNotThrow(()=>requireHttpOk(new Response('{}',{status:200}),'HTTP_OK'));
  assert.throws(()=>requireHttpOk({ok:()=>true},'INVALID_MOCK_RESPONSE'),
    /INVALID_MOCK_RESPONSE/);
  assert.throws(()=>requireHttpOk(new Response('{}',{status:503}),'HTTP_FAILED'),
    /HTTP_FAILED/);
});

test('GitHub and learner GET verify actual HTTP status before parsing response body',async()=>{
  const before=process.env.GITHUB_TOKEN;
  process.env.GITHUB_TOKEN='synthetic-only-token';
  try{
    let pathSeen='';
    const accepted=await github('/pulls/1389',async(url,{headers})=>{
      pathSeen=url;
      assert.equal(headers.Authorization,'Bearer synthetic-only-token');
      return new Response(JSON.stringify({number:1389}),{status:200});
    });
    assert.equal(accepted.number,1389);
    assert.match(pathSeen,/\/pulls\/1389$/);
    await assert.rejects(
      ()=>github('/pulls/1389',async()=>new Response('{}',{status:403})),
      /GITHUB_QUERY_FAILED/);
    const snap=await ownData('/private-check','synthetic-jwt',async(path,{token})=>{
      assert.equal(path,'/private-check');
      assert.equal(token,'synthetic-jwt');
      return new Response(JSON.stringify({success:true,data:{matricula_id:201}}),{status:200});
    });
    assert.equal(snap.matricula_id,201);
    await assert.rejects(
      ()=>ownData('/private-check','synthetic-jwt',async()=>new Response('{}',{status:409})),
      /LEARNER_GET_STATUS_409/);
  }finally{
    if(before===undefined)delete process.env.GITHUB_TOKEN;
    else process.env.GITHUB_TOKEN=before;
  }
});

test('full protected guard uses real Response.ok for GitHub and staging version',async()=>{
  const keys=['GITHUB_TOKEN','PLAYER3_QA_RELEASE_SHA','GITHUB_EVENT_NAME',
    'GITHUB_REF','GITHUB_REPOSITORY','GITHUB_ACTOR','PLAYER3_QA_CONFIRMATION'];
  const old=Object.fromEntries(keys.map(k=>[k,process.env[k]]));
  Object.assign(process.env,{
    GITHUB_TOKEN:'test-only',PLAYER3_QA_RELEASE_SHA:sha,
    GITHUB_EVENT_NAME:'workflow_dispatch',GITHUB_REF:'refs/heads/main',
    GITHUB_REPOSITORY:'Airtrust-Org/airtrust',GITHUB_ACTOR:'qa-admin',
    PLAYER3_QA_CONFIRMATION:'AIRTRUST_PLAYER3_READBACK_ONLY',
  });
  const positive=guard();
  const mocks={
    async github(path){
      if(path==='/pulls/1389')return positive.pr;
      if(path.includes('/check-runs?'))return positive.checks;
      if(path.includes('/collaborators/'))return {permission:'admin'};
      throw Error('UNKNOWN_TEST_GITHUB_PATH');
    },
    async api(path){
      assert.equal(path,'/api/version');
      return new Response(JSON.stringify({success:true,data:positive.live}),{status:200});
    },
  };
  try{
    await assert.doesNotReject(()=>guardWorkflow(mocks));
    await assert.rejects(()=>guardWorkflow({...mocks,
      api:async()=>new Response('{}',{status:502})}),/VERSION_HTTP/);
    await assert.rejects(()=>guardWorkflow({...mocks,
      github:async path=>path==='/pulls/1389'?positive.pr:
        path.includes('check-runs')?positive.checks:
        {permission:'read'}}),/WORKFLOW_ACTOR_PERMISSION_DENIED/);
  }finally{
    for(const k of keys){
      if(old[k]===undefined)delete process.env[k];else process.env[k]=old[k];
    }
  }
});
