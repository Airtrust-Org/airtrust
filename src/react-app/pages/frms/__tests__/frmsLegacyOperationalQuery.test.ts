import { describe, expect, it } from 'vitest';
import { canonicalizeLegacyFrmsOperationalQuery } from '../frmsLegacyOperationalQuery';

describe('FRMS legacy operational link', () => {
  it('preserva a data EVD e o tripulante sem cair no dia atual', () => {
    const result = new URLSearchParams(canonicalizeLegacyFrmsOperationalQuery(
      '?data_inicio=2026-10-13&data_fim=2026-10-13&funcionario_id=42',
    ));
    expect(result.get('data')).toBe('2026-10-13');
    expect(result.get('funcionario_id')).toBe('42');
    expect(result.get('data_inicio')).toBeNull();
    expect(result.get('origem')).toBe('controle-operacional-legado');
  });

  it('preserva data canônica explícita e não a substitui por data_inicio', () => {
    const result = new URLSearchParams(canonicalizeLegacyFrmsOperationalQuery(
      '?data=2026-10-15&data_inicio=2026-10-13&funcionario_id=9',
    ));
    expect(result.get('data')).toBe('2026-10-15');
    expect(result.get('funcionario_id')).toBe('9');
  });

  it('em link antigo por intervalo ancora no primeiro dia, não hoje', () => {
    const result = new URLSearchParams(canonicalizeLegacyFrmsOperationalQuery(
      '?data_inicio=2026-10-01&data_fim=2026-10-17',
    ));
    expect(result.get('data')).toBe('2026-10-01');
    expect(result.has('data_fim')).toBe(false);
  });

  it('não aceita entrada de data_inicio com formato inválido', () => {
    const result = new URLSearchParams(canonicalizeLegacyFrmsOperationalQuery(
      '?data_inicio=outro&funcionario_id=3',
    ));
    expect(result.has('data')).toBe(false);
    expect(result.get('funcionario_id')).toBe('3');
  });
});
