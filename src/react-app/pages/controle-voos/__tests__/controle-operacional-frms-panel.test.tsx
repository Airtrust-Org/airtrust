import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { ReactNode } from 'react';

import ControleOperacionalFrmsPanel from '../components/ControleOperacionalFrmsPanel';
import { apiClient } from '@/react-app/services/apiClient';
import type { CvFrmsOperacionalPainel } from '@/react-app/hooks/useControleVoos';

// Controle Operacional FRMS / Gate de Despacho V1 — painel compacto da
// Coordenacao. Reusa exatamente a resposta ja sanitizada do backend
// (`GET /controle-voos/operacional`), entao o teste de frontend cobre
// apenas apresentacao: estados LIBERADO/ATENCAO/NAO_LIBERADO, contadores e
// que nenhum dado sensivel (KSS/sono) aparece renderizado.

vi.mock('@/react-app/services/apiClient', () => ({
  apiClient: {
    get: vi.fn(),
    post: vi.fn(),
    put: vi.fn(),
    delete: vi.fn(),
  },
}));

function apiOk<T>(data: T) {
  return { success: true, data: { success: true, data } };
}

function renderWithClient(children: ReactNode) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={queryClient}>{children}</QueryClientProvider>);
}

const getMock = vi.mocked(apiClient.get);

afterEach(() => {
  vi.clearAllMocks();
});

function painel(overrides: Partial<CvFrmsOperacionalPainel> = {}): CvFrmsOperacionalPainel {
  return {
    data: '2026-08-24',
    resumo: {
      voos_nao_liberados: 1,
      tripulantes_checkin_pendente: 1,
      voos_requerem_revisao: 0,
      voos_liberaveis: 0,
    },
    voos: [
      {
        voo_id: 601,
        prefixo: 'ATX-1001',
        status: 'planejado',
        horario_previsto_partida: '2026-08-24T10:00:00Z',
        aeronave_id: null,
        frms_status: 'NAO_LIBERADO',
        frms_primary_reason: 'CHECKIN_DIARIO_PENDENTE',
        last_evaluated_at: '2026-08-24T09:00:00Z',
        tripulacao: [
          {
            funcionario_id: 1001,
            nome: 'Piloto Ficticio A',
            funcao: 'PIC',
            frms_status: 'NAO_LIBERADO',
            checkin_status: 'AUSENTE',
            fadiga_diaria: 'INDISPONIVEL',
            fadiga_acumulada: 'NORMAL',
            reasons: ['CHECKIN_DIARIO_PENDENTE'],
            primary_reason: 'CHECKIN_DIARIO_PENDENTE',
            natureza_dado: null,
          },
        ],
      },
    ],
    ...overrides,
  };
}

describe('ControleOperacionalFrmsPanel', () => {
  it('mostra contadores e o estado NAO_LIBERADO quando ha check-in pendente', async () => {
    getMock.mockImplementation(async (url: string) => {
      if (url.includes('/operacional')) return apiOk(painel());
      throw new Error(`unexpected url ${url}`);
    });

    renderWithClient(<ControleOperacionalFrmsPanel />);

    await waitFor(() => expect(screen.getAllByText('ATX-1001', { exact: false }).length).toBeGreaterThan(0));
    expect(screen.getByText('NÃO LIBERADO')).toBeInTheDocument();
    expect(screen.getByText('Piloto Ficticio A', { exact: false })).toBeInTheDocument();
    expect(screen.getByText('Ausente')).toBeInTheDocument();
  });

  it('expande a linha do tripulante e mostra o motivo sanitizado (sem dado sensivel)', async () => {
    getMock.mockImplementation(async (url: string) => {
      if (url.includes('/operacional')) return apiOk(painel());
      throw new Error(`unexpected url ${url}`);
    });

    renderWithClient(<ControleOperacionalFrmsPanel />);

    const row = await screen.findByTestId('frms-gate-row-601-1001');
    fireEvent.click(row);

    await waitFor(() =>
      expect(screen.getAllByText('Check-in diário pendente').length).toBeGreaterThan(1),
    );

    expect(document.body.textContent).not.toMatch(/kss|qualidade_sono|horas_sono|medica|alcool/i);
  });

  it('mostra estado LIBERADO quando toda a tripulacao esta liberavel', async () => {
    getMock.mockImplementation(async (url: string) => {
      if (url.includes('/operacional')) {
        return apiOk(
          painel({
            resumo: {
              voos_nao_liberados: 0,
              tripulantes_checkin_pendente: 0,
              voos_requerem_revisao: 0,
              voos_liberaveis: 1,
            },
            voos: [
              {
                voo_id: 602,
                prefixo: 'ATX-1002',
                status: 'planejado',
                horario_previsto_partida: '2026-08-24T12:00:00Z',
                aeronave_id: null,
                frms_status: 'LIBERAVEL',
                frms_primary_reason: null,
                last_evaluated_at: '2026-08-24T09:00:00Z',
                tripulacao: [
                  {
                    funcionario_id: 1002,
                    nome: 'Copiloto Ficticio A',
                    funcao: 'SIC',
                    frms_status: 'LIBERAVEL',
                    checkin_status: 'RECEBIDO',
                    fadiga_diaria: 'NORMAL',
                    fadiga_acumulada: 'NORMAL',
                    reasons: [],
                    primary_reason: null,
                    natureza_dado: 'JORNADA_REALIZADA',
                  },
                ],
              },
            ],
          }),
        );
      }
      throw new Error(`unexpected url ${url}`);
    });

    renderWithClient(<ControleOperacionalFrmsPanel />);

    await waitFor(() => expect(screen.getAllByText('ATX-1002', { exact: false }).length).toBeGreaterThan(0));
    expect(screen.getByText('LIBERADO')).toBeInTheDocument();
  });

  it('mostra estado vazio quando nao ha voos programados na data', async () => {
    getMock.mockImplementation(async (url: string) => {
      if (url.includes('/operacional')) {
        return apiOk(
          painel({
            resumo: {
              voos_nao_liberados: 0,
              tripulantes_checkin_pendente: 0,
              voos_requerem_revisao: 0,
              voos_liberaveis: 0,
            },
            voos: [],
          }),
        );
      }
      throw new Error(`unexpected url ${url}`);
    });

    renderWithClient(<ControleOperacionalFrmsPanel />);

    await waitFor(() =>
      expect(screen.getByText('Nenhum voo programado para esta data.')).toBeInTheDocument(),
    );
  });
});
