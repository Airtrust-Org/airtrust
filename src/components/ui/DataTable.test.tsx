import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { DataTable, type Column } from './DataTable';
import { buildUserScopedStorageKey } from '../../react-app/utils/userPreferences';

type TestRow = {
  id: number;
  nome: string;
  codigo: string;
};

const columns: Column<TestRow>[] = [
  {
    id: 'nome',
    label: 'Nome',
    accessor: (row) => row.nome,
    visible: true,
  },
  {
    id: 'codigo',
    label: 'Codigo',
    accessor: (row) => row.codigo,
    visible: true,
  },
];

describe('components/ui/DataTable', () => {
  it('restaura pelo menos uma coluna visivel quando a preferencia salva esconde todas', () => {
    const storageKey = buildUserScopedStorageKey('airtrust_datatable_qualificacoes-historico');
    localStorage.setItem(
      storageKey,
      JSON.stringify({
        visibility: {
          nome: false,
          codigo: false,
        },
        order: ['nome', 'codigo'],
      }),
    );

    render(
      <DataTable
        tableId="qualificacoes-historico"
        data={[{ id: 1, nome: 'Tripulante Teste', codigo: 'CRM' }]}
        columns={columns}
        virtualizeRows={false}
      />,
    );

    expect(screen.getByText('Nome')).toBeInTheDocument();
    expect(screen.getByText('Tripulante Teste')).toBeInTheDocument();
  });

  it('desliga virtualizacao para tabelas paginadas pelo servidor', () => {
    const data = Array.from({ length: 100 }, (_, index) => ({
      id: index + 1,
      nome: `Item ${index + 1}`,
      codigo: `COD-${index + 1}`,
    }));

    const { container } = render(
      <DataTable
        tableId="qualificacoes-historico-server"
        data={data}
        columns={columns}
        page={1}
        total={100}
        pageSize={100}
        onPageChange={vi.fn()}
        onSortChange={vi.fn()}
      />,
    );

    expect(screen.getByText('Item 100')).toBeInTheDocument();
    expect(container.querySelector('tbody')?.className).not.toContain('block');
  });
});
