/**
 * Guardas de rota das telas de fichas de treinamento de voo:
 * - /simuladores/fichas/para-avaliar exige a capability 'simuladores.evaluate'
 *   (mesmo nome usado pelo backend em GET /fichas/para-avaliar).
 * - /simuladores/fichas (legado) redireciona não-administrativos para a
 *   tela dedicada correta; admin/gestor mantêm a visão administrativa formal.
 */
import { render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';

const { permissionsMock, authMock } = vi.hoisted(() => ({
  permissionsMock: vi.fn(),
  authMock: vi.fn(),
}));

vi.mock('@/react-app/hooks/usePermissions', () => ({
  usePermissions: () => permissionsMock(),
}));

vi.mock('@/react-app/hooks/useAuth', () => ({
  useAuth: () => authMock(),
}));

vi.mock('@/react-app/config/api', () => ({
  API_BASE_URL: 'http://localhost:8787',
  getAccessToken: () => 'mock-access',
}));

vi.mock('@/react-app/components/AppLayout', () => ({
  default: ({ children }: { children: React.ReactNode }) => <div data-testid="app-layout">{children}</div>,
}));

vi.mock('@/react-app/components/modals/ModalAvaliarFicha', () => ({ default: () => null }));
vi.mock('@/react-app/components/AssinaturaModal', () => ({ default: () => null }));
vi.mock('@/react-app/components/modals/ConfirmDeleteModal', () => ({ ConfirmDeleteModal: () => null }));
vi.mock('sonner', () => ({ toast: { error: vi.fn(), success: vi.fn(), warning: vi.fn() } }));

function jsonResponse(body: unknown, status = 200) {
  return Promise.resolve(new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } }));
}

function stubEmptyFetch() {
  vi.stubGlobal('fetch', vi.fn().mockImplementation(() => jsonResponse({ success: true, data: [] })));
}

async function renderAtWithRoutes(initialPath: string, routeElement: React.ReactElement, routePath: string) {
  render(
    <MemoryRouter initialEntries={[initialPath]}>
      <Routes>
        <Route path={routePath} element={routeElement} />
        <Route path="/simuladores/fichas/minhas" element={<div>ROTA_MINHAS</div>} />
        <Route path="/simuladores/fichas/para-avaliar" element={<div>ROTA_PARA_AVALIAR</div>} />
      </Routes>
    </MemoryRouter>,
  );
}

describe('/simuladores/fichas/para-avaliar — capability gate', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.clearAllMocks();
    vi.resetModules();
  });

  it('sem simuladores.evaluate: redireciona para /simuladores/fichas/minhas e não monta a tela', async () => {
    permissionsMock.mockReturnValue({ isAdmin: false, isGestor: false, isAluno: true, isInstrutor: false, can: () => false });
    authMock.mockReturnValue({ user: { id: 3, email: 'aluno@test', nome: 'Aluno', role: 'ALUNO', permissions: [], funcionario_id: 10 } });
    stubEmptyFetch();

    const { default: ParaAvaliarPage } = await import('../para-avaliar');
    await renderAtWithRoutes('/simuladores/fichas/para-avaliar', <ParaAvaliarPage />, '/simuladores/fichas/para-avaliar');

    expect(await screen.findByText('ROTA_MINHAS')).toBeInTheDocument();
    expect(screen.queryByTestId('app-layout')).toBeNull();
    expect(screen.queryByText('Fichas de Treinamento de Voo para Avaliar')).toBeNull();
  });

  it('com simuladores.evaluate: monta a tela normalmente', async () => {
    permissionsMock.mockReturnValue({ isAdmin: false, isGestor: false, isAluno: false, isInstrutor: true, can: (p: string | string[]) => (Array.isArray(p) ? p : [p]).includes('simuladores.evaluate') });
    authMock.mockReturnValue({ user: { id: 2, email: 'instrutor@test', nome: 'Instrutor', role: 'INSTRUTOR', permissions: [], funcionario_id: 20 } });
    stubEmptyFetch();

    const { default: ParaAvaliarPage } = await import('../para-avaliar');
    await renderAtWithRoutes('/simuladores/fichas/para-avaliar', <ParaAvaliarPage />, '/simuladores/fichas/para-avaliar');

    expect(await screen.findByText('Fichas de Treinamento de Voo para Avaliar')).toBeInTheDocument();
    expect(screen.queryByTestId('app-layout')).not.toBeNull();
  });
});

