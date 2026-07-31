import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const workflow = readFileSync(
  join(process.cwd(), '..', '.github', 'workflows', 'd1-production-backup-restore-drill.yml'),
  'utf8',
);

describe('D1 production backup/restore drill workflow', () => {
  it('is manual, production-gated and read-only', () => {
    expect(workflow).toContain('workflow_dispatch:');
    expect(workflow).toContain('environment: production');
    expect(workflow).toContain('D1_PRODUCTION_BACKUP_RESTORE_DRILL');
    expect(workflow).toContain('backup-production-d1-readonly.mjs');
    expect(workflow).not.toContain('wrangler d1 execute');
  });

  it('restores into disposable SQLite and never uploads the dump', () => {
    expect(workflow).toContain('integrity_check == "ok"');
    expect(workflow).toContain("trap 'rm -rf \"$out_dir\"' EXIT");
    expect(workflow).toContain('d1-production-backup-restore-report.json');
    expect(workflow).not.toContain('airtrust-db-production-backup-*.sql');
    expect(workflow).toContain('backup: {bytes: .backup.bytes, sha256: .backup.sha256}');
    expect(workflow).not.toContain('target: .target');
  });
});
