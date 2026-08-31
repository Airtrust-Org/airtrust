import { describe, expect, it } from 'vitest';
import { resolveTrainingEntryPath } from '../training-entry';

describe('resolveTrainingEntryPath', () => {
  const can = (permission: string) =>
    permission === 'qualificacoes.view' || permission === 'simuladores.view';

  it('preserva o deep link em Qualificações quando este é o primeiro destino autorizado', () => {
    expect(
      resolveTrainingEntryPath({
        modulosAtivos: ['qualificacoes', 'lms', 'simuladores'],
        can,
        isAluno: false,
        isInstrutor: false,
      }),
    ).toBe('/qualificacoes');
  });

  it('não usa Qualificações quando a permissão efetiva a bloqueia', () => {
    expect(
      resolveTrainingEntryPath({
        modulosAtivos: ['qualificacoes', 'lms', 'simuladores'],
        can: () => false,
        isAluno: false,
        isInstrutor: false,
      }),
    ).toBe('/lms');
  });

  it('mantém o acesso de aluno/instrutor no catálogo LMS, sem expor os demais módulos', () => {
    expect(
      resolveTrainingEntryPath({
        modulosAtivos: ['qualificacoes', 'lms', 'simuladores'],
        can,
        isAluno: true,
        isInstrutor: false,
      }),
    ).toBe('/lms/cursos');
  });

  it('volta à home quando nenhum destino de treinamento está liberado', () => {
    expect(
      resolveTrainingEntryPath({
        modulosAtivos: ['funcionarios'],
        can,
        isAluno: false,
        isInstrutor: false,
      }),
    ).toBe('/');
  });
});
