import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const target = 'worker-airtrust/src/services/operational-domain-access.ts';

describe('temporary RBAC facade Prettier diagnostic', () => {
  it('prints only the lines that differ from canonical formatting', () => {
    const source = readFileSync(target, 'utf8');
    const formatted = execFileSync('npx', ['prettier', target], { encoding: 'utf8' });
    const sourceLines = source.split('\n');
    const formattedLines = formatted.split('\n');
    const differences: Array<{ line: number; source: string | null; formatted: string | null }> = [];

    for (let index = 0; index < Math.max(sourceLines.length, formattedLines.length); index += 1) {
      if (sourceLines[index] !== formattedLines[index]) {
        differences.push({
          line: index + 1,
          source: sourceLines[index] ?? null,
          formatted: formattedLines[index] ?? null,
        });
      }
    }

    console.error(`PRETTIER_DIFFERENCES=${JSON.stringify(differences.slice(0, 20))}`);
    expect(differences).toEqual([]);
  });
});
