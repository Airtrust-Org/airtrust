import React from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';

import { Badge } from './Badge';
import { Input, Select, TextArea } from './Input';
import { StatusBadge } from './StatusBadge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from './Table';
import { WidgetError } from './widget-states';

describe('semantic UI primitives', () => {
  it('uses the canonical semantic status classes for generic and domain badges', () => {
    const { rerender } = render(<Badge variant="danger">Falhou</Badge>);
    expect(screen.getByText('Falhou')).toHaveClass('at-status-critical');

    rerender(<StatusBadge status="ALERTA" />);
    expect(screen.getByText('Alerta')).toHaveClass('at-status-risk');

    rerender(<StatusBadge status="A_VENCER" />);
    expect(screen.getByText('A vencer')).toHaveClass('at-status-attention');

    rerender(<StatusBadge status="RENOVADA" />);
    expect(screen.getByText('Renovada')).toHaveClass('at-status-info');
  });

  it('keeps controls associated with labels, errors and semantic field styling', async () => {
    const user = userEvent.setup();
    render(
      <>
        <Input label="Nome" error="Informe o nome" required />
        <TextArea label="Observações" helperText="Opcional" />
        <Select label="Situação" options={[{ value: 'ativo', label: 'Ativo' }]} />
      </>,
    );

    const name = screen.getByLabelText(/Nome/);
    await user.click(name);
    expect(name).toHaveFocus();
    expect(name).toHaveAttribute('aria-invalid', 'true');
    expect(name).toHaveClass('at-field', 'at-focus');
    expect(screen.getByRole('alert')).toHaveTextContent('Informe o nome');

    expect(screen.getByLabelText('Observações')).toHaveClass('at-field', 'at-focus');
    expect(screen.getByLabelText('Situação')).toHaveClass('at-field', 'at-focus');
  });

  it('provides a keyboard-focusable horizontal table region and an adequate retry target', () => {
    render(
      <>
        <Table>
          <TableHeader>
            <TableRow><TableHead>Nome</TableHead></TableRow>
          </TableHeader>
          <TableBody>
            <TableRow><TableCell>Ana</TableCell></TableRow>
          </TableBody>
        </Table>
        <WidgetError onRetry={() => undefined} />
      </>,
    );

    expect(screen.getByRole('region', { name: 'Tabela rolável horizontalmente' })).toHaveAttribute(
      'tabindex',
      '0',
    );
    expect(screen.getByRole('button', { name: 'Tentar novamente' })).toHaveClass('min-h-11', 'at-focus');
  });
});
