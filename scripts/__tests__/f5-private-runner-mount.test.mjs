import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdtemp, readFile, lstat, writeFile, rm, readdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { materializeF5RunnerArtifacts } from '../staging/f5-materialize-private-runner.mjs';

const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const plan=Buffer.from('{"scope":"ONE_INACTIVE_CANDIDATE"}\n');
const adapter=Buffer.from('export const createF0Adapters = () => ({});\n');
function fixture(dir) {
  return { RUNNER_TEMP:dir, F5_EXECUTOR_PLAN_B64:plan.toString('base64'),
    F5_F0_ADAPTER_B64:adapter.toString('base64'),
    F5_F0_ADAPTER_SHA256:hash(adapter) };
}
async function withTemp(fn) {
  const dir=await mkdtemp(join(tmpdir(),'airtrust-f5-private-'));
  try {await fn(dir);} finally {await rm(dir,{recursive:true,force:true});}
}

test('mounts exact protected bytes under fixed private owner-only runner paths',()=>withTemp(async dir=>{
  const result=await materializeF5RunnerArtifacts(fixture(dir));
  assert.equal(result.status,'MOUNTED');
  assert.equal(result.remoteWritesExecuted,false);
  for(const [file,expected] of [
    ['f5-executor-plan.json',plan],['f5-provisioned-f0-adapter.mjs',adapter],
  ]) {
    const path=join(dir,file);
    assert.deepEqual(await readFile(path),expected);
    assert.equal((await lstat(path)).mode & 0o077,0);
  }
}));

test('missing or noncanonical secret and incorrect module pin fail before writes',()=>withTemp(async dir=>{
  for(const changes of [
    { F5_EXECUTOR_PLAN_B64:'' },
    { F5_F0_ADAPTER_B64:'AAAA-===' },
    { F5_F0_ADAPTER_SHA256:'0'.repeat(64) },
  ]) {
    await assert.rejects(materializeF5RunnerArtifacts({...fixture(dir),...changes}),
      /F5_RUNNER_MOUNT_/);
    assert.deepEqual(await readdir(dir),[]);
  }
}));

test('exclusive mode never replaces or removes a pre-existing private adapter',()=>withTemp(async dir=>{
  const candidate=join(dir,'f5-provisioned-f0-adapter.mjs');
  await writeFile(candidate,'KEEP', {mode:0o600});
  await assert.rejects(materializeF5RunnerArtifacts(fixture(dir)));
  assert.equal(await readFile(candidate,'utf8'),'KEEP');
  assert.deepEqual(await readdir(dir),['f5-provisioned-f0-adapter.mjs']);
}));
