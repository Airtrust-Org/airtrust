import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { syncRuntimeTranslation } from '@/react-app/i18n/runtimeTranslator';
import ComplianceTreinamentosPage from '../ComplianceTreinamentosPage';

const { fetchWithAuthMock } = vi.hoisted(() => ({
  fetchWithAuthMock: vi.fn(),
}));

vi.mock('@/react-app/config/api', () => ({
  fetchWithAuth: (...args: unknown[]) => fetchWithAuthMock(...args),
}));

vi.mock('@/react-app/hooks/useAuth', () => ({
  useAuth: () => ({
    user: { nome: 'Gestor QA', role: 'gestor' },
    empresas: [{ id: 1, nome: 'Empresa QA' }],
    empresaAtualId: 1,
  }),
}));

vi.mock('@/react-app/hooks/useQualificacoesExt', () => ({
  useQualificacaoTipos: () => ({ tipos: [], loading: false }),
}));

vi.mock('@/react-app/components/AppLayout', () => ({
  default: ({ children }: { children: ReactNode }) => <main>{children}</main>,
}));

vi.mock('sonner', () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));

function ok(data: unknown) {
  return {
    ok: true,
    json: async () => ({ success: true, data }),
  } as Response;
}

function renderCompliancePage() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(
    <MemoryRouter initialEntries={['/treinamentos/compliance']}>
      <QueryClientProvider client={client}>
        <ComplianceTreinamentosPage />
      </QueryClientProvider>
    </MemoryRouter>,
  );
}

describe('ComplianceTreinamentosPage tab navigation and i18n isolation', () => {
  beforeEach(() => {
    fetchWithAuthMock.mockImplementation((path: string) => {
      if (path.startsWith('/api/compliance-treinamentos/capabilities')) {
        return Promise.resolve(
          ok({
            schema_ready: true,
            reconciliation_ready: true,
            scopes: ['EMPRESA', 'SETOR', 'FUNCAO', 'SETOR_FUNCAO', 'FUNCIONARIO'],
          }),
        );
      }
      if (path.startsWith('/api/compliance-treinamentos/catalogos')) {
        return Promise.resolve(
          ok({
            setores: [{ id: 10, nome: 'Operações' }],
            funcoes: [{ id: 20, nome: 'Piloto' }],
            funcionarios: [{ id: 30, nome: 'Tripulante QA' }],
            setor_funcoes: [{ setor_id: 10, funcao_id: 20 }],
          }),
        );
      }
      if (path.startsWith('/api/compliance-treinamentos/resumo')) {
        return Promise.resolve(
          ok({
            pessoas: 1,
            pessoas_sem_configuracao: 0,
            setores_sem_matriz: 0,
            cargos_sem_matriz: 0,
            funcoes_sem_regra_especifica: 0,
            setores_sem_regra_especifica: 0,
            matriculas_sem_requisito: 0,
            requisitos_obrigatorios: 1,
            requisitos_distintos: 1,
            conformes: 0,
            vencendo: 0,
            vencidos: 0,
            nao_realizados: 1,
            em_andamento: 0,
            compliance_pct: 0,
            setores: [],
          }),
        );
      }
      if (path.startsWith('/api/compliance-treinamentos/treinamentos')) {
        return Promise.resolve(
          ok([
            {
              qualificacao_tipo_id: 101,
              qualificacao_tipo_nome: 'CRM Operacional',
              qualificacao_tipo_codigo: 'QA-COMP-TEST',
              pessoas: 1,
              conformes: 0,
              vencendo: 0,
              vencidos: 0,
              nao_realizados: 1,
              em_andamento: 0,
              compliance_pct: 0,
            },
          ]),
        );
      }
      if (path.startsWith('/api/compliance-treinamentos/pessoas')) {
        return Promise.resolve(
          ok([
            {
              id: 30,
              nome: 'Tripulante QA',
              setor_id: 10,
              setor_nome: 'Operações',
              funcao_id: 20,
              funcao_nome: 'Piloto',
              configurado: true,
              total_obrigatorios: 1,
              conformes: 0,
              vencendo: 0,
              vencidos: 0,
              nao_realizados: 1,
              em_andamento: 0,
              compliance_pct: 0,
            },
          ]),
        );
      }
      if (path.startsWith('/api/compliance-treinamentos/setores')) {
        return Promise.resolve(
          ok([
            {
              setor_id: 10,
              setor_nome: 'Operações',
              pessoas: 1,
              pessoas_sem_configuracao: 0,
              requisitos_obrigatorios: 1,
              requisitos_distintos: 1,
              conformes: 0,
              vencendo: 0,
              vencidos: 0,
              nao_realizados: 1,
              em_andamento: 0,
              compliance_pct: 0,
              cargos: [],
            },
          ]),
        );
      }
      if (path.startsWith('/api/compliance-treinamentos/tendencias')) {
        return Promise.resolve(
          ok([
            {
              snapshot_date: '2026-11-14',
              pessoas: 1,
              requisitos_obrigatorios: 1,
              conformes: 0,
              vencendo: 0,
              vencidos: 0,
              nao_realizados: 1,
              em_andamento: 0,
              compliance_pct: 0,
            },
          ]),
        );
      }
      return Promise.resolve(ok([]));
    });
  });

  afterEach(async () => {
    await syncRuntimeTranslation('pt-BR');
    vi.clearAllMocks();
  });

  it('keeps Setores and all Compliance navigation tabs intact when runtime en-US DOM translation runs', async () => {
    renderCompliancePage();

    await screen.findByRole('button', { name: 'Setores' });
    const dispose = await syncRuntimeTranslation('en-US');

    try {
      const expectedTabs = [
        'Pendências',
        'Treinamentos',
        'Pessoas',
        'Setores',
        'Relatórios',
        'Comunicações',
        'Administração',
      ];
      for (const label of expectedTabs) {
        expect(screen.getByRole('button', { name: label })).toBeInTheDocument();
      }
      expect(screen.queryByRole('button', { name: 'Sectors' })).not.toBeInTheDocument();

      fireEvent.click(screen.getByRole('button', { name: 'Treinamentos' }));
      await screen.findByText('CRM Operacional');

      // Simulate the Treinamentos -> Pessoas drilldown before switching to Setores.
      fireEvent.click(screen.getByRole('button', { name: 'CRM Operacional' }));
      await screen.findByText(/Pessoas de/i);

      await waitFor(() => {
        expect(screen.getByRole('button', { name: 'Setores' })).toBeInTheDocument();
      });

      fireEvent.click(screen.getByRole('button', { name: 'Setores' }));
      await screen.findByText('Operações');

      fireEvent.click(screen.getByRole('button', { name: 'Relatórios' }));
      await screen.findByRole('heading', { name: 'Evolução do compliance — 90 dias' });

      fireEvent.click(screen.getByRole('button', { name: 'Comunicações' }));
      await screen.findByRole('heading', { name: 'Histórico de comunicações' });

      fireEvent.click(screen.getByRole('button', { name: 'Administração' }));
      await screen.findByRole('button', { name: 'Por organização' });

      fireEvent.click(screen.getByRole('button', { name: 'Pessoas' }));
      await screen.findByRole('columnheader', { name: 'Pessoa' });

      fireEvent.click(screen.getByRole('button', { name: 'Pendências' }));
      await screen.findByRole('heading', { name: 'Central de pendências' });
    } finally {
      dispose();
    }
  });
});
