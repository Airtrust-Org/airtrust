import { describe, expect, it } from 'vitest';

import {
  parseGranularDiagnostic,
  resolveCompletionExplanation,
} from '@/react-app/utils/lmsDiagnosticContract';

const BASE = {
  version: 1,
  courseId: 'mel',
  currentSlide: { id: 's1', index: 1, title: 'Abertura' },
  slides: { totalRequired: 80, completedRequired: 80, missing: [] },
  assessment: {
    required: true,
    completed: true,
    scoreRaw: 68,
    masteryScore: 70,
    passed: false,
    unanswered: [],
    incomplete: [],
  },
  packageStatus: { lessonStatus: 'failed', finishRequested: true },
  updatedAt: '2026-08-26T12:00:00Z',
};

const CANONICAL_REJECTED = {
  status: 'rejected',
  code: 'SCORM_COMPLETION_REJECTED',
  can_finalize: false,
  explicit_failure: true,
  mastery_score: 70,
  score_pct: 68,
};

describe('AIRTRUST_COMPLETION_DIAGNOSTICS_V1 — resultados por módulo', () => {
  it('identifica o módulo reprovado e mostra nota obtida e mínima', () => {
    const granular = parseGranularDiagnostic({
      ...BASE,
      moduleResults: [
        {
          module: { id: 'mel-mod-04', index: 4, title: 'Procedimentos para uso da MEL' },
          assessment: {
            required: true,
            completed: true,
            scoreRaw: 68,
            masteryScore: 70,
            passed: false,
          },
        },
      ],
    });

    expect(granular).not.toBeNull();
    const explanation = resolveCompletionExplanation({
      canonical: CANONICAL_REJECTED,
      granular,
    });

    expect(explanation.category).toBe('SCORE');
    expect(explanation.items).toHaveLength(1);
    expect(explanation.items[0]?.label).toBe(
      'Módulo 4 — Procedimentos para uso da MEL — Nota obtida 68 — mínimo exigido 70.',
    );
    expect(explanation.items[0]?.ref?.id).toBe('mel-mod-04');
  });

  it('lista separadamente dois módulos reprovados', () => {
    const granular = parseGranularDiagnostic({
      ...BASE,
      moduleResults: [
        {
          module: { id: 'mel-mod-04', index: 4, title: 'Procedimentos para uso da MEL' },
          assessment: {
            required: true,
            completed: true,
            scoreRaw: 68,
            masteryScore: 70,
            passed: false,
          },
        },
        {
          module: { id: 'mel-mod-07', index: 7, title: 'Controle e fechamento' },
          assessment: {
            required: true,
            completed: true,
            scoreRaw: 60,
            masteryScore: 70,
            passed: false,
          },
        },
      ],
    });

    const explanation = resolveCompletionExplanation({
      canonical: CANONICAL_REJECTED,
      granular,
    });

    expect(explanation.summary).toBe('Há 2 módulos com avaliação abaixo do mínimo exigido.');
    expect(explanation.items).toHaveLength(2);
    expect(explanation.items[0]?.label).toContain('Módulo 4');
    expect(explanation.items[1]?.label).toContain('Módulo 7');
  });

  it('mantém compatibilidade com Diagnostics V1 antigo sem moduleResults', () => {
    const granular = parseGranularDiagnostic(BASE);
    expect(granular?.moduleResults).toEqual([]);

    const explanation = resolveCompletionExplanation({
      canonical: CANONICAL_REJECTED,
      granular,
    });
    expect(explanation.items).toHaveLength(1);
    expect(explanation.items[0]?.label).toBe('Nota obtida 68 — mínimo exigido 70.');
  });

  it('descarta moduleResults malformados sem quebrar o diagnóstico válido', () => {
    const granular = parseGranularDiagnostic({
      ...BASE,
      moduleResults: [
        null,
        'bad',
        { module: null, assessment: { scoreRaw: 68, masteryScore: 70, passed: false } },
        {
          module: { id: 'ok', index: 2, title: '  Módulo\u0007 válido  ' },
          assessment: {
            required: true,
            completed: true,
            scoreRaw: 68,
            masteryScore: 70,
            passed: false,
          },
        },
      ],
    });

    expect(granular?.moduleResults).toHaveLength(1);
    expect(granular?.moduleResults[0]?.module.title).toBe('Módulo válido');
  });
});
