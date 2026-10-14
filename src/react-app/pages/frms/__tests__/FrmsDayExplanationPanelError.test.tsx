import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ConfigLimites } from '../frmsUtils';
import FrmsDayExplanationPanel from '../components/FrmsDayExplanationPanel';

const refetchMock = vi.fn();

vi.mock('@/react-app/hooks/useFrms', () => ({
  useFrmsDayExplanation: () => ({ data: null, loading: false, error: 'A explicação excedeu o tempo de resposta esperado.', refetch: refetchMock }),
}));

describe('FrmsDayExplanationPanel error recovery', () => {
  beforeEach(() => refetchMock.mockReset());

  it('fails closed and provides a retry action when the explanation request times out', () => {
    render(
      <FrmsDayExplanationPanel
        tripulanteId="synthetic-qa"
        date="2026-10-13"
        config={{} as ConfigLimites}
        source="ficha"
      />,
    );

    expect(screen.getByText(/Não use ausência de explicação como sinal de normalidade/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Tentar novamente' }));
    expect(refetchMock).toHaveBeenCalledTimes(1);
  });
});
