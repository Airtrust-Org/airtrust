import { describe, expect, it } from 'vitest';
import {
  classificarCompetencia,
  competenciaAtualDoSistema,
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

describe('classificarCompetencia (ano + mês)', () => {
  const ref = c(2026, 9); // setembro/2026

  it('janeiro/2027 visto em setembro/2026 → futura', () => {
    expect(classificarCompetencia(c(2027, 1), ref)).toBe('futura');
  });

  it('janeiro/2025 visto em setembro/2026 → passada', () => {
    expect(classificarCompetencia(c(2025, 1), ref)).toBe('passada');
  });

  it('setembro/2026 visto em setembro/2026 → atual', () => {
    expect(classificarCompetencia(c(2026, 9), ref)).toBe('atual');
  });

  it('outubro/2026 visto em setembro/2026 → futura', () => {
    expect(classificarCompetencia(c(2026, 10), ref)).toBe('futura');
  });

  it('agosto/2026 visto em setembro/2026 → passada', () => {
    expect(classificarCompetencia(c(2026, 8), ref)).toBe('passada');
  });

  it('setembro/2025 não pode ser atual (é passada)', () => {
    expect(classificarCompetencia(c(2025, 9), ref)).toBe('passada');
  });

  it('setembro/2027 não pode ser atual (é futura)', () => {
    expect(classificarCompetencia(c(2027, 9), ref)).toBe('futura');
  });

  it('ano filtrado anterior ao atual: todos os meses são passados', () => {
    for (let mes = 1; mes <= 12; mes++) {
      expect(classificarCompetencia(c(2025, mes), ref)).toBe('passada');
    }
  });

  it('ano filtrado posterior ao atual: nenhum mês é passado ou atual', () => {
    for (let mes = 1; mes <= 12; mes++) {
      expect(classificarCompetencia(c(2027, mes), ref)).toBe('futura');
    }
  });
});

describe('competenciaAtualDoSistema', () => {
  it('extrai ano e mês (1-based) da data informada', () => {
    expect(competenciaAtualDoSistema(new Date(2026, 8, 15))).toEqual({
      ano: 2026,
      mes: 9,
    });
  });
});
