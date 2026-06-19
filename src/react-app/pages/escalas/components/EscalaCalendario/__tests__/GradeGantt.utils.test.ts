import { describe, expect, it } from 'vitest';

import {
  buildTripulantesSemAeronaveRows,
  collectFuncionariosComAeronaveAtiva,
} from '../GradeGantt';
import { buildSyntheticAlocacoesFromEventos } from '../GradeTripulantes.utils';
import type {
  EscalaAlocacao,
  EscalaCoberturaTripulante,
  EscalaEvento,
  QuinzenaEscala,
} from '../../../hooks/queries/useEscalasQuery';

function createAlocacao(partial: Partial<EscalaAlocacao>): EscalaAlocacao {
  return {
    id: partial.id || 'aloc-1',
    escala_id: partial.escala_id || 'escala-1',
    funcao: partial.funcao ?? 'PIC',
    situacao_tipo: partial.situacao_tipo,
    situacao_cor: partial.situacao_cor ?? null,
    situacao_nome: partial.situacao_nome ?? null,
    situacao_icone: partial.situacao_icone ?? null,
    situacao_bloqueia_alocacao: partial.situacao_bloqueia_alocacao ?? null,
    quinzena_id: partial.quinzena_id ?? null,
    data_inicio: partial.data_inicio || '2026-05-01',
    data_fim: partial.data_fim || '2026-05-15',
    padrao_escala_id: partial.padrao_escala_id ?? null,
    base: partial.base ?? null,
    observacoes: partial.observacoes ?? null,
    status: partial.status || 'planejado',
    auto_gerado: partial.auto_gerado ?? 0,
    created_by: partial.created_by ?? null,
    created_at: partial.created_at || '2026-04-11T00:00:00.000Z',
    updated_at: partial.updated_at || '2026-04-11T00:00:00.000Z',
    funcionario: partial.funcionario || {
      id: partial.funcionario_id || 'func-1',
      nome: partial.funcionario_nome || 'Tripulante',
      nome_guerra: null,
      matricula: null,
      role: partial.funcionario_role || 'PIC',
    },
    aeronave: partial.aeronave || {
      id: partial.aeronave_id ?? null,
      prefixo: partial.aeronave_prefixo ?? null,
      modelo: partial.aeronave_modelo ?? null,
    },
    funcionario_id: partial.funcionario_id || 'func-1',
    funcionario_nome: partial.funcionario_nome || 'Tripulante',
    funcionario_guerra: partial.funcionario_guerra ?? null,
    funcionario_matricula: partial.funcionario_matricula ?? null,
    funcionario_role: partial.funcionario_role ?? 'PIC',
    funcionario_quinzena: partial.funcionario_quinzena ?? null,
    funcionario_is_instrutor: partial.funcionario_is_instrutor ?? false,
    aeronave_id: partial.aeronave_id ?? null,
    aeronave_prefixo: partial.aeronave_prefixo ?? null,
    aeronave_modelo: partial.aeronave_modelo ?? null,
    modelo_aeronave: partial.modelo_aeronave ?? partial.aeronave_modelo ?? null,
    funcionario_modelo_aeronave: partial.funcionario_modelo_aeronave ?? null,
  };
}

function createCoberturaTripulante(
  partial: Partial<EscalaCoberturaTripulante>,
): EscalaCoberturaTripulante {
  return {
    id: partial.id || 'func-1',
    nome: partial.nome || 'Tripulante',
    nome_guerra: partial.nome_guerra ?? null,
    matricula: partial.matricula ?? null,
    cargo: partial.cargo || 'comandante',
    quinzena_numero: partial.quinzena_numero ?? 1,
    alocacao_q1: partial.alocacao_q1 ?? null,
    alocacao_q2: partial.alocacao_q2 ?? null,
    status_q1: partial.status_q1 || 'livre',
    status_q2: partial.status_q2 || 'livre',
    status_geral: partial.status_geral || 'livre',
    modelos_habilitados: partial.modelos_habilitados ?? [],
  };
}

const QUINZENAS_MES: QuinzenaEscala[] = [
  {
    id: 1,
    numero: 1,
    data_inicio: '2026-05-01',
    data_fim: '2026-05-16',
    mes: 5,
    ano: 2026,
  },
  {
    id: 2,
    numero: 2,
    data_inicio: '2026-05-17',
    data_fim: '2026-05-31',
    mes: 5,
    ano: 2026,
  },
];

