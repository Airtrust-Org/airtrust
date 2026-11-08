#!/usr/bin/env node
// Trusted workflow (main) guards an immutable, previously merged production
// source. Worker and Pages may have different deployed predecessors: each
// selected target must independently be monotonic to prevent silent rollback.
import { spawnSync } from 'node:child_process';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { extractBuildVersion } from './assert-pages-build-version.mjs';

const SHA = /^[0-9a-f]{40}$/;
const WORKER_VERSION_URL = 'https://api.airtrust.online/api/version';
const PAGES_VERSION_URL = 'https://airtrust.online/login';

export function validateProductionReleaseCandidate({
  releaseSha,
  workflowSha,
  deployedWorkerSha = null,
  deployedPagesSha = null,
  deployWorker,
  deployPages,
  isAncestor,
}) {
  if (!SHA.test(releaseSha || '')) throw new Error('RELEASE_SHA_INVALID');
  if (!SHA.test(workflowSha || '')) throw new Error('TRUSTED_WORKFLOW_SHA_INVALID');
  if (deployWorker !== true && deployPages !== true) throw new Error('NO_DEPLOY_TARGET');
  if (!isAncestor(releaseSha, workflowSha)) {
    throw new Error('RELEASE_SHA_NOT_MERGED_MAIN_ANCESTOR');
  }
  for (const [target, selected, predecessor] of [
    ['WORKER', deployWorker, deployedWorkerSha],
    ['PAGES', deployPages, deployedPagesSha],
  ]) {
    if (!selected) continue;
    if (!SHA.test(predecessor || '')) throw new Error(`DEPLOYED_${target}_SOURCE_SHA_INVALID`);
    if (!isAncestor(predecessor, releaseSha)) {
      throw new Error(`RELEASE_SHA_WOULD_ROLL_BACK_${target}`);
    }
  }
  return { releaseSha, workflowSha, deployedWorkerSha, deployedPagesSha };
}

export function resolvePagesSourceSha(html, resolveUniquePrefix) {
  const version = extractBuildVersion(html);
  const match = typeof version === 'string'
    ? /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z-([a-f0-9]{7})$/.exec(version)
    : null;
  if (!match) throw new Error('PAGES_BUILD_VERSION_UNAVAILABLE');
  const sha = resolveUniquePrefix(match[1]);
  if (!SHA.test(sha || '') || !sha.startsWith(match[1])) {
    throw new Error('PAGES_SOURCE_SHA_NOT_UNIQUELY_RESOLVED');
  }
  return sha;
}

function git(args, capture = false) {
  const result = spawnSync('git', args, { encoding: 'utf8', stdio: 'pipe' });
  if (result.error) throw new Error('GIT_TRANSPORT_ERROR', { cause: result.error });
  return capture ? (result.status === 0 ? result.stdout.trim() : null) : result.status === 0;
}

async function fetchCurrent(url, json) {
  const response = await fetch(url, {
    signal: AbortSignal.timeout(10000),
    headers: { 'cache-control': 'no-cache', pragma: 'no-cache' },
  });
  if (!response.ok) throw new Error(`PRODUCTION_PREDECESSOR_UNAVAILABLE_HTTP_${response.status}`);
  return json ? response.json() : response.text();
}

async function main() {
  const releaseSha = (process.env.RELEASE_SHA || '').toLowerCase();
  const workflowSha = (process.env.TRUSTED_WORKFLOW_SHA || '').toLowerCase();
  const deployWorker = process.env.DEPLOY_WORKER === 'true';
  const deployPages = process.env.DEPLOY_PAGES === 'true';
  if (!SHA.test(releaseSha) || !SHA.test(workflowSha)) {
    throw new Error('RELEASE_OR_WORKFLOW_SHA_INVALID');
  }
  if (!git(['cat-file', '-e', `${releaseSha}^{commit}`])) {
    throw new Error('RELEASE_SHA_NOT_AVAILABLE_IN_TRUSTED_CHECKOUT');
  }

  let deployedWorkerSha = null;
  let deployedPagesSha = null;
  if (deployWorker) {
    const payload = await fetchCurrent(WORKER_VERSION_URL, true);
    if (payload?.success !== true) throw new Error('WORKER_VERSION_RESPONSE_INVALID');
    deployedWorkerSha = String(payload?.data?.sourceSha || '').toLowerCase();
  }
  if (deployPages) {
    const html = await fetchCurrent(`${PAGES_VERSION_URL}?release_guard=${releaseSha}`, false);
    deployedPagesSha = resolvePagesSourceSha(html, (prefix) => {
      const commits = git(['rev-list', '--all'], true);
      if (!commits) return null;
      const matches = commits.split('\n').filter((sha) => sha.startsWith(prefix));
      return matches.length === 1 ? matches[0] : null;
    });
  }

  const checked = validateProductionReleaseCandidate({
    releaseSha,
    workflowSha,
    deployedWorkerSha,
    deployedPagesSha,
    deployWorker,
    deployPages,
    isAncestor: (older, newer) => git(['merge-base', '--is-ancestor', older, newer]),
  });
  console.log(`[production-release-candidate] PASS pinned=${checked.releaseSha} workflow=${checked.workflowSha} worker-predecessor=${checked.deployedWorkerSha || 'not-selected'} pages-predecessor=${checked.deployedPagesSha || 'not-selected'}`);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  main().catch((error) => {
    console.error(`[production-release-candidate] FAIL: ${error.message}`);
    process.exitCode = 1;
  });
}
