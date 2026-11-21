import React from 'react';
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { IconButton } from './IconButton';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from './Table';

describe('IconButton', () => {
  it('expõe nome acessível, type=button e alvo de 44px', () => {
    render(<IconButton label="Mês anterior" icon={<svg data-testid="ic" />} />);
    const button = screen.getByRole('button', { name: 'Mês anterior' });
    expect(button.getAttribute('type')).toBe('button');
    expect(button.className).toContain('min-h-11');
    expect(button.querySelector('[aria-hidden="true"]')).toBeTruthy();
  });
});

describe('Table accessibility', () => {
  it('usa scope=col nos cabeçalhos, legenda para leitor de tela e contêiner rolável', () => {
    const { container } = render(
      <Table caption="Usuários cadastrados">
        <TableHeader>
          <TableRow>
            <TableHead>Nome</TableHead>
            <TableHead scope="row">Linha</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          <TableRow>
            <TableCell>Ana</TableCell>
            <TableCell>1</TableCell>
          </TableRow>
        </TableBody>
      </Table>,
    );
    expect(screen.getByRole('table', { name: 'Usuários cadastrados' })).toBeTruthy();
    expect(screen.getByRole('columnheader', { name: 'Nome' }).getAttribute('scope')).toBe('col');
    expect(container.querySelector('th[scope="row"]')).toBeTruthy();
    expect(container.querySelector('.overflow-x-auto')).toBeTruthy();
  });
});
