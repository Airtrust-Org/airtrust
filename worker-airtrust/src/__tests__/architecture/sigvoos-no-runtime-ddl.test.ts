import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const testDir = dirname(fileURLToPath(import.meta.url));
const srcRoot = join(testDir, '../..');
const bootstrapPath = join(testDir, '../../../../scripts/bootstrap-new-environment.sql');

const runtimeForbiddenPatterns = [
  /\bensureSigvoosTables\s*\(/,
  /\bCREATE TABLE IF NOT EXISTS\s+integracoes_sigvoos_/i,
  /\bCREATE TABLE IF NOT EXISTS\s+sigvoos_/i,
  /\bALTER TABLE\s+integracoes_sigvoos_/i,
  /\bALTER TABLE\s+sigvoos_/i,
];

function listRuntimeSourceFiles(dir: string): string[] {
  const entries = readdirSync(dir, { withFileTypes: true });
  const files: string[] = [];

  for (const entry of entries) {
    if (entry.name === '__tests__') continue;

    const fullPath = join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...listRuntimeSourceFiles(fullPath));
      continue;
    }

    if (entry.isFile() && (fullPath.endsWith('.ts') || fullPath.endsWith('.tsx'))) {
      files.push(fullPath);
    }
  }

  return files;
}

describe('sigvoos runtime DDL removal', () => {
  it('keeps runtime source free of SIGVOOS fallback DDL and ensureSigvoosTables call sites', () => {
    const runtimeFiles = listRuntimeSourceFiles(srcRoot);
    const violations: string[] = [];

    for (const file of runtimeFiles) {
      const source = readFileSync(file, 'utf8');
      for (const pattern of runtimeForbiddenPatterns) {
        if (pattern.test(source)) {
          violations.push(`${file}: ${pattern}`);
        }
      }
    }

    expect(violations).toEqual([]);
  });

  it('preserves the bootstrap as the official new-environment DDL path', () => {
    const bootstrapSql = readFileSync(bootstrapPath, 'utf8');

    expect(bootstrapSql).toContain('CREATE TABLE IF NOT EXISTS integracoes_sigvoos_config');
    expect(bootstrapSql).toContain('CREATE TABLE IF NOT EXISTS integracoes_sigvoos_eventos');
    expect(bootstrapSql).toContain('CREATE TABLE IF NOT EXISTS integracoes_sigvoos_mapeamentos');
  });
});
