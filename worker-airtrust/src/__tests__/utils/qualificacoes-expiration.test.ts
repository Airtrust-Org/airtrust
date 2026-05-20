import { describe, expect, it } from 'vitest';
import { calcularDiasAteVencimento, determinarStatus } from '../../utils/qualificacoes-expiration';

describe('qualificacoes-expiration', () => {
  const referencia = '2026-05-04';

  it('classifica vencimento hoje como expirando', () => {
    expect(calcularDiasAteVencimento('2026-05-04', referencia)).toBe(0);
    expect(determinarStatus('2026-05-04', 30, referencia)).toBe('expirando');
  });

  it('classifica vencimento em 5 dias como expirando', () => {
    expect(calcularDiasAteVencimento('2026-05-09', referencia)).toBe(5);
    expect(determinarStatus('2026-05-09', 30, referencia)).toBe('expirando');
  });

  it('classifica vencimento em 30 dias como expirando no threshold de 30', () => {
    expect(calcularDiasAteVencimento('2026-06-03', referencia)).toBe(30);
    expect(determinarStatus('2026-06-03', 30, referencia)).toBe('expirando');
  });

  it('trata vencimento em 90 dias conforme threshold configurado', () => {
    expect(calcularDiasAteVencimento('2026-08-02', referencia)).toBe(90);
    expect(determinarStatus('2026-08-02', 30, referencia)).toBe('vigente');
    expect(determinarStatus('2026-08-02', 90, referencia)).toBe('expirando');
  });

  it('nao considera valida por 1 ano como expirando no threshold padrao', () => {
    expect(calcularDiasAteVencimento('2027-05-04', referencia)).toBe(365);
    expect(determinarStatus('2027-05-04', 30, referencia)).toBe('vigente');
  });

  it('classifica vencida ontem como vencida', () => {
    expect(calcularDiasAteVencimento('2026-05-03', referencia)).toBe(-1);
    expect(determinarStatus('2026-05-03', 30, referencia)).toBe('vencida');
  });
});
