import { fireEvent, render, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { BaseModal } from './BaseModal';

const getBackdrop = () =>
  document.body.querySelector('[aria-hidden="true"].absolute.inset-0') as HTMLElement | null;

describe('BaseModal', () => {
  it('nao fecha ao clicar dentro do conteudo e fecha ao clicar no backdrop', () => {
    const onClose = vi.fn();
    render(
      <BaseModal isOpen onClose={onClose} title="Teste modal">
        <button type="button">Acao interna</button>
      </BaseModal>,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Acao interna' }));
    expect(onClose).not.toHaveBeenCalled();

    // O modal e renderizado via portal em document.body, entao a busca precisa
    // ocorrer no documento inteiro, nao apenas no container local do render().
    const backdrop = getBackdrop();
    expect(backdrop).not.toBeNull();

    fireEvent.click(backdrop as HTMLElement);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('respeita disableBackdropClose', () => {
    const onClose = vi.fn();
    render(
      <BaseModal isOpen onClose={onClose} title="Teste modal" disableBackdropClose>
        <div>Conteudo</div>
      </BaseModal>,
    );

    const backdrop = getBackdrop();
    expect(backdrop).not.toBeNull();

    fireEvent.click(backdrop as HTMLElement);
    expect(onClose).not.toHaveBeenCalled();
  });

  it('aplica posicionamento no topo quando solicitado', () => {
    render(
      <BaseModal isOpen onClose={() => undefined} title="Teste modal" placement="top">
        <div>Conteudo</div>
      </BaseModal>,
    );

    const dialog = screen.getByRole('dialog');
    const wrapper = dialog.parentElement;

    expect(wrapper).not.toBeNull();
    expect(wrapper?.className).toContain('items-start');
    expect(wrapper?.className).toContain('pt-6');
  });

  it('mantem o modal dentro da viewport e o corpo rolavel independente do rodape', () => {
    render(
      <BaseModal
        isOpen
        onClose={() => undefined}
        title="Teste modal"
        footer={<button type="button">Confirmar</button>}
      >
        <div>Conteudo</div>
      </BaseModal>,
    );

    const dialog = screen.getByRole('dialog');
    expect(dialog.className).toContain('max-h-[calc(100dvh-2rem)]');
    expect(dialog.className).toContain('flex-col');

    const body = screen.getByText('Conteudo').parentElement;
    expect(body?.className).toContain('overflow-y-auto');
    expect(body?.className).toContain('min-h-0');

    expect(screen.getByRole('button', { name: 'Confirmar' })).toBeVisible();
  });

  it('renderiza via portal em document.body, escapando de ancestrais com transform', () => {
    const { container } = render(
      <div style={{ transform: 'translateZ(0)' }}>
        <BaseModal isOpen onClose={() => undefined} title="Teste modal">
          <div>Conteudo</div>
        </BaseModal>
      </div>,
    );

    const dialog = screen.getByRole('dialog');
    // Se o modal estivesse aninhado dentro do container com transform, um
    // ancestral com transform quebraria o position:fixed (bug real observado
    // em producao). O portal garante que o dialog nunca seja descendente do
    // container local do render().
    expect(container.contains(dialog)).toBe(false);
    expect(document.body.contains(dialog)).toBe(true);
  });

  it('associa titulo e subtitulo com ids unicos em modais simultaneos', () => {
    render(
      <>
        <BaseModal
          isOpen
          onClose={() => undefined}
          title="Primeiro modal"
          subtitle="Primeira descricao"
        >
          <div>Primeiro conteudo</div>
        </BaseModal>
        <BaseModal
          isOpen
          onClose={() => undefined}
          title="Segundo modal"
          subtitle="Segunda descricao"
        >
          <div>Segundo conteudo</div>
        </BaseModal>
      </>,
    );

    const dialogs = screen.getAllByRole('dialog');
    const firstTitle = within(dialogs[0]).getByText('Primeiro modal');
    const firstSubtitle = within(dialogs[0]).getByText('Primeira descricao');
    const secondTitle = within(dialogs[1]).getByText('Segundo modal');
    const secondSubtitle = within(dialogs[1]).getByText('Segunda descricao');

    expect(dialogs[0]).toHaveAttribute('aria-labelledby', firstTitle.id);
    expect(dialogs[0]).toHaveAttribute('aria-describedby', firstSubtitle.id);
    expect(dialogs[1]).toHaveAttribute('aria-labelledby', secondTitle.id);
    expect(dialogs[1]).toHaveAttribute('aria-describedby', secondSubtitle.id);
    expect(firstTitle.id).not.toBe(secondTitle.id);
    expect(firstSubtitle.id).not.toBe(secondSubtitle.id);
  });

  it('fornece nome acessivel para modal sem titulo visivel', () => {
    render(
      <BaseModal isOpen onClose={() => undefined} ariaLabel="Detalhes operacionais">
        <div>Conteudo sem cabecalho</div>
      </BaseModal>,
    );

    expect(screen.getByRole('dialog', { name: 'Detalhes operacionais' })).toBeVisible();
    expect(screen.getByRole('button', { name: 'Fechar' })).toBeVisible();
  });
});