describe('collectFuncionariosComAeronaveAtiva', () => {
  it('marca funcionarios com alocacao operacional em aeronave no periodo visivel', () => {
    const resultado = collectFuncionariosComAeronaveAtiva(
      [
        createAlocacao({
          funcionario_id: 'ramon',
          funcionario_nome: 'Ramon',
          aeronave_id: 10,
          aeronave_prefixo: 'PS-CDV',
          data_inicio: '2026-05-01',
          data_fim: '2026-05-15',
        }),
        createAlocacao({
          id: 'sit-1',
          funcionario_id: 'ramon',
          funcionario_nome: 'Ramon',
          situacao_tipo: 'STB',
          aeronave_id: null,
          aeronave_prefixo: null,
          funcao: null,
          data_inicio: '2026-05-01',
          data_fim: '2026-05-15',
        }),
      ],
      '2026-05-01',
      '2026-05-31',
    );

    expect(resultado.has('ramon')).toBe(true);
  });

  it('ignora situacoes sem aeronave e alocacoes fora do periodo visivel', () => {
    const resultado = collectFuncionariosComAeronaveAtiva(
      [
        createAlocacao({
          id: 'sit-1',
          funcionario_id: 'adriana',
          funcionario_nome: 'Adriana',
          situacao_tipo: 'STB',
          aeronave_id: null,
          aeronave_prefixo: null,
          funcao: null,
          data_inicio: '2026-05-17',
          data_fim: '2026-05-31',
        }),
        createAlocacao({
          id: 'aloc-fora',
          funcionario_id: 'caio',
          funcionario_nome: 'Caio',
          aeronave_id: 11,
          aeronave_prefixo: 'PS-CDU',
          data_inicio: '2026-06-01',
          data_fim: '2026-06-15',
        }),
      ],
      '2026-05-01',
      '2026-05-31',
    );

    expect(resultado.size).toBe(0);
  });
});

function createEvento(partial: Partial<EscalaEvento>): EscalaEvento {
  return {
    id: partial.id || 'evt-1',
    escala_id: partial.escala_id || 'escala-1',
    tripulacao_id: partial.tripulacao_id ?? null,
    funcionario_id: partial.funcionario_id || 'func-1',
    funcionario_nome: partial.funcionario_nome || 'Tripulante',
    funcionario_matricula: partial.funcionario_matricula || '001',
    funcionario_cargo: partial.funcionario_cargo ?? null,
    tipo_evento: partial.tipo_evento || 'treinamento_solo',
    data_inicio: partial.data_inicio || '2026-06-15',
    data_fim: partial.data_fim || '2026-06-16',
    gerado_automaticamente: partial.gerado_automaticamente ?? 0,
    status: partial.status || 'pendente',
    origem: partial.origem ?? 'treinamento',
    observacoes: partial.observacoes ?? null,
  };
}

