/**
 * #1492 + decisao do proprietario (todos os vencimentos vencem NO DIA): o Compliance usa o mesmo
 * calculo do historico/Ficha e IGNORA a coluna legada vencimento_fim_mes.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { computeRequirement, type Rule } from '../../services/training-compliance-snapshot-builder';

type Evidence = NonNullable<Parameters<typeof computeRequirement>[1]>[number];

function rule(overrides: Partial<Rule>): Rule {
  return {
    id: 1, empresa_id: 6, qualificacao_tipo_id: 10, qualificacao_tipo_nome: 'T',
    qualificacao_tipo_codigo: 'T', validade_meses: 12, escopo: 'EMPRESA', setor_id: null,
    setor_nome: null, funcao_id: null, funcao_nome: null, funcionario_id: null,
    funcionario_nome: null, aeronave_modelo: null, condicao_id: null, condicao_codigo: null,
    condicao_nome: null, justificativa: null, perfil_competencia: null,
    modalidade_requerida: null, fundamento_tipo: null, fundamento_documento: null,
    fundamento_item: null, validade_fonte: 'MODELO', obrigatoriedade: 'OBRIGATORIA',
    nivel_requerido: null, critico_operacional: 0, origem: 'REGULATORIO',
    referencia_normativa: null, observacoes: null, vigencia_inicio: null, vigencia_fim: null,
    prazo_inicial_dias: null, auto_matricular_ead: 0, ativo: 1, created_at: '2026-01-01',
    updated_at: '2026-01-01', ...overrides,
  };
}

const history = (data_realizacao: string): Evidence => ({
  funcionario_id: 1, tipo_id: 10, data_realizacao, data_vencimento: null,
  origem: 'QUALIFICACAO', origem_id: 1, origem_titulo: null, modalidade: 'PRESENCIAL',
});

afterEach(() => vi.useRealTimers());

describe('computeRequirement ignora vencimento_fim_mes (vence no dia)', () => {
  it('flag legada = 1 vence no mesmo dia (2025-01-15 + 12m = 2026-01-15), nao no fim do mes', () => {
    const result = computeRequirement(
      rule({ vencimento_fim_mes: 1 }), [history('2025-01-15')], [], { today: '2026-01-20' },
    );
    expect(result.data_validade).toBe('2026-01-15');
    expect(result.status_compliance).toBe('VENCIDO');
  });

  it('modelo dia exato continua vencendo no mesmo dia (2025-01-15 + 12m = 2026-01-15)', () => {
    const result = computeRequirement(
      rule({ vencimento_fim_mes: 0 }), [history('2025-01-15')], [], { today: '2026-01-20' },
    );
    expect(result.data_validade).toBe('2026-01-15');
    expect(result.status_compliance).toBe('VENCIDO');
  });

  it('regra sem a coluna (legado) preserva o calculo dia exato', () => {
    const result = computeRequirement(rule({}), [history('2025-01-15')], [], { today: '2025-06-01' });
    expect(result.data_validade).toBe('2026-01-15');
  });
});
