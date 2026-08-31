import { describe, expect, it } from 'vitest';
import {
  addMonthsIso,
  buildCycleRequirement,
  resolveCycleRequirement,
} from './../../services/qualification-cycle-planning';

describe('qualification cycle planning', () => {
  it('preserva histórico anterior à vigência e não cria obrigação retroativa', () => {
    const requirement = buildCycleRequirement({
      rule: {
        id: 'periodico-semestral',
        source_qualification_type_id: 101,
        target_qualification_type_id: 102,
        interval_months: 7,
        effective_from: '2026-08-31',
        active: true,
      },
      source_completion_date: '2026-08-30',
    });

    expect(requirement).toBeNull();
  });

  it('gera a relação futura com intervalo configurável de sete meses', () => {
    const requirement = buildCycleRequirement({
      rule: {
        id: 'periodico-semestral',
        source_qualification_type_id: 101,
        target_qualification_type_id: 102,
        interval_months: 7,
        effective_from: '2026-08-31',
        active: true,
        label: 'Periódico → Semestral',
      },
      source_completion_date: '2026-09-15',
    });

    expect(requirement).toMatchObject({
      source_qualification_type_id: 101,
      target_qualification_type_id: 102,
      source_completion_date: '2026-09-15',
      due_date: '2027-04-15',
      interval_months: 7,
      label: 'Periódico → Semestral',
    });
  });

  it('serve para outros equipamentos e intervalos sem hardcode de modelo', () => {
    const requirement = resolveCycleRequirement({
      rules: [
        {
          id: 1,
          source_qualification_type_id: 501,
          target_qualification_type_id: 502,
          interval_months: 6,
          effective_from: '2026-08-31',
        },
      ],
      source_qualification_type_id: 501,
      source_completion_date: '2026-10-01',
    });

    expect(requirement?.due_date).toBe('2027-04-01');
    expect(requirement?.target_qualification_type_id).toBe(502);
  });

  it('trata corretamente fim de mês', () => {
    expect(addMonthsIso('2027-01-31', 1)).toBe('2027-02-28');
    expect(addMonthsIso('2028-01-31', 1)).toBe('2028-02-29');
  });

  it('usa a regra vigente mais recente quando há versões', () => {
    const requirement = resolveCycleRequirement({
      rules: [
        {
          id: 1,
          source_qualification_type_id: 900,
          target_qualification_type_id: 901,
          interval_months: 6,
          effective_from: '2026-01-01',
        },
        {
          id: 2,
          source_qualification_type_id: 900,
          target_qualification_type_id: 902,
          interval_months: 7,
          effective_from: '2026-08-31',
        },
      ],
      source_qualification_type_id: 900,
      source_completion_date: '2026-09-30',
    });

    expect(requirement?.rule_id).toBe(2);
    expect(requirement?.target_qualification_type_id).toBe(902);
    expect(requirement?.due_date).toBe('2027-04-30');
  });
});
