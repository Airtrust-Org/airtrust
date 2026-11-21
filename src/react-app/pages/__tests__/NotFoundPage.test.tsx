import React from 'react';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it } from 'vitest';

import NotFoundPage from '../NotFoundPage';

describe('NotFoundPage', () => {
  it('mostra título, o caminho inexistente e links de saída dentro de um landmark main', () => {
    render(
      <MemoryRouter initialEntries={['/pasta-virtual']}>
        <NotFoundPage />
      </MemoryRouter>,
    );
    expect(screen.getByRole('main')).toBeTruthy();
    expect(screen.getByRole('heading', { level: 1, name: 'Página não encontrada' })).toBeTruthy();
    expect(screen.getByText('/pasta-virtual')).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Ir para o painel' }).getAttribute('href')).toBe('/');
    expect(screen.getByRole('link', { name: 'Entrar com outra conta' }).getAttribute('href')).toBe('/login');
  });
});
