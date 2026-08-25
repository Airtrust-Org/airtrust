import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it, vi } from 'vitest';

const ROOT = join(__dirname, '../../../..');

function readWorkflow(): string {
  return readFileSync(join(ROOT, '.github/workflows/deploy-staging.yml'), 'utf8');
}

function extractGuardScript(workflow: string): string {
  const match = workflow.match(/node <<'NODE'\n\s*\(async \(\) => \{\n([\s\S]*?)\}\)\(\)\.catch/);
  if (!match) throw new Error('Guard script not found');
  return match[1];
}

async function runGuard(
  scenario: any
) {
  const workflow = readWorkflow();
  const scriptBody = extractGuardScript(workflow);
  
  const processEnv = {
    GITHUB_REPOSITORY: 'test/repo',
    PR_NUMBER: '1',
    RELEASE_SHA: scenario.releaseSha || 'sha-release',
    GITHUB_ACTOR: 'actor-123',
    GITHUB_TOKEN: 'token',
  };
  
  const mockApiData: any = {
    '/repos/test/repo/pulls/1': {
      state: scenario.prState || 'open',
      merged: scenario.prMerged || false,
      merge_commit_sha: scenario.prMergeCommitSha || 'sha-merge',
      base: { ref: 'main' },
      head: { 
        sha: scenario.prHeadSha || 'sha-release', 
        repo: { full_name: 'test/repo', fork: scenario.isFork || false } 
      },
      ...scenario.prOverrides
    },
    '/repos/test/repo/git/refs/heads/main': {
      object: { sha: scenario.mainSha || 'sha-merge' }
    },
    [`/repos/test/repo/git/commits/${scenario.releaseSha || 'sha-release'}`]: {
      sha: scenario.releaseSha || 'sha-release'
    },
    '/repos/test/repo/collaborators/actor-123/permission': {
      permission: scenario.actorPermission || 'admin'
    },
    [`/repos/test/repo/commits/${scenario.releaseSha || 'sha-release'}/check-runs?per_page=100`]: {
      check_runs: scenario.checks || [{ name: 'test', status: 'completed', conclusion: 'success' }]
    },
    [`/repos/test/repo/commits/${scenario.releaseSha || 'sha-release'}/status`]: {
      statuses: scenario.statuses || []
    }
  };

  const mockFetch = async (url: string, options: any) => {
    const path = url.replace('https://api.github.com', '');
    if (mockApiData[path]) {
      return {
        ok: true,
        json: async () => mockApiData[path]
      };
    }
    return {
      ok: false,
      status: 404
    };
  };

  const asyncWrapper = new Function(
    'process',
    'fetch',
    `
    return (async () => {
      ${scriptBody}
    })();
    `
  );

  return asyncWrapper({ env: processEnv }, mockFetch);
}

describe('Staging Release Guard Logic', () => {
  it('PR aberto + head correto: permitido', async () => {
    await expect(runGuard({
      prState: 'open',
      prHeadSha: 'sha-release',
      releaseSha: 'sha-release'
    })).resolves.toBeUndefined();
  });

  it('PR aberto + merge SHA: negado', async () => {
    await expect(runGuard({
      prState: 'open',
      prHeadSha: 'sha-unmerged',
      releaseSha: 'sha-merge'
    })).rejects.toThrow('OPEN_PR_HEAD_MISMATCH');
  });

  it('PR mergeado + merge_commit_sha + HEAD atual da main: permitido', async () => {
    await expect(runGuard({
      prState: 'closed',
      prMerged: true,
      prMergeCommitSha: 'sha-merge',
      mainSha: 'sha-merge',
      releaseSha: 'sha-merge'
    })).resolves.toBeUndefined();
  });

  it('PR mergeado + head SHA antigo: negado', async () => {
    await expect(runGuard({
      prState: 'closed',
      prMerged: true,
      prMergeCommitSha: 'sha-merge',
      mainSha: 'sha-merge',
      releaseSha: 'sha-unmerged' // Not merge_commit_sha
    })).rejects.toThrow('MERGED_PR_SHA_MISMATCH');
  });

  it('PR mergeado + merge SHA que não é HEAD atual: negado', async () => {
    await expect(runGuard({
      prState: 'closed',
      prMerged: true,
      prMergeCommitSha: 'sha-merge',
      mainSha: 'sha-newer', // main moved forward
      releaseSha: 'sha-merge'
    })).rejects.toThrow('RELEASE_SHA_NOT_CURRENT_MAIN');
  });

  it('PR fechado sem merge: negado', async () => {
    await expect(runGuard({
      prState: 'closed',
      prMerged: false
    })).rejects.toThrow('PR_NOT_OPEN_OR_MERGED');
  });

  it('PR de fork: negado', async () => {
    await expect(runGuard({
      isFork: true
    })).rejects.toThrow('PR_FROM_FORK_REJECTED');
  });

  // Check-runs/status gate verification moved out of this inline PR/actor
  // guard script into scripts/ci/verify-release-gates.mjs, which is invoked
  // as its own workflow step and has its own dedicated behavioral coverage
  // in scripts/ci/verify-release-gates.test.mjs ("fails when an official GHA
  // gate is missing/not green" and "fails when the GCB aggregate gate is
  // missing or red"). This guard script no longer contains that logic, so it
  // can't be exercised through this harness.
  it('delegates check-runs/status gate verification to verify-release-gates.mjs', () => {
    const workflow = readWorkflow();
    expect(workflow).toContain('node scripts/ci/verify-release-gates.mjs');
  });
});
