import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import GradeTripulantes from '../GradeTripulantes';
import type { EscalaEvento } from '../../../hooks/queries/useEscalasQuery';

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

function renderGrade({
  eventos = [],
  escalaMes = 6,
  escalaAno = 2026,
}: {
  eventos?: EscalaEvento[];
  escalaMes?: number;
  escalaAno?: number;
} = {}) {
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
        eventos={eventos}
        escalaId="1"
        quinzenas={[
          {
            id: 1,
            ano: escalaAno,
            mes: escalaMes,
            numero: 1,
            data_inicio: `${escalaAno}-${String(escalaMes).padStart(2, '0')}-01`,
            data_fim: `${escalaAno}-${String(escalaMes).padStart(2, '0')}-15`,
            status: 'fechada',
            publicada_em: null,
          },
          {
            id: 2,
            ano: escalaAno,
            mes: escalaMes,
            numero: 2,
            data_inicio: `${escalaAno}-${String(escalaMes).padStart(2, '0')}-16`,
            data_fim: `${escalaAno}-${String(escalaMes).padStart(2, '0')}-30`,
            status: 'fechada',
            publicada_em: null,
          },
        ]}
        escalaMes={escalaMes}
        escalaAno={escalaAno}
        onAlocarLivre={vi.fn()}
        onEditarSituacao={vi.fn()}
        onEditarFuncionario={vi.fn()}
        onFocarAlocacaoAeronave={vi.fn()}
      />
    </QueryClientProvider>,
  );
}

describe('GradeTripulantes', () => {
  it('mostra disponibilidade apenas na quinzena ativa e folga fora dela quando nao ha alocacao', () => {
    renderGrade();

    expect(screen.getAllByTitle('Disponível · Em escala')).toHaveLength(15);
    expect(screen.getAllByTitle('Folga')).toHaveLength(15);
    expect(screen.queryByText('+')).not.toBeInTheDocument();
  });

  it('renderiza CRM e simulador planejados nas celulas mensais do tripulante', () => {
    renderGrade({
      escalaMes: 6,
      eventos: [
        {
          id: 'crm-15-trip-1',
          escala_id: '1',
          tripulacao_id: 'treinamento:1',
          funcionario_id: 'trip-1',
          funcionario_nome: 'Tripulante Teste',
          funcionario_matricula: '123',
          funcionario_cargo: 'comandante',
          tipo_evento: 'treinamento_solo',
          data_inicio: '2026-06-15',
          data_fim: '2026-06-15',
          gerado_automaticamente: 1,
          origem: 'treinamento',
          status: 'confirmado',
          observacoes: 'CRM — Gerenciamento de Recursos da Tripulação',
        },
        {
          id: 'crm-16-trip-1',
          escala_id: '1',
          tripulacao_id: 'treinamento:1',
          funcionario_id: 'trip-1',
          funcionario_nome: 'Tripulante Teste',
          funcionario_matricula: '123',
          funcionario_cargo: 'comandante',
          tipo_evento: 'treinamento_solo',
          data_inicio: '2026-06-16',
          data_fim: '2026-06-16',
          gerado_automaticamente: 1,
          origem: 'treinamento',
          status: 'confirmado',
          observacoes: 'CRM — Gerenciamento de Recursos da Tripulação',
        },
        {
          id: 'direct-sim-75-p-trip-1',
          escala_id: '1',
          tripulacao_id: 'sim_sessao:75',
          funcionario_id: 'trip-1',
          funcionario_nome: 'Tripulante Teste',
          funcionario_matricula: '123',
          funcionario_cargo: 'comandante',
          tipo_evento: 'treinamento_simulador',
          data_inicio: '2026-06-25',
          data_fim: '2026-06-25',
          gerado_automaticamente: 1,
          origem: 'simuladores',
          status: 'confirmado',
          observacoes: 'SK76 - PERIÓDICO - 03/03: LOFT E CHECK',
        },
      ],
    });

    expect(screen.getAllByTitle('CURSO · CRM — Gerenciamento de Recursos da Tripulação')).toHaveLength(2);
    expect(screen.getByTitle('SIM · SK76 - PERIÓDICO - 03/03: LOFT E CHECK')).toBeInTheDocument();
    expect(screen.getAllByTitle('Disponível · Em escala')).toHaveLength(14);
    expect(screen.getAllByTitle('Folga')).toHaveLength(13);
    expect(screen.queryByText('+')).not.toBeInTheDocument();
  });
});
