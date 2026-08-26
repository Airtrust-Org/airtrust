import { describe, expect, it } from 'vitest';
import { buildQualificationHistoryDomainColumn } from '../../routes/qualificacoes/historico-domain';

describe('qualification history read-domain resolution', () => {
  it('prefers the owning employee sector domain before catalog classification', () => {
    const expression = buildQualificationHistoryDomainColumn(true);

    expect(expression).toContain('s_hist_scope.dominio_codigo');
    expect(expression).toContain('s_hist_scope.id = f.setor_id');
    expect(expression).toContain('s_hist_scope.empresa_id = f.empresa_id');
    expect(expression).toContain(
      'COALESCE(qh_categoria_ref.dominio_codigo, qt.dominio_codigo, qt_categoria_ref.dominio_codigo)',
    );
  });

  it('keeps the safe pre-0454 catalog fallback after employee-sector resolution', () => {
    const expression = buildQualificationHistoryDomainColumn(false);

    expect(expression).toContain('s_hist_scope.dominio_codigo');
    expect(expression).toContain(
      'COALESCE(qh_categoria_ref.dominio_codigo, qt_categoria_ref.dominio_codigo)',
    );
    expect(expression).not.toContain('qt.dominio_codigo');
  });
});