describe('/simuladores/fichas — rota legada redireciona por capability (não-administrativos)', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.clearAllMocks();
    vi.resetModules();
  });

  it('instrutor com simuladores.evaluate é redirecionado para /simuladores/fichas/para-avaliar', async () => {
    permissionsMock.mockReturnValue({ isAdmin: false, isGestor: false, isAluno: false, isInstrutor: true, can: (p: string | string[]) => (Array.isArray(p) ? p : [p]).includes('simuladores.evaluate') });
    authMock.mockReturnValue({ user: { id: 2, email: 'instrutor@test', nome: 'Instrutor', role: 'INSTRUTOR', permissions: [], funcionario_id: 20 } });
    stubEmptyFetch();

    const { default: FichasSessao } = await import('../index');
    await renderAtWithRoutes('/simuladores/fichas', <FichasSessao />, '/simuladores/fichas');

    expect(await screen.findByText('ROTA_PARA_AVALIAR')).toBeInTheDocument();
  });

  it('aluno (sem capability) é redirecionado para /simuladores/fichas/minhas', async () => {
    permissionsMock.mockReturnValue({ isAdmin: false, isGestor: false, isAluno: true, isInstrutor: false, can: () => false });
    authMock.mockReturnValue({ user: { id: 3, email: 'aluno@test', nome: 'Aluno', role: 'ALUNO', permissions: [], funcionario_id: 10 } });
    stubEmptyFetch();

    const { default: FichasSessao } = await import('../index');
    await renderAtWithRoutes('/simuladores/fichas', <FichasSessao />, '/simuladores/fichas');

    expect(await screen.findByText('ROTA_MINHAS')).toBeInTheDocument();
  });

  it('admin mantém a visão administrativa formal (sem redirecionar)', async () => {
    permissionsMock.mockReturnValue({ isAdmin: true, isGestor: false, isAluno: false, isInstrutor: false, can: () => true });
    authMock.mockReturnValue({ user: { id: 1, email: 'admin@test', nome: 'Admin', role: 'ADMINISTRADOR', permissions: [], funcionario_id: null } });
    stubEmptyFetch();

    const { default: FichasSessao } = await import('../index');
    await renderAtWithRoutes('/simuladores/fichas', <FichasSessao />, '/simuladores/fichas');

    expect(await screen.findByTestId('app-layout')).toBeInTheDocument();
    expect(screen.queryByText('ROTA_MINHAS')).toBeNull();
    expect(screen.queryByText('ROTA_PARA_AVALIAR')).toBeNull();
  });

  it('gestor mantém a visão administrativa formal (sem redirecionar)', async () => {
    permissionsMock.mockReturnValue({ isAdmin: false, isGestor: true, isAluno: false, isInstrutor: false, can: () => true });
    authMock.mockReturnValue({ user: { id: 4, email: 'gestor@test', nome: 'Gestor', role: 'GESTOR', permissions: [], funcionario_id: null } });
    stubEmptyFetch();

    const { default: FichasSessao } = await import('../index');
    await renderAtWithRoutes('/simuladores/fichas', <FichasSessao />, '/simuladores/fichas');

    expect(await screen.findByTestId('app-layout')).toBeInTheDocument();
    expect(screen.queryByText('ROTA_MINHAS')).toBeNull();
    expect(screen.queryByText('ROTA_PARA_AVALIAR')).toBeNull();
  });
});
