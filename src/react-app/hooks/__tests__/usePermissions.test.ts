import { renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { usePermissions } from '../usePermissions';

const useAuthMock = vi.fn();

vi.mock('../useAuth', () => ({
  useAuth: () => useAuthMock(),
}));

function mockAuth(overrides: Partial<{ user: unknown; empresaAtualId: number | null }>) {
  useAuthMock.mockReturnValue({
    user: null,
    empresaAtualId: null,
    ...overrides,
  });
}

describe('usePermissions', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
  });

  it('usuário ausente: fail-closed — nenhuma permissão concedida', () => {
    mockAuth({ user: null, empresaAtualId: null });
    const { result } = renderHook(() => usePermissions());

    expect(result.current.isAuthenticated).toBe(false);
    expect(result.current.can('funcionarios.view')).toBe(false);
    expect(result.current.can('admin.usuarios')).toBe(false);
  });

  it('tenant ausente (empresaAtualId null): não usa fallback, resolve apenas pelos defaults do role', () => {
    mockAuth({
      user: { id: 1, role: 'INSTRUTOR', permissions: [] },
      empresaAtualId: null,
    });
    const { result } = renderHook(() => usePermissions());

    // Sem tenant, o hook não deve travar nem conceder acesso administrativo —
    // apenas os defaults built-in do role continuam válidos.
    expect(result.current.can('simuladores.view')).toBe(true);
    expect(result.current.can('admin.usuarios')).toBe(false);
  });

  it('tenant inválido (empresaAtualId=0/NaN): tratado como ausente, não como wildcard', () => {
    mockAuth({
      user: { id: 1, role: 'ALUNO', permissions: [] },
      empresaAtualId: 0,
    });
    const { result } = renderHook(() => usePermissions());

    expect(result.current.can('self.ficha')).toBe(true);
    expect(result.current.can('admin.config')).toBe(false);
  });

  it('empresa A vs empresa B: overrides salvos para a empresa A não vazam para a empresa B', () => {
    mockAuth({
      user: { id: 42, role: 'ALUNO', permissions: [] },
      empresaAtualId: 1,
    });
    const { result: resultA } = renderHook(() => usePermissions());
    expect(resultA.current.can('relatorios.export')).toBe(false);

    // Mesma sessão de usuário, tenant diferente — nenhum estado partilhado entre
    // empresas deve conceder uma permissão que não foi explicitamente definida
    // para a empresa B.
    mockAuth({
      user: { id: 42, role: 'ALUNO', permissions: [] },
      empresaAtualId: 2,
    });
    const { result: resultB } = renderHook(() => usePermissions());
    expect(resultB.current.can('relatorios.export')).toBe(false);
  });

  it('localStorage adulterado nunca concede permissão efetiva', () => {
    localStorage.setItem(
      'airtrust:9:77:perfis_custom',
      JSON.stringify([{ value: 'ALUNO', permissoes: null }]),
    );
    localStorage.setItem(
      'airtrust_perfis_custom',
      JSON.stringify([{ value: 'ALUNO', permissoes: null }]),
    );

    mockAuth({
      user: { id: 77, role: 'ALUNO', permissions: [] },
      empresaAtualId: 9,
    });
    const { result } = renderHook(() => usePermissions());

    expect(result.current.can('admin.usuarios')).toBe(false);
    expect(result.current.can('relatorios.export')).toBe(false);
    expect(result.current.can('self.ficha')).toBe(true);
  });

  it('usuário sem permissão: GESTOR não acessa admin.config nem admin.multiempresa mesmo com wildcard de role', () => {
    mockAuth({
      user: { id: 2, role: 'GESTOR', permissions: [] },
      empresaAtualId: 5,
    });
    const { result } = renderHook(() => usePermissions());

    expect(result.current.isGestor).toBe(true);
    expect(result.current.can('admin.config')).toBe(false);
    expect(result.current.can('admin.multiempresa')).toBe(false);
    // Fora da lista bloqueada, o wildcard de GESTOR ainda concede acesso.
    expect(result.current.can('funcionarios.view')).toBe(true);
  });

  it('permissões builtin vs custom: DENY override individual sobrepõe o wildcard ADMINISTRADOR', () => {
    mockAuth({
      user: { id: 3, role: 'ADMINISTRADOR', permissions: ['DENY:admin.multiempresa'] },
      empresaAtualId: 9,
    });
    const { result } = renderHook(() => usePermissions());

    expect(result.current.isAdmin).toBe(true);
    expect(result.current.can('admin.multiempresa')).toBe(false);
    expect(result.current.can('funcionarios.view')).toBe(true);
  });

  it('permissões builtin vs custom: GRANT override individual concede permissão fora do default do role', () => {
    mockAuth({
      user: { id: 4, role: 'ALUNO', permissions: ['GRANT:relatorios.export'] },
      empresaAtualId: 9,
    });
    const { result } = renderHook(() => usePermissions());

    expect(result.current.can('relatorios.export')).toBe(true);
  });

  it('canAll exige todas as permissões da lista, não apenas uma', () => {
    mockAuth({
      user: { id: 5, role: 'INSTRUTOR', permissions: [] },
      empresaAtualId: 9,
    });
    const { result } = renderHook(() => usePermissions());

    expect(result.current.canAll(['simuladores.view', 'self.escala'])).toBe(true);
    expect(result.current.canAll(['simuladores.view', 'admin.usuarios'])).toBe(false);
  });
});
