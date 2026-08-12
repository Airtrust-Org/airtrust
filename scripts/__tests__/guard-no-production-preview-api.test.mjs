import { describe, expect, it } from 'vitest';
import {
  inspectAllowedOriginsSource,
  inspectCredentialedCorsSource,
  inspectFrontendSource,
  inspectWorkflowSource,
  inspectWranglerSource,
} from '../guard-no-production-preview-api.mjs';

describe('guard:no-production-preview-api', () => {
  it('detects generic Pages routing to production', () => {
    const violations = inspectFrontendSource(`
      const PRODUCTION_FRONTEND_HOSTS = new Set();
      if (host.includes('pages.dev')) return 'https://api.airtrust.online/api';
      throw new Error('Preview host may only use the staging API');
    `);
    expect(violations).toContain('frontend: generic pages.dev includes() routing is forbidden');
  });

  it('detects a broad credentialed Pages regex', () => {
    const violations = inspectAllowedOriginsSource(`
      export function parseEnvAllowedOrigins(value) {
        if (candidate === '*') return [];
        return value;
      }
      if (/^https:\\/\\/[a-z0-9-]+\\.airtrust\\.pages\\.dev$/i.test(origin)) return origin;
    `);
    expect(violations.some((item) => item.includes('broad *.airtrust.pages.dev'))).toBe(true);
  });

  it('detects wildcard CORS with credentials', () => {
    expect(
      inspectCredentialedCorsSource(
        `headers.set('Access-Control-Allow-Origin', '*'); headers.set('Access-Control-Allow-Credentials', 'true');`,
        'fixture.ts',
      ),
    ).toHaveLength(1);
  });

  it('detects production API in a staging workflow', () => {
    expect(
      inspectWorkflowSource(
        `name: staging preview\nenv:\n  VITE_API_URL: https://api.airtrust.online/api`,
        'preview.yml',
      ),
    ).toContain('preview.yml: staging/preview workflow points VITE_API_URL to production');
  });

  it('detects mixed staging and production bindings', () => {
    const violations = inspectWranglerSource(`
      main = "src/environment-entrypoint.ts"
      [env.staging]
      [env.staging.vars]
      CORS_ORIGINS = "https://staging.airtrust.pages.dev"
      [[env.staging.d1_databases]]
      database_id = "7c8a788e-a4c4-4d5d-8208-ff7ff55e84ae"
      [env.production]
      [env.production.vars]
      CORS_ORIGINS = "https://airtrust.online"
      [[env.production.d1_databases]]
      database_id = "bf9963f4-eb12-439b-a830-20bbf577ac22"
    `);

    expect(violations).toContain(
      'worker-airtrust/wrangler.toml: staging block contains a production API, D1, or R2 target',
    );
    expect(violations).toContain(
      'worker-airtrust/wrangler.toml: production block contains a staging API, D1, or R2 target',
    );
  });
});
