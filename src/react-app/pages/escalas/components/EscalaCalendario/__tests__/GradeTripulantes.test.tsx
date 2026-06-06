import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import GradeTripulantes from '../GradeTripulantes';

vi.mock('../../../hooks/useEscalaStore', () => ({
  useEscalaStore: () => ({ exibirNome: 'completo' }),
}));

vi.mock('../../../hooks/useTiposEventoResolvidos', () => ({
  useTiposEventoResolvidos: () => ({
    configMap: {
      voo: { sigla: 'V', cor: '#3B82F6', label: 'Voo', ativo: true },
      folga: { sigla: 'Fo', cor: '#E2E8F0', label: 'Folga', ativo: true },
    },
  }),
}));

function renderGrade() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });

  return render(
    <QueryClientProvider client={queryClient}>
      <GradeTripulantes
        cobertura={{
          tripulantes: [
            {
              id: 'trip-1',
              nome: 'Tripulante Teste',
              nome_guerra: null,
              matricula: null,
              cargo: 'comandante',
              quinzena_numero: 1,
              alocacao_q1: null,
              alocacao_q2: null,
              status_q1: 'livre',
              status_q2: 'livre',
              status_geral: 'livre',
              modelos_habilitados: ['AW139'],
            },
          ],
          resumo: { total: 1, completos: 0, parciais: 0, livres: 1 },
        }}
        alocacoes={[]}
        eventos={[]}
        escalaId="1"
        quinzenas={[
          {
            id: 1,
            ano: 2026,
            mes: 5,
            numero: 1,
            data_inicio: '2026-05-01',
            data_fim: '2026-05-15',
            status: 'fechada',
            publicada_em: null,
          },
          {
            id: 2,
            ano: 2026,
            mes: 5,
            numero: 2,
            data_inicio: '2026-05-16',
            data_fim: '2026-05-31',
            status: 'fechada',
            publicada_em: null,
          },
        ]}
        escalaMes={5}
        escalaAno={2026}
        onAlocarLivre={vi.fn()}
        onEditarSituacao={vi.fn()}
        onEditarFuncionario={vi.fn()}
        onFocarAlocacaoAeronave={vi.fn()}
      />
    </QueryClientProvider>,
  );
}

describe('GradeTripulantes', () => {
  it('preenche dias sem evento com folga para nao deixar celulas vazias', () => {
    renderGrade();

    expect(screen.getAllByTitle('Folga').length).toBeGreaterThan(0);
    expect(screen.queryByText('+')).not.toBeInTheDocument();
  });
});