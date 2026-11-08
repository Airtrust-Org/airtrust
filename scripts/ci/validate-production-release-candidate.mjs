#!/usr/bin/env node
// Trusted main workflow validates a pinned, previously merged release SHA.
// This is deliberately independent of the release source tree: the source is
// checked out only after this guard and the eight official gates have passed.
import { spawnSync } from 'node:child_process';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const SHA = /^[0-9a-f]{40}$/;
const VERSION_URL = 'https://api.airtrust.online/api/version';

export function validateProductionReleaseCandidate({
  releaseSha,
  workflowSha,
  deployedSha,
  isAncestor,
}) {
  for (const [label, value] of [
    ['RELEASE_SHA', releaseSha],
    ['TRUSTED_WORKFLOW_SHA', workflowSha],
    ['DEPLOYED_SOURCE_SHA', deployedSha],
  ]) {
    if (!SHA.test(value || '')) throw new Error(`${label}_INVALID`);
  }
  if (!isAncestor(releaseSha, workflowSha)) {
    throw new Error('RELEASE_SHA_NOT_MERGED_MAIN_ANCESTOR');
  }
  // A stale candidate is publishable only when it does not roll back an
  // already-published production version. Rollbacks need a separate runbook.
  if (!isAncestor(deployedSha, releaseSha)) {
    throw new Error('RELEASE_SHA_WOULD_ROLL_BACK_PRODUCTION');
  }
  return { releaseSha, workflowSha, deployedSha };
}

function git(args) {
  const result = spawnSync('git', args, { encoding: 'utf8', stdio: 'pipe' });
  if (result.error) throw new Error('GIT_TRANSPORT_ERROR', { cause: result.error });
  return result.status === 0;
}

async function main() {
  const releaseSha = (process.env.RELEASE_SHA || '').toLowerCase();
  const workflowSha = (process.env.TRUSTED_WORKFLOW_SHA || '').toLowerCase();
  if (!SHA.test(releaseSha) || !SHA.test(workflowSha)) {
    throw new Error('RELEASE_OR_WORKFLOW_SHA_INVALID');
  }
  if (!git(['cat-file', '-e', `${releaseSha}^{commit}`])) {
    throw new Error('RELEASE_SHA_NOT_AVAILABLE_IN_TRUSTED_CHECKOUT');
  }
  const response = await fetch(VERSION_URL, {
    signal: AbortSignal.timeout(10000),
    headers: { 'cache-control': 'no-cache', accept: 'application/json' },
  });
  if (!response.ok) throw new Error(`PRODUCTION_VERSION_UNAVAILABLE_HTTP_${response.status}`);
  const payload = await response.json();
  if (payload?.success !== true) throw new Error('PRODUCTION_VERSION_RESPONSE_INVALID');
  const deployedSha = String(payload?.data?.sourceSha || '').toLowerCase();
  const validated = validateProductionReleaseCandidate({
    releaseSha,
    workflowSha,
    deployedSha,
    isAncestor: (older, newer) => git(['merge-base', '--is-ancestor', older, newer]),
  });
  console.log(`[production-release-candidate] PASS pinned=${validated.releaseSha} workflow=${validated.workflowSha} predecessor=${validated.deployedSha}`);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  main().catch((error) => {
    console.error(`[production-release-candidate] FAIL: ${error.message}`);
    process.exitCode = 1;
  });
}