describe('GradeGantt synthetic bridge — CRM/simulator eventos → LinhaSituacao', () => {
  it('grade_gantt_usa_bridge — buildSyntheticAlocacoesFromEventos está importado em GradeGantt', async () => {
    const { readFileSync } = await import('node:fs');
    const { resolve, dirname } = await import('node:path');
    const { fileURLToPath } = await import('node:url');
    const dir = dirname(fileURLToPath(import.meta.url));
    const src = readFileSync(resolve(dir, '../GradeGantt.tsx'), 'utf8');
    expect(src).toContain("import { buildSyntheticAlocacoesFromEventos } from './GradeTripulantes.utils'");
    expect(src).toContain('syntheticAlocacoes');
    expect(src).toContain('buildSyntheticAlocacoesFromEventos({');
  });

  it('crm_15_16_junho_aparece_em_linhaSituacao_via_grade_gantt — escala_eventos treinamento_solo geram CURSO nas linhas', () => {
    const escalaId = 'c9767640-01aa-4714-a6ba-7b4635ffb3c4';
    const eventosCRM: EscalaEvento[] = [
      createEvento({ id: 'evt-crm-1', escala_id: escalaId, funcionario_id: '66', funcionario_nome: 'Vargas', tipo_evento: 'treinamento_solo', data_inicio: '2026-06-15', data_fim: '2026-06-15' }),
      createEvento({ id: 'evt-crm-2', escala_id: escalaId, funcionario_id: '66', funcionario_nome: 'Vargas', tipo_evento: 'treinamento_solo', data_inicio: '2026-06-16', data_fim: '2026-06-16' }),
      createEvento({ id: 'evt-crm-3', escala_id: escalaId, funcionario_id: '67', funcionario_nome: 'Monteiro', tipo_evento: 'treinamento_solo', data_inicio: '2026-06-15', data_fim: '2026-06-15' }),
    ];

    const synthetic = buildSyntheticAlocacoesFromEventos({
      eventos: eventosCRM,
      escalaId,
      tripulanteIds: new Set(['66', '67']),
    });

    expect(synthetic.length).toBeGreaterThanOrEqual(3);
    expect(synthetic.every((s) => s.situacao_tipo === 'CURSO')).toBe(true);
    expect(synthetic.some((s) => s.funcionario_id === '66')).toBe(true);
    expect(synthetic.some((s) => s.funcionario_id === '67')).toBe(true);

    // Feed into buildTripulantesSemAeronaveRows → linhas de situação
    const coberturas: EscalaCoberturaTripulante[] = [
      createCoberturaTripulante({ id: '66', nome: 'Vargas', cargo: 'copiloto' }),
      createCoberturaTripulante({ id: '67', nome: 'Monteiro', cargo: 'copiloto' }),
    ];
    const rows = buildTripulantesSemAeronaveRows({
      situacoes: synthetic,
      tripulantesCobertura: coberturas,
      funcionariosComAeronaveAtiva: new Set(),
      filtroNomeNormalizado: '',
      filtroModeloNormalizado: '',
      quinzenasMes: QUINZENAS_MES,
      intervaloVisivelInicio: '2026-06-01',
      intervaloVisivelFim: '2026-06-30',
    });

    expect(rows).toHaveLength(2);
    const vargas = rows.find((r) => r.funcionarioId === '66');
    expect(vargas).toBeDefined();
    expect(vargas!.situacoes.length).toBeGreaterThanOrEqual(1);
    expect(vargas!.situacoes.every((s) => s.situacao_tipo === 'CURSO')).toBe(true);
  });

  it('antonio_25_06_aparece_em_linhaSituacao_via_grade_gantt — sessoesDiretas treinamento_simulador geram SIM nas linhas', () => {
    const escalaId = 'c9767640-01aa-4714-a6ba-7b4635ffb3c4';
    const eventoSimulador: EscalaEvento[] = [
      createEvento({ id: 'sim-75-3', escala_id: escalaId, funcionario_id: '3', funcionario_nome: 'Antônio', tipo_evento: 'treinamento_simulador', data_inicio: '2026-06-25', data_fim: '2026-06-25' }),
    ];

    const synthetic = buildSyntheticAlocacoesFromEventos({
      eventos: eventoSimulador,
      escalaId,
      tripulanteIds: new Set(['3']),
    });

    expect(synthetic).toHaveLength(1);
    expect(synthetic[0].situacao_tipo).toBe('SIM');
    expect(synthetic[0].funcionario_id).toBe('3');

    const coberturas: EscalaCoberturaTripulante[] = [
      createCoberturaTripulante({ id: '3', nome: 'Antônio', cargo: 'comandante' }),
    ];
    const rows = buildTripulantesSemAeronaveRows({
      situacoes: synthetic,
      tripulantesCobertura: coberturas,
      funcionariosComAeronaveAtiva: new Set(),
      filtroNomeNormalizado: '',
      filtroModeloNormalizado: '',
      quinzenasMes: QUINZENAS_MES,
      intervaloVisivelInicio: '2026-06-01',
      intervaloVisivelFim: '2026-06-30',
    });

    expect(rows).toHaveLength(1);
    expect(rows[0].funcionarioId).toBe('3');
    expect(rows[0].situacoes.some((s) => s.situacao_tipo === 'SIM')).toBe(true);
  });

  it('sem_situacao_registrada_nao_aparece_quando_eventos_existem — com synthetic, linhas têm situações', () => {
    const escalaId = 'escala-test';
    const eventos: EscalaEvento[] = [
      createEvento({ id: 'e1', escala_id: escalaId, funcionario_id: 'pilot-1', funcionario_nome: 'Piloto', tipo_evento: 'treinamento_solo', data_inicio: '2026-06-10', data_fim: '2026-06-10' }),
    ];
    const synthetic = buildSyntheticAlocacoesFromEventos({
      eventos,
      escalaId,
      tripulanteIds: new Set(['pilot-1']),
    });
    const rows = buildTripulantesSemAeronaveRows({
      situacoes: synthetic,
      tripulantesCobertura: [createCoberturaTripulante({ id: 'pilot-1', nome: 'Piloto' })],
      funcionariosComAeronaveAtiva: new Set(),
      filtroNomeNormalizado: '',
      filtroModeloNormalizado: '',
      quinzenasMes: QUINZENAS_MES,
      intervaloVisivelInicio: '2026-06-01',
      intervaloVisivelFim: '2026-06-30',
    });
    // Row exists and has at least one situacao → no "Sem situação registrada"
    expect(rows).toHaveLength(1);
    expect(rows[0].situacoes.length).toBeGreaterThan(0);
  });

  it('synthetic_nao_polui_funcionariosComAeronaveAtiva — itens com situacao_tipo nao sao marcados como tendo aeronave', () => {
    const escalaId = 'escala-test';
    const eventos: EscalaEvento[] = [
      createEvento({ id: 'e1', escala_id: escalaId, funcionario_id: 'pilot-1', funcionario_nome: 'Piloto', tipo_evento: 'treinamento_solo', data_inicio: '2026-06-10', data_fim: '2026-06-10' }),
    ];
    const synthetic = buildSyntheticAlocacoesFromEventos({
      eventos,
      escalaId,
      tripulanteIds: new Set(['pilot-1']),
    });
    // collectFuncionariosComAeronaveAtiva should NOT include pilot-1 because synthetic items have situacao_tipo
    const result = collectFuncionariosComAeronaveAtiva(synthetic, '2026-06-01', '2026-06-30');
    expect(result.has('pilot-1')).toBe(false);
  });
});

