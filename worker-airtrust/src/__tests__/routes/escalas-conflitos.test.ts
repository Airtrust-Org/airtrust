import { describe, expect, it } from 'vitest';

import { shouldIgnoreSubstitutableEventConflict } from '../../routes/escalas-conflitos';

describe('shouldIgnoreSubstitutableEventConflict', () => {
  it('ignora conflito quando um placeholder automatico deve ser substituido', () => {
    expect(
      shouldIgnoreSubstitutableEventConflict({
        evento1_id: 'evt-1',
        tipo1: 'voo',
        inicio1: '2026-05-08',
        fim1: '2026-05-08',
        auto1: 1,
        evento2_id: 'evt-2',
        tipo2: 'medico',
        inicio2: '2026-05-08',
        fim2: '2026-05-08',
        auto2: 0,
        funcionario_id: 'func-1',
        funcionario_nome: 'Ramon',
      }),
    ).toBe(true);
  });

  it('mantem conflito quando nenhum dos eventos e placeholder automatico substituivel', () => {
    expect(
      shouldIgnoreSubstitutableEventConflict({
        evento1_id: 'evt-1',
        tipo1: 'medico',
        inicio1: '2026-05-08',
        fim1: '2026-05-08',
        auto1: 0,
        evento2_id: 'evt-2',
        tipo2: 'cheque',
        inicio2: '2026-05-08',
        fim2: '2026-05-08',
        auto2: 0,
        funcionario_id: 'func-1',
        funcionario_nome: 'Ramon',
      }),
    ).toBe(false);
  });
});
