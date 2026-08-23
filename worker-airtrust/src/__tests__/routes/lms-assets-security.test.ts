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

  it('allows the actual staging Pages host, not just the non-matching wildcard', () => {
    // "*.airtrust.pages.dev" is a subdomain wildcard — it does not match
    // Cloudflare Pages' project-name.pages.dev naming (airtrust-staging.pages.dev
    // is a sibling of airtrust.pages.dev, not a child of it). Without the exact
    // host listed too, the SCORM player iframe is blocked by frame-ancestors
    // in staging.
    expect(LMS_FRAME_ANCESTORS.split(' ')).toContain('https://airtrust-staging.pages.dev');
  });

  it('stores only a short-lived HttpOnly asset token in the LMS cookie', () => {
    const source = readFileSync(join(process.cwd(), 'src', 'routes', 'lms-assets.ts'), 'utf8');
    expect(source).toContain("token_type: 'lms_asset'");
    expect(source).toContain("asset_scope: 'course_assets'");
    expect(source).toContain('HttpOnly;');
    expect(source).toContain('appendAssetTokenCookie(headers, token, c.req.raw)');
    expect(source).not.toContain('appendAssetTokenCookie(headers, requestToken)');
  });

  it('allows query tokens only for the scoped PPTX viewer asset', () => {
    const source = readFileSync(join(process.cwd(), 'src', 'routes', 'lms-assets.ts'), 'utf8');
    expect(source.match(/allowScopedQuery:\s*true/g)).toHaveLength(1);
    expect(source).toContain("app.get('/pptx/asset/:cursoId'");
  });
});
