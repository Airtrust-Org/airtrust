/**
 * gestor-operational-domain-rbac: the "Manutenção" (MRO) nav group must
 * disappear from the sidebar for a gestor without the MANUTENCAO domain
 * once a tenant's flag is on, and stay visible (module-gating unchanged)
 * while the flag is off.
 */
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { describe, expect, it, vi } from 'vitest';
import MainSidebar from '../MainSidebar';

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

vi.mock('../../hooks/useSystemSettings', () => ({
  useSystemSettings: () => ({ logoSrc: '/logo.png' }),
}));

// The pre-existing (unrelated) dev-module email allowlist in
// development-module-nav.ts also hides MRO from the sidebar entirely for
// any non-primary-admin user, independent of this RBAC feature. Using the
// primary-admin identity here isolates the NEW operational-domain gate
// under test from that separate, pre-existing restriction.
function baseAuth() {
  return {
    user: { name: 'Admin Gestor', role: 'ADMINISTRADOR', email: 'filipe.daumas@icloud.com' },
    empresas: [
      {
        id: 1,
        nome: 'AirTrust',
        modulos_ativos: ['dashboard', 'funcionarios', 'mro'],
      },
    ],
    empresaAtualId: 1,
  };
}

function renderSidebar() {
  return render(
    <MemoryRouter>
      <MainSidebar />
    </MemoryRouter>,
  );
}

describe('MainSidebar MRO operational-domain gating', () => {
  it('flag desativada: menu Manutenção (MRO) visível', () => {
    authMock.mockReturnValue(baseAuth());
    operationalAccessMock.mockReturnValue({ enabled: false, hasDomain: () => false });

    renderSidebar();

    expect(screen.getByText('Manutenção')).toBeInTheDocument();
  });

  it('flag ativada + gestor sem domínio MANUTENCAO: menu Manutenção some', () => {
    authMock.mockReturnValue(baseAuth());
    operationalAccessMock.mockReturnValue({
      enabled: true,
      hasDomain: (d: string) => d === 'OPERACOES',
    });

    renderSidebar();

    expect(screen.queryByText('Manutenção')).not.toBeInTheDocument();
  });

  it('flag ativada + gestor com domínio MANUTENCAO: menu Manutenção continua visível', () => {
    authMock.mockReturnValue(baseAuth());
    operationalAccessMock.mockReturnValue({
      enabled: true,
      hasDomain: (d: string) => d === 'MANUTENCAO',
    });

    renderSidebar();

    expect(screen.getByText('Manutenção')).toBeInTheDocument();
  });
});
