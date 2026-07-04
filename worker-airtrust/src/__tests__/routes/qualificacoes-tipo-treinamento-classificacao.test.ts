import { describe, expect, it } from 'vitest';
import {
  normalizeTipoTreinamento,
  resolveCargaHorariaByTipo,
  resolveParametrosRenovacaoQualificacao,
} from '../../routes/qualificacoes/historico-helpers';

/**
 * Golden regression pack: Inicial x Periódico não pode ser confundido.
 * `normalizeTipoTreinamento` é a única fonte que decide isso hoje (string
 * match sobre o valor persistido); documenta o comportamento correto E o
 * gap conhecido de fallback silencioso para valores não reconhecidos,
 * conforme mapeado na auditoria de domínio.
 */
describe('normalizeTipoTreinamento', () => {
  it('classifica INICIAL corretamente', () => {
    expect(normalizeTipoTreinamento('INICIAL')).toBe('INICIAL');
    expect(normalizeTipoTreinamento('inicial')).toBe('INICIAL');
    expect(normalizeTipoTreinamento('  Inicial  ')).toBe('INICIAL');
  });

  it('classifica PERIODICO/RECORRENTE como RECORRENTE, nunca como INICIAL', () => {
    expect(normalizeTipoTreinamento('PERIODICO')).toBe('RECORRENTE');
    expect(normalizeTipoTreinamento('PERIÓDICO')).toBe('RECORRENTE');
    expect(normalizeTipoTreinamento('RECORRENTE')).toBe('RECORRENTE');
    expect(normalizeTipoTreinamento('Recorrente')).toBe('RECORRENTE');
  });

  it('classifica SEMESTRAL como categoria propria (nao INICIAL nem RECORRENTE)', () => {
    expect(normalizeTipoTreinamento('SEMESTRAL')).toBe('SEMESTRAL');
  });

  it('GAP CONHECIDO: string nao reconhecida (typo/variacao) retorna null em vez de erro explicito', () => {
    // Documenta o comportamento atual: variações não mapeadas explicitamente
    // (typo, abreviação, categoria nova) não geram INICIAL nem RECORRENTE de
    // forma explícita — retornam null e o chamador decide o fallback. Este
    // teste trava esse comportamento para que uma mudança futura seja
    // deliberada, não acidental.
    expect(normalizeTipoTreinamento('PERIODIC')).toBeNull();
    expect(normalizeTipoTreinamento('PERÍODICO')).toBeNull(); // acento no i, nao no o
    expect(normalizeTipoTreinamento('')).toBeNull();
    expect(normalizeTipoTreinamento(null)).toBeNull();
    expect(normalizeTipoTreinamento(undefined)).toBeNull();
  });
});

describe('resolveCargaHorariaByTipo', () => {
  it('INICIAL prioriza carga_horaria_inicial sobre carga_horaria_recorrente', () => {
    const carga = resolveCargaHorariaByTipo({
      tipoTreinamento: 'INICIAL',
      cargaInicial: 40,
      cargaRecorrente: 8,
      cargaPadrao: 4,
    });
    expect(carga).toBe(40);
  });

  it('RECORRENTE/PERIODICO prioriza carga_horaria_recorrente sobre carga_horaria_inicial', () => {
    const carga = resolveCargaHorariaByTipo({
      tipoTreinamento: 'PERIODICO',
      cargaInicial: 40,
      cargaRecorrente: 8,
      cargaPadrao: 4,
    });
    expect(carga).toBe(8);
  });

  it('SEMESTRAL tambem prioriza carga_horaria_recorrente', () => {
    const carga = resolveCargaHorariaByTipo({
      tipoTreinamento: 'SEMESTRAL',
      cargaInicial: 40,
      cargaRecorrente: 8,
      cargaPadrao: 4,
    });
    expect(carga).toBe(8);
  });

  it('carga_horaria persistida no historico sempre vence (snapshot historico)', () => {
    const carga = resolveCargaHorariaByTipo({
      cargaHistorico: 99,
      tipoTreinamento: 'PERIODICO',
      cargaInicial: 40,
      cargaRecorrente: 8,
    });
    expect(carga).toBe(99);
  });

  it('GAP CONHECIDO: tipoTreinamento nao reconhecido cai no mesmo fallback de INICIAL', () => {
    // Documenta o gap: se o valor persistido nao bate com nenhuma variante
    // conhecida, a carga horaria resolvida e identica ao caminho INICIAL
    // (prioriza cargaInicial), mesmo que o registro seja na verdade um
    // periodico com nome de tipo mal digitado. Nao corrigido nesta fase
    // (requer decisao de dominio sobre normalizacao/validacao na escrita).
    const cargaTipoDesconhecido = resolveCargaHorariaByTipo({
      tipoTreinamento: 'PERIODIC_TYPO',
      cargaInicial: 40,
      cargaRecorrente: 8,
    });
    const cargaInicialExplicito = resolveCargaHorariaByTipo({
      tipoTreinamento: 'INICIAL',
      cargaInicial: 40,
      cargaRecorrente: 8,
    });
    expect(cargaTipoDesconhecido).toBe(cargaInicialExplicito);
  });
});

describe('resolveParametrosRenovacaoQualificacao', () => {
  it('nao classifica renovacao generica como SEMESTRAL', () => {
    const params = resolveParametrosRenovacaoQualificacao({
      codigoQualificacao: 'NR-12',
      dataConclusao: '2026-01-10',
      validadeMeses: 12,
    });
    expect(params.tipoTreinamento).toBe('RECORRENTE');
  });

  it('G1-SEM forca SEMESTRAL independente da validade informada', () => {
    const params = resolveParametrosRenovacaoQualificacao({
      codigoQualificacao: 'G1-SEM',
      dataConclusao: '2026-01-10',
      validadeMeses: 12,
    });
    expect(params.tipoTreinamento).toBe('SEMESTRAL');
    expect(params.validadeMeses).toBe(6);
  });

  it('validade de 6 meses generica tambem produz SEMESTRAL (regra por validade, nao so por codigo)', () => {
    const params = resolveParametrosRenovacaoQualificacao({
      codigoQualificacao: 'OUTRO-CODIGO',
      dataConclusao: '2026-01-10',
      validadeMeses: 6,
    });
    expect(params.tipoTreinamento).toBe('SEMESTRAL');
  });
});
