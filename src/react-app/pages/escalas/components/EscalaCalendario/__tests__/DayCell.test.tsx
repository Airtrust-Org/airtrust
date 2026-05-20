import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { DayCell } from '../DayCell';

vi.mock('../../../hooks/useTiposEventoResolvidos', () => ({
  useTiposEventoResolvidos: () => ({
    configMap: {
      VOO: { sigla: 'V', cor: '#3B82F6', label: 'Voo Operacional', ativo: true },
      SIM: {
        sigla: 'Si',
        cor: '#FDE68A',
        label: 'Simulador',
        ativo: true,
      },
      FOL: { sigla: 'Fo', cor: '#E2E8F0', label: 'Folga', ativo: true },
    },
  }),
}));

describe('DayCell', () => {
  it('usa a sigla configurada e contraste correto mesmo quando o backend envia codigo canonico', () => {
    render(
      <table>
        <tbody>
          <tr>
            <DayCell
              date={new Date('2026-05-10T00:00:00')}
              mesReferencia={5}
              anoReferencia={2026}
              eventos={[
                {
                  id: 'evt-1',
                  escala_id: 'esc-1',
                  funcionario_id: 'func-1',
                  funcionario_nome: 'Teste',
                  funcionario_matricula: '123',
                  tipo_evento: 'SIM' as never,
                  data_inicio: '2026-05-10',
                  data_fim: '2026-05-10',
                  gerado_automaticamente: 0,
                  status: 'confirmado',
                },
              ]}
            />
          </tr>
        </tbody>
      </table>,
    );

    const sigla = screen.getByText('Si');
    expect(sigla).toBeInTheDocument();
    expect(sigla.parentElement).toHaveStyle({ color: '#FFFFFF' });
  });
});
