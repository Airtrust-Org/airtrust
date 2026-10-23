import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { evaluateBoaStagingCandidate } from '../staging/check-boa-staging-release-lineage.mjs';

const H = {
  candidateSha: 'a'.repeat(40),
  mainSha: 'b'.repeat(40),
  deployedSha: 'c'.repeat(40),
};
test('never treats green lineage as authorization to deploy staging', () => {
  const checked = [];
  const result = evaluateBoaStagingCandidate({
    ...H, isAncestor: (a, b) => { checked.push([a,b]); return true; },
  });
  assert.deepEqual(result, {
    status: 'ANCESTRY_ONLY_COMPATIBLE_NOT_RELEASE_AUTHORIZED',
    canDeploy: false,
    ancestryCompatible: true,
  });
  assert.deepEqual(checked, [[H.mainSha,H.candidateSha],[H.deployedSha,H.candidateSha]]);
});
test('blocks candidate from stale main even if CI was green', () => {
  const checked = [];
  const result = evaluateBoaStagingCandidate({
    ...H, isAncestor: (a,b) => {checked.push([a,b]); return false;},
  });
  assert.equal(result.status, 'BLOCK_CANDIDATE_BEHIND_MAIN');
  assert.equal(result.canDeploy, false);
  assert.deepEqual(checked,[[H.mainSha,H.candidateSha]]);
});
test('blocks replacement of unrelated active staging Worker', () => {
  let n = 0;
  const result = evaluateBoaStagingCandidate({
    ...H, isAncestor: () => ++n === 1,
  });
  assert.equal(result.status,'BLOCK_CANDIDATE_DIVERGES_FROM_STAGING');
  assert.equal(result.canDeploy,false);
  assert.equal(n,2);
});
test('does not allow duplicate deployment of same exact runtime SHA', () => {
  const result = evaluateBoaStagingCandidate({
    ...H,deployedSha:H.candidateSha,
    isAncestor:()=>{throw Error('must not call Git for identical SHA');},
  });
  assert.equal(result.status,'NOOP_ALREADY_DEPLOYED');
});
test('fail closed on missing hashes, git errors, missing callback or ambiguous ancestry', () => {
  assert.equal(evaluateBoaStagingCandidate({
    ...H,mainSha:'not-a-sha',isAncestor:()=>true,
  }).status,'BLOCK_UNVERIFIABLE_PROVENANCE');
  assert.equal(evaluateBoaStagingCandidate({
    ...H,
  }).status,'BLOCK_MISSING_ANCESTRY_CHECK');
  assert.equal(evaluateBoaStagingCandidate({
    ...H,isAncestor:()=>{throw Error('not fetched');},
  }).status,'BLOCK_UNVERIFIABLE_GIT_LINEAGE');
  assert.equal(evaluateBoaStagingCandidate({
    ...H,isAncestor:()=>{throw Error('Git status 128');},
  }).canDeploy,false);
});

test('BOA staging provenance workflow is branch-scoped, no secrets and GET-only', () => {
  const workflow = readFileSync(new URL(
    '../../.github/workflows/boa-staging-source-readback.yml', import.meta.url,
  ), 'utf8');
  assert.match(workflow, /name: BOA Staging Source Lineage \(Read Only\)/);
  assert.match(workflow, /  push:\n    branches:\n      - feat\/frms-boa-mensal-consolidado-20261020/);
  assert.match(workflow, /permissions:\n  contents: read/);
  assert.match(workflow, /persist-credentials: false/);
  assert.match(workflow, /git fetch origin main --quiet/);
  assert.match(workflow, /check-boa-staging-release-lineage\.mjs/);
  assert.match(workflow, /BOA_MAIN_SHA/);
  assert.match(workflow, /BOA_CANDIDATE_SHA/);
  assert.match(workflow, /if: always\(\)/);
  assert.match(workflow, /deploy authorized: \*\*NO\*\*/);
  assert.doesNotMatch(workflow, /secrets\.|CLOUDFLARE_API_TOKEN|wrangler|--apply|git push|curl\s+-X\s+(?:POST|PUT|DELETE)/i);
});
