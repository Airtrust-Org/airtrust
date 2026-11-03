/**
 * Auditoria de Compliance — oráculo independente para computeRequirement.
 *
 * Cada caso usa um dataset sintético conhecido e compara o resultado com um
 * valor calculado à mão (não com o próprio código). Referência de "hoje":
 * America/Sao_Paulo (mesma régua de qualificacoes-alerta-config.getTodayIsoSaoPaulo).
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { computeRequirement, type Rule } from '../../services/training-compliance-snapshot-builder';

type Evidence = NonNullable<Parameters<typeof computeRequirement>[1]>[number];

function rule(overrides: Partial<Rule> = {}): Rule {
  return {
    id: 1,
    empresa_id: 1,
    qualificacao_tipo_id: 10,
    qualificacao_tipo_nome: 'NR-35',
    qualificacao_tipo_codigo: 'NR35',
    validade_meses: 12,
    escopo: 'EMPRESA',
    setor_id: null,
    setor_nome: null,
    funcao_id: null,
    funcao_nome: null,
    funcionario_id: null,
    funcionario_nome: null,
    aeronave_modelo: null,
    condicao_id: null,
    condicao_codigo: null,
    condicao_nome: null,
    justificativa: null,
    perfil_competencia: null,
    modalidade_requerida: null,
    fundamento_tipo: null,
    fundamento_documento: null,
    fundamento_item: null,
    validade_fonte: 'EVIDENCIA',
    obrigatoriedade: 'OBRIGATORIA',
    nivel_requerido: null,
    critico_operacional: 0,
    origem: 'REGULATORIO',
    referencia_normativa: null,
    observacoes: null,
    vigencia_inicio: null,
    vigencia_fim: null,
    prazo_inicial_dias: null,
    auto_matricular_ead: 0,
    ativo: 1,
    created_at: '2026-01-01',
    updated_at: '2026-01-01',
    ...overrides,
  };
}

function history(data_realizacao: string, data_vencimento: string | null): Evidence {
  return {
    funcionario_id: 1,
    tipo_id: 10,
    data_realizacao,
    data_vencimento,
    origem: 'QUALIFICACAO',
    origem_id: 1,
    origem_titulo: null,
    modalidade: 'PRESENCIAL',
  };
}

function lms(
  status: string,
  data_realizacao: string | null,
  extra: Partial<Evidence> = {},
): Evidence {
  return {
    funcionario_id: 1,
    tipo_id: 10,
    data_realizacao,
    data_vencimento: null,
    origem: 'LMS',
    origem_id: 7,
    origem_titulo: 'Curso',
    lms_status: status,
    progresso_pct: 40,
    modalidade: 'EAD',
    ...extra,
  };
}

afterEach(() => vi.useRealTimers());

describe('computeRequirement — referência de data America/Sao_Paulo', () => {
  it('às 22:30 BRT (01:30Z do dia seguinte) um vencimento "hoje" ainda é válido (dias=0, VENCENDO)', () => {
    // 2026-11-02 22:30 em São Paulo == 2026-11-03T01:30:00Z
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-11-03T01:30:00Z'));
    const result = computeRequirement(rule(), [history('2025-11-02', '2026-11-02')], []);
    expect(result.dias_para_vencer).toBe(0);
    expect(result.status_compliance).toBe('VENCENDO');
  });

  it('às 22:30 BRT, vencimento "ontem" já é VENCIDO (dias=-1)', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-11-03T01:30:00Z'));
    const result = computeRequirement(rule(), [history('2025-11-01', '2026-11-01')], []);
    expect(result.dias_para_vencer).toBe(-1);
    expect(result.status_compliance).toBe('VENCIDO');
  });

  it('às 22:30 BRT, evidência realizada "hoje" em BRT conta como realizada', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-11-03T01:30:00Z'));
    const result = computeRequirement(rule({ validade_meses: 12 }), [history('2026-11-02', null)], []);
    expect(result.status_compliance).toBe('CONFORME');
  });

  it('janela de 30 dias respeita a data BRT: vence em 30 dias → VENCENDO; em 31 → CONFORME', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-11-03T01:30:00Z')); // hoje BRT = 2026-11-02
    const r30 = computeRequirement(rule(), [history('2025-12-02', '2026-12-02')], []);
    const r31 = computeRequirement(rule(), [history('2025-12-03', '2026-12-03')], []);
    expect(r30.dias_para_vencer).toBe(30);
    expect(r30.status_compliance).toBe('VENCENDO');
    expect(r31.dias_para_vencer).toBe(31);
    expect(r31.status_compliance).toBe('CONFORME');
  });
});

describe('computeRequirement — oráculo de status', () => {
  const noon = (iso: string) => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(`${iso}T15:00:00Z`));
  };

  it('sem nenhuma evidência → NAO_REALIZADO (ausência nunca vira conforme)', () => {
    noon('2026-06-15');
    const result = computeRequirement(rule(), [], []);
    expect(result.status_compliance).toBe('NAO_REALIZADO');
    expect(result.status).toBe('EM_FALTA');
  });

  it('evidência futura (data_realizacao > hoje) não conta', () => {
    noon('2026-06-15');
    const result = computeRequirement(rule(), [history('2026-07-01', '2027-07-01')], []);
    expect(result.status_compliance).toBe('NAO_REALIZADO');
  });

  it('LMS EM_ANDAMENTO sem conclusão → EM_ANDAMENTO, nunca CONFORME', () => {
    noon('2026-06-15');
    const result = computeRequirement(rule(), [], [lms('EM_ANDAMENTO', null)]);
    expect(result.status_compliance).toBe('EM_ANDAMENTO');
    expect(result.progresso_pct).toBe(40);
  });

  it.each(['NAO_INICIADO', 'REPROVADO', 'CANCELADO'])(
    'LMS %s não produz conformidade',
    (status) => {
      noon('2026-06-15');
      const result = computeRequirement(rule(), [], [lms(status, '2026-06-01')]);
      expect(result.status_compliance).toBe('NAO_REALIZADO');
    },
  );

  it('LMS CONCLUIDO sem data_conclusao não vira conforme (evidência sem data)', () => {
    noon('2026-06-15');
    const result = computeRequirement(rule(), [], [lms('CONCLUIDO', null)]);
    expect(result.status_compliance).not.toBe('CONFORME');
  });

  it('LMS CONCLUIDO + validade_meses=12 → validade = conclusão + 12 meses', () => {
    noon('2026-06-15');
    const result = computeRequirement(
      rule({ validade_fonte: 'MODELO' }),
      [],
      [lms('CONCLUIDO', '2025-08-10')],
    );
    expect(result.data_validade).toBe('2026-08-10');
    expect(result.status_compliance).toBe('CONFORME');
  });

  it('LMS concluído há mais de 12 meses → VENCIDO', () => {
    noon('2026-06-15');
    const result = computeRequirement(
      rule({ validade_fonte: 'MODELO' }),
      [],
      [lms('CONCLUIDO', '2025-06-14')],
    );
    expect(result.data_validade).toBe('2026-06-14');
    expect(result.dias_para_vencer).toBe(-1);
    expect(result.status_compliance).toBe('VENCIDO');
  });

  it('virada de ano e ano bissexto: 2027-02-28 + 12m = 2028-02-28; 2027-02-28 + 24m = 2029-02-28', () => {
    noon('2027-03-01');
    const r12 = computeRequirement(
      rule({ validade_fonte: 'MODELO', validade_meses: 12 }),
      [],
      [lms('CONCLUIDO', '2027-02-28')],
    );
    expect(r12.data_validade).toBe('2028-02-28');
    const r24 = computeRequirement(
      rule({ validade_fonte: 'MODELO', validade_meses: 24 }),
      [],
      [lms('CONCLUIDO', '2027-02-28')],
    );
    expect(r24.data_validade).toBe('2029-02-28');
  });

  it('evidência mais recente prevalece sobre mais antiga já vencida (renovação)', () => {
    noon('2026-06-15');
    const result = computeRequirement(
      rule(),
      [history('2026-05-01', '2027-05-01'), history('2024-05-01', '2025-05-01')],
      [],
    );
    expect(result.data_validade).toBe('2027-05-01');
    expect(result.status_compliance).toBe('CONFORME');
  });

  it('modalidade exigida PRESENCIAL: EAD concluído NÃO satisfaz', () => {
    noon('2026-06-15');
    const result = computeRequirement(
      rule({ modalidade_requerida: 'PRESENCIAL', validade_fonte: 'MODELO' }),
      [],
      [lms('CONCLUIDO', '2026-06-01')],
    );
    expect(result.status_compliance).toBe('NAO_REALIZADO');
    expect(result.evidencia_modalidade_incompativel).toBe(true);
  });

  it('perfil exigido: evidência sem perfil gravado não satisfaz requisito perfilado', () => {
    noon('2026-06-15');
    const result = computeRequirement(
      rule({ perfil_competencia: 'AVSEC_GESTOR' }),
      [{ ...history('2026-06-01', '2027-06-01'), perfil_competencia: null }],
      [],
    );
    expect(result.status_compliance).toBe('NAO_REALIZADO');
  });
});
