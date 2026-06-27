#!/usr/bin/env node

import { existsSync, realpathSync } from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const repoRoot = realpathSync(path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..'));
const canonicalRoot = '/Users/filipedaumas/SAAS/Airtrust';
const currentPath = realpathSync(process.cwd());

function runGit(args, { allowFailure = false } = {}) {
  try {
    return execFileSync('git', args, {
      cwd: repoRoot,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    }).trim();
  } catch (error) {
    if (allowFailure) {
      return '';
    }
    const stderr = error.stderr?.toString().trim();
    throw new Error(stderr || error.message);
  }
}

function listLines(value) {
  if (!value) {
    return [];
  }
  return value
    .split('\n')
    .map((line) => line.trimEnd())
    .filter(Boolean);
}

async function fetchPublicWorkerVersion() {
  const endpoint = 'https://api.airtrust.online/api/version';
  try {
    const response = await fetch(endpoint, {
      headers: { accept: 'application/json,text/plain;q=0.9,*/*;q=0.8' },
    });

    if (!response.ok) {
      return { status: `HTTP_${response.status}`, summary: null };
    }

    const text = await response.text();
    let summary = text.trim();

    try {
      const payload = JSON.parse(text);
      summary = payload.data?.version
        || payload.data?.deploymentId
        || payload.appVersion
        || payload.version
        || payload.APP_VERSION
        || payload.build
        || JSON.stringify(payload);
    } catch {
      // Leave summary as raw text when the endpoint is not JSON.
    }

    return { status: 'OK', summary };
  } catch (error) {
    return { status: 'UNAVAILABLE', summary: error.message };
  }
}

function fileStateRecommendation({ branch, head, originMain, statusLines, canonicalMatch }) {
  if (statusLines.length > 0) {
    return 'NOT_OK_DIRTY_WORKTREE';
  }
  if (branch && branch !== 'main') {
    return 'NOT_OK_WRONG_BRANCH';
  }
  if (head !== originMain) {
    return 'NOT_OK_BEHIND_ORIGIN_MAIN';
  }
  if (!canonicalMatch || branch === 'main' || branch === '') {
    return 'DEPLOY_SHOULD_USE_GITHUB_ACTIONS';
  }
  return 'OK_FOR_LOCAL_DEV';
}

const branch = runGit(['branch', '--show-current'], { allowFailure: true });
const head = runGit(['rev-parse', 'HEAD']);
const originMain = runGit(['rev-parse', 'origin/main'], { allowFailure: true });
const statusLines = listLines(runGit(['status', '--short', '--untracked-files=all'], { allowFailure: true }));
const modifiedFiles = statusLines.filter((line) => !line.startsWith('??'));
const untrackedFiles = statusLines.filter((line) => line.startsWith('??'));
const worktrees = listLines(runGit(['worktree', 'list', '--porcelain'], { allowFailure: true }));
const nodeModulesExists = existsSync(path.join(repoRoot, 'node_modules'));
const workerNodeModulesExists = existsSync(path.join(repoRoot, 'worker-airtrust', 'node_modules'));
const canonicalMatch = currentPath === canonicalRoot;
const publicWorker = await fetchPublicWorkerVersion();
const recommendation = fileStateRecommendation({
  branch,
  head,
  originMain,
  statusLines,
  canonicalMatch,
});

console.log('AIRTRUST_REPO_DOCTOR');
console.log(`path: ${currentPath}`);
console.log(`canonical_path: ${canonicalRoot}`);
console.log(`in_canonical_path: ${canonicalMatch ? 'yes' : 'no'}`);
console.log(`branch: ${branch || '(detached HEAD)'}`);
console.log(`HEAD: ${head}`);
console.log(`origin/main: ${originMain || '(missing)'}`);
console.log(`HEAD_equals_origin_main: ${head === originMain ? 'yes' : 'no'}`);
console.log(`worktree_dirty: ${statusLines.length > 0 ? 'yes' : 'no'}`);
console.log(`node_modules_present: ${nodeModulesExists ? 'yes' : 'no'}`);
console.log(`worker_node_modules_present: ${workerNodeModulesExists ? 'yes' : 'no'}`);
console.log(`public_worker_status: ${publicWorker.status}`);
console.log(`public_worker_summary: ${publicWorker.summary || '(unavailable)'}`);
console.log('');
console.log('modified_files:');
if (modifiedFiles.length === 0) {
  console.log('(none)');
} else {
  for (const line of modifiedFiles) {
    console.log(line);
  }
}
console.log('');
console.log('untracked_relevant:');
if (untrackedFiles.length === 0) {
  console.log('(none)');
} else {
  for (const line of untrackedFiles) {
    console.log(line);
  }
}
console.log('');
console.log('open_worktrees:');
if (worktrees.length === 0) {
  console.log('(none)');
} else {
  for (const line of worktrees) {
    console.log(line);
  }
}
console.log('');
console.log(`recommendation: ${recommendation}`);
