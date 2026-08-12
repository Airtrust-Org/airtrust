import { describe, expect, it } from 'vitest';

import { shouldValidateCourseQualificationBinding } from '../../routes/lms-cursos-canonical-boundary';

describe('lms course canonical qualification boundary', () => {
  it('preserva vínculo histórico inalterado em edição de metadados/conteúdo', () => {
    expect(
      shouldValidateCourseQualificationBinding({
        courseId: 32,
        existingBinding: { tipoId: 130, gerarQualificacao: true },
        requestedTipoId: 130,
        requestedGerarQualificacao: true,
      }),
    ).toBe(false);
  });

  it('continua validando troca de tipo de qualificação', () => {
    expect(
      shouldValidateCourseQualificationBinding({
        courseId: 32,
        existingBinding: { tipoId: 130, gerarQualificacao: true },
        requestedTipoId: 131,
        requestedGerarQualificacao: true,
      }),
    ).toBe(true);
  });

  it('continua validando ativação da geração automática', () => {
    expect(
      shouldValidateCourseQualificationBinding({
        courseId: 32,
        existingBinding: { tipoId: 130, gerarQualificacao: false },
        requestedTipoId: 130,
        requestedGerarQualificacao: true,
      }),
    ).toBe(true);
  });

  it('valida vínculo informado na criação de curso', () => {
    expect(
      shouldValidateCourseQualificationBinding({
        courseId: null,
        existingBinding: null,
        requestedTipoId: 130,
        requestedGerarQualificacao: true,
      }),
    ).toBe(true);
  });
});
