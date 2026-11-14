import { describe, expect, it } from 'vitest';
import { isReloadProtectedInteractivePath } from '../reloadProtection';

describe('reloadProtection', () => {
  it('protege rotas interativas críticas contra reload automático', () => {
    expect(isReloadProtectedInteractivePath('/frms/checkin')).toBe(true);
    expect(isReloadProtectedInteractivePath('/frms/checkin/')).toBe(true);
    expect(isReloadProtectedInteractivePath('/frms/fadiga-checkin')).toBe(true);
    expect(isReloadProtectedInteractivePath('/lms/prova/42')).toBe(true);
    expect(isReloadProtectedInteractivePath('/lms/provas')).toBe(true);
    expect(isReloadProtectedInteractivePath('/lms/player/10')).toBe(true);
    expect(isReloadProtectedInteractivePath('/avaliacoes/nova')).toBe(true);
    expect(isReloadProtectedInteractivePath('/escalas')).toBe(true);
    expect(isReloadProtectedInteractivePath('/simuladores/fichas')).toBe(true);
    expect(isReloadProtectedInteractivePath('/qualificacoes')).toBe(true);
    expect(isReloadProtectedInteractivePath('/pilot')).toBe(true);
    expect(isReloadProtectedInteractivePath('/frms/fadiga-painel')).toBe(false);
    expect(isReloadProtectedInteractivePath('/frms')).toBe(false);
    expect(isReloadProtectedInteractivePath('/dashboard')).toBe(false);
  });
});
