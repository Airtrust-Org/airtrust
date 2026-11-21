import React from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';

import { useConfirmDialog } from '@/react-app/hooks/useConfirmDialog';
import type { ConfirmOptions } from '@/react-app/components/modals/ConfirmDialog';

function Harness({ options, onResult }: { options: ConfirmOptions; onResult: (v: boolean) => void }) {
  const { confirm, confirmDialog } = useConfirmDialog();
  return (
    <>
      <button type="button" onClick={async () => onResult(await confirm(options))}>
        Executar
      </button>
      {confirmDialog}
    </>
  );
}

describe('useConfirmDialog / ConfirmDialog', () => {
  it('resolve true ao confirmar', async () => {
    const user = userEvent.setup();
    let result: boolean | null = null;
    render(<Harness options={{ title: 'Enviar proposta?' }} onResult={(v) => (result = v)} />);

    await user.click(screen.getByRole('button', { name: 'Executar' }));
    expect(screen.getByRole('dialog', { name: 'Enviar proposta?' })).toBeTruthy();
    await user.click(screen.getByRole('button', { name: 'Confirmar' }));
    expect(result).toBe(true);
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('resolve false ao cancelar e ao pressionar Escape', async () => {
    const user = userEvent.setup();
    const results: boolean[] = [];
    render(<Harness options={{ title: 'Remover?' }} onResult={(v) => results.push(v)} />);

    await user.click(screen.getByRole('button', { name: 'Executar' }));
    await user.click(screen.getByRole('button', { name: 'Cancelar' }));
    await user.click(screen.getByRole('button', { name: 'Executar' }));
    await user.keyboard('{Escape}');
    expect(results).toEqual([false, false]);
  });

  it('em ação destrutiva foca Cancelar ao abrir', async () => {
    const user = userEvent.setup();
    render(
      <Harness
        options={{ title: 'Excluir?', tone: 'danger', confirmLabel: 'Excluir' }}
        onResult={() => undefined}
      />,
    );
    await user.click(screen.getByRole('button', { name: 'Executar' }));
    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Cancelar' }));
  });

  it('exige o texto digitado para habilitar a confirmação', async () => {
    const user = userEvent.setup();
    let result: boolean | null = null;
    render(
      <Harness
        options={{ title: 'Restaurar backup?', tone: 'danger', requireText: 'RESTAURAR', confirmLabel: 'Restaurar' }}
        onResult={(v) => (result = v)}
      />,
    );
    await user.click(screen.getByRole('button', { name: 'Executar' }));

    const confirmButton = screen.getByRole('button', { name: 'Restaurar' }) as HTMLButtonElement;
    expect(confirmButton.disabled).toBe(true);
    await user.type(screen.getByLabelText(/Digite/), 'RESTAURAR');
    expect(confirmButton.disabled).toBe(false);
    await user.click(confirmButton);
    expect(result).toBe(true);
  });

  it('substituir um pedido pendente reinicia o texto digitado, mesmo com mesmo título e requireText', async () => {
    const user = userEvent.setup();
    const results: boolean[] = [];

    function Replace() {
      const { confirm, confirmDialog } = useConfirmDialog();
      const options: ConfirmOptions = {
        title: 'Restaurar backup?',
        tone: 'danger',
        requireText: 'RESTAURAR',
        confirmLabel: 'Restaurar',
      };
      return (
        <>
          <button type="button" onClick={async () => results.push(await confirm(options))}>
            Abrir
          </button>
          {confirmDialog}
        </>
      );
    }

    render(<Replace />);
    await user.click(screen.getByRole('button', { name: 'Abrir' }));
    await user.type(screen.getByLabelText(/Digite/), 'RESTAURAR');
    expect((screen.getByRole('button', { name: 'Restaurar' }) as HTMLButtonElement).disabled).toBe(false);

    // Segundo pedido com o mesmo título/texto, enquanto o primeiro está aberto
    const second = screen.getByRole('button', { name: 'Abrir', hidden: true });
    second.click();
    await Promise.resolve();

    expect(results).toEqual([false]);
    expect((screen.getByLabelText(/Digite/) as HTMLInputElement).value).toBe('');
    expect((screen.getByRole('button', { name: 'Restaurar' }) as HTMLButtonElement).disabled).toBe(true);
  });
});
