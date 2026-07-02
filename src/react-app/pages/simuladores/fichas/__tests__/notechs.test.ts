import { describe, expect, it } from 'vitest';
import { FICHA_AVALIACAO_FAIXAS } from '../avaliacaoScale';
import {
  NOTECHS_CATEGORIA,
  NOTECHS_DESCRITORES,
  NOTECHS_GRUPOS,
  NOTECHS_ITENS,
  NOTECHS_ORDEM_BASE,
  NOTECHS_PROVENIENCIA_AVISO,
  getNotechsDescritores,
  getNotechsGrupo,
  getNotechsItensPorGrupo,
  isNotechsCategoria,
  splitManobrasNotechs,
} from '../notechs';

describe('NOTECHS — grupos e itens (Parte 2 do modelo funcional)', () => {
  it('tem exatamente 4 grupos (Cooperação, Liderança, Consciência Situacional, Tomada de Decisão)', () => {
    expect(NOTECHS_GRUPOS).toHaveLength(4);
    expect(NOTECHS_GRUPOS.map((g) => g.codigo)).toEqual([
      'COOPERACAO',
      'LIDERANCA',
      'CONSCIENCIA_SITUACIONAL',
      'TOMADA_DECISAO',
    ]);
  });

  it('tem exatamente 15 itens no total, distribuídos 4+4+3+4 pelos grupos', () => {
    expect(NOTECHS_ITENS).toHaveLength(15);
    expect(getNotechsItensPorGrupo('COOPERACAO')).toHaveLength(4);
    expect(getNotechsItensPorGrupo('LIDERANCA')).toHaveLength(4);
    expect(getNotechsItensPorGrupo('CONSCIENCIA_SITUACIONAL')).toHaveLength(3);
    expect(getNotechsItensPorGrupo('TOMADA_DECISAO')).toHaveLength(4);
  });

  it('preserva a ordem fixa dos 15 itens (1001-1015)', () => {
    const ordens = NOTECHS_ITENS.map((item) => item.ordem);
    expect(ordens).toEqual(Array.from({ length: 15 }, (_, i) => NOTECHS_ORDEM_BASE + i));
  });

  it('cada item tem código único, título PT e título EN não vazios', () => {
    const codigos = NOTECHS_ITENS.map((item) => item.codigo);
    expect(new Set(codigos).size).toBe(15);
    for (const item of NOTECHS_ITENS) {
      expect(item.tituloPt.trim().length).toBeGreaterThan(0);
      expect(item.tituloEn.trim().length).toBeGreaterThan(0);
      expect(getNotechsGrupo(item.grupo)).toBeDefined();
    }
  });
});

describe('NOTECHS — descritores completos (referência, fora da ficha principal)', () => {
  it('tem exatamente 60 descritores (15 itens x 4 faixas)', () => {
    expect(NOTECHS_DESCRITORES).toHaveLength(60);
  });

  it('cada item tem exatamente 4 descritores, um por faixa da régua global', () => {
    const faixasEsperadas = FICHA_AVALIACAO_FAIXAS.map((f) => f.rangeLabel);
    for (const item of NOTECHS_ITENS) {
      const descritores = getNotechsDescritores(item.codigo);
      expect(descritores).toHaveLength(4);
      expect(descritores.map((d) => d.rangeLabel)).toEqual(faixasEsperadas);
      for (const d of descritores) {
        expect(d.texto.trim().length).toBeGreaterThan(0);
      }
    }
  });

  it('reaproveita as mesmas faixas (1-2/3-4/5-7/8-10) da régua global existente', () => {
    const rangeLabelsNotechs = new Set(NOTECHS_DESCRITORES.map((d) => d.rangeLabel));
    const rangeLabelsGlobais = new Set(FICHA_AVALIACAO_FAIXAS.map((f) => f.rangeLabel));
    expect(rangeLabelsNotechs).toEqual(rangeLabelsGlobais);
  });

  it('expõe aviso de proveniência do conteúdo (texto público, não verificado contra ficha fonte)', () => {
    expect(NOTECHS_PROVENIENCIA_AVISO.length).toBeGreaterThan(0);
  });
});

describe('isNotechsCategoria', () => {
  it('reconhece a categoria NOTECHS, case-insensitive', () => {
    expect(isNotechsCategoria('NOTECHS')).toBe(true);
    expect(isNotechsCategoria('notechs')).toBe(true);
    expect(isNotechsCategoria(' NOTECHS ')).toBe(true);
  });

  it('rejeita outras categorias', () => {
    expect(isNotechsCategoria('GERAL')).toBe(false);
    expect(isNotechsCategoria(null)).toBe(false);
    expect(isNotechsCategoria(undefined)).toBe(false);
  });

  it('usa a mesma constante NOTECHS_CATEGORIA em todo o módulo', () => {
    expect(NOTECHS_CATEGORIA).toBe('NOTECHS');
  });
});

describe('splitManobrasNotechs — separação usada na ficha e no PDF', () => {
  it('separa manobras técnicas (ordem 1-22) dos itens NOTECHS (ordem >= 1001)', () => {
    const manobras = [
      { ordem: 1 },
      { ordem: 22 },
      { ordem: 1001 },
      { ordem: 1015 },
    ];
    const { tecnicas, notechs } = splitManobrasNotechs(manobras);
    expect(tecnicas).toHaveLength(2);
    expect(notechs).toHaveLength(2);
  });

  it('ordena os itens NOTECHS por ordem, independentemente da ordem de entrada', () => {
    const manobras = [{ ordem: 1010 }, { ordem: 1001 }, { ordem: 1005 }];
    const { notechs } = splitManobrasNotechs(manobras);
    expect(notechs.map((m) => m.ordem)).toEqual([1001, 1005, 1010]);
  });

  it('lida com lista vazia sem erro', () => {
    expect(splitManobrasNotechs([])).toEqual({ tecnicas: [], notechs: [] });
  });

  it('fichas legadas sem itens NOTECHS retornam notechs vazio (sem regressão de layout)', () => {
    const manobras = Array.from({ length: 22 }, (_, i) => ({ ordem: i + 1 }));
    const { tecnicas, notechs } = splitManobrasNotechs(manobras);
    expect(tecnicas).toHaveLength(22);
    expect(notechs).toHaveLength(0);
  });
});
