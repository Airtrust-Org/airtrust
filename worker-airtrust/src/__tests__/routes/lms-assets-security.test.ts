import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  buildLmsContentSecurityPolicy,
  LMS_FRAME_ANCESTORS,
} from '../../lib/lms/security-headers';

describe('LMS asset security contract', () => {
  it('restricts frame ancestors to official AirTrust surfaces', () => {
    const policy = buildLmsContentSecurityPolicy();
    expect(policy).toContain(`frame-ancestors ${LMS_FRAME_ANCESTORS}`);
    expect(policy).not.toContain('frame-ancestors *');
  });

  it('stores only a short-lived HttpOnly asset token in the LMS cookie', () => {
    const source = readFileSync(join(process.cwd(), 'src', 'routes', 'lms-assets.ts'), 'utf8');
    expect(source).toContain("token_type: 'lms_asset'");
    expect(source).toContain("asset_scope: 'course_assets'");
    expect(source).toContain('HttpOnly;');
    expect(source).toContain('appendAssetTokenCookie(headers, assetToken)');
    expect(source).not.toContain('appendAssetTokenCookie(headers, requestToken)');
  });

  it('allows query tokens only for the scoped PPTX viewer asset', () => {
    const source = readFileSync(join(process.cwd(), 'src', 'routes', 'lms-assets.ts'), 'utf8');
    expect(source.match(/allowScopedQuery:\s*true/g)).toHaveLength(1);
    expect(source).toContain("app.get('/pptx/asset/:cursoId'");
  });
});
