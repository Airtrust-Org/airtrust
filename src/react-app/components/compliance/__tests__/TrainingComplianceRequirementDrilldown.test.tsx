import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { TrainingComplianceRequirementDrilldown } from '../TrainingComplianceRequirementDrilldown';

const { fetchWithAuthMock } = vi.hoisted(() => ({ fetchWithAuthMock: vi.fn() }));

vi.mock('@/react-app/config/api', () => ({
  fetchWithAuth: (...args: unknown[]) => fetchWithAuthMock(...args),
}));

function renderDrawer() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <TrainingComplianceRequirementDrilldown
        title="Requisitos de Comandante"
        filters={{ setor_id: 1, funcao_id: 2 }}
        onClose={vi.fn()}
      />
    </QueryClientProvider>,
  );
}
describe('TrainingComplianceRequirementDrilldown', () => {
  it('explains distinct requirements and exposes the records behind the number', async () => {
    fetchWithAuthMock.mockResolvedValue({
      ok: true,
      json: async () => ({
        success: true,
        meta: { pessoas: 15, requisitos_distintos: 2, obrigacoes_individuais: 30 },
        data: [
          {
            qualificacao_tipo_id: 100,
            qualificacao_tipo_nome: 'CRM',
            qualificacao_tipo_codigo: 'CRM',
            pessoas: 15,
            obrigacoes_individuais: 15,
            conformes: 12,
            vencendo: 1,
            vencidos: 1,
            nao_realizados: 1,
            em_andamento: 0,
            origens: ['REGULATORIO'],
            referencias_normativas: ['RBAC 121'],
            escopos: ['SETOR_FUNCAO'],
            modalidades: [],
            perfis_competencia: [],
            aeronaves_modelos: [],
            condicoes: [],
          },
        ],
      }),
    } as Response);

    renderDrawer();

    expect((await screen.findAllByText('CRM')).length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText('Requisitos de Comandante')).toBeInTheDocument();
    expect(screen.getByText('2')).toBeInTheDocument();
    expect(screen.getByText('30')).toBeInTheDocument();
    expect(screen.getByText(/Requisito = treinamento distinto/)).toBeInTheDocument();
    expect(screen.getByText(/RBAC 121/)).toBeInTheDocument();
    expect(screen.getByText('Aplicação: SETOR FUNCAO')).toBeInTheDocument();
    expect(fetchWithAuthMock).toHaveBeenCalledWith(
      '/api/compliance-treinamentos/requisitos-aplicaveis?setor_id=1&funcao_id=2',
    );
  });
});
