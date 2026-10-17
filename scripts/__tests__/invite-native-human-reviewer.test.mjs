import test from 'node:test';
import assert from 'node:assert/strict';
import { assertReviewerConfig, getIsolatedQaTenant, acceptSafeInviteReceipt, runInvitation } from '../staging/invite-native-human-reviewer.mjs';
const env={ STAGING_NATIVE_REVIEWER_EMAIL:'human@example.org',
 STAGING_SMOKE_EMAIL:'qa-agent@staging.airtrust.invalid', STAGING_SMOKE_PASSWORD:'synthetic',
 EXPECTED_STAGING_SOURCE_SHA:'1'.repeat(40), STAGING_REVIEWER_CONFIRMATION:'AIRTRUST_STAGING_REVIEWER_INVITE',
 STAGING_API_BASE_URL:'https://airtrust-api-staging.airtrust.workers.dev' };
test('only exact staging reviewer intent and admin secret are valid',()=>{
 assert.equal(assertReviewerConfig(env,false).email, 'human@example.org');
 assert.throws(()=>assertReviewerConfig({...env,STAGING_NATIVE_REVIEWER_EMAIL:'qa-agent@staging.airtrust.invalid'},true),/REVIEWER_EMAIL/);
 assert.throws(()=>assertReviewerConfig({...env,EXPECTED_STAGING_SOURCE_SHA:'abc'},true),/REVIEWER_SHA/);
 assert.throws(()=>assertReviewerConfig({...env,STAGING_REVIEWER_CONFIRMATION:'oops'},true),/REVIEWER_CONFIRMATION/);
});
test('rejects any real tenant, non-admin QA user or invalid ID',()=>{
 assert.equal(getIsolatedQaTenant([{id:21,codigo:'airtrust_smoke',role:'admin'}]),21);
 assert.throws(()=>getIsolatedQaTenant([{id:6,codigo:'costa_do_sol',role:'admin'}]),/REVIEWER_ISOLATED/);
 assert.throws(()=>getIsolatedQaTenant([{id:21,codigo:'airtrust_smoke',role:'student'}]),/REVIEWER_ISOLATED/);
});
test('rejects API/production invite links and undelivered mail without leaking tokens',()=>{
 const r=u=>({success:true,data:{emailSent:true,conviteUrl:u}});
 assert.equal(acceptSafeInviteReceipt(r('https://staging.airtrust.pages.dev/aceitar-convite?token=fake')),
 'REVIEWER_INVITATION_DELIVERED');
 for(const u of ['https://airtrust.online/aceitar-convite?token=fake','https://airtrust-api-staging.airtrust.workers.dev/aceitar-convite?token=fake']){
 assert.throws(()=>acceptSafeInviteReceipt(r(u)),/REVIEWER_INVITE_URL_NOT_STAGING/);}
 assert.throws(()=>acceptSafeInviteReceipt({success:true,data:{emailSent:false}}),/REVIEWER_INVITE_DELIVERY_UNCONFIRMED/);
});
test('deploy SHA mismatch fails before any auth or write',async()=>{
 let requests=0;
 await assert.rejects(()=>runInvitation(env,true,async()=>{requests++;return {status:200,json:{data:{environment:'staging',sourceSha:'2'.repeat(40)}}}}),/REVIEWER_DEPLOYED_SHA_MISMATCH/);
 assert.equal(requests,1);
});
