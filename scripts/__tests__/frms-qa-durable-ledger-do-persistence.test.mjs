// Purely disposable Miniflare DO/SQLite contract tests. No Cloudflare account,
// GitHub credential, staging environment or remote D1/R2 endpoint is accessed.
import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {build} from 'esbuild';
import {Miniflare} from 'miniflare';

const sha='c'.repeat(40),grantId='6374255192';
const key='frms-qa-prepare-grant:'+sha+':'+grantId;
const claim={sha,phase:'prepare',runId:'40019815631',runAttempt:1};
const source=[
  "import {DurableObject} from 'cloudflare:workers';",
  "import {durablePrepareGrantLedger} from './ops/frms-qa-repair/durable-prepare-grant-ledger.mjs';",
  'export class TestGrantDO extends DurableObject {',
  '  async reserve(input) {',
  '    const ledger=durablePrepareGrantLedger(this.ctx.storage);',
  "    try { const reserved=await ledger.transaction(async tx=>{",
  '      if(await tx.get(input.key))return false;',
  '      await tx.put(input.key,input.claim);',
  "      if(input.forceRollback)throw Error('synthetic-abort');",
  '      return true;',
  "    }); return JSON.stringify({ok:true,reserved});",
  "    } catch(error) {return JSON.stringify({ok:false,code:String(error?.message||'UNKNOWN')});}",
  '  }',
  '  async count() {return (await this.ctx.storage.list()).size;}',
  '  async stored(key) {return JSON.stringify(await this.ctx.storage.get(key) ?? null);}',
  '}',
  "export default {fetch(){return new Response('Not found',{status:404});}}",
].join('\n');
const bundle=await build({stdin:{contents:source,resolveDir:process.cwd(),
  sourcefile:'frms-do-proof.mjs',loader:'js'},
  bundle:true,format:'esm',platform:'node',external:['cloudflare:workers'],write:false});
const script=bundle.outputFiles[0].text;
const buildMiniflare=persist=>new Miniflare({
  cf:false,durableObjectsPersist:persist,
  workers:[{
    name:'ledger-test',modules:true,script,
    compatibilityDate:'2026-10-19',compatibilityFlags:['nodejs_compat'],
    durableObjects:{GRANTS:{className:'TestGrantDO',useSQLite:true}},
  }],
});
async function getFixture(persist){
  const mf=buildMiniflare(persist);
  await mf.ready;
  const ns=await mf.getDurableObjectNamespace('GRANTS','ledger-test');
  const id=ns.idFromName('frms-f0-one-shared-caller');
  return {mf,stub:ns.get(id),namespace:ns,id};
}
const reserve=async (stub,input)=>JSON.parse(await stub.reserve(input));
const stored=async (stub,k)=>JSON.parse(await stub.stored(k));

test('24 competing RPCs to actual disposable DO/SQLite reserve once',async t=>{
  const f=await getFixture(false);
  t.after(()=>f.mf.dispose());
  const results=await Promise.all(Array.from({length:24},()=>
    reserve(f.stub,{key,claim})));
  assert.equal(results.filter(v=>v.ok&&v.reserved).length,1);
  assert.equal(results.filter(v=>v.ok&&v.reserved===false).length,23);
  assert.equal(await f.stub.count(),1);
  assert.deepEqual(await stored(f.stub,key),claim);
  const freshStub=f.namespace.get(f.id);
  assert.deepEqual(await reserve(freshStub,{key,claim}),{ok:true,reserved:false});
  assert.equal((await f.mf.dispatchFetch('https://local.invalid/prepare')).status,404);
});

test('DO SQLite persistence survives Miniflare process restart, denying replay',async t=>{
  const folder=await mkdtemp(join(tmpdir(),'frms-ledger-do-persist-'));
  t.after(async()=>{await rm(folder,{recursive:true,force:true});});
  const first=await getFixture(folder);
  try{
    assert.deepEqual(await reserve(first.stub,{key,claim}),{ok:true,reserved:true});
    assert.equal(await first.stub.count(),1);
  }finally{await first.mf.dispose();}
  const second=await getFixture(folder);
  try{
    assert.deepEqual(await reserve(second.stub,{key,claim}),{ok:true,reserved:false});
    assert.deepEqual(await stored(second.stub,key),claim);
    assert.equal(await second.stub.count(),1);
  }finally{await second.mf.dispose();}
});

test('DO transaction errors roll back and cannot leak storage internals',async t=>{
  const f=await getFixture(false);
  t.after(()=>f.mf.dispose());
  assert.deepEqual(await reserve(f.stub,{key,claim,forceRollback:true}),
    {ok:false,code:'QA_PREPARE_DURABLE_GRANT_LEDGER_DENIED'});
  assert.equal(await f.stub.count(),0);
  assert.deepEqual(await reserve(f.stub,{key,claim}),{ok:true,reserved:true});
});

test('malformed scope and grant metadata cannot persist through real DO',async t=>{
  const f=await getFixture(false);
  t.after(()=>f.mf.dispose());
  const candidates=[
    {key:'frms-qa-prepare-grant:'+sha+':../../admin',claim},
    {key,claim:{...claim,phase:'apply'}},
    {key,claim:{...claim,tenantId:999014}},
    {key,claim:{...claim,runAttempt:0}},
    {key:'frms-qa-prepare-grant:'+'f'.repeat(39)+':'+grantId,claim},
  ];
  for(const request of candidates){
    assert.deepEqual(await reserve(f.stub,request),
      {ok:false,code:'QA_PREPARE_DURABLE_GRANT_LEDGER_DENIED'});
  }
  assert.equal(await f.stub.count(),0);
});
