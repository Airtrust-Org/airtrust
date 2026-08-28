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

  it('clearActiveSessionRole remove a seleção', () => {
    setCookie('ALUNO');
    clearActiveSessionRole();
    expect(readActiveSessionRole()).toBeNull();
  });

  it('useAuth reflete o perfil selecionado no user.role sem alterar o contexto base', () => {
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

    setCookie('INSTRUTOR');
    const { result } = renderHook(() => useAuth(), { wrapper });
    expect(result.current.user?.role).toBe('INSTRUTOR');
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
