import { describe, expect, it } from 'vitest';
import { deriveConflictVerification } from '../conflict-verification';

const oneConflict = {
  conflitos_eventos: [{ evento1_id: 'e1', evento2_id: 'e2' }],
  conflitos_tripulacoes: [],
  restricoes_violadas: [],
  violacoes_compliance: [],
};

describe('F14-08 — nenhum resultado desconhecido equivale a zero conflitos', () => {
  it('503 COMPLIANCE_CHECK_UNAVAILABLE com conflito antigo em cache permanece indisponível', () => {
    const status = deriveConflictVerification({
      hasEscala: true,
      data: oneConflict,
      error: '503 COMPLIANCE_CHECK_UNAVAILABLE',
      loading: false,
      isFetching: false,
      isSuccess: false,
    });
    expect(status).toEqual({ verificado: false, total: 1 });
  });

  it('durante refetch não autoriza publicação usando resultado positivo antigo', () => {
    const status = deriveConflictVerification({
      hasEscala: true,
      data: { ...oneConflict, conflitos_eventos: [] },
      error: null,
      loading: false,
      isFetching: true,
      isSuccess: true,
    });
    expect(status).toEqual({ verificado: false, total: 0 });
  });

  it('somente sucesso completo confirma que não há conflitos', () => {
    const status = deriveConflictVerification({
      hasEscala: true,
      data: { ...oneConflict, conflitos_eventos: [] },
      error: null,
      loading: false,
      isFetching: false,
      isSuccess: true,
    });
    expect(status).toEqual({ verificado: true, total: 0 });
  });
});
