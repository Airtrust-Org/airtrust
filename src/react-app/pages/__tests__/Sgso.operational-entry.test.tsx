import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../components/AppLayout', () => ({
  default: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
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
      </Routes>
    </MemoryRouter>,
  );
}

describe('SGSO operational entry', () => {
  beforeEach(() => localStorage.clear());

  it('starts with action-oriented work areas instead of the full dashboard', () => {
    renderSgso();

    expect(screen.getByRole('heading', { name: 'SGSO' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Relatos de segurança/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Indicadores e tendências/i })).toBeInTheDocument();
    expect(screen.queryByText('Workspace SGSO')).not.toBeInTheDocument();
  });

  it('preserves the selected operational area when opening the full workspace', () => {
    renderSgso();

    fireEvent.click(screen.getByRole('button', { name: /Auditorias/i }));

    expect(localStorage.getItem('airtrust.sgso.activeTab')).toBe('auditorias');
    expect(screen.getByText('Workspace SGSO')).toBeInTheDocument();
  });

  it('opens the full workspace directly when requested by query string', () => {
    renderSgso('/sgso?view=workspace');
    expect(screen.getByText('Workspace SGSO')).toBeInTheDocument();
  });

  it('keeps direct SGSO tools reachable from the simplified entry', () => {
    renderSgso();
    fireEvent.click(screen.getByRole('button', { name: /RELPREV/i }));
    expect(screen.getByText('RELPREV route')).toBeInTheDocument();
  });
});
