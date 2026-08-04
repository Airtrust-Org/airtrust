import { Buffer } from 'node:buffer';
import { execFileSync } from 'node:child_process';
import { describe, expect, it } from 'vitest';

describe('temporary operational-domain facade formatter diagnostic', () => {
  it('prints the canonical Prettier output', () => {
    const formatted = execFileSync(
      'npx',
      [
        '--yes',
        'prettier@3.9.6',
        'worker-airtrust/src/services/operational-domain-access.ts',
      ],
      { encoding: 'utf8' },
    );
    const encoded = Buffer.from(formatted).toString('base64');
    console.error(`PRETTIER_OPERATIONAL_DOMAIN_FACADE_BASE64=${encoded}`);
    expect(encoded).toBe('DIAGNOSTIC_COMPLETE');
  });
});
