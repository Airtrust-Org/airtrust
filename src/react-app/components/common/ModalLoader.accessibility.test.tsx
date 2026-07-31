import { lazy, type ComponentType } from 'react';
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { ModalLoader } from './ModalLoader';

const PendingModal = lazy(
  () => new Promise<{ default: ComponentType }>(() => undefined),
);

describe('ModalLoader accessibility', () => {
  it('anuncia o carregamento quando o modal aberto esta suspenso', () => {
    render(
      <ModalLoader isOpen>
        <PendingModal />
      </ModalLoader>,
    );

    const status = screen.getByRole('status');
    expect(status).toHaveTextContent('Carregando...');
    expect(status).toHaveAttribute('aria-live', 'polite');
    expect(status).toHaveAttribute('aria-atomic', 'true');
    expect(status).toHaveAttribute('aria-busy', 'true');
    expect(status.querySelector('[aria-hidden="true"]')).not.toBeNull();
  });

  it('nao expoe o fallback quando o modal suspenso esta fechado', () => {
    render(
      <ModalLoader isOpen={false}>
        <PendingModal />
      </ModalLoader>,
    );

    expect(screen.queryByRole('status')).not.toBeInTheDocument();
    expect(screen.queryByText('Carregando...')).not.toBeInTheDocument();
  });

  it('renderiza normalmente filhos que nao suspendem', () => {
    render(
      <ModalLoader isOpen>
        <div>Conteúdo carregado</div>
      </ModalLoader>,
    );

    expect(screen.getByText('Conteúdo carregado')).toBeVisible();
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
  });
});
