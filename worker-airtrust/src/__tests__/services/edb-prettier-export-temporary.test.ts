import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const TARGETS = [
  'src/services/edb/technical-status-shadow-contracts.ts',
  'src/__tests__/services/edb-technical-status-shadow-contracts.test.ts',
];

describe('temporary Prettier export', () => {
  it('prints the exact formatted target files for the executor', () => {
    execFileSync('npx', ['--yes', 'prettier@3.9.6', '--write', ...TARGETS], {
      cwd: process.cwd(),
      stdio: 'pipe',
    });

    for (const target of TARGETS) {
      const formatted = readFileSync(resolve(process.cwd(), target), 'utf8');
      console.log(`AIRTRUST_FORMAT_EXPORT:${target}:${Buffer.from(formatted).toString('base64')}`);
    }

    expect(TARGETS).toHaveLength(2);
  });
});
