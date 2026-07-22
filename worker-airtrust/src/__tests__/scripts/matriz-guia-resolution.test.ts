import { describe, expect, it } from 'vitest';
import { resolveGuiaLinks } from '../../../scripts/lib/matriz-guia-resolution.mjs';

function session(
  codigo: string,
  relpath: string,
  ciclo: string | null = null,
  programa = 'PERIODICO',
  aeronave: 'AW139' | 'SK76' = 'AW139',
) {
  return { codigo_canonico: codigo, html_relpath: relpath, ciclo, programa, aeronave };
}
function guia(
  id: number,
  codigo: string,
  programa: string,
  ciclo: number | null,
  sessao_numero: number | null,
  sessao_total: number | null,
  aeronave: 'AW139' | 'SK76' = 'AW139',
) {
  return { id, codigo, programa, ciclo, sessao_numero, sessao_total, aeronave };
}

describe('matriz-guia-resolution', () => {
  it('resolves by exact codigo_canonico match when the guia carries the current code', () => {
    const sessions = [session('A139-I-01/12', 'AW139/html/G_Inicial_Sessao_1_de_12.html', null, 'INICIAL')];
    const guias = [guia(1, 'A139-I-01/12', 'INICIAL', null, 1, 12)];
    const result = resolveGuiaLinks({ sessions, guias });
    expect(result).toEqual([{ codigo_canonico: 'A139-I-01/12', guia_id: 1, match_type: 'EXACT_CODE' }]);
  });

  it('falls back to the structured signature when the guia code uses stale naming', () => {
    const sessions = [
      session('A139-P-02/04-C1-OFFSHORE', 'AW139/html/G_Periodico_Ciclo_1_Sessao_2_de_4.html', 'C1'),
    ];
    // Stale guia code lacks the -OFFSHORE suffix entirely.
    const guias = [guia(16, 'A139-P-02/04-C1', 'PERIODICO', 1, 2, 4)];
    const result = resolveGuiaLinks({ sessions, guias });
    expect(result).toEqual([{ codigo_canonico: 'A139-P-02/04-C1-OFFSHORE', guia_id: 16, match_type: 'STRUCTURED' }]);
  });

  it('resolves the real 9-code AW139 periodic fallback set 1:1 across 3 cycles without collision', () => {
    const codes = [
      ['A139-P-02/04-C1-OFFSHORE', 'C1', 2],
      ['A139-P-03/04-C1-IFR-LOFT', 'C1', 3],
      ['A139-P-04/04-C1-CHECK', 'C1', 4],
      ['A139-P-02/04-C2-OFFSHORE', 'C2', 2],
      ['A139-P-03/04-C2-IFR-LOFT', 'C2', 3],
      ['A139-P-04/04-C2-CHECK', 'C2', 4],
      ['A139-P-02/04-C3-OFFSHORE', 'C3', 2],
      ['A139-P-03/04-C3-IFR-LOFT', 'C3', 3],
      ['A139-P-04/04-C3-CHECK', 'C3', 4],
    ] as const;
    const sessions = codes.map(([codigo, ciclo, n]) =>
      session(codigo, `AW139/html/G_Periodico_Ciclo_${ciclo.slice(1)}_Sessao_${n}_de_4.html`, ciclo),
    );
    // Stale guia codes collapse the per-family suffix, only ciclo/sessao_numero disambiguate.
    const staleCode = (n: number) => (n === 2 ? 'A139-P-02/04' : n === 3 ? 'A139-P-03/04-OFFSHOR' : 'A139-P-04/04-CHECK');
    const guias = codes.map(([, ciclo, n], i) => guia(100 + i, staleCode(n), 'PERIODICO', Number(ciclo.slice(1)), n, 4));
    const result = resolveGuiaLinks({ sessions, guias });
    expect(result).toHaveLength(9);
    expect(new Set(result.map((r) => r.guia_id)).size).toBe(9);
    expect(result.every((r) => r.match_type === 'STRUCTURED')).toBe(true);
  });

  it('rejects an ambiguous structured signature (two guias, same signature)', () => {
    const sessions = [session('A139-P-02/04-C1-OFFSHORE', 'AW139/html/G_Periodico_Ciclo_1_Sessao_2_de_4.html', 'C1')];
    const guias = [
      guia(16, 'A139-P-02/04-C1', 'PERIODICO', 1, 2, 4),
      guia(17, 'A139-P-02/04-C1-DUP', 'PERIODICO', 1, 2, 4),
    ];
    expect(() => resolveGuiaLinks({ sessions, guias })).toThrow(/ambígua/);
  });

  it('rejects when no guia matches at all', () => {
    const sessions = [session('A139-P-02/04-C1-OFFSHORE', 'AW139/html/G_Periodico_Ciclo_1_Sessao_2_de_4.html', 'C1')];
    const guias = [guia(16, 'OTHER', 'PERIODICO', 2, 3, 4)];
    expect(() => resolveGuiaLinks({ sessions, guias })).toThrow(/nenhum guia/);
  });

  it('rejects an orphan active guia with no matching session', () => {
    const sessions = [session('A139-I-01/12', 'AW139/html/G_Inicial_Sessao_1_de_12.html', null, 'INICIAL')];
    const guias = [
      guia(1, 'A139-I-01/12', 'INICIAL', null, 1, 12),
      guia(2, 'ORPHAN', 'INICIAL', null, 2, 12),
    ];
    expect(() => resolveGuiaLinks({ sessions, guias })).toThrow(/sem sessão correspondente/);
  });

  it('does not confuse an AW139 and an SK76 guia sharing the same programa/ciclo/sessao signature', () => {
    // Real production data: A139-P-02/04-C1 and S76-P-02/04-C1 are both
    // PERIODICO/ciclo=1/sessao=2-of-4 guias, one per aircraft — aeronave must
    // be part of the signature or this collides as "ambiguous".
    const sessions = [
      session('A139-P-02/04-C1-OFFSHORE', 'AW139/html/G_Periodico_Ciclo_1_Sessao_2_de_4.html', 'C1', 'PERIODICO', 'AW139'),
      session('S76-P-02/04-C1', 'SK76/html/G_Periodico_Ciclo_1_Sessao_2_de_4.html', 'C1', 'PERIODICO', 'SK76'),
    ];
    const guias = [
      guia(16, 'A139-P-02/04-C1', 'PERIODICO', 1, 2, 4, 'AW139'),
      guia(46, 'S76-P-02/04-C1', 'PERIODICO', 1, 2, 4, 'SK76'),
    ];
    const result = resolveGuiaLinks({ sessions, guias });
    expect(result).toEqual(
      expect.arrayContaining([
        { codigo_canonico: 'A139-P-02/04-C1-OFFSHORE', guia_id: 16, match_type: 'STRUCTURED' },
        { codigo_canonico: 'S76-P-02/04-C1', guia_id: 46, match_type: 'EXACT_CODE' },
      ]),
    );
  });

  it('normalizes accented programa text and matches a CHECK session to its PERIODICO-programa guia', () => {
    // Real data: A139-P-04/04-C1-CHECK's own tipo_qualificacao_estruturado is
    // "CHECK", but its curricular programa is "Periódico" (accented) — same
    // program as the guia table's "PERIODICO" — and that's what must match.
    const sessions = [session('A139-P-04/04-C1-CHECK', 'AW139/html/G_Periodico_Ciclo_1_Sessao_4_de_4.html', 'C1', 'Periódico')];
    const guias = [guia(18, 'A139-P-04/04-CHECK', 'PERIODICO', 1, 4, 4)];
    const result = resolveGuiaLinks({ sessions, guias });
    expect(result).toEqual([{ codigo_canonico: 'A139-P-04/04-C1-CHECK', guia_id: 18, match_type: 'STRUCTURED' }]);
  });

  it('rejects two canonical codes claiming the same guia', () => {
    const sessions = [
      session('A139-P-02/04-C1-OFFSHORE', 'AW139/html/G_Periodico_Ciclo_1_Sessao_2_de_4.html', 'C1'),
      session('A139-P-02/04-C1-OFFSHORE-DUP', 'AW139/html/G_Periodico_Ciclo_1_Sessao_2_de_4.html', 'C1'),
    ];
    const guias = [guia(16, 'A139-P-02/04-C1', 'PERIODICO', 1, 2, 4)];
    expect(() => resolveGuiaLinks({ sessions, guias })).toThrow(/mais de um código canônico/);
  });
});
