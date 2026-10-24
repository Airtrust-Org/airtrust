// GET-only synthetic Queue metadata fixtures. No real Cloudflare calls.
import test from 'node:test';
import assert from 'node:assert/strict';
import {probeExistingQueueMetadata as probe} from
  '../../ops/frms-qa-repair/probe-existing-queue-access.mjs';

const ACCOUNT='a'.repeat(32),TOKEN='synthetic-existing-staging-worker-token';
const prepared=[
  {queue_name:'airtrust-frms-qa-private-prepare-staging'},
  {queue_name:'airtrust-frms-qa-private-results-staging'}];
function fake({status=200,items=prepared,success=true,redirected=false,
  count=items.length}={}){
  const calls=[];
  return {calls,fetcher:async(uri,options)=>{
    calls.push({uri,method:options.method,redirect:options.redirect});
    assert.equal(uri,'https://api.cloudflare.com/client/v4/accounts/'+ACCOUNT+
      '/queues?per_page=100');
    assert.equal(options.method,'GET');
    assert.equal(options.redirect,'manual');
    assert.equal(options.headers.Authorization,'Bearer '+TOKEN);
    return {
      status,redirected,
      json:async()=>({success,result:items,result_info:{total_count:count}}),
    };
  }};
}
test('existing staging token metadata GET finds exact Queue names without attesting write',async()=>{
  const h=fake();
  const v=await probe({accountId:ACCOUNT,token:TOKEN,fetcher:h.fetcher});
  assert.equal(v.verdict,'EXPECTED_QUEUE_NAMES_FOUND_GET_ONLY');
  assert.equal(v.queueNamesPresent,2);
  assert.equal(v.writePermissionAttested,false);
  assert.equal(v.queueMessagesRead,0);
  assert.equal(v.cloudflareWrites,0);
  assert.equal(h.calls.length,1);
  assert.equal(JSON.stringify(v).includes(TOKEN),false);
  assert.equal(JSON.stringify(v).includes(ACCOUNT),false);
});
test('missing actual Queue names are never interpreted as provisioned',async()=>{
  for(const items of [[],[prepared[0]],[{queue_name:'some-other-app'}]]){
    const h=fake({items});
    const v=await probe({accountId:ACCOUNT,token:TOKEN,fetcher:h.fetcher});
    assert.equal(v.verdict,'QUEUE_NAMES_NOT_YET_PROVISIONED');
    assert.equal(v.writePermissionAttested,false);
  }
});
test('invalid token, permission denied, redirect, malformed JSON and pagination fail closed',async()=>{
  assert.equal((await probe({accountId:ACCOUNT,token:''})).writePermissionAttested,false);
  assert.equal((await probe({accountId:'wrong',token:TOKEN})).verdict,
    'CLOUDFLARE_QUEUE_READ_NOT_ATTESTED');
  for(const opts of [{status:403},{status:401},{redirected:true},
    {success:false},{items:[{}]},{count:101}]){
    const h=fake(opts);
    const r=await probe({accountId:ACCOUNT,token:TOKEN,fetcher:h.fetcher});
    assert.equal(r.verdict,'CLOUDFLARE_QUEUE_READ_NOT_ATTESTED');
    assert.equal(r.cloudflareWrites,0);
  }
});
