import { describe, expect, it } from 'vitest';

import { loadSimuladoresMatrizV6Data } from '../../scripts/maintenance/lib/simuladores-matriz-v6-data.mjs';

type Row = { ordem: number; codigo: string; nome: string; fase_voo?: string };

const norm = (s: string) =>
  String(s || '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .trim();

const FORBIDDEN_METADATA_TOKENS = [
  'validar se fica',
  'renomeado',
  'v4.1',
  'matriz_v6_modelo',
  'tipo_item',
  'fase_voo=',
  'carater=',
  'fap_refs=',
];

function isTerminal(row: Row): boolean {
  const code = row.codigo.toUpperCase();
  if (/-EST-/.test(code)) return true;
  if (code === 'S76-FLU-01') return true;
  if (code === 'OPS-OFF-X3') return true;
  return false;
}

describe('matriz v6.2 — guardrails estruturais', () => {
  const data = loadSimuladoresMatrizV6Data();

  it('o loader nao reporta issues estruturais', () => {
    expect(data.issues).toEqual([]);
    expect(data.models).toHaveLength(51);
  });

  it('nenhuma sessao executa item operacional apos um item terminal', () => {
    const offenders: string[] = [];

    for (const model of data.models) {
      const rows: Row[] = model.rows;
      const terminalIndex = rows.findIndex((row) => isTerminal(row));
      if (terminalIndex === -1) continue;

      const after = rows.slice(terminalIndex + 1);
      if (after.length > 0) {
        offenders.push(
          `${model.modelCode}: terminal@${rows[terminalIndex].ordem} seguido de ${after
            .map((row) => `${row.ordem}:${row.codigo}`)
            .join(', ')}`,
        );
      }
    }

    expect(offenders, offenders.join('\n')).toEqual([]);
  });

  it('LOFT-CHK-23 aparece antes de LOFT-CHK-19 em todas as sequencias LOFT/Check', () => {
    const offenders: string[] = [];

    for (const model of data.models.filter((item) => item.rows.some((row) => row.codigo.startsWith('LOFT-CHK-')))) {
      const pos23 = model.rows.find((row) => row.codigo === 'LOFT-CHK-23')?.ordem ?? 999;
      const pos19 = model.rows.find((row) => row.codigo === 'LOFT-CHK-19')?.ordem ?? -1;
      if (!(pos23 < pos19)) {
        offenders.push(`${model.modelCode}: LOFT-CHK-23@${pos23} / LOFT-CHK-19@${pos19}`);
      }
    }

    expect(offenders, offenders.join('\n')).toEqual([]);
  });
});

describe('matriz v6.2 — guardrails especificos do documento final', () => {
  const data = loadSimuladoresMatrizV6Data();

  it('A139-I-01/12 termina em A139-EST-01 e mantem FLY-BAS-X4 antes do pouso', () => {
    const model = data.models.find((item) => item.modelCode === 'A139-I-01/12');
    expect(model).toBeDefined();

    const landing = model?.rows.find((row) => row.codigo === 'A139-PNO-01');
    const recovery = model?.rows.find((row) => row.codigo === 'FLY-BAS-X4');
    const final = model?.rows.find((row) => row.ordem === 18);

    expect(final?.codigo).toBe('A139-EST-01');
    expect((recovery?.ordem ?? 99) < (landing?.ordem ?? 0)).toBe(true);
  });

  it('A139-I-06/12 nao posiciona A139-OEI-01 depois de A139-POU-01', () => {
    const model = data.models.find((item) => item.modelCode === 'A139-I-06/12');
    expect(model).toBeDefined();

    const oei = model?.rows.find((row) => row.codigo === 'A139-OEI-01');
    const landing = model?.rows.find((row) => row.codigo === 'A139-POU-01');

    expect(oei).toBeDefined();
    expect(landing).toBeDefined();
    expect((oei?.ordem ?? 0) < (landing?.ordem ?? 99)).toBe(true);
  });

  it('A139-I-10/12 nao termina com CAU-HOT-65 e encerra em ditching offshore', () => {
    const model = data.models.find((item) => item.modelCode === 'A139-I-10/12');
    expect(model).toBeDefined();

    const final = model?.rows.find((row) => row.ordem === 18);
    expect(final?.codigo).toBe('OPS-OFF-X3');
    expect(final?.codigo).not.toBe('CAU-HOT-65');
  });

  it('SK76-I-10/12 termina em S76-FLU-01', () => {
    const model = data.models.find((item) => item.modelCode === 'SK76-I-10/12');
    expect(model).toBeDefined();
    expect(model?.rows.find((row) => row.ordem === 18)?.codigo).toBe('S76-FLU-01');
  });

  it('nenhum nome final contem metadados internos', () => {
    const offenders: string[] = [];

    for (const model of data.models) {
      for (const row of model.rows) {
        const haystack = norm(row.nome);
        for (const token of FORBIDDEN_METADATA_TOKENS) {
          if (haystack.includes(norm(token))) {
            offenders.push(`${model.modelCode}/${row.codigo}: ${row.nome}`);
          }
        }
      }
    }

    expect(offenders, offenders.join('\n')).toEqual([]);
  });

  it('nenhuma sessao mistura familias AW139 e SK76/S76', () => {
    const offenders: string[] = [];

    for (const model of data.models) {
      const codes = model.rows.map((row) => row.codigo);
      if (model.aircraft === 'AW139' && codes.some((codigo) => codigo.startsWith('S76-') || codigo.startsWith('76-'))) {
        offenders.push(`${model.modelCode}: codigo SK76 em sessao AW139`);
      }
      if (model.aircraft === 'SK76' && codes.some((codigo) => codigo.startsWith('A139-') || codigo.startsWith('CAU-') || codigo.startsWith('WAR-'))) {
        offenders.push(`${model.modelCode}: codigo AW139 em sessao SK76`);
      }
    }

    expect(offenders, offenders.join('\n')).toEqual([]);
  });

  it('TRE-INST e CRED-EXA nao reintroduzem familias NOTECHS/CRM dentro das 18 tecnicas', () => {
    const treInst = data.models.find((item) => item.modelCode === 'TRE-INST');
    const credExa = data.models.find((item) => item.modelCode === 'CRED-EXA');

    expect(treInst).toBeDefined();
    expect(credExa).toBeDefined();
    expect(treInst?.rows.some((row) => row.codigo.startsWith('INV-CRM-'))).toBe(false);
    expect(credExa?.rows.some((row) => row.codigo.startsWith('EXA-NTS-'))).toBe(false);
  });

  it('IFR basico nao aparece como bloco principal antes de A139-I-05/12 e SK76-I-05/12', () => {
    const a139I03 = data.models.find((item) => item.modelCode === 'A139-I-03/12');
    const a139I04 = data.models.find((item) => item.modelCode === 'A139-I-04/12');
    const a139I05 = data.models.find((item) => item.modelCode === 'A139-I-05/12');
    const sk76I03 = data.models.find((item) => item.modelCode === 'SK76-I-03/12');
    const sk76I04 = data.models.find((item) => item.modelCode === 'SK76-I-04/12');
    const sk76I05 = data.models.find((item) => item.modelCode === 'SK76-I-05/12');

    expect(a139I03?.rows.some((row) => row.codigo.startsWith('OPS-APP-'))).toBe(false);
    expect(a139I04?.rows.some((row) => row.codigo.startsWith('OPS-APP-'))).toBe(false);
    expect(a139I05?.rows.some((row) => row.codigo.startsWith('OPS-APP-'))).toBe(true);

    expect(sk76I03?.rows.some((row) => /APX|RNV|ILS|VOR/.test(row.codigo))).toBe(false);
    expect(sk76I04?.rows.some((row) => /APX|RNV|ILS|VOR/.test(row.codigo))).toBe(false);
    expect(sk76I05?.rows.some((row) => /APX|RNV|ILS|VOR/.test(row.codigo))).toBe(true);
  });

  it('S76-REQ-01 e sessoes semestrais SK76 encerram em item terminal aceitavel', () => {
    const expectedTerminal = new Map([
      ['S76-REQ-01', 'S76-EST-01'],
      ['SK76-S-01/02', 'S76-EST-01'],
      ['SK76-S-02/02', 'S76-EST-01'],
    ]);

    for (const [modelCode, terminalCode] of expectedTerminal.entries()) {
      const model = data.models.find((item) => item.modelCode === modelCode);
      expect(model).toBeDefined();
      expect(model?.rows.find((row) => row.ordem === 18)?.codigo).toBe(terminalCode);
    }
  });
});
