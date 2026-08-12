import { describe, expect, it } from 'vitest';

import {
  resolveCanonicalCourseId,
  shouldValidateCourseQualificationBinding,
} from '../../routes/lms-cursos-canonical-boundary';

describe('lms course canonical qualification boundary', () => {
  it('resolve o curso pelo pathname quando o middleware ainda não recebeu o param :id', () => {
    expect(resolveCanonicalCourseId(undefined, '/api/lms/cursos/32')).toBe(32);
    expect(resolveCanonicalCourseId(undefined, '/lms/cursos/32')).toBe(32);
    expect(resolveCanonicalCourseId(undefined, '/32')).toBe(32);
  });

  it('prioriza o param de rota quando disponível', () => {
    expect(resolveCanonicalCourseId('32', '/api/lms/cursos/99')).toBe(32);
  });

  it('não confunde ações do catálogo com id de curso', () => {
    expect(resolveCanonicalCourseId(undefined, '/api/lms/cursos/sync-ead')).toBeNull();
  });

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
