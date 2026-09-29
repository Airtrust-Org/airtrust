import type { ReactNode } from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import FrmsAlertasPainel from '../FrmsAlertasPainel';
import type { FrmsAlertaRow } from '@/react-app/hooks/useFrms';

const useFrmsAlertasMock = vi.fn();
const mutateMock = vi.fn();
const refetchMock = vi.fn();

vi.mock('@/react-app/components/AppLayout', () => ({
  default: ({ children }: { children: ReactNode }) => <div>{children}</div>,
}));

vi.mock('../components/FrmsWorkspaceNav', () => ({
  default: () => <nav aria-label="Áreas FRMS" />,
}));

vi.mock('@/react-app/hooks/useFrms', async () => {
  const actual = await vi.importActual<typeof import('@/react-app/hooks/useFrms')>('@/react-app/hooks/useFrms');
  return {
    ...actual,
    useFrmsAlertas: (...args: unknown[]) => useFrmsAlertasMock(...args),
    useFrmsMutation: () => ({ mutate: mutateMock }),
  };
});

function caseRow(overrides: Partial<FrmsAlertaRow> = {}): FrmsAlertaRow {
  return {
    id: 'case-1',
    tripulante_id: '30',
    jornada_id: 'journey-1',
    data_jornada: '2026-08-27',
    data_fato: '2026-08-27',
    tipo_limite: 'JORNADA',
    nivel: 'CRITICO',
    percentual_atingido: 95,
    valor_atual_min: 570,
    valor_limite_min: 600,
    mensagem: 'Revisar jornada antes da decisão operacional.',
    nome_tripulante: 'Pessoa Crítica',
    visualizado: 1,
    visualizado_em: '2026-08-27 12:00:00',
    visualizado_por: 'coord@example.com',
    resolvido: 0,
    resolvido_em: null,
    resolvido_por: null,
    notas_resolucao: null,
    created_at: '2026-08-27 11:00:00',
    ...overrides,
  };
}

function mockCases(data: FrmsAlertaRow[]) {
  useFrmsAlertasMock.mockReturnValue({
    data,
    loading: false,
    error: null,
    refetch: refetchMock,
  });
}

function renderPage(path = '/frms/alertas') {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <FrmsAlertasPainel />
    </MemoryRouter>,
  );
}

describe('FrmsAlertasPainel', () => {
  beforeEach(() => {
    useFrmsAlertasMock.mockReset();
    mutateMock.mockReset();
    refetchMock.mockReset();
    mutateMock.mockResolvedValue({});
    refetchMock.mockResolvedValue(undefined);
    mockCases([caseRow()]);
  });

  it('usa a mesma linguagem operacional da fila sem alterar os níveis persistidos', () => {
    renderPage();

    expect(screen.getAllByText('Avaliar').length).toBeGreaterThan(0);
    expect(screen.getByText(/backlog acumulado/i)).toBeInTheDocument();
    expect(screen.queryByText('CRÍTICO')).not.toBeInTheDocument();
  });

  it('exige governança completa antes de resolver um caso', async () => {
    renderPage();

    fireEvent.click(screen.getByRole('button', { name: 'Registrar tratamento' }));

    const confirmButton = screen.getByRole('button', { name: 'Confirmar e resolver' });
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(confirmButton).toBeDisabled();
    expect(mutateMock).not.toHaveBeenCalled();

    fireEvent.change(screen.getByLabelText('Responsável pelo tratamento'), {
      target: { value: 'Coordenação de Operações' },
    });
    fireEvent.change(screen.getByLabelText('Prazo'), {
      target: { value: '2026-09-30' },
    });
    fireEvent.change(screen.getByLabelText('Mitigação aplicada'), {
      target: { value: 'Tripulante substituído e jornada reconfirmada pela coordenação.' },
    });
    fireEvent.change(screen.getByLabelText('Justificativa da decisão'), {
      target: { value: 'A jornada foi replanejada e os limites foram novamente verificados.' },
    });
    fireEvent.change(screen.getByLabelText('Evidência ou referência'), {
      target: { value: 'FRAT-2026-091' },
    });
    fireEvent.change(screen.getByLabelText('Avaliação de eficácia'), {
      target: { value: 'A nova tripulação operou dentro dos limites e sem novo alerta.' },
    });
    expect(confirmButton).toBeEnabled();

    fireEvent.click(confirmButton);

    await waitFor(() => {
      expect(mutateMock).toHaveBeenCalledWith('/api/frms/alertas/case-1/resolver', {
        method: 'PUT',
        body: JSON.stringify({
          responsavel: 'Coordenação de Operações',
          prazo: '2026-09-30',
          acao_mitigacao: 'Tripulante substituído e jornada reconfirmada pela coordenação.',
          justificativa: 'A jornada foi replanejada e os limites foram novamente verificados.',
          evidencia_referencia: 'FRAT-2026-091',
          avaliacao_eficacia: 'A nova tripulação operou dentro dos limites e sem novo alerta.',
        }),
      });
    });
    expect(refetchMock).toHaveBeenCalled();
  });
  it('mostra a trilha de auditoria de casos já resolvidos', () => {
    mockCases([
      caseRow({
        resolvido: 1,
        resolvido_por: 'coordenacao@airtrust.online',
        resolvido_em: '2026-08-27 13:15:00',
        notas_resolucao: 'Jornada corrigida após validação com a escala.',
      }),
    ]);

    renderPage();

    expect(screen.getByText(/Resolvido por coordenacao@airtrust.online/i)).toBeInTheDocument();
    expect(screen.getByText(/Registro: Jornada corrigida após validação com a escala/i)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Registrar tratamento' })).not.toBeInTheDocument();
  });
});
