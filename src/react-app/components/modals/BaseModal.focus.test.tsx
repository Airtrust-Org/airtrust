import React, { useState } from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { BaseModal } from './BaseModal';

afterEach(() => {
  document.body.style.overflow = '';
});

function Fixture() {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" onClick={() => setOpen(true)}>
        Abrir
      </button>
      <BaseModal isOpen={open} onClose={() => setOpen(false)} title="Editar">
        <input aria-label="Primeiro" />
        <input aria-label="Segundo" />
      </BaseModal>
    </>
  );
}

describe('BaseModal focus management', () => {
  it('foca o primeiro campo ao abrir e devolve o foco ao gatilho ao fechar', async () => {
    const user = userEvent.setup();
    render(<Fixture />);
    const trigger = screen.getByRole('button', { name: 'Abrir' });

    await user.click(trigger);
    expect(screen.getByRole('dialog', { name: 'Editar' })).toBeTruthy();
    expect(document.activeElement).toBe(screen.getByLabelText('Primeiro'));

    await user.keyboard('{Escape}');
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(document.activeElement).toBe(trigger);
  });

  it('prende o Tab dentro do diálogo nos dois sentidos', async () => {
    const user = userEvent.setup();
    render(<Fixture />);
    await user.click(screen.getByRole('button', { name: 'Abrir' }));

    const close = screen.getByRole('button', { name: 'Fechar' });
    const first = screen.getByLabelText('Primeiro');
    const second = screen.getByLabelText('Segundo');

    expect(document.activeElement).toBe(first);
    await user.tab();
    expect(document.activeElement).toBe(second);
    // Do último campo, Tab volta ao primeiro foco do diálogo (botão Fechar no cabeçalho)
    await user.tab();
    expect(document.activeElement).toBe(close);
    // Shift+Tab no primeiro foco volta ao último
    await user.tab({ shift: true });
    expect(document.activeElement).toBe(second);
  });

  it('não rouba o foco de um campo com autoFocus', async () => {
    render(
      <BaseModal isOpen onClose={vi.fn()} title="Auto">
        <input aria-label="A" />
        <input aria-label="B" autoFocus />
      </BaseModal>,
    );
    expect(document.activeElement).toBe(screen.getByLabelText('B'));
  });

  it('com modais empilhados, Escape fecha só o do topo e a rolagem fica travada até o último fechar', async () => {
    const user = userEvent.setup();
    const closeOuter = vi.fn();
    const closeInner = vi.fn();

    function Stack({ inner }: { inner: boolean }) {
      return (
        <>
          <BaseModal isOpen onClose={closeOuter} title="Externo">
            <button type="button">x</button>
          </BaseModal>
          <BaseModal isOpen={inner} onClose={closeInner} title="Interno">
            <button type="button">y</button>
          </BaseModal>
        </>
      );
    }

    const { rerender } = render(<Stack inner />);
    expect(document.body.style.overflow).toBe('hidden');

    await user.keyboard('{Escape}');
    expect(closeInner).toHaveBeenCalledTimes(1);
    expect(closeOuter).not.toHaveBeenCalled();

    rerender(<Stack inner={false} />);
    expect(document.body.style.overflow).toBe('hidden');

    await user.keyboard('{Escape}');
    expect(closeOuter).toHaveBeenCalledTimes(1);
  });

  it('libera a rolagem do body ao fechar o último modal', () => {
    const { rerender } = render(
      <BaseModal isOpen onClose={vi.fn()} title="Um">
        <button type="button">x</button>
      </BaseModal>,
    );
    expect(document.body.style.overflow).toBe('hidden');
    rerender(
      <BaseModal isOpen={false} onClose={vi.fn()} title="Um">
        <button type="button">x</button>
      </BaseModal>,
    );
    expect(document.body.style.overflow).toBe('');
  });
});
