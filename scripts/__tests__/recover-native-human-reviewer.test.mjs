import test from 'node:test';
import assert from 'node:assert/strict';
import {
  selectExistingReviewer, assertBrevoConfigured, recoverReviewer,
} from '../staging/recover-native-human-reviewer.mjs';

const good={id:15,email:'reviewer@example.org',nome:'Revisor de treinamentos',perfil:'ALUNO',role:'student'};
const env={
  STAGING_NATIVE_REVIEWER_EMAIL:'reviewer@example.org',
  STAGING_SMOKE_EMAIL:'qa-agent@staging.airtrust.invalid',
  STAGING_SMOKE_PASSWORD:'synthetic-test',
  EXPECTED_STAGING_SOURCE_SHA:'a'.repeat(40),
  STAGING_REVIEWER_CONFIRMATION:'AIRTRUST_STAGING_REVIEWER_RECOVER',
  STAGING_API_BASE_URL:'https://airtrust-api-staging.airtrust.workers.dev',
};
test('strictly identifies one pre-existing synthetic-tenant student without logging PII',()=>{
  assert.equal(selectExistingReviewer([good],good.email),15);
  assert.throws(()=>selectExistingReviewer([],good.email),/NOT_UNIQUE/);
  assert.throws(()=>selectExistingReviewer([good,good],good.email),/NOT_UNIQUE/);
  assert.throws(()=>selectExistingReviewer([{...good,role:'admin'}],good.email),/ROLE_MISMATCH/);
  assert.throws(()=>selectExistingReviewer([{...good,nome:'Other'}],good.email),/ROLE_MISMATCH/);
});
test('Brevo is strictly required from staging Worker secrets metadata',()=>{
  assert.equal(assertBrevoConfigured({success:true,result:[{name:'BREVO_API_KEY'}]}),true);
  assert.throws(()=>assertBrevoConfigured({success:true,result:[{name:'SENDGRID_API_KEY'}]}),/STAGING_SECRET_ABSENT/);
  assert.throws(()=>assertBrevoConfigured({success:false,result:[]}),/METADATA_UNAVAILABLE/);
});
function harness(collector, responseOverrides={}) {
  return async(url,options={})=>{
    const path=new URL(url).pathname;
    collector.push({path,method:options.method||'GET'});
    if(path==='/api/version')return {status:200,json:{data:{environment:'staging',sourceSha:env.EXPECTED_STAGING_SOURCE_SHA}}};
    if(path==='/api/auth/empresas')return {status:200,json:{data:{empresas:[{id:12,codigo:'airtrust_smoke',role:'admin'}],empresaAtualId:12}}};
    if(path==='/api/auth/me')return {status:200,json:{data:{email:env.STAGING_SMOKE_EMAIL}}};
    if(path==='/api/empresas/12/usuarios')return {status:200,json:{success:true,data:[good]}};
    if(path==='/api/admin/usuarios/15/invite')return responseOverrides.resend || {status:200,json:{success:true,data:{emailSent:true,inviteLink:'https://staging.airtrust.pages.dev/aceitar-convite?token=TESTONLY'}}};
    throw new Error('UNEXPECTED_TEST_REQUEST');
  };
}
const login=async()=>({data:{accessToken:'synthetic-token-value-long-enough-for-test'}});
test('read-only check never creates or resends invitation',async()=>{
 const seen=[];
 assert.equal(await recoverReviewer(env,false,harness(seen),login),'REVIEWER_EXISTING_ACCOUNT_VERIFIED');
 assert.equal(seen.filter(x=>x.method==='POST').length,0);
});
test('missing Brevo blocks resend before mutating anything',async()=>{
 const seen=[];
 await assert.rejects(()=>recoverReviewer(env,true,harness(seen),login,undefined,
   async()=>{throw Error('REVIEWER_BREVO_STAGING_SECRET_ABSENT');}),/SECRET_ABSENT/);
 assert.equal(seen.filter(x=>x.method==='POST').length,0);
});
test('resend requires Brevo and confirmed delivery, never returns token or link',async()=>{
 const seen=[];
 assert.equal(await recoverReviewer(env,true,harness(seen),login,undefined,async()=>true),'REVIEWER_INVITATION_DELIVERED');
 assert.deepEqual(seen.filter(x=>x.method==='POST').map(x=>x.path),['/api/admin/usuarios/15/invite']);
 const rejected=[];
 await assert.rejects(()=>recoverReviewer(env,true,harness(rejected,{resend:{status:200,json:{success:true,data:{emailSent:false,inviteLink:'https://staging.airtrust.pages.dev/aceitar-convite?token=TESTONLY'}}}}),login,undefined,async()=>true),/DELIVERY_UNCONFIRMED/);
});
