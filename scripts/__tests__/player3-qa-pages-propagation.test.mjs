import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {verifyQaAssetWithRetry} from '../staging/player3-qa-trusted-executor.mjs';

const prefix='https://qa-player3-staging.pages.dev/qa/player3/999006/327/fixture/';
const bytes=Buffer.from('<!doctype html><title>QA synthetic only</title>');
const item={url:prefix+'index.html',bytes:bytes.length,
  sha256:createHash('sha256').update(bytes).digest('hex')};
const reply=(status,body=bytes)=>({status,arrayBuffer:async()=>body});

test('QA Pages first deployment propagation: retries transient 404 then proves bytes',async()=>{
 const seen=[];let calls=0;
 await verifyQaAssetWithRetry(item,prefix,{
   fetcher:async()=>{calls++;return calls<3?reply(404):reply(200);},
   sleep:async duration=>seen.push(duration),attempts:3,intervalMs:4
 });
 assert.equal(calls,3);
 assert.deepEqual(seen,[4,4]);
});
test('QA Pages propagation remains bounded and refuses missing content',async()=>{
 let calls=0;
 await assert.rejects(verifyQaAssetWithRetry(item,prefix,{
   fetcher:async()=>{calls++;return reply(404);},
   sleep:async()=>{},attempts:3,intervalMs:0
 }),/PLAYER3_QA_HTTPS_NOT_FOUND/);
 assert.equal(calls,3);
});
test('403/401 must fail immediately instead of using propagation retry',async()=>{
 for(const code of [401,403]){
   let calls=0;
   await assert.rejects(verifyQaAssetWithRetry(item,prefix,{
     fetcher:async()=>{calls++;return reply(code);},
     sleep:async()=>{throw Error('must not sleep');},attempts:3
   }),/PLAYER3_QA_HTTPS_NOT_FOUND/);
   assert.equal(calls,1);
 }
});
test('200 is accepted only with exact SHA and expected byte count',async()=>{
 for(const body of [Buffer.from('incorrect'),Buffer.from('123456789012345678901234567890123456')]){
   await assert.rejects(verifyQaAssetWithRetry(item,prefix,{
     fetcher:async()=>reply(200,body),sleep:async()=>{},
     attempts:1
   }),/PLAYER3_QA_HTTPS_BYTE_HASH_INVALID/);
 }
});
test('only reviewed asset path and bounded attempts are accepted',async()=>{
 await assert.rejects(verifyQaAssetWithRetry({...item,url:prefix+'private-bank.json'},prefix,{
   fetcher:async()=>reply(200)
 }),/PLAYER3_QA_PUBLIC_ASSET_SCOPE_INVALID/);
 await assert.rejects(verifyQaAssetWithRetry(item,prefix,{
   attempts:100,fetcher:async()=>reply(200)
 }),/PLAYER3_QA_HTTPS_RETRY_SCOPE_INVALID/);
});
