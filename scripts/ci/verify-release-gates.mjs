#!/usr/bin/env node
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const REQUIRED_GITHUB_CHECKS = Object.freeze([
  'lint',
  'build-content-gates',
  'worker-typecheck',
]);

const REQUIRED_GCB_STATUS = 'airtrust-gcb';

export function verifyReleaseGatePayloads({ checkRuns, statuses }) {
  if (!Array.isArray(checkRuns)) {
    throw new Error('RELEASE_CHECK_RUNS_UNAVAILABLE');
  }
  if (!Array.isArray(statuses)) {
    throw new Error('RELEASE_STATUSES_UNAVAILABLE');
  }

  const failures = [];

  for (const requiredName of REQUIRED_GITHUB_CHECKS) {
    const candidates = checkRuns.filter((check) => check?.name === requiredName);
    if (candidates.length === 0) {
      failures.push(`${requiredName}:missing`);
      continue;
    }

    const passed = candidates.some(
      (check) => check.status === 'completed' && check.conclusion === 'success',
    );
    if (!passed) failures.push(`${requiredName}:not-success`);
  }

  const gcbCandidates = statuses.filter((status) => status?.context === REQUIRED_GCB_STATUS);
  if (gcbCandidates.length === 0) {
    failures.push(`${REQUIRED_GCB_STATUS}:missing`);
  } else if (!gcbCandidates.some((status) => status.state === 'success')) {
    failures.push(`${REQUIRED_GCB_STATUS}:not-success`);
  }

  if (failures.length > 0) {
    throw new Error(`RELEASE_GATES_NOT_GREEN:${failures.join(',')}`);
  }

  return {
    githubActions: [...REQUIRED_GITHUB_CHECKS],
    googleCloudBuild: REQUIRED_GCB_STATUS,
  };
}

async function githubGet(path, token) {
  const response = await fetch(`https://api.github.com${path}`, {
    headers: {
      authorization: `Bearer ${token}`,
      accept: 'application/vnd.github+json',
      'x-github-api-version': '2022-11-28',
    },
  });
  if (!response.ok) {
    throw new Error(`${path} returned HTTP ${response.status}`);
  }
  return response.json();
}

export async function verifyReleaseGates({ repository, sha, token }) {
  if (!repository || !/^[^/]+\/[^/]+$/.test(repository)) {
    throw new Error('GITHUB_REPOSITORY_INVALID');
  }
  if (!/^[0-9a-f]{40}$/i.test(sha || '')) {
    throw new Error('RELEASE_SHA_INVALID');
  }
  if (!token) throw new Error('GITHUB_TOKEN_MISSING');

  const encodedSha = encodeURIComponent(sha.toLowerCase());
  const [checksPayload, statusesPayload] = await Promise.all([
    githubGet(`/repos/${repository}/commits/${encodedSha}/check-runs?per_page=100`, token),
    githubGet(`/repos/${repository}/commits/${encodedSha}/status`, token),
  ]);

  return verifyReleaseGatePayloads({
    checkRuns: checksPayload.check_runs,
    statuses: statusesPayload.statuses,
  });
}

async function main() {
  const repository = process.env.GITHUB_REPOSITORY;
  const sha = process.env.RELEASE_SHA || process.env.GITHUB_SHA;
  const token = process.env.GITHUB_TOKEN;
  const result = await verifyReleaseGates({ repository, sha, token });
  console.log(
    `[release-gates] PASS: GHA=${result.githubActions.join(',')} GCB=${result.googleCloudBuild} SHA=${sha}`,
  );
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  main().catch((error) => {
    console.error(`[release-gates] FAIL: ${error.message}`);
    process.exit(1);
  });
}
