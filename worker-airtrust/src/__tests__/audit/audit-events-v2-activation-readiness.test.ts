import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const rootDir = resolve(import.meta.dirname, '../../../..');
const migrationPath = resolve(rootDir, 'worker-airtrust/migrations/0385_audit_events_v2.sql');
const trackedConfigPaths = [
  'worker-airtrust/wrangler.toml',
  'worker-airtrust/wrangler.dev.toml',
  'worker-airtrust/package.json',
  'package.json',
];

describe('audit v2 activation readiness', () => {
  it('keeps the audit v2 migration additive and free from destructive statements', () => {
    const sql = readFileSync(migrationPath, 'utf8');

    expect(sql).toContain('CREATE TABLE IF NOT EXISTS audit_events_v2');
    expect(sql).toContain('idx_audit_events_v2_request');
    expect(sql).not.toMatch(/\bDROP\b/i);
    expect(sql).not.toMatch(/\bDELETE\b/i);
    expect(sql).not.toMatch(/\bUPDATE\b/i);
  });

  it('does not enable the dual-write flag by default in tracked configs', () => {
    for (const relativePath of trackedConfigPaths) {
      const absolutePath = resolve(rootDir, relativePath);
      if (!existsSync(absolutePath)) continue;

      const contents = readFileSync(absolutePath, 'utf8');
      expect(contents).not.toMatch(/AUDIT_EVENTS_V2_DUAL_WRITE\s*=\s*["']true["']/);
    }
  });
});
