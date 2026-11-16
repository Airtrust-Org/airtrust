import { renderHook } from '@testing-library/react';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  SESSION_ROLE_COOKIE,
  clearActiveSessionRole,
  readActiveSessionRole,
  useAuth,
} from '../useAuth';
import { AuthContext } from '../../context/auth-context';
import { getTabSessionRole, setTabSessionRole } from '../../lib/session-role-preference';

function setCookie(value: string) {
  document.cookie = `${SESSION_ROLE_COOKIE}=${encodeURIComponent(value)}; Path=/`;
}

beforeEach(() => {
  clearActiveSessionRole();
});

describe('perfil ativo de sessão no cliente', () => {
  it('readActiveSessionRole lê o cookie de perfil selecionado', () => {
    expect(readActiveSessionRole()).toBeNull();
    setCookie('INSTRUTOR');
    expect(readActiveSessionRole()).toBe('INSTRUTOR');
  });

  it('clearActiveSessionRole remove o cookie e a preferência isolada da aba', () => {
    setCookie('ALUNO');
    setTabSessionRole('GESTOR');
    expect(getTabSessionRole()).toBe('GESTOR');
    clearActiveSessionRole();
    expect(readActiveSessionRole()).toBeNull();
    expect(getTabSessionRole()).toBeNull();
  });

  it('não aceita preferências locais de perfil inválido', () => {
    expect(() => setTabSessionRole('ADMIN_ROOT')).toThrow('Perfil de sessão inválido');
    expect(getTabSessionRole()).toBeNull();
  });

  it('useAuth não confia em cookie alterável para mudar user.role', () => {
    const baseUser = { id: 1, nome: 'Fulano', role: 'GESTOR', email: 'f@x.io' };
    const logout = vi.fn();
    const selectEmpresa = vi.fn().mockResolvedValue(undefined);
    const ctx = {
      user: baseUser,
      isLoading: false,
      isAuthenticated: true,
      login: vi.fn(),
      logout,
      selectEmpresa,
    } as unknown as Parameters<typeof AuthContext.Provider>[0]['value'];

    const wrapper = ({ children }: { children: ReactNode }) => (
      <AuthContext.Provider value={ctx}>{children}</AuthContext.Provider>
    );

    setCookie('ADMINISTRADOR');
    const { result } = renderHook(() => useAuth(), { wrapper });
    expect(result.current.user?.role).toBe('GESTOR');
    expect(baseUser.role).toBe('GESTOR');
  });

  it('logout e selectEmpresa limpam a seleção de perfil', async () => {
    const logout = vi.fn();
    const selectEmpresa = vi.fn().mockResolvedValue(undefined);
    const ctx = {
      user: { id: 1, role: 'GESTOR' },
      isLoading: false,
      isAuthenticated: true,
      login: vi.fn(),
      logout,
      selectEmpresa,
    } as unknown as Parameters<typeof AuthContext.Provider>[0]['value'];

    const wrapper = ({ children }: { children: ReactNode }) => (
      <AuthContext.Provider value={ctx}>{children}</AuthContext.Provider>
    );

    setCookie('ALUNO');
    const { result } = renderHook(() => useAuth(), { wrapper });

    result.current.logout();
    expect(logout).toHaveBeenCalled();
    expect(readActiveSessionRole()).toBeNull();

    setCookie('ALUNO');
    await result.current.selectEmpresa(42);
    expect(selectEmpresa).toHaveBeenCalledWith(42);
    expect(readActiveSessionRole()).toBeNull();
  });
});
