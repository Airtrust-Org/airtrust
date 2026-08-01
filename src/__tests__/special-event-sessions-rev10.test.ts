import { describe, expect, it } from 'vitest';

import {
  getSpecialEventSessionDefinition,
  normalizeSpecialEventSessionCode,
  splitExaminerTechnicalBlocks,
} from '../shared/simuladores/special-event-sessions';
import {
  EXAMINER_PRACTICAL_TRAINING_PROGRAM,
  findProgramByCodigo,
} from '../react-app/config/sharedSessionPrograms';

describe('PTO Rev10 special instructor/examiner sessions', () => {
  it('recognizes the four canonical examiner sessions and their one-hour loads', () => {
    for (const code of ['EXA-01/04', 'EXA-02/04', 'EXA-03/04', 'EXA-04/04'] as const) {
      expect(normalizeSpecialEventSessionCode(code)).toBe(code);
      const definition = getSpecialEventSessionDefinition(code);
      expect(definition?.kind).toBe('examiner');
      expect(definition?.durationMinutes).toBe(60);
      expect(
        splitExaminerTechnicalBlocks(
          code,
          Array.from({ length: 18 }, (_, index) => ({ ordem: index + 1 })),
        )?.flatMap((block) => block.items),
      ).toHaveLength(18);
    }
  });

  it('keeps the short header title distinct from the full canonical title', () => {
    const definition = getSpecialEventSessionDefinition('EXA-04/04');

    expect(definition?.headerTitle).toBe('Treinamento Prático de Examinador 4/4');
    expect(definition?.headerSubtitle).toBe('Condução Integral do Exame');
    expect(definition?.fullTitle).toBe(
      'Treinamento Prático de Examinador 4/4 — Condução Integral do Exame',
    );
  });

  it('uses the canonical instructor loads from the matrix', () => {
    expect(getSpecialEventSessionDefinition('INST-E01')?.durationMinutes).toBe(60);
    expect(getSpecialEventSessionDefinition('INST-E02')?.durationMinutes).toBe(120);
  });

  it('keeps legacy examiner codes recognizable only for historical hydration', () => {
    expect(getSpecialEventSessionDefinition('EXA-E01')?.legacy).toBe(true);
    expect(getSpecialEventSessionDefinition('EXA-E02')?.legacy).toBe(true);
  });

  it('groups sessions 1/4-2/4 and 3/4-4/4 into the two physical events', () => {
    expect(EXAMINER_PRACTICAL_TRAINING_PROGRAM.evento1Codigos).toEqual(
      expect.arrayContaining(['EXA-01/04', 'EXA-02/04']),
    );
    expect(EXAMINER_PRACTICAL_TRAINING_PROGRAM.evento2Codigos).toEqual(
      expect.arrayContaining(['EXA-03/04', 'EXA-04/04']),
    );
    expect(findProgramByCodigo('EXA-04/04')?.id).toBe('TREINAMENTO_PRATICO_EXAMINADOR');
  });
});
