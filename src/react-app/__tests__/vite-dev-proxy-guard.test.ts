import { describe, expect, it } from 'vitest';
import { assertDevProxyTargetIsSafe, isProductionApiTarget } from '../config/devProxyGuard';

describe('Vite dev proxy production guard', () => {
  it('identifies AirTrust production API targets', () => {
    expect(isProductionApiTarget('https://api.airtrust.online')).toBe(true);
    expect(isProductionApiTarget('https://api.airtrust.online/api')).toBe(true);
    expect(isProductionApiTarget('http://localhost:8787')).toBe(false);
  });

  it('blocks production proxy targets in development by default', () => {
    expect(() =>
      assertDevProxyTargetIsSafe('development', 'https://api.airtrust.online'),
    ).toThrow(/Dev proxy blocked/);
  });

  it('allows production proxy targets only with explicit verbose override', () => {
    expect(() =>
      assertDevProxyTargetIsSafe(
        'development',
        'https://api.airtrust.online',
        'I_UNDERSTAND_THIS_POINTS_DEV_TO_PRODUCTION',
      ),
    ).not.toThrow();
  });
});
