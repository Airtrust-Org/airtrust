import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { ReactNode } from 'react';

import ControleVoosMeusVoos from '../ControleVoosMeusVoos';
import ControleVoosCoordenacaoFila from '../ControleVoosCoordenacaoFila';
import ControleVoosRdvWorkflowPanel from '../components/ControleVoosRdvWorkflowPanel';
import { apiClient } from '@/react-app/services/apiClient';
import type { CvRdv } from '@/react-app/hooks/useControleVoos';

vi.mock('@/react-app/components/AppLayout', () => ({
  default: ({ children }: { children: ReactNode }) => <div>{children}</div>,
}));
vi.mock('../components/ControleVoosPageShell', () => ({
  default: ({ children }: { children: ReactNode }) => <div>{children}</div>,
}));
vi.mock('../components/ControleVoosPageHeader', () => ({
  default: ({ title, description }: { title: string; description?: string }) => (
    <header>
      <h1>{title}</h1>
      {description ? <p>{description}</p> : null}
    </header>
  ),
}));

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
  return render(
    <MemoryRouter>
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    </MemoryRouter>,
  );
}

const getMock = vi.mocked(apiClient.get);
const postMock = vi.mocked(apiClient.post);

afterEach(() => {
  vi.clearAllMocks();
});

describe('ControleVoosMeusVoos', () => {
  it('mostra estado vazio quando o piloto nao tem voos atribuidos', async () => {
    getMock.mockImplementation(async (url: string) => {
      if (url.includes('/voos/meus')) return apiOk([]);
      if (url.includes('/catalogos/aeroportos')) return apiOk([]);
      throw new Error(`unexpected url ${url}`);
    });

    renderWithClient(<ControleVoosMeusVoos />);

    await waitFor(() => expect(screen.getByText(/Nenhum voo atribuído a você/)).toBeInTheDocument());
  });

  it('lista voos atribuidos ao piloto autenticado', async () => {
    getMock.mockImplementation(async (url: string) => {
      if (url.includes('/voos/meus')) {
        return apiOk([
          {
            id: 601,
            prefixo: 'ATX-1001',
            data_programacao: '2026-06-14',
            origem_id: 101,
            destino_id: 102,
            horario_previsto_partida: '2026-06-14T10:00:00Z',
            status: 'concluido_operacionalmente',
          },
        ]);
      }
      if (url.includes('/catalogos/aeroportos')) return apiOk([]);
      throw new Error(`unexpected url ${url}`);
    });

    renderWithClient(<ControleVoosMeusVoos />);

    await waitFor(() => expect(screen.getByText('ATX-1001')).toBeInTheDocument());
    expect(screen.getByText('Meu RDV')).toBeInTheDocument();
  });
});

describe('ControleVoosCoordenacaoFila', () => {
  it('lista RDVs da fila com o status de fluxo correto', async () => {
    getMock.mockImplementation(async (url: string) => {
      if (url.includes('/rdv/fila')) {
        return apiOk([
          {
            id: 1,
            voo_id: 601,
            numero: 'RDV-0001',
            data_voo: '2026-06-14',
            status: 'preenchimento_finalizado',
            workflow_status: 'enviado',
            versao: 2,
            responsavel_preenchimento_id: 10,
            enviado_em: '2026-06-14T12:00:00Z',
            aprovado_coordenacao_em: null,
            finalizado_workflow_em: null,
            motivo_devolucao: null,
            prefixo: 'ATX-1001',
            aeronave_id: 5,
            data_programacao: '2026-06-14',
          },
        ]);
      }
      throw new Error(`unexpected url ${url}`);
    });

    renderWithClient(<ControleVoosCoordenacaoFila />);

    await waitFor(() => expect(screen.getByText('RDV-0001')).toBeInTheDocument());
    expect(screen.getByText('Enviado', { selector: 'span' })).toBeInTheDocument();
    expect(screen.getByText('Revisar')).toBeInTheDocument();
  });

  it('mostra estado vazio quando nenhum RDV corresponde aos filtros', async () => {
    getMock.mockImplementation(async () => apiOk([]));
    renderWithClient(<ControleVoosCoordenacaoFila />);
    await waitFor(() => expect(screen.getByText(/Nenhum RDV encontrado/)).toBeInTheDocument());
  });
});

