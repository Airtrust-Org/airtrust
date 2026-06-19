import { render, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import GradeGantt from '../GradeGantt';
import type {
  EscalaAlocacao,
  EscalaCoberturaTripulante,
  QuinzenaEscala,
} from '../../../hooks/queries/useEscalasQuery';

vi.mock('../../../hooks/useEscalaStore', () => ({
  useEscalaStore: () => ({
    exibirNome: 'completo',
    modoEdicao: false,
    tiposEventoVisiveis: undefined,
    visaoContinua: false,
  }),
}));

vi.mock('../../../hooks/useTiposEventoResolvidos', () => ({
  useTiposEventoResolvidos: () => ({
    configMap: {
      VOO: { sigla: 'V', cor: '#3B82F6', label: 'Voo', ativo: true },
      FOL: { sigla: 'Fo', cor: '#E2E8F0', label: 'Folga', ativo: true },
      FER: { sigla: 'Fe', cor: '#F87171', label: 'Férias', ativo: true },
      LIC: { sigla: 'Li', cor: '#94A3B8', label: 'Licença', ativo: true },
    },
  }),
}));

vi.mock('../../../hooks/queries/useEscalasQuery', async () => {
  const actual = await vi.importActual('../../../hooks/queries/useEscalasQuery');
  return {
    ...actual,
    useCMAStatusQuery: () => ({ data: null }),
  };
});

const QUINZENAS_JUNHO: QuinzenaEscala[] = [
  {
    id: 1,
    numero: 1,
    data_inicio: '2026-06-01',
    data_fim: '2026-06-15',
    mes: 6,
    ano: 2026,
    status: 'rascunho',
    publicada_em: null,
  },
  {
    id: 2,
    numero: 2,
    data_inicio: '2026-06-16',
    data_fim: '2026-06-30',
    mes: 6,
    ano: 2026,
    status: 'rascunho',
    publicada_em: null,
  },
];

function createTripulante(
  partial: Partial<EscalaCoberturaTripulante> = {},
): EscalaCoberturaTripulante {
  return {
    id: partial.id || 'trip-1',
    nome: partial.nome || 'Tripulante Teste',
    nome_guerra: partial.nome_guerra ?? null,
    matricula: partial.matricula ?? null,
    cargo: partial.cargo || 'comandante',
    quinzena_numero: partial.quinzena_numero ?? 1,
    alocacao_q1: partial.alocacao_q1 ?? null,
    alocacao_q2: partial.alocacao_q2 ?? null,
    status_q1: partial.status_q1 || 'livre',
    status_q2: partial.status_q2 || 'livre',
    status_geral: partial.status_geral || 'livre',
    modelos_habilitados: partial.modelos_habilitados ?? ['AW139'],
  };
}

function createSituacao(partial: Partial<EscalaAlocacao>): EscalaAlocacao {
  return {
    id: partial.id || 'sit-1',
    escala_id: partial.escala_id || 'escala-1',
    funcao: partial.funcao ?? null,
    situacao_tipo: partial.situacao_tipo ?? 'FERIAS',
    situacao_cor: partial.situacao_cor ?? '#F87171',
    situacao_nome: partial.situacao_nome ?? 'Férias',
    situacao_icone: partial.situacao_icone ?? null,
    situacao_bloqueia_alocacao: partial.situacao_bloqueia_alocacao ?? 1,
    quinzena_id: partial.quinzena_id ?? 1,
    data_inicio: partial.data_inicio || '2026-06-10',
    data_fim: partial.data_fim || '2026-06-12',
    padrao_escala_id: partial.padrao_escala_id ?? null,
    base: partial.base ?? null,
    observacoes: partial.observacoes ?? null,
    status: partial.status || 'planejado',
    auto_gerado: partial.auto_gerado ?? 0,
    created_by: partial.created_by ?? null,
    created_at: partial.created_at || '2026-06-01T00:00:00.000Z',
    updated_at: partial.updated_at || '2026-06-01T00:00:00.000Z',
    funcionario: partial.funcionario || {
      id: partial.funcionario_id || 'trip-1',
      nome: partial.funcionario_nome || 'Tripulante Teste',
      nome_guerra: null,
      matricula: null,
      role: partial.funcionario_role || 'PIC',
    },
    aeronave: partial.aeronave || {
      id: partial.aeronave_id ?? null,
      prefixo: partial.aeronave_prefixo ?? null,
      modelo: partial.aeronave_modelo ?? null,
    },
    funcionario_id: partial.funcionario_id || 'trip-1',
    funcionario_nome: partial.funcionario_nome || 'Tripulante Teste',
    funcionario_guerra: partial.funcionario_guerra ?? null,
    funcionario_matricula: partial.funcionario_matricula ?? null,
    funcionario_role: partial.funcionario_role ?? 'PIC',
    funcionario_quinzena: partial.funcionario_quinzena ?? null,
    funcionario_is_instrutor: partial.funcionario_is_instrutor ?? false,
    aeronave_id: partial.aeronave_id ?? null,
    aeronave_prefixo: partial.aeronave_prefixo ?? null,
    aeronave_modelo: partial.aeronave_modelo ?? null,
    modelo_aeronave: partial.modelo_aeronave ?? null,
    funcionario_modelo_aeronave: partial.funcionario_modelo_aeronave ?? null,
  };
}

function renderGradeGantt({
  status = 'rascunho',
  tripulantesCobertura = [createTripulante()],
  alocacoes = [],
}: {
  status?: string;
  tripulantesCobertura?: EscalaCoberturaTripulante[];
  alocacoes?: EscalaAlocacao[];
} = {}) {
  return render(
    <GradeGantt
      escala={{ id: 'escala-1', mes: 6, ano: 2026, status }}
      tripulacoes={[]}
      alocacoes={alocacoes}
      cobertura={[]}
      tripulantesCobertura={tripulantesCobertura}
      eventos={[]}
      quinzenas={QUINZENAS_JUNHO}
    />,
  );
}

describe('GradeGantt', () => {
  it.each(['rascunho', 'publicada', 'fechada'])(
    'mostra disponibilidade base no bloco Tripulantes sem Aeronaves em status %s',
    (status) => {
      renderGradeGantt({ status });

      const bloco = screen.getByText('Tripulantes sem Aeronaves').closest('section');
      expect(bloco).not.toBeNull();
      expect(within(bloco as HTMLElement).getAllByTitle('Disponível · Em escala')).toHaveLength(15);
      expect(
        within(bloco as HTMLElement).queryByText('Sem situação registrada no período'),
      ).not.toBeInTheDocument();
    },
  );

  it('projeta a base da quinzena 2 para tripulante sem aeronave', () => {
    renderGradeGantt({
      tripulantesCobertura: [
        createTripulante({
          id: 'trip-2',
          nome: 'Tripulante Q2',
          quinzena_numero: 2,
          modelos_habilitados: ['SK76'],
        }),
      ],
    });

    const bloco = screen.getByText('Tripulantes sem Aeronaves').closest('section');
    expect(bloco).not.toBeNull();
    expect(within(bloco as HTMLElement).getAllByTitle('Disponível · Em escala')).toHaveLength(15);
  });

  it('mantem dias fora da quinzena sem projetar disponibilidade', () => {
    renderGradeGantt();

    const bloco = screen.getByText('Tripulantes sem Aeronaves').closest('section');
    expect(bloco).not.toBeNull();
    expect(within(bloco as HTMLElement).getAllByTitle('Disponível · Em escala')).toHaveLength(15);
    expect(within(bloco as HTMLElement).queryByTitle('Folga')).not.toBeInTheDocument();
  });

  it('preserva evento real e reduz a disponibilidade projetada', () => {
    renderGradeGantt({
      alocacoes: [
        createSituacao({
          id: 'ferias-1',
          funcionario_id: 'trip-1',
          funcionario_nome: 'Tripulante Teste',
          situacao_tipo: 'FERIAS',
          situacao_nome: 'Férias',
          data_inicio: '2026-06-10',
          data_fim: '2026-06-12',
        }),
      ],
    });

    const bloco = screen.getByText('Tripulantes sem Aeronaves').closest('section');
    expect(bloco).not.toBeNull();
    expect(within(bloco as HTMLElement).getAllByTitle('Disponível · Em escala')).toHaveLength(12);
    expect(within(bloco as HTMLElement).getAllByTitle('Férias · Tripulante Teste')).toHaveLength(3);
  });

  it.each([
    ['FERIAS', 'Férias', 'Férias'],
    ['LICENCA', 'Licença', 'Licença'],
    ['AFT', 'Afastamento', 'Licença'],
    ['FOLGA', 'Folga Formal', 'Folga'],
  ] as const)(
    'bloqueia disponibilidade quando ha situacao formal %s',
    (situacaoTipo, situacaoNome, tituloEsperado) => {
      renderGradeGantt({
        alocacoes: [
          createSituacao({
            id: `sit-${situacaoTipo}`,
            funcionario_id: 'trip-1',
            funcionario_nome: 'Tripulante Teste',
            situacao_tipo: situacaoTipo,
            situacao_nome: situacaoNome,
            data_inicio: '2026-06-05',
            data_fim: '2026-06-05',
          }),
        ],
      });

      const bloco = screen.getByText('Tripulantes sem Aeronaves').closest('section');
      expect(bloco).not.toBeNull();
      expect(within(bloco as HTMLElement).getAllByTitle('Disponível · Em escala')).toHaveLength(14);
      expect(
        within(bloco as HTMLElement).getByTitle(new RegExp(`${tituloEsperado} · Tripulante Teste`)),
      ).toBeInTheDocument();
    },
  );
});
