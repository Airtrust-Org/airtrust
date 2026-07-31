import { describe, expect, it } from 'vitest';

import {
  PTO_REV10_ALLOWED_MUTATION_TABLES,
  PTO_REV10_FORBIDDEN_HISTORICAL_TABLES,
  buildPtoRev10ModelAndLinkStatements,
  getPtoRev10SessionType,
  physicalPtoRev10ModelCode,
} from '../../../scripts/lib/simuladores-pto-rev10-apply-core.mjs';

function makePlan() {
  const types = [
    'INICIAL',
    'PERIODICO',
    'SEMESTRAL',
    'CHECK',
    'REQUALIFICACAO',
    'ELEVACAO_NIVEL',
    'EXPERIENCIA_RECENTE',
    'NOTURNO',
  ];
  const models = Array.from({ length: 66 }, (_, index) => ({
    codigo: `MODEL-${index + 1}`,
    titulo: `Modelo ${index + 1}`,
    programa: 'Programa',
    natureza: index % 10 === 0 ? 'Verificação' : 'Instrução',
    tipo_estruturado: types[index % types.length],
    tipo_dispositivo: 'SIMULADOR',
    carga_sessao:
      index % 13 === 0
        ? 'Integrada às 9 horas do ciclo; sem carga adicional de FFS'
        : '2 horas',
    duracao_estimada_minutos: index % 13 === 0 ? 0 : 120,
    aeronave: index < 31 ? 'AW139' : 'SK76',
    ordem_curricular: index + 1,
  }));
  return {
    empresa_id: 6,
    versao_matriz: 'PTO-REV10-2026-07-30',
    models,
    items: models.flatMap((model) =>
      Array.from({ length: 18 }, (_, itemIndex) => ({
        modelo: model.codigo,
        ordem: itemIndex + 1,
        codigo: `MAN-${itemIndex + 1}`,
        nome: `Manobra ${itemIndex + 1}`,
        execucao_pf: itemIndex < 9 ? 'A' : 'B',
        fase_voo: 'FASE',
        tipo_conteudo: 'PROCEDIMENTO',
      })),
    ),
  };
}

describe('PTO Rev10 versioned DML builder', () => {
  it('creates one new physical version and preserves the canonical display code', () => {
    expect(physicalPtoRev10ModelCode('A139-I-01/12', 'PTO-REV10-2026-07-30', 2)).toBe(
      'A139-I-01/12@PTO-REV10-2026-07-30-V2',
    );
  });

  it('has an explicit session type for every canonical program/nature class', () => {
    for (const type of [
      'INICIAL',
      'PERIODICO',
      'SEMESTRAL',
      'CHECK',
      'REQUALIFICACAO',
      'ELEVACAO_NIVEL',
      'EXPERIENCIA_RECENTE',
      'NOTURNO',
    ]) {
      expect(getPtoRev10SessionType(type).codigo).toBeTruthy();
    }
  });

  it('generates only tenant-scoped curriculum mutations and no historical-sheet mutation', () => {
    const plan = makePlan();
    const { statements, modelRows } = buildPtoRev10ModelAndLinkStatements({
      plan,
      empresaId: 6,
      importUuid: 'pto-rev10-test',
      maxVersionByCode: new Map([['MODEL-1', { modelo_id: 900, versao_numero: 4 }]]),
    });
    const sql = statements.join('\n');

    expect(modelRows).toHaveLength(66);
    expect(modelRows[0].previousId).toBe(900);
    expect(modelRows[0].versionNumber).toBe(5);
    expect(modelRows[0].tipoDispositivo).toBe('SIMULADOR');
    expect(sql).toContain('duracao_estimada');
    expect(sql).toContain("'SIMULADOR'");
    expect(sql).toContain("'AW139'");
    expect(sql).toContain("'SK76'");
    expect(sql).toContain(',0,1,');
    expect(sql).toContain('WHERE empresa_id=6');
    expect(sql).toContain('is_current=0');
    expect(sql).toContain('modelos_sessao_versionamento');

    for (const table of PTO_REV10_ALLOWED_MUTATION_TABLES) {
      expect(sql).toContain(table);
    }
    for (const table of PTO_REV10_FORBIDDEN_HISTORICAL_TABLES) {
      expect(sql.toLowerCase()).not.toMatch(
        new RegExp(`(?:insert\\s+into|update|delete\\s+from)\\s+${table}`, 'i'),
      );
    }
    expect(sql).not.toMatch(/\bDROP\b|\bALTER\b|\bCREATE\s+TABLE\b/i);
  });
});
