import { describe, expect, it } from 'vitest';
import {
  inferRuntimeEnvironmentFromHostname,
  normalizeRuntimeEnvironment,
} from '@/react-app/components/VersionBadge';

describe('VersionBadge environment classification', () => {
  it.each([
    ['airtrust.online', 'production'],
    ['www.airtrust.online', 'production'],
    ['AIRTRUST.ONLINE', 'production'],
    ['airtrust-staging.pages.dev', 'staging'],
    ['staging.airtrust.online', 'staging'],
    ['airtrust-api-staging.workers.dev', 'staging'],
    ['localhost', 'development'],
    ['preview.pages.dev', 'development'],
  ] as const)('classifica %s como %s', (hostname, expected) => {
    expect(inferRuntimeEnvironmentFromHostname(hostname)).toBe(expected);
  });

  it('normaliza somente ambientes conhecidos da API', () => {
    expect(normalizeRuntimeEnvironment(' production ')).toBe('production');
    expect(normalizeRuntimeEnvironment('STAGING')).toBe('staging');
    expect(normalizeRuntimeEnvironment('development')).toBe('development');
    expect(normalizeRuntimeEnvironment('preview')).toBeNull();
    expect(normalizeRuntimeEnvironment(undefined)).toBeNull();
  });
});
