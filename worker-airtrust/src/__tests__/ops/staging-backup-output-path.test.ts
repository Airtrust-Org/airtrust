import { chmodSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { afterEach, describe, expect, it } from 'vitest';

const ROOT = join(__dirname, '../../../..');
const scriptPath = join(ROOT, 'scripts/staging/backup-d1-staging.sh');
const script = readFileSync(scriptPath, 'utf8');
const tempDirs: string[] = [];

function runWithFakeNpx(fakeBody: string) {
  const dir = mkdtempSync(join(tmpdir(), 'airtrust-staging-backup-test-'));
  tempDirs.push(dir);
  const binDir = join(dir, 'bin');
  const outDir = join(dir, 'out');
  spawnSync('mkdir', ['-p', binDir, outDir]);
  const npx = join(binDir, 'npx');
  writeFileSync(npx, `#!/usr/bin/env bash\nset -euo pipefail\n${fakeBody}\n`);
  chmodSync(npx, 0o755);
  return spawnSync('bash', [scriptPath, '--apply', `--out-dir=${outDir}`], {
    cwd: ROOT,
    encoding: 'utf8',
    env: {
      ...process.env,
      PATH: `${binDir}:${process.env.PATH ?? ''}`,
      CONFIRM_STAGING_BACKUP: 'AIRTRUST_STAGING_BACKUP',
    },
  });
}

afterEach(() => {
  while (tempDirs.length) rmSync(tempDirs.pop()!, { recursive: true, force: true });
});

describe('staging D1 backup output path', () => {
  it('passes the absolute backup path to Wrangler unchanged', () => {
    expect(script).toContain('npx wrangler d1 export "$db_name" --remote --output "$out_file"');
    expect(script).not.toContain('--output "../$out_file"');
  });

  it('accepts only the known Undici assertion after a confirmed successful download', () => {
    const result = runWithFakeNpx(`
output="$7"
printf '%s\n' 'PRAGMA foreign_keys=OFF;' 'CREATE TABLE test(id INTEGER);' > \"$output\"
echo 'AssertionError [ERR_ASSERTION]' >&2
echo '  assert(!this.paused)' >&2
echo \"🌀 Downloaded to $output successfully!\" >&2
exit 1`);
    expect(result.status, result.stderr).toBe(0);
    expect(result.stdout).toContain('BACKUP_OK');
    expect(result.stderr).toContain('known Undici post-download assertion');
  });

  it('rejects a non-zero Wrangler exit without the exact post-download signature', () => {
    const result = runWithFakeNpx(`
output="$7"
printf '%s\n' 'partial export' > \"$output\"
echo 'network failure' >&2
exit 1`);
    expect(result.status).not.toBe(0);
    expect(result.stdout).not.toContain('BACKUP_OK');
    expect(result.stderr).toContain('failed before a verifiable successful download');
  });
});
