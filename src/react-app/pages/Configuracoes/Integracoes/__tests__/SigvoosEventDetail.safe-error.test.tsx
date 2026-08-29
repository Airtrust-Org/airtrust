import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { SigvoosEventDetail } from '../SigvoosEventDetail';

describe('SigvoosEventDetail', () => {
  it('never renders the raw technical synchronization error', () => {
    const technicalError =
      'SQLITE_ERROR: no such table: sigvoos_jornadas at Worker.fetch (/srv/worker.ts:812:17)';

    render(<SigvoosEventDetail error={technicalError} status="ERRO" />);

    expect(
      screen.getByText('Falha na sincronização. Verifique a execução e tente novamente.'),
    ).toBeInTheDocument();
    expect(screen.queryByText(technicalError)).not.toBeInTheDocument();
    expect(screen.queryByText(/SQLITE_ERROR|worker\.ts|no such table/i)).not.toBeInTheDocument();
  });

  it('keeps successful and in-progress states operational', () => {
    const { rerender } = render(<SigvoosEventDetail status="SUCESSO" />);
    expect(screen.getByText('Sem erro')).toBeInTheDocument();

    rerender(<SigvoosEventDetail status="PROCESSANDO" />);
    expect(screen.getByText('Execução em andamento')).toBeInTheDocument();
  });
});
