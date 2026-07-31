import { fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import SeletorFuncionario from './SeletorFuncionario';

describe('SeletorFuncionario accessibility', () => {
  beforeEach(() => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        json: vi.fn().mockResolvedValue({
          success: true,
          funcionarios: [
            {
              id: 1,
              nome: 'Ana Silva',
              matricula: 'A001',
            },
          ],
        }),
      }),
    );
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('names the clear control, hides its decorative icon and clears the selection', async () => {
    const onChange = vi.fn();

    render(<SeletorFuncionario value={1} onChange={onChange} />);

    const clearButton = await screen.findByRole('button', { name: 'Remover seleção' });
    expect(clearButton).toHaveAttribute('type', 'button');
    expect(clearButton.querySelector('svg')).toHaveAttribute('aria-hidden', 'true');

    fireEvent.click(clearButton);
    expect(onChange).toHaveBeenCalledWith(0);
  });
});
