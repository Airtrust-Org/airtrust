import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

import { runCli } from '../../../scripts/snapshot-simuladores-pto-rev10-local.mjs';

const source = fs.readFileSync(
  path.resolve(process.cwd(), 'scripts', 'snapshot-simuladores-pto-rev10-local.mjs'),
  'utf8',
);

describe('PTO Rev10 local snapshot guard', () => {
  it('refuses remote, staging and production tokens before opening a database', () => {
    expect(() => runCli(['node', 'script', '--remote'])).toThrow(
      'indicação de remoto/staging/produção',
    );
    expect(() => runCli(['node', 'script', '--env', 'production'])).toThrow(
      'indicação de remoto/staging/produção',
    );
    expect(() => runCli(['node', 'script', '--env', 'staging'])).toThrow(
      'indicação de remoto/staging/produção',
    );
  });

  it('contains only read-side database statements', () => {
    expect(source).not.toMatch(/spawnSync\(['\"]wrangler['\"]/);
    expect(source).not.toMatch(/\b(?:INSERT|UPDATE|DELETE|ALTER|DROP|CREATE|REPLACE|UPSERT)\b/);
    expect(source).toContain("const dbPath = arg(argv, '--d1-local')");
    expect(source).toContain("mode: 'LOCAL_READ_ONLY'");
  });
});
