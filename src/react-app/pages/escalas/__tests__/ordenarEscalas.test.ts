import { describe, expect, it } from 'vitest';
import {
  ordenarEscalasCronologicamente,
  proximasCompetenciasSemEscala,
} from '../utils/ordenarEscalas';

const c = (ano: number, mes: number) => ({ ano, mes });

describe('ordenarEscalasCronologicamente', () => {
  it('ordena vários meses do mesmo ano em ordem crescente', () => {
    const entrada = [c(2026, 3), c(2026, 1), c(2026, 12), c(2026, 7)];
    expect(ordenarEscalasCronologicamente(entrada).map((e) => e.mes)).toEqual([
      1, 3, 7, 12,
    ]);
  });

  it('mantém ordem cronológica com múltiplos anos (dez/2025 antes de jan/2026)', () => {
    const entrada = [c(2026, 1), c(2025, 12), c(2027, 2), c(2025, 1)];
    expect(
      ordenarEscalasCronologicamente(entrada).map((e) => `${e.ano}-${e.mes}`),
    ).toEqual(['2025-1', '2025-12', '2026-1', '2027-2']);
  });

  it('não usa comparação lexicográfica (mês 10 depois do mês 2, não antes)', () => {
    const entrada = [c(2026, 10), c(2026, 2), c(2026, 1)];
    expect(ordenarEscalasCronologicamente(entrada).map((e) => e.mes)).toEqual([
      1, 2, 10,
    ]);
  });

  it('não muta o array recebido', () => {
    const entrada = [c(2026, 5), c(2026, 2)];
    const copia = [...entrada];
    ordenarEscalasCronologicamente(entrada);
    expect(entrada).toEqual(copia);
  });

  it('é estável para competências idênticas', () => {
    const a = { ...c(2026, 4), id: 'a' };
    const b = { ...c(2026, 4), id: 'b' };
    expect(ordenarEscalasCronologicamente([a, b]).map((e) => e.id)).toEqual([
      'a',
      'b',
    ]);
  });

  it('lida com estado vazio', () => {
    expect(ordenarEscalasCronologicamente([])).toEqual([]);
  });
});

describe('proximasCompetenciasSemEscala', () => {
  it('retorna os 3 primeiros meses sem escala do ano filtrado', () => {
    expect(proximasCompetenciasSemEscala([c(2026, 1), c(2026, 2)], 2026)).toEqual(
      [3, 4, 5],
    );
  });

  it('ignora competências de outros anos ao calcular os meses livres', () => {
    // jan/2025 não deve "preencher" jan/2026
    expect(proximasCompetenciasSemEscala([c(2025, 1), c(2026, 1)], 2026)).toEqual(
      [2, 3, 4],
    );
  });

  it('estado vazio: primeiros 3 meses do ano', () => {
    expect(proximasCompetenciasSemEscala([], 2026)).toEqual([1, 2, 3]);
  });

  it('ano completo: nenhuma sugestão de criação', () => {
    const anoCheio = Array.from({ length: 12 }, (_, i) => c(2026, i + 1));
    expect(proximasCompetenciasSemEscala(anoCheio, 2026)).toEqual([]);
  });

  it('respeita o limite informado', () => {
    expect(proximasCompetenciasSemEscala([], 2026, 1)).toEqual([1]);
  });
});
