import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const workflow = readFileSync(
  join(process.cwd(), '..', '.github', 'workflows', 'cloudflare-credential-doctor.yml'),
  'utf8',
);

describe('Cloudflare credential doctor D1 contract', () => {
  it('diagnoses the canonical D1 backup token independently', () => {
    expect(workflow).toContain('- d1_backup');
    expect(workflow).toContain('CLOUDFLARE_D1_BACKUP_API_TOKEN');
    expect(workflow).toContain('/d1/database?per_page=1');
    expect(workflow).toContain('TOKEN_PERMISSION_INSUFFICIENT');
  });
});
