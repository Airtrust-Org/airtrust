import { describe, expect, it } from 'vitest';
import { getLmsCourseCompliance } from './LmsCourseComplianceMetrics';

describe('LMS operational compliance metrics', () => {
  const course = { qualificacao_tipo_id: 17 };

  it('counts expiring and expired employees as needing a new cycle, not up-to-date completions', () => {
    expect(getLmsCourseCompliance(course, [{
      qualificacao_tipo_id: 17,
      pessoas: 12,
      conformes: 8,
      vencendo: 3,
      matriculados: 7,
      concluidos: 5,
      compliance_pct: 66.7,
    }])).toEqual({
      obrigatorios: 12,
      matriculados: 7,
      concluidos: 5,
      compliance: 66.7,
    });
  });

  it('does not invent obligation counts for an unmapped course', () => {
    expect(getLmsCourseCompliance({ qualificacao_tipo_id: null } as typeof course, [])).toBeNull();
    expect(getLmsCourseCompliance(course, [])).toBeNull();
  });
});
