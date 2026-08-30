import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../components/AppLayout', () => ({
  default: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

vi.mock('../../hooks/useAuth', () => ({
  useAuth: () => ({
    token: 'test-token',
    refreshToken: vi.fn(),
    logout: vi.fn(),
  }),
}));

vi.mock('../../config/api', () => ({
  API_BASE_URL: 'https://api.test',
  getAccessToken: () => 'refreshed-token',
}));

vi.mock('../SgsoWorkspace', () => ({
  default: () => <div>Workspace SGSO</div>,
}));

import Sgso from '../Sgso';

function renderSgso(entry = '/sgso') {
  return render(
    <MemoryRouter initialEntries={[entry]}>
      <Routes>
        <Route path="/sgso" element={<Sgso />} />
        <Route path="/sgso/relprev" element={<div>RELPREV route</div>} />
        <Route path="/sgso/frat" element={<div>FRAT route</div>} />
        <Route path="/sgso/bowtie" element={<div>Bowtie route</div>} />
      </Routes>
    </MemoryRouter>,
  );
}

function mockResumo(
  resumo: {
    ncs_abertas: number;
    backlog_triagem_24h?: number;
    frat_alto_sem_aprovacao?: number;
    barreiras_degradadas?: number;
  },
) {
  vi.stubGlobal(
    'fetch',
    vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ success: true, data: { resumo } }),
    }),
  );
}

describe('SGSO operational entry', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('prioritizes real pending work instead of rendering navigation cards as a dashboard', async () => {
    mockResumo({
      ncs_abertas: 4,
      backlog_triagem_24h: 3,
      frat_alto_sem_aprovacao: 2,
      barreiras_degradadas: 1,
    });

    renderSgso();

    expect(screen.getByRole('heading', { name: 'SGSO' })).toBeInTheDocument();
    expect(await screen.findByText('FRAT de alto risco sem aprovação')).toBeInTheDocument();
    expect(screen.getByText('Barreiras degradadas')).toBeInTheDocument();
    expect(screen.getByText('Relatos aguardando triagem há mais de 24 h')).toBeInTheDocument();
    expect(screen.getByText('Não conformidades abertas')).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Áreas de trabalho' })).not.toBeInTheDocument();
    expect(screen.queryByText('Workspace SGSO')).not.toBeInTheDocument();
  });

  it('shows a calm healthy state when the operational summary has no active pending items', async () => {
    mockResumo({
      ncs_abertas: 0,
      backlog_triagem_24h: 0,
      frat_alto_sem_aprovacao: 0,
      barreiras_degradadas: 0,
    });

    renderSgso();

    expect(
      await screen.findByText('Nenhuma pendência crítica no resumo operacional'),
    ).toBeInTheDocument();
    expect(screen.getByRole('navigation', { name: 'Áreas do SGSO' })).toBeInTheDocument();
    expect(screen.getByRole('navigation', { name: 'Ferramentas do SGSO' })).toBeInTheDocument();
  });

  it('preserves the selected operational area when opening the full workspace', async () => {
    mockResumo({ ncs_abertas: 0 });
    renderSgso();

    await screen.findByText('Nenhuma pendência crítica no resumo operacional');
    fireEvent.click(screen.getByRole('button', { name: 'Auditorias' }));

    expect(localStorage.getItem('airtrust.sgso.activeTab')).toBe('auditorias');
    expect(screen.getByText('Workspace SGSO')).toBeInTheDocument();
  });

  it('opens the full workspace directly when requested by query string without loading the summary', () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    renderSgso('/sgso?view=workspace');

    expect(screen.getByText('Workspace SGSO')).toBeInTheDocument();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('keeps direct SGSO tools reachable from the compact secondary navigation', async () => {
    mockResumo({ ncs_abertas: 0 });
    renderSgso();

    await screen.findByText('Nenhuma pendência crítica no resumo operacional');
    fireEvent.click(screen.getByRole('button', { name: 'RELPREV' }));

    expect(screen.getByText('RELPREV route')).toBeInTheDocument();
  });

  it('fails safely without exposing technical API details', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockRejectedValue(new Error('SQLITE_ERROR: internal stack trace')),
    );

    renderSgso();

    expect(await screen.findByText('Resumo operacional indisponível')).toBeInTheDocument();
    expect(screen.getByText(/As áreas do SGSO continuam acessíveis/i)).toBeInTheDocument();
    expect(screen.queryByText(/SQLITE_ERROR|stack trace/i)).not.toBeInTheDocument();
  });
});
