/**
 * #1492: falha ao carregar evidencia (historico ou LMS) nunca pode virar
 * "sem evidencia"/conformidade silenciosa: o snapshot propaga o erro.
 */
import { describe, expect, it } from 'vitest';
import {
  loadLmsEvidence,
  loadQualificationEvidence,
} from '../../services/training-compliance-snapshot-builder';

function failingDb(message: string): D1Database {
  const fail = () => {
    throw new Error(message);
  };
  const statement = {
    bind: () => statement,
    first: async () => fail(),
    all: async () => fail(),
    run: async () => fail(),
  };
  return { prepare: () => statement } as unknown as D1Database;
}

describe('carga de evidencia do Compliance falha fechada', () => {
  it('propaga falha permanente ao ler o historico de qualificacoes', async () => {
    await expect(loadQualificationEvidence(failingDb('D1 indisponivel (teste)'), 6)).rejects.toThrow(
      'D1 indisponivel (teste)',
    );
  });

  it('propaga falha permanente ao ler a evidencia LMS', async () => {
    await expect(loadLmsEvidence(failingDb('D1 indisponivel (teste)'), 6)).rejects.toThrow(
      'D1 indisponivel (teste)',
    );
  });
});
