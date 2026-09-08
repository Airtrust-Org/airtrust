import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const apiSource = readFileSync(join(process.cwd(), 'src/react-app/config/api.ts'), 'utf8');
const lmsAssetsSource = readFileSync(
  join(process.cwd(), 'worker-airtrust/src/routes/lms-assets.ts'),
  'utf8',
);
const lmsAssetSessionSource = readFileSync(
  join(process.cwd(), 'worker-airtrust/src/lib/lms/lms-asset-session.ts'),
  'utf8',
);

describe('LMS cross-origin credential contract', () => {
  it('keeps authenticated frontend requests credentialed', () => {
    expect(apiSource).toContain("credentials: 'include' as RequestCredentials");
    expect(apiSource).toContain('credentials: options.credentials ?? fetchConfig.credentials');
  });

  it('preserves the scoped HttpOnly asset-session cookie for SCORM/H5P', () => {
    expect(lmsAssetSessionSource).toContain("export const LMS_ASSET_TOKEN_COOKIE = 'airtrust_lms_asset_token'");
    expect(lmsAssetsSource).toContain("import { LMS_ASSET_TOKEN_COOKIE } from '../lib/lms/lms-asset-session'");
    expect(lmsAssetsSource).toContain('HttpOnly');
    expect(lmsAssetsSource).toContain('SameSite=None; Secure');
    expect(lmsAssetsSource).toContain('Path=/api/lms/');
  });
});
