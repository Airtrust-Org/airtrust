import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { BaseModal } from './BaseModal';

describe('BaseModal', () => {
  it('nao fecha ao clicar dentro do conteudo e fecha ao clicar no backdrop', () => {
    const onClose = vi.fn();
    const { container } = render(
      <BaseModal isOpen onClose={onClose} title="Teste modal">
        <button type="button">Acao interna</button>
      </BaseModal>,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Acao interna' }));
    expect(onClose).not.toHaveBeenCalled();

    const backdrop = container.querySelector('[aria-hidden="true"]');
    expect(backdrop).not.toBeNull();

    fireEvent.click(backdrop as HTMLElement);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('respeita disableBackdropClose', () => {
    const onClose = vi.fn();
    const { container } = render(
      <BaseModal isOpen onClose={onClose} title="Teste modal" disableBackdropClose>
        <div>Conteudo</div>
      </BaseModal>,
    );

    const backdrop = container.querySelector('[aria-hidden="true"]');
    expect(backdrop).not.toBeNull();

    fireEvent.click(backdrop as HTMLElement);
    expect(onClose).not.toHaveBeenCalled();
  });
});
