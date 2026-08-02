// source_reference: static repository scripts only; no database, environment, backup, or credential is read.
// operational_decision: legacy raw production clone and plaintext backup entrypoints must remain fail-closed.
// dry_run_required: tests execute only the blocked shell stubs in empty temporary directories.
// rollback_plan_required: temporary directories are removed after each assertion; no persistent state is changed.

import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const repositoryRoot = path.resolve(process.cwd(), '..');

const blockedScripts = ['scripts/clone-prod-data.sh', 'scripts/backup-database.sh'] as const;

function readRepositoryFile(relativePath: string): string {
  return readFileSync(path.join(repositoryRoot, relativePath), 'utf8');
}

describe.each(blockedScripts)('%s', (relativePath) => {
  it('remains a fail-closed stub without database execution primitives', () => {
    const source = readRepositoryFile(relativePath);

    expect(source).toContain('set -euo pipefail');
    expect(source).toContain('exit 1');
    expect(source).toMatch(/legacy/i);
    expect(source).toMatch(/blocked|disabled/i);
    expect(source).not.toMatch(/\bwrangler\b/i);
    expect(source).not.toContain('--remote');
    expect(source).not.toMatch(/SELECT\s+\*/i);
    expect(source).not.toContain('prod_full_dump');
    expect(source).not.toContain('migrations/data-export');
  });

  it('exits before creating any local artifact', () => {
    const tempDirectory = mkdtempSync(path.join(tmpdir(), 'airtrust-blocked-export-'));

    try {
      const result = spawnSync('bash', [path.join(repositoryRoot, relativePath)], {
        cwd: tempDirectory,
        encoding: 'utf8',
      });

      expect(result.status).toBe(1);
      expect(`${result.stdout}\n${result.stderr}`).toMatch(/blocked|disabled/i);
      expect(readdirSync(tempDirectory)).toEqual([]);
    } finally {
      rmSync(tempDirectory, { recursive: true, force: true });
    }
  });
});

describe('legacy export artifact containment', () => {
  it('ignores every generated file under migrations/data-export', () => {
    const ignoreFile = readRepositoryFile('migrations/data-export/.gitignore');

    expect(ignoreFile).toContain('*');
    expect(ignoreFile).toContain('!.gitignore');
  });
});
