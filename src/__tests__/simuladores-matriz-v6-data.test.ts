import { describe, expect, it } from 'vitest';

import {
  RPEA_PENDING_GAPS,
  buildRowReferencias,
  loadSimuladoresMatrizV6Data,
  normalizeRpeaAlias,
} from '../../scripts/maintenance/lib/simuladores-matriz-v6-data.mjs';

const EXPECTED_MODELS = [
  'A139-I-01/12',
  'A139-I-12/12',
  'A139-P-C1/VFR',
  'A139-P-LOFT/CHECK',
  'SK76-I-01/12',
  'SK76-I-12/12',
  'SK76-P-CHECK',
  'S76-P-C3/IFR',
];

const OUTSIDE_PACKAGE_MODELS = [
  'A139-S-01/02',
  'A139-S-02/02',
  'A139-REQ-01',
  'S76-REQ-01',
  'SK76-S-01/02',
  'SK76-S-02/02',
  'TRE-INST',
  'CRED-EXA',
];

describe('simuladores matriz v6.2 data', () => {
  it('gera exatamente os 39 modelos do documento final, com 18 tecnicas distintas cada', () => {
    const data = loadSimuladoresMatrizV6Data();

    expect(data.issues).toEqual([]);
    expect(data.models).toHaveLength(39);

    for (const model of data.models) {
      expect(model.rows).toHaveLength(18);
      expect(new Set(model.rows.map((row) => row.codigo)).size).toBe(18);
    }
  });

  it('carrega a fonte obrigatoria V6.2 final e mantem os modelos-alvo principais', () => {
    const data = loadSimuladoresMatrizV6Data();
    const codes = new Set(data.models.map((model) => model.modelCode));

    expect(data.sourceFile).toBe('airtrust_matriz_v6_2_todas_sessoes_manobras_final.md');
    for (const modelCode of EXPECTED_MODELS) {
      expect(codes.has(modelCode), `modelo ausente: ${modelCode}`).toBe(true);
    }
  });

  it('nao inclui sessoes fora do pacote explicitamente preservadas pelo documento final', () => {
    const data = loadSimuladoresMatrizV6Data();
    const codes = new Set(data.models.map((model) => model.modelCode));

    for (const modelCode of OUTSIDE_PACKAGE_MODELS) {
      expect(codes.has(modelCode), `modelo fora do pacote apareceu no loader: ${modelCode}`).toBe(false);
    }
  });

  it('mantem os 15 NOTECHS fora das 18 tecnicas', () => {
    const data = loadSimuladoresMatrizV6Data();

    expect(data.notechsCodes).toHaveLength(15);
    expect(data.notechsCodes[0]).toBe('NOTECHS-01');
    expect(data.notechsCodes[14]).toBe('NOTECHS-15');

    for (const model of data.models) {
      expect(model.rows.some((row) => row.codigo.startsWith('NOTECHS-'))).toBe(false);
    }
  });

  it('marca sessoes de check como avaliativas, sem contaminar sessoes de treino puro', () => {
    const data = loadSimuladoresMatrizV6Data();
    const checkCodes = ['A139-I-12/12', 'A139-P-LOFT/CHECK', 'SK76-I-12/12', 'SK76-P-CHECK'];
    const trainCodes = ['A139-I-11/12', 'A139-P-LOFT/OFFSHORE', 'SK76-I-11/12', 'S76-P-C1/VFR'];

    for (const modelCode of checkCodes) {
      const model = data.models.find((item) => item.modelCode === modelCode);
      expect(model).toBeDefined();
      expect(new Set(model?.rows.map((row) => row.carater))).toEqual(new Set(['avaliativo']));
    }

    for (const modelCode of trainCodes) {
      const model = data.models.find((item) => item.modelCode === modelCode);
      expect(model).toBeDefined();
      expect(new Set(model?.rows.map((row) => row.carater))).toEqual(new Set(['treinamento']));
    }
  });

  it('preserva codigos legados 76-* onde a V6.2 final ainda os usa, sem normalizacao cega', () => {
    const data = loadSimuladoresMatrizV6Data();
    const sk76I03 = data.models.find((item) => item.modelCode === 'SK76-I-03/12');
    const sk76I06 = data.models.find((item) => item.modelCode === 'SK76-I-06/12');

    expect(sk76I03?.rows.some((row) => row.codigo === '76-PRGGP')).toBe(true);
    expect(sk76I03?.rows.some((row) => row.codigo === '76-APXPR')).toBe(true);
    expect(sk76I06?.rows.some((row) => row.codigo === '76-POUMO')).toBe(true);
  });

  it('SK76-P-CHECK usa a familia LOFT-CHK-* e nao reintroduz S76-LOFT-*', () => {
    const data = loadSimuladoresMatrizV6Data();
    const model = data.models.find((item) => item.modelCode === 'SK76-P-CHECK');
    expect(model).toBeDefined();

    for (const row of model?.rows ?? []) {
      expect(row.codigo.startsWith('LOFT-CHK-')).toBe(true);
      expect(row.codigo.startsWith('S76-LOFT-')).toBe(false);
    }
  });

  it('buildRowReferencias continua separado do nome/descricao publico', () => {
    const refsQrh = buildRowReferencias({ codigo: 'S76-FCR-17', nome: 'Falha de Motor em Cruzeiro', fap_refs: 'QRH S76' });
    expect(refsQrh).toContainEqual(expect.objectContaining({ tipo: 'QRH', status: 'FONTE_OPERADOR' }));

    const refsFap = buildRowReferencias({ codigo: 'OPS-APP-X1', nome: 'Precision approach', fap_refs: 'FAP06 IAP3.2' });
    expect(refsFap).toContainEqual(expect.objectContaining({ tipo: 'FAP', item: 'IAP3.2', status: 'CONFIRMADA' }));
  });

  it('expõe a lista canonica de gaps RPEA e a normalizacao de aliases sem mapas concorrentes', () => {
    const data = loadSimuladoresMatrizV6Data();

    expect(normalizeRpeaAlias('690-2.43BA')).toBe('690-2.43BB');
    expect(normalizeRpeaAlias('690-2.44C.1C')).toBe('690-2.44C.1E');
    expect(normalizeRpeaAlias('690-2.46C.6')).toBe('690-2.46C.6');

    expect(data.rpeaPendingGaps).toEqual(RPEA_PENDING_GAPS);
    expect(RPEA_PENDING_GAPS).toEqual([
      expect.objectContaining({ item: '690-2.50C.2', status: 'PENDENTE_OWNER' }),
      expect.objectContaining({ item: '690-2.51C.1', status: 'TREINAMENTO_OPERACIONAL_SEPARADO' }),
      expect.objectContaining({ item: '690-2.51C.2', status: 'TREINAMENTO_OPERACIONAL_SEPARADO' }),
      expect.objectContaining({ item: '690-2.43C.2A', status: 'PENDENTE_FONTE' }),
    ]);
  });
});
