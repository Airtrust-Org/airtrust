import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { SigvoosEventDetail } from '../EdApp';

describe('SIGVOOS execution error safety', () => {
  it('never exposes a raw backend error in the DOM', () => {
    const technicalError =
      'SQLITE_ERROR: no such column: jornadas.secret_token\n    at worker/sigvoos.ts:418:17';

    render(<SigvoosEventDetail error={technicalError} status="ERRO" />);

    expect(screen.getByText('Falha na sincronização')).toBeInTheDocument();
    expect(screen.queryByText(technicalError)).not.toBeInTheDocument();
    expect(document.body).not.toHaveTextContent('SQLITE_ERROR');
    expect(document.body).not.toHaveTextContent('jornadas.secret_token');
    expect(document.body).not.toHaveTextContent('worker/sigvoos.ts');
  });
});
