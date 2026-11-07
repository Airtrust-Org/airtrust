import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, lstat, writeFile, rm, readdir, mkdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { materializeF5RunnerArtifacts } from '../staging/f5-materialize-private-runner.mjs';

const plan=Buffer.from('{"scope":"ONE_INACTIVE_CANDIDATE"}\n');
const adapter=Buffer.from('export const createF0Adapters = () => ({});\n');
async function fixture(dir) {
  const temp=join(dir,'runner-temp'),workspace=join(dir,'repo');
  const source=join(workspace,'scripts/staging/f5-f0-adapters.mjs');
  await mkdir(join(workspace,'scripts/staging'),{recursive:true});
  await mkdir(temp);
  await writeFile(source,adapter,{mode:0o644});
  return { RUNNER_TEMP:temp,GITHUB_WORKSPACE:workspace,F5_F0_ADAPTER_SOURCE:source,
    F5_EXECUTOR_PLAN_B64:plan.toString('base64') };
}
async function withTemp(fn) {
  const dir=await mkdtemp(join(tmpdir(),'airtrust-f5-private-'));
  try {await fn(dir);} finally {await rm(dir,{recursive:true,force:true});}
}

test('mounts exact protected bytes under fixed private owner-only runner paths',()=>withTemp(async dir=>{
  const env=await fixture(dir);
  const result=await materializeF5RunnerArtifacts(env);
  assert.equal(result.status,'MOUNTED');
  assert.equal(result.remoteWritesExecuted,false);
  for(const [file,expected] of [
    ['f5-executor-plan.json',plan],['f5-provisioned-f0-adapter.mjs',adapter],
  ]) {
    const path=join(env.RUNNER_TEMP,file);
    assert.deepEqual(await readFile(path),expected);
    assert.equal((await lstat(path)).mode & 0o077,0);
  }
}));

test('missing or noncanonical secret and incorrect module pin fail before writes',()=>withTemp(async dir=>{
  const base=await fixture(dir);
  for(const changes of [
    { F5_EXECUTOR_PLAN_B64:'' },
    { F5_F0_ADAPTER_SOURCE:join(dir,'outside.mjs') },
  ]) {
    await assert.rejects(materializeF5RunnerArtifacts({...base,...changes}),
      /F5_RUNNER_MOUNT_/);
    assert.deepEqual(await readdir(base.RUNNER_TEMP),[]);
  }
}));

test('exclusive mode never replaces or removes a pre-existing private adapter',()=>withTemp(async dir=>{
  const env=await fixture(dir);
  const candidate=join(env.RUNNER_TEMP,'f5-provisioned-f0-adapter.mjs');
  await writeFile(candidate,'KEEP', {mode:0o600});
  await assert.rejects(materializeF5RunnerArtifacts(env));
  assert.equal(await readFile(candidate,'utf8'),'KEEP');
  assert.deepEqual(await readdir(env.RUNNER_TEMP),['f5-provisioned-f0-adapter.mjs']);
}));
