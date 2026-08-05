import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  upsert: vi.fn(),
  g1Sem: vi.fn(),
  audit: vi.fn(),
}));

vi.mock('../../services/qualificacoes-historico-ficha', () => ({
  upsertQualificacaoHistoricoDaFicha: mocks.upsert,
}));
vi.mock('../../services/qualificacoes-g1-sem', () => ({
  realizarG1SemPendente: mocks.g1Sem,
}));
vi.mock('../../routes/simuladores-shared', () => ({ audit: mocks.audit }));

import {
  gerarQualificacaoDaFicha,
  isTipoCurricularSemestral,
} from '../../routes/simuladores-fichas-helpers';

type FichaFixture = {
  empresa_id: number;
  aluno_empresa_id: number;
  aluno_nome: string;
  colaborador_id_aluno: number | null;
  agendamento_slot_id: number;
  status: string;
  aprovado: number;
  data_sessao: string;
  tipo_sessao: string;
  modelo_qualificacao_tipo_id: number;
  modelo_qualificacao_codigo: string;
  modelo_qualificacao_nome: string;
  modelo_qualificacao_validade: number | null;
  tipo_curricular_codigo: string | null;
  tipo_curricular_nome: string | null;
};

function createDb(
  tipoCurricularCodigo: string | null,
  checks: unknown[],
  overrides: Partial<FichaFixture> = {},
) {
  const ficha: FichaFixture = {
    empresa_id: 17,
    aluno_empresa_id: 17,
    aluno_nome: 'Aluno de teste',
    colaborador_id_aluno: 44,
    agendamento_slot_id: 91,
    status: 'APROVADO',
    aprovado: 1,
    data_sessao: '2026-07-21',
    tipo_sessao: 'SIM',
    modelo_qualificacao_tipo_id: 12,
    modelo_qualificacao_codigo: 'REC',
    modelo_qualificacao_nome: 'Recorrente',
    modelo_qualificacao_validade: 12,
    tipo_curricular_codigo: tipoCurricularCodigo,
    tipo_curricular_nome:
      tipoCurricularCodigo === 'SEM'
        ? 'Semestral'
        : tipoCurricularCodigo
          ? 'Periódico'
          : null,
    ...overrides,
  };

  return {
    prepare: vi.fn((query: string) => ({
      bind: vi.fn(() => ({
        first: vi.fn(async () => (query.includes('FROM fichas_sessao') ? ficha : null)),
        all: vi.fn(async () => ({
          results: query.includes('FROM sessoes_checks') ? checks : [],
        })),
      })),
    })),
  } as unknown as D1Database;
}

describe('G1-SEM curricular gate', () => {
  beforeEach(() => {
    mocks.upsert.mockReset().mockImplementation(async (_db, input) => ({
      id: input.qualificacaoId,
      action: 'insert',
      row: {},
    }));
    mocks.g1Sem.mockReset().mockResolvedValue({
      id: 991,
      dataVencimento: '2027-01-21',
    });
    mocks.audit.mockReset();
  });

  it('does not infer a semestral curriculum from a six-month FAP in PER', () => {
    expect(isTipoCurricularSemestral('PER', 'Periódico')).toBe(false);
  });

  it('accepts only the canonical semestral curricular variants', () => {
    expect(isTipoCurricularSemestral('SEM', 'Semestral')).toBe(true);
    expect(isTipoCurricularSemestral(null, 'Semestral')).toBe(true);
  });

  it('rejects non-canonical curricular aliases', () => {
    expect(isTipoCurricularSemestral(null, 'Semianual')).toBe(false);
    expect(isTipoCurricularSemestral('PER', 'Semestral')).toBe(false);
  });

  it('fails closed when the model cannot resolve its curricular type', () => {
    expect(isTipoCurricularSemestral(null, null)).toBe(false);
    expect(isTipoCurricularSemestral('', '')).toBe(false);
  });

  it('generates the periodic principal and approved six-month FAP without G1-SEM for PER', async () => {
    const result = await gerarQualificacaoDaFicha(
      createDb('PER', [
        {
          qualificacao_tipo_id: 13,
          qt_codigo: 'FAP06',
          qt_nome: 'FAP seis meses',
          qt_validade: 6,
        },
      ]),
      501,
    );

    expect(mocks.upsert).toHaveBeenCalledTimes(2);
    expect(result.qualificacoes_geradas.map((item) => item.codigo)).toEqual([
      'REC',
      'FAP06',
    ]);
    expect(mocks.g1Sem).not.toHaveBeenCalled();
  });

  it('generates G1-SEM once for SEM with an approved six-month FAP', async () => {
    const result = await gerarQualificacaoDaFicha(
      createDb('SEM', [
        {
          qualificacao_tipo_id: 13,
          qt_codigo: 'FAP06',
          qt_nome: 'FAP seis meses',
          qt_validade: 6,
        },
      ]),
      502,
    );

    expect(mocks.g1Sem).toHaveBeenCalledTimes(1);
    expect(
      result.qualificacoes_geradas.filter((item) => item.codigo === 'G1-SEM'),
    ).toHaveLength(1);
  });

  it('does not generate FAP or G1-SEM when the check is rejected by the scoped query', async () => {
    const result = await gerarQualificacaoDaFicha(createDb('SEM', []), 503);

    expect(result.qualificacoes_geradas.map((item) => item.codigo)).toEqual(['REC']);
    expect(mocks.g1Sem).not.toHaveBeenCalled();
  });

  it('fails closed and emits a sanitized warning when the curricular type is absent', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    await gerarQualificacaoDaFicha(
      createDb(null, [
        {
          qualificacao_tipo_id: 13,
          qt_codigo: 'FAP06',
          qt_nome: 'FAP seis meses',
          qt_validade: 6,
        },
      ]),
      504,
    );

    expect(mocks.g1Sem).not.toHaveBeenCalled();
    expect(warn).toHaveBeenCalledWith(
      expect.not.stringMatching(/Aluno de teste|cpf|canac|token/i),
    );
    warn.mockRestore();
  });

  it('persists permanent simulator qualifications without an artificial expiry', async () => {
    const result = await gerarQualificacaoDaFicha(
      createDb('PER', [], { modelo_qualificacao_validade: null }),
      505,
    );

    expect(mocks.upsert).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        funcionarioId: 44,
        qualificacaoCodigo: 'REC',
        dataVencimento: null,
      }),
    );
    expect(result.valida_ate).toBeNull();
  });

  it('rejects a ficha without an employee before any qualification write', async () => {
    await expect(
      gerarQualificacaoDaFicha(
        createDb('PER', [], { colaborador_id_aluno: null }),
        506,
      ),
    ).rejects.toThrow('Ficha sem colaborador válido para gerar qualificação');

    expect(mocks.upsert).not.toHaveBeenCalled();
  });
});
