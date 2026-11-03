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

  it('às 22:30 BRT, conclusão gravada com a data UTC (dia seguinte) conta como realizada — LMS e Histórico', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-11-03T01:30:00Z')); // BRT 2026-11-02 22:30; gravadores usam 2026-11-03
    const viaHistorico = computeRequirement(rule(), [history('2026-11-03', null)], []);
    expect(viaHistorico.status_compliance).toBe('CONFORME');
    const viaLms = computeRequirement(
      rule({ validade_fonte: 'MODELO' }),
      [],
      [lms('CONCLUIDO', '2026-11-03')],
    );
    expect(viaLms.status_compliance).toBe('CONFORME');
  });

  it('evidência realmente futura (além do dia UTC corrente) continua não contando', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-11-03T01:30:00Z'));
    const result = computeRequirement(rule(), [history('2026-11-04', null)], []);
    expect(result.status_compliance).toBe('NAO_REALIZADO');
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

import { buildDailyComplianceSnapshots } from '../../services/training-compliance-snapshots';

type Person = Parameters<typeof buildDailyComplianceSnapshots>[0][number];
const person = (p: Partial<Person>): Person => ({
  setor_id: null,
  funcao_id: null,
  total_obrigatorios: 0,
  conformes: 0,
  vencendo: 0,
  vencidos: 0,
  nao_realizados: 0,
  em_andamento: 0,
  ...p,
});

describe('agregados de conformidade — oráculo (razão de somas, 1 casa decimal)', () => {
  // Dataset conhecido:
  //   P1 setor 10 função 1: 4 obrig., 3 conformes (1 vencendo), 1 vencido
  //   P2 setor 10 função 2: 2 obrig., 2 conformes
  //   P3 setor 11 função 1: 3 obrig., 1 conforme, 2 não realizados
  //   P4 setor 11 função 2: sem requisitos aplicáveis (0) — fora do denominador
  const people = [
    person({ setor_id: 10, funcao_id: 1, total_obrigatorios: 4, conformes: 3, vencendo: 1, vencidos: 1 }),
    person({ setor_id: 10, funcao_id: 2, total_obrigatorios: 2, conformes: 2 }),
    person({ setor_id: 11, funcao_id: 1, total_obrigatorios: 3, conformes: 1, nao_realizados: 2 }),
    person({ setor_id: 11, funcao_id: 2 }),
  ];
  const rows = buildDailyComplianceSnapshots(people, '2026-11-02');
  const find = (setor: number, funcao: number) =>
    rows.find((r) => r.setor_id === setor && r.funcao_id === funcao)!;

  it('empresa: (3+2+1)/(4+2+3) = 6/9 = 66.7%; pessoa sem requisitos não entra no denominador', () => {
    const all = find(0, 0);
    expect(all.pessoas).toBe(4);
    expect(all.requisitos_obrigatorios).toBe(9);
    expect(all.conformes).toBe(6);
    expect(all.compliance_pct).toBe(66.7);
  });

  it('setor 10: 5/6 = 83.3% — setor 11: 1/3 = 33.3%', () => {
    expect(find(10, 0).compliance_pct).toBe(83.3);
    expect(find(11, 0).compliance_pct).toBe(33.3);
  });

  it('função 1: 4/7 = 57.1% — função 2: 2/2 = 100%', () => {
    expect(find(0, 1).compliance_pct).toBe(57.1);
    expect(find(0, 2).compliance_pct).toBe(100);
  });

  it('célula setor×função com só pessoa sem requisitos → null (nunca 0% nem 100%)', () => {
    expect(find(11, 2).compliance_pct).toBeNull();
    expect(find(11, 2).requisitos_obrigatorios).toBe(0);
  });

  it('subtotais de setores e de funções reconciliam com o total da empresa (sem dupla contagem)', () => {
    const sum = (key: 'conformes' | 'requisitos_obrigatorios' | 'vencidos' | 'nao_realizados', which: 'setor' | 'funcao') =>
      rows
        .filter((r) => (which === 'setor' ? r.setor_id > 0 && r.funcao_id === 0 : r.funcao_id > 0 && r.setor_id === 0))
        .reduce((acc, r) => acc + r[key], 0);
    for (const key of ['conformes', 'requisitos_obrigatorios', 'vencidos', 'nao_realizados'] as const) {
      expect(sum(key, 'setor')).toBe(find(0, 0)[key]);
      expect(sum(key, 'funcao')).toBe(find(0, 0)[key]);
    }
  });

  it('pessoas_com_pendencia conta quem tem vencendo/vencido/não realizado/em andamento (P1 e P3)', () => {
    expect(find(0, 0).pessoas_com_pendencia).toBe(2);
  });

  it('lista vazia: um único registro da empresa com denominador zero → null', () => {
    const empty = buildDailyComplianceSnapshots([], '2026-11-02');
    expect(empty).toHaveLength(1);
    expect(empty[0].compliance_pct).toBeNull();
  });

  it('arredondamento: 1/3 → 33.3 e 2/3 → 66.7', () => {
    const one = buildDailyComplianceSnapshots([person({ total_obrigatorios: 3, conformes: 1 })], 'd')[0];
    const two = buildDailyComplianceSnapshots([person({ total_obrigatorios: 3, conformes: 2 })], 'd')[0];
    expect(one.compliance_pct).toBe(33.3);
    expect(two.compliance_pct).toBe(66.7);
  });
});

import { getTodayIsoSaoPaulo } from '../../utils/qualificacoes-alerta-config';

describe('getTodayIsoSaoPaulo — formatter reutilizado e fronteiras', () => {
  it('não constrói um Intl.DateTimeFormat por chamada (custo escalaria com funcionário×requisito)', () => {
    const construct = vi.spyOn(Intl, 'DateTimeFormat');
    for (let i = 0; i < 1000; i++) getTodayIsoSaoPaulo(new Date('2026-11-03T01:30:00Z'));
    expect(construct).not.toHaveBeenCalled();
    construct.mockRestore();
  });

  it.each([
    ['2026-11-03T02:59:59Z', '2026-11-02'], // 23:59:59 BRT
    ['2026-11-03T03:00:00Z', '2026-11-03'], // 00:00:00 BRT
    ['2028-03-01T02:59:59Z', '2028-02-29'], // bissexto
    ['2027-01-01T02:59:59Z', '2026-12-31'], // virada de ano
  ])('%s → %s', (iso, expected) => {
    expect(getTodayIsoSaoPaulo(new Date(iso))).toBe(expected);
  });
});
