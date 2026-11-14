import { describe, expect, it } from 'vitest';
import { evaluateNotechsApproval } from '../../constants/notechs-approval';
import { NOTECHS_CANONICAL_ITEMS, CANONICAL_NOTECHS_TO_LEGACY } from '../../../../src/shared/simuladores/notechs-canonical';

function fullRows(nota: string | null = '6.0') {
  return NOTECHS_CANONICAL_ITEMS.map((item) => ({
    codigo: item.codigo,
    categoria: 'NOTECHS',
    resultado: nota,
  }));
}

describe('NOTECHS — aprovação individual vinculada à ficha', () => {
  it('aprova apenas os 15 elementos com nota >= 6', () => {
    const result = evaluateNotechsApproval(fullRows());
    expect(result).toMatchObject({ eligible: true, required: 15, complete: 15, passed: 15 });
  });

  it('rejeita nota 5 mesmo com as outras 14 notas 10', () => {
    const rows = fullRows('10.0');
    rows[0].resultado = '5.0';
    const result = evaluateNotechsApproval(rows);
    expect(result.eligible).toBe(false);
    expect(result.belowMinimum).toEqual([{ codigo: rows[0].codigo, nota: 5 }]);
  });

  it.each([null, 'NR', 'NAO_REALIZADA', 'N/A', ''])(
    'não permite aprovação com NOTECHS sem avaliação: %s',
    (value) => {
      const rows = fullRows('8.0');
      rows[14].resultado = value;
      const result = evaluateNotechsApproval(rows);
      expect(result.eligible).toBe(false);
      expect(result.unscored).toEqual([rows[14].codigo]);
    },
  );

  it('não considera 14 notas válidas suficientes', () => {
    const rows = fullRows();
    rows.pop();
    const result = evaluateNotechsApproval(rows);
    expect(result.missing).toHaveLength(1);
    expect(result.eligible).toBe(false);
  });

  it('não permite duplicar NOTECHS por alias legado', () => {
    const rows = fullRows();
    const canonical = rows[0].codigo;
    rows.push({ codigo: CANONICAL_NOTECHS_TO_LEGACY[canonical], categoria: 'NOTECHS', resultado: '10' });
    expect(evaluateNotechsApproval(rows).duplicate).toEqual([canonical]);
    expect(evaluateNotechsApproval(rows).eligible).toBe(false);
  });

  it('rejeita códigos inesperados, valores decimais/fracionários ou lixo', () => {
    const rows = fullRows();
    rows[3].resultado = '6.5';
    rows.push({ codigo: 'NTS-NOVO-99', categoria: 'NOTECHS', resultado: '9' });
    const result = evaluateNotechsApproval(rows);
    expect(result.invalid).toHaveLength(1);
    expect(result.unexpected).toEqual(['NTS-NOVO-99']);
    expect(result.eligible).toBe(false);
  });

  it('ignora os resultados técnicos ao calcular a suficiência dos NOTECHS', () => {
    const rows = fullRows();
    rows.push({ codigo: 'MAN-A139', categoria: 'GERAL', resultado: '1' });
    expect(evaluateNotechsApproval(rows).eligible).toBe(true);
  });

  it('não permite aprovar uma ficha sem qualquer NOTECHS', () => {
    const result = evaluateNotechsApproval([{ codigo: 'MAN-A139', categoria: 'GERAL', resultado: '10' }]);
    expect(result.eligible).toBe(false);
    expect(result.missing).toHaveLength(15);
  });
});
