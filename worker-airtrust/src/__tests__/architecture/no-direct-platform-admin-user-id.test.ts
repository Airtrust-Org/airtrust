import { readdirSync, readFileSync, statSync } from 'node:fs';
import { relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const SRC_ROOT = resolve(fileURLToPath(new URL('../..', import.meta.url)));
const ALLOWED_LEGACY_HELPER_FILE = 'middleware/tenant.ts';

const FORBIDDEN_DIRECT_PLATFORM_ADMIN_PATTERNS = [
  /\buserId(?:Raw|Number)?\s*={2,3}\s*1\b/,
  /\b1\s*={2,3}\s*userId(?:Raw|Number)?\b/,
];

function listTypeScriptSourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((entry) => {
    const absolute = resolve(dir, entry);
    const stat = statSync(absolute);

    if (stat.isDirectory()) {
      if (entry === '__tests__') return [];
      return listTypeScriptSourceFiles(absolute);
    }

    return entry.endsWith('.ts') ? [absolute] : [];
  });
}

describe('platform admin boundary', () => {
  it('does not add direct userId=1 checks outside the centralized helper', () => {
    const violations = listTypeScriptSourceFiles(SRC_ROOT)
      .filter((file) => relative(SRC_ROOT, file) !== ALLOWED_LEGACY_HELPER_FILE)
      .flatMap((file) => {
        const source = readFileSync(file, 'utf8');
        return FORBIDDEN_DIRECT_PLATFORM_ADMIN_PATTERNS.filter((pattern) =>
          pattern.test(source),
        ).map((pattern) => `${relative(SRC_ROOT, file)} matches ${pattern}`);
      });

    expect(violations).toEqual([]);
  });
});
