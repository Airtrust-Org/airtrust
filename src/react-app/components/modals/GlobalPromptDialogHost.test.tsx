import React from 'react';
import { render, screen, act } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';

import GlobalPromptDialogHost from './GlobalPromptDialogHost';
import { promptDialog } from '@/react-app/utils/confirmDialog';

describe('promptDialog / GlobalPromptDialogHost', () => {
  it('resolve com o texto digitado e exige o mínimo de caracteres', async () => {
    const user = userEvent.setup();
    render(<GlobalPromptDialogHost />);

    let result: string | null | undefined;
    await act(async () => {
      void promptDialog('Informe a justificativa', {
        title: 'Justificativa',
        required: true,
        minLength: 10,
      }).then((v) => (result = v));
    });

    const field = screen.getByLabelText('Informe a justificativa');
    expect(document.activeElement).toBe(field);
    const confirm = screen.getByRole('button', { name: 'Confirmar' }) as HTMLButtonElement;
    expect(confirm.disabled).toBe(true);

    await user.type(field, 'curto');
    expect(confirm.disabled).toBe(true);
    await user.type(field, ' o suficiente');
    expect(confirm.disabled).toBe(false);
    await user.click(confirm);
    expect(result).toBe('curto o suficiente');
  });

  it('resolve null ao cancelar', async () => {
    const user = userEvent.setup();
    render(<GlobalPromptDialogHost />);
    let result: string | null | undefined;
    await act(async () => {
      void promptDialog('Observações', { title: 'Obs' }).then((v) => (result = v));
    });
    await user.click(screen.getByRole('button', { name: 'Cancelar' }));
    expect(result).toBeNull();
  });
});
