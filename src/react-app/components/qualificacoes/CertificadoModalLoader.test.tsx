import type { ComponentType } from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { CertificadoModalLoader } from './CertificadoModalLoader';

function getBaseProps() {
  return {
    isOpen: true,
    onClose: vi.fn(),
    qualificacao: {
      id: 123,
      funcionario_id: 10,
      funcionario_nome: 'Tripulante Teste',
      matricula: '00123',
      qualificacao_nome: 'CRM Recorrente',
      codigo: 'CRM',
      data_conclusao: '2026-06-15',
    },
  };
}

describe('CertificadoModalLoader', () => {
  it('mostra fallback visivel durante o carregamento lazy', async () => {
    let resolveLoader: ((value: { default: ComponentType<any> }) => void) | null = null;
    const loader = vi.fn(
      () =>
        new Promise<{ default: ComponentType<any> }>((resolve) => {
          resolveLoader = resolve;
        }),
    );

    render(<CertificadoModalLoader {...getBaseProps()} loadComponent={loader} />);

    expect(screen.getByText('Carregando modal de certificados')).toBeInTheDocument();

    resolveLoader?.({
      default: () => <div>Modal carregado</div>,
    });

    await waitFor(() => {
      expect(screen.getByText('Modal carregado')).toBeInTheDocument();
    });
  });

  it('mostra erro amigavel e permite retry do import lazy', async () => {
    const loader = vi
      .fn<() => Promise<{ default: ComponentType<any> }>>()
      .mockRejectedValueOnce(new Error('lazy modal failed'))
      .mockResolvedValueOnce({
        default: () => <div>Modal carregado apos retry</div>,
      });

    render(<CertificadoModalLoader {...getBaseProps()} loadComponent={loader} />);

    await waitFor(() => {
      expect(
        screen.getByText('Nao foi possivel abrir o modal de certificados'),
      ).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole('button', { name: 'Tentar novamente' }));

    await waitFor(() => {
      expect(screen.getByText('Modal carregado apos retry')).toBeInTheDocument();
    });
  });
});
