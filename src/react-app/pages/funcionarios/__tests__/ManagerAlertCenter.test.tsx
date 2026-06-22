import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import ManagerAlertCenter from '../ManagerAlertCenter';

const useAuthMock = vi.fn();
const usePermissionsMock = vi.fn();
const useMetricsQueryMock = vi.fn();
const useAlertasQueryMock = vi.fn();
const useFrmsAlertasQueryMock = vi.fn();
const useSgsoChecklistQueryMock = vi.fn();
const useSimuladoresAlertasQueryMock = vi.fn();
const useFrmsOperationalSnapshotMock = vi.fn();

vi.mock('@/react-app/hooks/useAuth', () => ({
  useAuth: () => useAuthMock(),
}));

vi.mock('@/react-app/hooks/usePermissions', () => ({
  usePermissions: () => usePermissionsMock(),
}));

vi.mock('@/react-app/pages/dashboard/queries', () => ({
  useMetricsQuery: (enabled?: boolean) => useMetricsQueryMock(enabled),
  useAlertasQuery: (enabled?: boolean) => useAlertasQueryMock(enabled),
  useFrmsAlertasQuery: (enabled?: boolean) => useFrmsAlertasQueryMock(enabled),
  useSgsoChecklistQuery: (enabled?: boolean) => useSgsoChecklistQueryMock(enabled),
  useSimuladoresAlertasQuery: (enabled?: boolean) => useSimuladoresAlertasQueryMock(enabled),
}));

vi.mock('@/react-app/hooks/useFrmsOperationalSnapshot', () => ({
  useFrmsOperationalSnapshot: (filters: unknown) => useFrmsOperationalSnapshotMock(filters),
}));

function renderCenter() {
  return render(
    <MemoryRouter>
      <ManagerAlertCenter />
    </MemoryRouter>,
  );
}

describe('ManagerAlertCenter', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useAuthMock.mockReturnValue({
      empresaAtualId: 7,
      empresas: [{ id: 7, modulos_ativos: ['frms', 'sgso', 'simuladores', 'qualificacoes', 'lms'] }],
    });
    usePermissionsMock.mockReturnValue({
      isAdmin: false,
      isGestor: true,
      can: () => true,
    });
  });

  it('nao renderiza a central para gestor enquanto o hotfix estiver ativo', () => {
    renderCenter();

    expect(screen.queryByText('Central de Alertas do Gestor')).not.toBeInTheDocument();
    expect(screen.queryByText('O que precisa de ação agora')).not.toBeInTheDocument();
    expect(screen.queryByText(/Fontes parciais: FRMS/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/Ver fichas/i)).not.toBeInTheDocument();
    expect(useMetricsQueryMock).not.toHaveBeenCalled();
    expect(useAlertasQueryMock).not.toHaveBeenCalled();
    expect(useFrmsAlertasQueryMock).not.toHaveBeenCalled();
    expect(useSgsoChecklistQueryMock).not.toHaveBeenCalled();
    expect(useSimuladoresAlertasQueryMock).not.toHaveBeenCalled();
    expect(useFrmsOperationalSnapshotMock).not.toHaveBeenCalled();
  });

  it('nao renderiza a central nem consulta dados para admin principal', () => {
    usePermissionsMock.mockReturnValue({
      isAdmin: true,
      isGestor: false,
      can: () => true,
    });

    renderCenter();

    expect(screen.queryByText('Central de Alertas do Gestor')).not.toBeInTheDocument();
    expect(screen.queryByText('O que precisa de ação agora')).not.toBeInTheDocument();
    expect(useMetricsQueryMock).not.toHaveBeenCalled();
    expect(useAlertasQueryMock).not.toHaveBeenCalled();
    expect(useFrmsAlertasQueryMock).not.toHaveBeenCalled();
    expect(useSgsoChecklistQueryMock).not.toHaveBeenCalled();
    expect(useSimuladoresAlertasQueryMock).not.toHaveBeenCalled();
    expect(useFrmsOperationalSnapshotMock).not.toHaveBeenCalled();
  });
});
