import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import HomeRouter from '../HomeRouter';

const { authMock, buscarPorIdMock } = vi.hoisted(() => ({
  authMock: vi.fn(),
  buscarPorIdMock: vi.fn(),
}));

vi.mock('../../hooks/useAuth', () => ({
  useAuth: () => authMock(),
}));

vi.mock('../../services/funcionarios.service', () => ({
  funcionariosService: {
    buscarPorId: buscarPorIdMock,
  },
}));

vi.mock('../../pages/DashboardPrincipal', () => ({
  default: () => <div>dashboard-principal</div>,
}));

vi.mock('../../pages/HomePerfil', () => ({
  default: ({
    homeProfile,
    funcionarioContext,
  }: {
    homeProfile?: string;
    funcionarioContext?: { setor?: string | null } | null;
  }) => (
    <div>
      {`home-profile:${homeProfile ?? 'undefined'}:${funcionarioContext?.setor ?? 'sem-setor'}`}
    </div>
  ),
}));

function renderHomeRouter(initialEntry: string) {
  return render(
    <MemoryRouter initialEntries={[initialEntry]}>
      <Routes>
        <Route path="/" element={<HomeRouter />} />
        <Route path="/home" element={<HomeRouter />} />
        <Route path="/funcionarios" element={<div>funcionarios-page</div>} />
      </Routes>
    </MemoryRouter>,
  );
}

describe('HomeRouter', () => {
  beforeEach(() => {
    authMock.mockReturnValue({
      user: { nome: 'Teste Usuario', role: 'ALUNO', funcionario_id: 10 },
      isLoading: false,
    });
    buscarPorIdMock.mockReset();
    buscarPorIdMock.mockResolvedValue({
      id: 10,
      funcao: 'Aluno',
      cargo: 'Aluno',
      setor: 'Administrativo',
      setor_id: 1,
    });
  });

  it('renderiza o dashboard apenas para o admin principal allowlisted', () => {
    authMock.mockReturnValue({
      user: {
        nome: 'Filipe Daumas',
        email: 'filipe.daumas@icloud.com',
        role: 'ADMINISTRADOR',
        funcionario_id: null,
      },
      isLoading: false,
    });

    renderHomeRouter('/');

    expect(screen.getByText('dashboard-principal')).toBeInTheDocument();
    expect(buscarPorIdMock).not.toHaveBeenCalled();
  });

  it.each(['GESTOR', 'ADMINISTRADOR'])(
    'redireciona %s comum para /funcionarios',
    async (role) => {
      authMock.mockReturnValue({
        user: {
          nome: 'Backoffice',
          email: 'admin@empresa.com',
          role,
          funcionario_id: 25,
        },
        isLoading: false,
      });

      renderHomeRouter('/');

      await waitFor(() => {
        expect(screen.getByText('funcionarios-page')).toBeInTheDocument();
      });
      expect(buscarPorIdMock).not.toHaveBeenCalled();
    },
  );

  it('resolve home profile por setor existente do funcionario', async () => {
    buscarPorIdMock.mockResolvedValue({
      id: 10,
      funcao: 'Mecanico',
      cargo: 'Tecnico',
      setor: 'Manutenção',
      setor_id: 6,
    });

    renderHomeRouter('/home');

    await waitFor(() => {
      expect(
        screen.getByText('home-profile:STUDENT_MANUTENCAO:Manutenção'),
      ).toBeInTheDocument();
    });
    expect(buscarPorIdMock).toHaveBeenCalledWith('10');
  });
});
