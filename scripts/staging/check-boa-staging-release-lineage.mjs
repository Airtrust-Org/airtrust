/**
 * BOA staging release ancestry safety check.
 *
 * Checks ONLY source lineage, not authorization, deployment health, scientific
 * approval, database schema, grants, or runtime compatibility. Read-only.
 * Never dispatches, changes Git refs, or writes staging resources.
 */
import { execFileSync, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';

const SHA = /^[0-9a-f]{40}$/;
const VERSION_URL = 'https://airtrust-api-staging.airtrust.workers.dev/api/version';

export function evaluateBoaStagingCandidate({
  candidateSha, mainSha, deployedSha, isAncestor,
}) {
  if (![candidateSha, mainSha, deployedSha].every(sha => SHA.test(sha || ''))) {
    return { status: 'BLOCK_UNVERIFIABLE_PROVENANCE', canDeploy: false };
  }
  if (typeof isAncestor !== 'function') {
    return { status: 'BLOCK_MISSING_ANCESTRY_CHECK', canDeploy: false };
  }
  if (candidateSha === deployedSha) {
    return { status: 'NOOP_ALREADY_DEPLOYED', canDeploy: false };
  }
  try {
    // A branch may have a green CI yet omit unrelated main fixes.
    if (!isAncestor(mainSha, candidateSha)) {
      return { status: 'BLOCK_CANDIDATE_BEHIND_MAIN', canDeploy: false };
    }
    // Critical: do not overwrite a separate draft PR's active Worker.
    if (!isAncestor(deployedSha, candidateSha)) {
      return { status: 'BLOCK_CANDIDATE_DIVERGES_FROM_STAGING', canDeploy: false };
    }
  } catch {
    return { status: 'BLOCK_UNVERIFIABLE_GIT_LINEAGE', canDeploy: false };
  }
  return {
    status: 'ANCESTRY_ONLY_COMPATIBLE_NOT_RELEASE_AUTHORIZED',
    canDeploy: false,
    ancestryCompatible: true,
  };
}

function gitIsAncestor(base, head) {
  const result = spawnSync('git', ['merge-base', '--is-ancestor', base, head], {
    encoding: 'utf8', timeout: 10000, stdio: 'ignore',
  });
  if (result.status === 0) return true;
  if (result.status === 1) return false;
  throw new Error('GIT_ANCESTRY_UNVERIFIABLE');
}

function requiredShaArg(name) {
  const prefix = name + '=';
  const input = process.argv.slice(2).find(arg => arg.startsWith(prefix));
  if (!input || !SHA.test(input.slice(prefix.length))) {
    throw new Error('MISSING_OR_INVALID_' + name.replaceAll('-', '_'));
  }
  return input.slice(prefix.length);
}

async function checkLiveStaging() {
  const response = await fetch(VERSION_URL, {
    method: 'GET',
    signal: AbortSignal.timeout(12000),
    headers: { Accept: 'application/json', 'Cache-Control': 'no-cache' },
  });
  if (!response.ok) throw new Error('STAGING_VERSION_HTTP_' + response.status);
  const doc = await response.json();
  const data = doc?.data;
  if (doc?.success !== true || data?.environment !== 'staging'
    || !SHA.test(data?.sourceSha || '') || typeof data?.workerVersionId !== 'string'
    || !data.workerVersionId) {
    throw new Error('STAGING_VERSION_UNVERIFIABLE');
  }
  return { sourceSha: data.sourceSha, workerVersionId: data.workerVersionId };
}

async function main() {
  const candidateSha = requiredShaArg('--candidate-sha');
  const mainSha = requiredShaArg('--main-sha');
  let deployed;
  try {
    deployed = await checkLiveStaging();
  } catch (error) {
    process.stdout.write(JSON.stringify({
      status: 'BLOCK_STAGING_READBACK_UNAVAILABLE',
      canDeploy: false,
      reason: error instanceof Error ? error.message : 'UNKNOWN',
    }) + '\n');
    process.exitCode = 2;
    return;
  }
  const result = evaluateBoaStagingCandidate({
    candidateSha, mainSha, deployedSha: deployed.sourceSha, isAncestor: gitIsAncestor,
  });
  process.stdout.write(JSON.stringify({
    ...result, candidateSha, mainSha,
    deployedSourceSha: deployed.sourceSha,
    workerVersionId: deployed.workerVersionId,
    source: VERSION_URL,
    note: 'No deploy, database query or Git change performed',
  }, null, 2) + '\n');
  // Green ancestry never grants release authorization; this script only stops
  // an unsafe candidate and is not a substitute for release workflow guards.
  if (result.status !== 'ANCESTRY_ONLY_COMPATIBLE_NOT_RELEASE_AUTHORIZED') {
    process.exitCode = 2;
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch(() => {
    process.stdout.write(JSON.stringify({
      status: 'BLOCK_UNVERIFIABLE_PREDEPLOY_CHECK', canDeploy: false,
    }) + '\n');
    process.exitCode = 2;
  });
}
