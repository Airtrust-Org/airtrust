import { describe, expect, it } from 'vitest';
import { describeScormClosureMissing } from '../react-app/pages/lms/lmsScormClosureReasons';

describe('Player 2.0: requisitos de fechamento que o aluno pode compreender', () => {
  it('explica simultaneamente prova sem nota, telas pendentes e status terminal', () => {
    const reasons = describeScormClosureMissing([
      'distinct_slide_coverage', 'terminal_scorm_status', 'assessment_score',
    ]);
    expect(reasons).toHaveLength(3);
    expect(reasons.join(' ')).toMatch(/telas obrigatórias/);
    expect(reasons.join(' ')).toMatch(/nota da avaliação/);
    expect(reasons.join(' ')).toMatch(/conclusão ou aprovação/);
  });

  it('não mostra aprovação inexistente nem repete motivos; argumentos inesperados são seguros', () => {
    expect(describeScormClosureMissing(null)).toEqual([]);
    const reasons = describeScormClosureMissing(['assessment_pass', 'assessment_pass', 'UNKNOWN']);
    expect(reasons).toHaveLength(2);
    expect(reasons[0]).toMatch(/não atingiu o mínimo/);
    expect(reasons.join(' ')).not.toContain('Curso concluído');
  });
});