function buildRdv(overrides: Partial<CvRdv>): CvRdv {
  return {
    id: 1,
    empresa_id: 1,
    voo_id: 601,
    numero: 'RDV-0001',
    data_voo: '2026-06-14',
    horario_decolagem_real: null,
    horario_pouso_real: null,
    horas_voadas: null,
    numero_pousos: null,
    ciclos: null,
    combustivel_decolagem: null,
    combustivel_pouso: null,
    combustivel_consumo: null,
    pob: null,
    carga_kg: null,
    ocorrencias: null,
    divergencias: null,
    status: 'preenchimento_finalizado',
    responsavel_preenchimento_id: 10,
    preenchido_em: null,
    finalizado_operacionalmente_por: null,
    finalizado_operacionalmente_em: null,
    workflow_status: 'rascunho',
    versao: 1,
    enviado_por: null,
    enviado_em: null,
    revisao_iniciada_por: null,
    revisao_iniciada_em: null,
    aprovado_coordenacao_por: null,
    aprovado_coordenacao_em: null,
    finalizado_workflow_em: null,
    reaberto_por: null,
    reaberto_em: null,
    motivo_devolucao: null,
    motivo_cancelamento: null,
    created_at: '2026-06-14T10:00:00Z',
    updated_at: '2026-06-14T10:00:00Z',
    ...overrides,
  };
}

describe('ControleVoosRdvWorkflowPanel', () => {
  it('piloto: mostra "Enviar para Coordenação" e desabilita quando ha alerta IMPEDE_ENVIO', async () => {
    getMock.mockImplementation(async (url: string) => {
      if (url.includes('/rdv/alertas')) {
        return apiOk([{ id: 1, tipo: 'tripulacao', severidade: 'IMPEDE_ENVIO', mensagem: 'Nenhum tripulante cadastrado', regra: 'TRIPULACAO_AUSENTE' }]);
      }
      return apiOk([]);
    });

    renderWithClient(
      <ControleVoosRdvWorkflowPanel vooId="601" rdv={buildRdv({ workflow_status: 'rascunho', status: 'preenchimento_finalizado' })} isCoordenacao={false} />,
    );

    await waitFor(() => expect(screen.getByText('Nenhum tripulante cadastrado')).toBeInTheDocument());
    const button = screen.getByRole('button', { name: /Envio bloqueado por alertas/ });
    expect(button).toBeDisabled();
  });

  it('coordenacao: em revisao mostra Aprovar e Devolver; devolver exige justificativa', async () => {
    getMock.mockImplementation(async () => apiOk([]));

    renderWithClient(
      <ControleVoosRdvWorkflowPanel vooId="601" rdv={buildRdv({ workflow_status: 'em_revisao' })} isCoordenacao={true} />,
    );

    await waitFor(() => expect(screen.getByRole('button', { name: 'Aprovar' })).toBeInTheDocument());
    fireEvent.click(screen.getByRole('button', { name: 'Devolver ao piloto' }));

    const confirmar = await screen.findByRole('button', { name: 'Confirmar' });
    expect(confirmar).toBeDisabled();

    const textarea = screen.getByPlaceholderText(/faltou informar consumo/);
    fireEvent.change(textarea, { target: { value: 'Faltou informar consumo de combustivel' } });
    expect(confirmar).not.toBeDisabled();

    postMock.mockResolvedValueOnce(apiOk(buildRdv({ workflow_status: 'rascunho' })));
    fireEvent.click(confirmar);

    await waitFor(() =>
      expect(postMock).toHaveBeenCalledWith(
        '/controle-voos/voos/601/rdv/devolver',
        expect.objectContaining({ justificativa: 'Faltou informar consumo de combustivel' }),
      ),
    );
  });

  it('coordenacao: RDV finalizado mostra Reabrir e botao de gerar PDF', async () => {
    getMock.mockImplementation(async () => apiOk([]));

    renderWithClient(
      <ControleVoosRdvWorkflowPanel vooId="601" rdv={buildRdv({ workflow_status: 'finalizado' })} isCoordenacao={true} />,
    );

    await waitFor(() => expect(screen.getByRole('button', { name: 'Reabrir' })).toBeInTheDocument());
    expect(screen.getByRole('button', { name: /Gerar relatório Petrobras/ })).toBeInTheDocument();
  });
});
