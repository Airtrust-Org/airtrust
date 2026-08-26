import { describe, expect, it } from 'vitest';

import { parseCompletionDiagnosticsSnapshot } from '../../services/lms-completion-diagnostics-snapshot';

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

describe('LMS completion diagnostics snapshot — moduleResults', () => {
  it('persiste somente resultados por módulo sanitizados', () => {
    const parsed = parseCompletionDiagnosticsSnapshot({
      ...BASE,
      moduleResults: [
        {
          module: {
            id: 'mel-mod-04',
            index: 4,
            title: ' Procedimentos\u0000 para uso da MEL ',
          },
          assessment: {
            required: true,
            completed: true,
            scoreRaw: 68,
            masteryScore: 70,
            passed: false,
          },
          correctAnswers: ['nunca persistir'],
          empresaId: 999,
        },
      ],
    });

    expect(parsed?.moduleResults).toEqual([
      {
        module: {
          id: 'mel-mod-04',
          index: 4,
          title: 'Procedimentos para uso da MEL',
        },
        assessment: {
          required: true,
          completed: true,
          scoreRaw: 68,
          masteryScore: 70,
          passed: false,
        },
      },
    ]);
    expect(parsed?.moduleResults[0]).not.toHaveProperty('correctAnswers');
    expect(parsed?.moduleResults[0]).not.toHaveProperty('empresaId');
  });

  it('normaliza pacote Diagnostics V1 antigo para moduleResults vazio', () => {
    const parsed = parseCompletionDiagnosticsSnapshot(BASE);
    expect(parsed?.moduleResults).toEqual([]);
  });

  it('descarta entradas sem identificação de módulo', () => {
    const parsed = parseCompletionDiagnosticsSnapshot({
      ...BASE,
      moduleResults: [
        null,
        'bad',
        { module: {}, assessment: { required: true, passed: false } },
        {
          module: { id: 'valid', index: 2, title: 'Módulo válido' },
          assessment: { required: true, completed: false, passed: null },
        },
      ],
    });

    expect(parsed?.moduleResults).toHaveLength(1);
    expect(parsed?.moduleResults[0]?.module.id).toBe('valid');
  });
});
