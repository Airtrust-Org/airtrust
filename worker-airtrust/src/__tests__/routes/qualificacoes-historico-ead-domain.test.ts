import { describe, expect, it } from 'vitest';
import { buildQualificationHistoryDomainColumn } from '../../routes/qualificacoes/historico-domain';

describe('qualification history domain resolution for mixed EAD categories', () => {
  it('uses the explicit qualification-type override before the type category', () => {
    expect(buildQualificationHistoryDomainColumn(true)).toBe(
      'COALESCE(qh_categoria_ref.dominio_codigo, qt.dominio_codigo, qt_categoria_ref.dominio_codigo)',
    );
  });

  it('keeps the safe category-only fallback when migration 0454 is absent', () => {
    expect(buildQualificationHistoryDomainColumn(false)).toBe(
      'COALESCE(qh_categoria_ref.dominio_codigo, qt_categoria_ref.dominio_codigo)',
    );
  });
});
