import { describe, expect, it } from 'vitest';
import { selectCandidate } from '../smoke-operational-domain-certificate.mjs';

describe('staging operational-domain certificate smoke', () => {
  it('selects an accessible completed history for a genuinely unclassified type', () => {
    const historiesByType = new Map([
      [
        42,
        [
          {
            id: 901,
            funcionario_id: 12,
            funcionario_setor_id: 7,
            data_realizacao: '2026-07-01',
            categoria_id_historico: 13,
            tem_certificado: 0,
          },
        ],
      ],
    ]);

    expect(
      selectCandidate({
        unclassifiedTypes: [{ id: 42 }],
        typeRows: [{ id: 42, categoria_id: 13 }],
        historiesByType,
        managedSetorIds: [7],
      }),
    ).toEqual({
      typeId: 42,
      typeCategoryId: 13,
      historyId: 901,
      employeeId: 12,
      employeeSetorId: 7,
      hasCertificate: false,
    });
  });

  it('rejects out-of-scope, incomplete, and category-mismatched histories', () => {
    const historiesByType = new Map([
      [
        42,
        [
          {
            id: 901,
            funcionario_id: 12,
            funcionario_setor_id: 99,
            data_realizacao: '2026-07-01',
            categoria_id_historico: 13,
          },
          {
            id: 902,
            funcionario_id: 13,
            funcionario_setor_id: 7,
            data_realizacao: null,
            categoria_id_historico: 13,
          },
          {
            id: 903,
            funcionario_id: 14,
            funcionario_setor_id: 7,
            data_realizacao: '2026-07-01',
            categoria_id_historico: 77,
          },
        ],
      ],
    ]);

    expect(
      selectCandidate({
        unclassifiedTypes: [{ id: 42 }],
        typeRows: [{ id: 42, categoria_id: 13 }],
        historiesByType,
        managedSetorIds: [7],
      }),
    ).toBeNull();
  });

  it('prefers a history without an existing certificate', () => {
    const historiesByType = new Map([
      [
        42,
        [
          {
            id: 800,
            funcionario_id: 10,
            funcionario_setor_id: 7,
            data_realizacao: '2026-07-01',
            categoria_id_historico: 13,
            tem_certificado: 1,
          },
          {
            id: 900,
            funcionario_id: 11,
            funcionario_setor_id: 7,
            data_realizacao: '2026-07-01',
            categoria_id_historico: 13,
            tem_certificado: 0,
          },
        ],
      ],
    ]);

    const selected = selectCandidate({
      unclassifiedTypes: [{ id: 42 }],
      typeRows: [{ id: 42, categoria_id: 13 }],
      historiesByType,
      managedSetorIds: [7],
    });
    expect(selected?.historyId).toBe(900);
    expect(selected?.hasCertificate).toBe(false);
  });
});
