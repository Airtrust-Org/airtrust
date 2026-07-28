/**
 * gestor-operational-domain-rbac: MRO is a frontend-only prototype (see
 * src/react-app/pages/mro/) classified MANUTENCAO — a gestor without the
 * MANUTENCAO domain must not reach it once a tenant's
 * operational_domain_rbac_enabled flag is on, and it must not affect
 * access when the flag is off (legacy behavior preserved).
 *
 * Uses the primary-admin identity (see development-module-nav.ts) to clear
 * the pre-existing, unrelated dev-module email allowlist gate that /mro
 * also sits behind today — that gate is independent of this RBAC feature
 * and out of scope here; this test isolates the NEW domain gate.
 */
import { render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import ProtectedRoute from '../ProtectedRoute';

const { authMock, operationalAccessMock } = vi.hoisted(() => ({
  authMock: vi.fn(),
  operationalAccessMock: vi.fn(),
}));

vi.mock('@/react-app/hooks/useAuth', () => ({
  useAuth: () => authMock(),
}));

vi.mock('@/react-app/hooks/useOperationalAccess', () => ({
  useOperationalAccess: () => operationalAccessMock(),
}));

vi.mock('@/react-app/i18n/useLanguage', () => ({
  useLanguage: () => ({ t: (key: string) => key }),
}));

const PRIMARY_ADMIN_USER = {
  name: 'Admin Gestor Manutenção',
  role: 'ADMINISTRADOR',
  email: 'filipe.daumas@icloud.com',
};

function renderMro() {
  return render(
    <MemoryRouter initialEntries={['/mro']}>
      <Routes>
        <Route
          path="/mro"
          element={
            <ProtectedRoute>
              <div>conteudo mro</div>
            </ProtectedRoute>
          }
        />
      </Routes>
    </MemoryRouter>,
  );
}

function baseAuth() {
  return {
    isAuthenticated: true,
    isLoading: false,
    user: PRIMARY_ADMIN_USER,
    empresas: [{ id: 1, nome: 'AirTrust', modulos_ativos: ['dashboard', 'funcionarios', 'mro'] }],
    empresaAtualId: 1,
  };
}

describe('ProtectedRoute MRO operational-domain gating', () => {
  it('flag desativada (legado): MRO acessível independente de domínio', () => {
    authMock.mockReturnValue(baseAuth());
    operationalAccessMock.mockReturnValue({ enabled: false, hasDomain: () => false });

    renderMro();

    expect(screen.getByText('conteudo mro')).toBeInTheDocument();
  });

  it('flag ativada + domínio MANUTENCAO: MRO acessível', () => {
    authMock.mockReturnValue(baseAuth());
    operationalAccessMock.mockReturnValue({
      enabled: true,
      hasDomain: (d: string) => d === 'MANUTENCAO',
    });

    renderMro();

    expect(screen.getByText('conteudo mro')).toBeInTheDocument();
  });

  it('flag ativada + sem domínio MANUTENCAO (gestor de Operações): MRO bloqueado', () => {
    authMock.mockReturnValue(baseAuth());
    operationalAccessMock.mockReturnValue({
      enabled: true,
      hasDomain: (d: string) => d === 'OPERACOES',
    });

    renderMro();

    expect(screen.queryByText('conteudo mro')).not.toBeInTheDocument();
    expect(screen.getByText('protected.denied.title')).toBeInTheDocument();
  });
});
