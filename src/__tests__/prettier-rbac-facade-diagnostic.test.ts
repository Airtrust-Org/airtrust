import { execFileSync } from 'node:child_process';
import { Buffer } from 'node:buffer';
import { describe, expect, it } from 'vitest';

describe('temporary prettier diagnostic', () => {
  it('prints the canonical formatter output for the RBAC facade', () => {
    const formatted = execFileSync(
      'npx',
      [
        '--yes',
        'prettier@3.9.6',
        'worker-airtrust/src/services/operational-domain-access.ts',
      ],
      { encoding: 'utf8' },
    );
    console.error(`PRETTIER_OUTPUT_BASE64=${Buffer.from(formatted).toString('base64')}`);
    expect(formatted).toBe('DIAGNOSTIC_COMPLETE');
  });
});