describe('buildTripulantesSemAeronaveRows', () => {
  it('inclui tripulantes sem aeronave mesmo sem situacao registrada', () => {
    const rows = buildTripulantesSemAeronaveRows({
      situacoes: [],
      tripulantesCobertura: [
        createCoberturaTripulante({
          id: 'castro',
          nome: 'Carlos Castro',
          nome_guerra: 'Castro',
          cargo: 'comandante',
          quinzena_numero: 2,
          modelos_habilitados: ['S76'],
        }),
      ],
      funcionariosComAeronaveAtiva: new Set(),
      filtroNomeNormalizado: '',
      filtroModeloNormalizado: '',
      quinzenasMes: QUINZENAS_MES,
      intervaloVisivelInicio: '2026-05-01',
      intervaloVisivelFim: '2026-05-31',
    });

    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      funcionarioId: 'castro',
      nome: 'Carlos Castro',
      nomeGuerra: 'Castro',
      funcao: 'PIC',
      modelo: 'S76',
      quinzenaPreferencial: 2,
    });
    expect(rows[0].situacoes).toHaveLength(0);
    expect(rows[0].situacoesVisiveis).toHaveLength(0);
    expect(rows[0].situacaoReferencia).toBeNull();
  });

  it('mescla cobertura com situacoes e exclui quem ja esta em aeronave no periodo', () => {
    const rows = buildTripulantesSemAeronaveRows({
      situacoes: [
        createAlocacao({
          id: 'sit-1',
          funcionario_id: 'castro',
          funcionario_nome: 'Carlos Castro',
          funcionario_guerra: 'Castro',
          funcionario_role: 'PIC',
          situacao_tipo: 'FERIAS',
          situacao_nome: 'Férias',
          data_inicio: '2026-05-17',
          data_fim: '2026-05-31',
        }),
      ],
      tripulantesCobertura: [
        createCoberturaTripulante({
          id: 'castro',
          nome: 'Carlos Castro',
          nome_guerra: 'Castro',
          cargo: 'comandante',
          quinzena_numero: 2,
          modelos_habilitados: ['S76'],
        }),
        createCoberturaTripulante({
          id: 'ramon',
          nome: 'Ramon',
          cargo: 'copiloto',
          quinzena_numero: 1,
          modelos_habilitados: ['AW139'],
        }),
      ],
      funcionariosComAeronaveAtiva: new Set(['ramon']),
      filtroNomeNormalizado: '',
      filtroModeloNormalizado: '',
      quinzenasMes: QUINZENAS_MES,
      intervaloVisivelInicio: '2026-05-01',
      intervaloVisivelFim: '2026-05-31',
    });

    expect(rows).toHaveLength(1);
    expect(rows[0].funcionarioId).toBe('castro');
    expect(rows[0].situacaoReferencia?.id).toBe('sit-1');
    expect(rows[0].situacoesVisiveis).toHaveLength(1);
  });

  it('preserva folga manual na quinzena ativa para bloquear disponibilidade base', () => {
    const rows = buildTripulantesSemAeronaveRows({
      situacoes: [
        createAlocacao({
          id: 'folga-manual-q1',
          funcionario_id: 'castro',
          funcionario_nome: 'Carlos Castro',
          funcionario_guerra: 'Castro',
          funcionario_role: 'PIC',
          situacao_tipo: 'FOLGA',
          situacao_nome: 'Folga Formal',
          quinzena_id: 1,
          auto_gerado: 0,
          data_inicio: '2026-05-05',
          data_fim: '2026-05-05',
        }),
      ],
      tripulantesCobertura: [
        createCoberturaTripulante({
          id: 'castro',
          nome: 'Carlos Castro',
          nome_guerra: 'Castro',
          cargo: 'comandante',
          quinzena_numero: 1,
          modelos_habilitados: ['S76'],
        }),
      ],
      funcionariosComAeronaveAtiva: new Set(),
      filtroNomeNormalizado: '',
      filtroModeloNormalizado: '',
      quinzenasMes: QUINZENAS_MES,
      intervaloVisivelInicio: '2026-05-01',
      intervaloVisivelFim: '2026-05-31',
    });

    expect(rows).toHaveLength(1);
    expect(rows[0].situacoesVisiveis).toHaveLength(1);
    expect(rows[0].situacoesVisiveis[0]).toMatchObject({
      id: 'folga-manual-q1',
      situacao_tipo: 'FOLGA',
    });
  });
});
