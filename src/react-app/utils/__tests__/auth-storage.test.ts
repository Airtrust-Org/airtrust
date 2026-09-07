import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  clearLegacyPerfisCache,
  hasLegacyPerfisCache,
  readScopedAuthStorage,
  readScopedPerfis,
  removeScopedAuthStorage,
  writeScopedAuthStorage,
  writeScopedPerfis,
} from '../auth-storage';

describe('auth-storage helpers', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.restoreAllMocks();
  });

  it('mantém dados estritamente namespaced por empresa e usuário', () => {
    const a = { empresaId: 1, userId: 10 };
    const b = { empresaId: 2, userId: 10 };

    writeScopedAuthStorage('preferencia_ui', a, 'tenant-a');

    expect(readScopedAuthStorage('preferencia_ui', a)).toBe('tenant-a');
    expect(readScopedAuthStorage('preferencia_ui', b)).toBeNull();

    removeScopedAuthStorage('preferencia_ui', a);
    expect(readScopedAuthStorage('preferencia_ui', a)).toBeNull();
  });

  it('ignora escopo incompleto e remove apenas a chave escopada solicitada', () => {
    writeScopedAuthStorage('x', { empresaId: 0, userId: 10 }, 'never');
    expect(readScopedAuthStorage('x', { empresaId: 0, userId: 10 })).toBeNull();

    const scope = { empresaId: 1, userId: 10 };
    writeScopedAuthStorage('ui', scope, '1');
    localStorage.setItem('unrelated', 'keep');
    removeScopedAuthStorage('ui', scope);

    expect(readScopedAuthStorage('ui', scope)).toBeNull();
    expect(localStorage.getItem('unrelated')).toBe('keep');
  });

  it('serializa perfis apenas como cache de UI escopado e rejeita JSON inválido', () => {
    const scope = { empresaId: 7, userId: 11 };
    const perfis = [{ value: 'ALUNO', permissoes: ['self.ficha'] }];

    writeScopedPerfis(scope, perfis);
    expect(readScopedPerfis(scope)).toEqual(perfis);

    writeScopedAuthStorage('perfis_custom', scope, '{invalid');
    expect(readScopedPerfis(scope)).toBeNull();
  });

  it('detecta e remove a chave legada sem nunca convertê-la em autoridade', () => {
    localStorage.setItem('airtrust_perfis_custom', '[{"value":"ADMINISTRADOR"}]');
    expect(hasLegacyPerfisCache()).toBe(true);

    clearLegacyPerfisCache();

    expect(hasLegacyPerfisCache()).toBe(false);
  });
});
