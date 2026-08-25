#!/usr/bin/env node
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const REQUIRED_GITHUB_CHECKS = Object.freeze([
  'lint',
  'build-content-gates',
  'worker-typecheck',
  'frontend-coverage',
  'worker-tests-1',
  'worker-tests-2',
  'lms-smoke',
  'public-e2e',
]);

export function verifyReleaseGatePayloads({ checkRuns }) {
  if (!Array.isArray(checkRuns)) {
    throw new Error('RELEASE_CHECK_RUNS_UNAVAILABLE');
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

  if (failures.length > 0) {
    throw new Error(`RELEASE_GATES_NOT_GREEN:${failures.join(',')}`);
  }

  return {
    githubActions: [...REQUIRED_GITHUB_CHECKS],
  };
}

async function githubGet(pathname, token) {
  const response = await fetch(`https://api.github.com${pathname}`, {
    headers: {
      authorization: `Bearer ${token}`,
      accept: 'application/vnd.github+json',
      'x-github-api-version': '2022-11-28',
    },
  });
  if (!response.ok) {
    throw new Error(`${pathname} returned HTTP ${response.status}`);
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
  const checksPayload = await githubGet(
    `/repos/${repository}/commits/${encodedSha}/check-runs?per_page=100`,
    token,
  );

  return verifyReleaseGatePayloads({
    checkRuns: checksPayload.check_runs,
  });
}

async function main() {
  const repository = process.env.GITHUB_REPOSITORY;
  const sha = process.env.RELEASE_SHA || process.env.GITHUB_SHA;
  const token = process.env.GITHUB_TOKEN;
  const result = await verifyReleaseGates({ repository, sha, token });
  console.log(`[release-gates] PASS: GHA=${result.githubActions.join(',')} SHA=${sha}`);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  main().catch((error) => {
    console.error(`[release-gates] FAIL: ${error.message}`);
    process.exit(1);
  });
}
