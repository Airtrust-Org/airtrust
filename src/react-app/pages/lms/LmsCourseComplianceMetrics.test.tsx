import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { getLmsCourseCompliance, LmsCourseMandatoryPill } from './LmsCourseComplianceMetrics';

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

  it('shows the canonical number of obligated people as a catalog pill, independent of enrollments', () => {
    const html = renderToStaticMarkup(
      <LmsCourseMandatoryPill curso={course} rows={[{
        qualificacao_tipo_id: 17,
        pessoas: 24,
        conformes: 8,
        vencendo: 2,
        matriculados: 7,
        concluidos: 5,
        compliance_pct: 33.3,
      }]} />,
    );
    expect(html).toContain('Obrigatórios: 24');
    expect(html).not.toContain('Matriculados: 7');
  });

  it('distinguishes zero required people from an unknown/unlinked course', () => {
    const rows = [{
      qualificacao_tipo_id: 17,
      pessoas: 0,
      conformes: 0,
      vencendo: 0,
      matriculados: 0,
      concluidos: 0,
      compliance_pct: 0,
    }];
    expect(renderToStaticMarkup(<LmsCourseMandatoryPill curso={course} rows={rows} />))
      .toContain('Obrigatórios: 0');
    expect(renderToStaticMarkup(<LmsCourseMandatoryPill curso={course} rows={undefined} />))
      .toBe('');
    expect(renderToStaticMarkup(
      <LmsCourseMandatoryPill curso={{ qualificacao_tipo_id: null }} rows={rows} />,
    )).toBe('');
  });

  it('does not invent obligation counts for an unmapped course', () => {
    expect(getLmsCourseCompliance({ qualificacao_tipo_id: null } as typeof course, [])).toBeNull();
    expect(getLmsCourseCompliance(course, [])).toBeNull();
  });
});
