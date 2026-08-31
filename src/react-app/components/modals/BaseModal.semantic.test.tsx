import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { BaseModal } from './BaseModal';

describe('BaseModal semantic accessibility', () => {
  it('provides an accessible dialog and a 44px close target', () => {
    render(
      <BaseModal isOpen onClose={vi.fn()} title="Editar cadastro">
        Conteúdo
      </BaseModal>,
    );

    expect(screen.getByRole('dialog', { name: 'Editar cadastro' })).toHaveClass('at-surface');
    expect(screen.getByRole('button', { name: 'Fechar' })).toHaveClass(
      'min-h-11',
      'min-w-11',
      'at-focus',
    );
  });

  it('keeps footer actions stacked on narrow screens and horizontal from sm up', () => {
    render(
      <BaseModal
        isOpen
        onClose={vi.fn()}
        title="Confirmar ação"
        footer={<button type="button">Salvar</button>}
      >
        Conteúdo
      </BaseModal>,
    );

    const footer = screen.getByRole('button', { name: 'Salvar' }).parentElement;
    expect(footer).toHaveClass('flex-col-reverse', 'items-stretch', 'sm:flex-row', 'sm:items-center');
  });
});
