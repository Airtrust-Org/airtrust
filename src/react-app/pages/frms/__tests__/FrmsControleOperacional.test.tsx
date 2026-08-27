import { render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { describe, expect, it } from 'vitest';
import FrmsControleOperacional from '../FrmsControleOperacional';

function renderLegacyRoute() {
  return render(
    <MemoryRouter initialEntries={['/frms/controle-operacional']}>
      <Routes>
        <Route path="/frms/controle-operacional" element={<FrmsControleOperacional />} />
        <Route path="/frms" element={<div>Operação FRMS canônica</div>} />
      </Routes>
    </MemoryRouter>,
  );
}

describe('FrmsControleOperacional legado', () => {
  it('redireciona para a única superfície operacional em /frms', () => {
    renderLegacyRoute();
    expect(screen.getByText('Operação FRMS canônica')).toBeInTheDocument();
  });
});
