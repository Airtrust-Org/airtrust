import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import MroPrototypeBanner from './MroPrototypeBanner';

describe('MroPrototypeBanner', () => {
  it('keeps the required compliance notice compact and free of maturity metadata', () => {
    render(<MroPrototypeBanner />);

    const notice = screen.getByRole('note', { name: 'Aviso de dados demonstrativos do MRO' });
    expect(notice).toHaveTextContent(
      'Dados demonstrativos. Não usar como registro oficial de manutenção ou aeronavegabilidade.',
    );
    expect(notice).not.toHaveTextContent('N0');
    expect(notice).not.toHaveTextContent('A0');
    expect(notice).not.toHaveTextContent('Protótipo');
    expect(notice).not.toHaveTextContent('Não regulado');
    expect(notice).toHaveClass('text-sm', 'leading-5');
  });
});
