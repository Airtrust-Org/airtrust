import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const ROOT = join(__dirname, '../../../..');
const script = readFileSync(join(ROOT, 'scripts/staging/backup-d1-staging.sh'), 'utf8');

describe('staging D1 backup output path', () => {
  it('passes the absolute backup path to Wrangler unchanged', () => {
    expect(script).toContain(
      'npx wrangler d1 export "$db_name" --remote --output "$out_file"',
    );
    expect(script).not.toContain('--output "../$out_file"');
  });
});
