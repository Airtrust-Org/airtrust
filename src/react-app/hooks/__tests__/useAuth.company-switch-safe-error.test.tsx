import type { ReactNode } from 'react';
import { renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { AuthContext, type AuthContextType } from '@/react-app/context/auth-context';
import { useAuth } from '../useAuth';

describe('useAuth company switch errors', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('keeps technical tenant-switch failures out of the visible error', async () => {
    const technicalError = new Error(
      'SQLITE_ERROR: no such table: usuarios_empresas at worker.ts:418:11',
    );
    const selectEmpresa = vi.fn().mockRejectedValue(technicalError);
    const contextValue: AuthContextType = {
      user: {
        id: 1,
        email: 'qa@example.invalid',
        nome: 'QA User',
        role: 'ADMINISTRADOR',
        permissions: [],
        funcionario_id: 1,
      },
      token: 'token',
      empresas: [],
      empresaAtualId: 1,
      isAuthenticated: true,
      isLoading: false,
      login: vi.fn(),
      logout: vi.fn(),
      refreshToken: vi.fn(),
      selectEmpresa,
      refreshEmpresas: vi.fn(),
    };
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const wrapper = ({ children }: { children: ReactNode }) => (
      <AuthContext.Provider value={contextValue}>{children}</AuthContext.Provider>
    );

    const { result } = renderHook(() => useAuth(), { wrapper });

    await expect(result.current.selectEmpresa(2)).rejects.toThrow(
      'Não foi possível trocar de empresa. Tente novamente.',
    );
    expect(selectEmpresa).toHaveBeenCalledWith(2);
    expect(consoleError).toHaveBeenCalledWith('[Auth] Falha ao trocar empresa', technicalError);
  });
});
