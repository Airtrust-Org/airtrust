import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const ROOT = join(__dirname, '../../../..');
const sha256 = (path: string) => createHash('sha256').update(readFileSync(path)).digest('hex');

describe('0481 Schema V2 manifest integrity', () => {
  it('pins the exact reviewed SQL and plan hashes', () => {
    const manifest = JSON.parse(
      readFileSync(join(ROOT, 'worker-airtrust/schema-v2/training-dependency-planning-0481.json'), 'utf8'),
    );
    expect(sha256(join(ROOT, manifest.filePath))).toBe(manifest.fileHash);
    expect(sha256(join(ROOT, manifest.planPath))).toBe(manifest.planHash);
  });
});
