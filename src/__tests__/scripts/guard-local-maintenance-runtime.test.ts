import { describe, expect, it } from 'vitest';
import { validateLocalMaintenanceConfig } from '../../../scripts/guard-local-maintenance-runtime.mjs';

const safeWrangler = `
[env.staging.vars]
ENVIRONMENT = "staging"
[env.production.vars]
ENVIRONMENT = "production"
`;

describe('guard:local-maintenance-runtime', () => {
  it('accepts remote configuration without local maintenance flags', () => {
    expect(validateLocalMaintenanceConfig({ wrangler: safeWrangler, packageJson: { scripts: { 'maintenance:local': 'wrangler dev --local' } } })).toEqual([]);
  });

  it('rejects remote flags, development remotes, bypass substitution, and remote local scripts', () => {
    const failures = validateLocalMaintenanceConfig({
      wrangler: `[env.staging.vars]\nENABLE_LOCAL_MAINTENANCE = "true"\nLOCAL_MAINTENANCE_RUNTIME = "true"\nENVIRONMENT = "development"\nENABLE_DEV_AUTH_BYPASS ENABLE_LOCAL_MAINTENANCE`,
      packageJson: { scripts: { 'maintenance:local': 'wrangler d1 execute db --remote' } },
    });
    expect(failures).toHaveLength(5);
  });
});
