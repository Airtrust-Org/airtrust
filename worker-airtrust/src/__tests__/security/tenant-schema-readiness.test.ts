import { describe, expect, it } from 'vitest';
import { AppError } from '../../utils/errors';
import {
  allowsLegacyTenantSchema,
  assertTenantMembershipSchemaReady,
} from '../../middleware/tenant';

describe('tenant membership schema readiness', () => {
  it.each(['production', 'staging', undefined])(
    'fails closed in mature environment %s when usuarios_empresas is absent',
    (environment) => {
      let captured: unknown;
      try {
        assertTenantMembershipSchemaReady(environment, false);
      } catch (error) {
        captured = error;
      }
      expect(captured).toBeInstanceOf(AppError);
      expect((captured as AppError).status).toBe(503);
      expect((captured as AppError).code).toBe('SCHEMA_NOT_READY');
    },
  );

  it('permits a missing legacy table only in controlled local environments', () => {
    expect(allowsLegacyTenantSchema('development')).toBe(true);
    expect(allowsLegacyTenantSchema('test')).toBe(true);
    expect(allowsLegacyTenantSchema('staging')).toBe(false);
    expect(allowsLegacyTenantSchema('production')).toBe(false);
    expect(allowsLegacyTenantSchema(undefined)).toBe(false);
    expect(() => assertTenantMembershipSchemaReady('development', false)).not.toThrow();
    expect(() => assertTenantMembershipSchemaReady('test', false)).not.toThrow();
  });

  it('delegates when the canonical membership table exists', () => {
    expect(() => assertTenantMembershipSchemaReady('staging', true)).not.toThrow();
    expect(() => assertTenantMembershipSchemaReady('production', true)).not.toThrow();
  });
});
