import { describe, expect, it } from 'vitest';
import { isReloadProtectedInteractivePath } from '../reloadProtection';

describe('reloadProtection', () => {
  it('protege rotas interativas de check-in FRMS contra reload automático', () => {
    expect(isReloadProtectedInteractivePath('/frms/checkin')).toBe(true);
    expect(isReloadProtectedInteractivePath('/frms/checkin/')).toBe(true);
    expect(isReloadProtectedInteractivePath('/frms/fadiga-checkin')).toBe(true);
    expect(isReloadProtectedInteractivePath('/frms/fadiga-painel')).toBe(false);
    expect(isReloadProtectedInteractivePath('/frms')).toBe(false);
  });
});
