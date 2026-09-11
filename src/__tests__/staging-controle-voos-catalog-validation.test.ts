import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const read = (path: string) => readFileSync(resolve(process.cwd(), path), 'utf8');

const workflow = read('.github/workflows/staging-controle-voos-catalog-validation.yml');
const smoke = read('scripts/staging/smoke-controle-voos-catalogs.mjs');
const provision = read('scripts/staging/provision-controle-voos-e2e-fixtures.mjs');
const cleanup = read('scripts/staging/cleanup-controle-voos-e2e-fixtures.mjs');

describe('staging Controle de Voos operational catalog validation', () => {
  it('is explicit workflow_dispatch, staging-only and release-gated', () => {
    expect(workflow).toContain('workflow_dispatch:');
    expect(workflow).toContain('AIRTRUST_STAGING_CV_CATALOGS');
    expect(workflow).toContain("[[ \"$GIT_REF\" == \"refs/heads/main\" ]]");
    expect(workflow).toContain('verify-release-gates.mjs');
    expect(workflow).toContain('STAGING_SOURCE_SHA_MISMATCH');
    expect(workflow).toContain('RELEASE_SHA_NOT_CURRENT_MAIN');
    expect(workflow).toContain('environment: staging');
    expect(workflow).toContain('airtrust-db-staging-baseline-20260701');
    expect(workflow).toContain('airtrust-api-staging.airtrust.workers.dev');
    expect(workflow).not.toContain('api.airtrust.online');
    expect(workflow).not.toContain('run_migrations');
  });

  it('uses disposable two-tenant fixtures and always cleans them up', () => {
    expect(workflow).toContain('provision-controle-voos-e2e-fixtures.mjs --apply');
    expect(workflow).toContain('smoke-controle-voos-catalogs.mjs');
    expect(workflow).toContain('Cleanup disposable fixtures');
    expect(workflow).toContain('if: ${{ always() }}');
    expect(workflow).toContain('cleanup-controle-voos-e2e-fixtures.mjs');
    expect(workflow).toContain('CLOUDFLARE_D1_MIGRATION_API_TOKEN');
    expect(provision).toContain("role: 'manager'");
    expect(provision).toContain("role: 'viewer'");
    expect(provision).toContain("tenant: 'B'");
    expect(cleanup).toContain('cv_aeroportos');
    expect(cleanup).toContain('cv_tipos_voo');
    expect(cleanup).toContain('cv_naturezas_voo');
    expect(cleanup).toContain('cv_motivos_operacionais');
  });

  it('covers all four operational catalogs and their required live invariants', () => {
    for (const catalog of ['aeroportos', 'tipos', 'naturezas', 'motivos']) {
      expect(smoke).toContain(`key: '${catalog}'`);
    }
    expect(smoke).toContain('viewer_create_403');
    expect(smoke).toContain('duplicate_code_409');
    expect(smoke).toContain('cross_tenant_patch_404');
    expect(smoke).toContain('manager_patch');
    expect(smoke).toContain('tenant_b_does_not_see_tenant_a');
    expect(smoke).toContain('manager_inactivate');
    expect(smoke).toContain('inactive_excluded_from_active');
    expect(smoke).toContain('inactive_preserved');
    expect(smoke).toContain('?ativo=1');
    expect(smoke).toContain('?ativo=0');
  });

  it('fails closed against any non-staging HTTP target and keeps evidence sanitized', () => {
    expect(smoke).toContain("const EXPECTED_HOST = 'airtrust-api-staging.airtrust.workers.dev'");
    expect(smoke).toContain('STAGING_TARGET_REJECTED');
    expect(smoke).toContain('url.hostname !== EXPECTED_HOST');
    expect(smoke).toContain('operation_id: json?.data?.id ?? null');
    expect(smoke).not.toContain('operations.push({ token');
    expect(smoke).not.toContain('operations.push({ password');
    expect(smoke).not.toContain('api.airtrust.online');
  });

  it('requires every catalog invariant in the workflow summary gate', () => {
    for (const required of [
      'viewer_create_403',
      'manager_create',
      'created_id',
      'duplicate_code_409',
      'cross_tenant_patch_404',
      'manager_patch',
      'viewer_read_active',
      'active_visible_after_update',
      'tenant_b_read',
      'tenant_b_does_not_see_tenant_a',
      'manager_inactivate',
      'read_active_after_inactivate',
      'inactive_excluded_from_active',
      'read_inactive_after_inactivate',
      'inactive_preserved',
    ]) {
      expect(workflow).toContain(`'${required}'`);
    }
    expect(workflow).toContain('CATALOG_SMOKE_NOT_GREEN');
    expect(workflow).toContain('MISSING_GREEN_OPERATION');
  });
});
