import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

import {
  RPEA_PENDING_GAPS,
  buildRowReferencias,
  loadSimuladoresMatrizV6Data,
  normalizeRpeaAlias,
} from '../../scripts/maintenance/lib/simuladores-matriz-v6-data.mjs';

const ROOT = path.resolve(import.meta.dirname, '..', '..');
const ACCEPTANCE_MATRIX = path.join(ROOT, 'docs', 'analysis', 'matriz-v6-2-acceptance-matrix-51-modelos.md');

const EXPECTED_MODELS = [
  'A139-I-01/12',
  'A139-I-12/12',
  'A139-P-C1/VFR',
  'A139-P-LOFT/CHECK',
  'CRED-EXA',
  'SK76-I-01/12',
  'SK76-I-12/12',
  'SK76-P-CHECK',
  'S76-P-02/04-C3',
  'TRE-INST',
];

const CLOSING_10_MODELS = [
  'A139-NOT-01',
  'A139-NOT-02',
  'A139-REQ-01',
  'A139-S-01/02',
  'A139-S-02/02',
  'S76-NOT-01',
  'S76-NOT-02',
  'S76-REQ-01',
  'SK76-S-01/02',
  'SK76-S-02/02',
];

describe('simuladores matriz v6.2 data', () => {
  it('gera exatamente os 51 modelos do documento final, com 18 tecnicas distintas cada', () => {
    const data = loadSimuladoresMatrizV6Data();
    const totalRows = data.models.reduce((sum, model) => sum + model.rows.length, 0);

    expect(data.issues).toEqual([]);
    expect(data.models).toHaveLength(51);
    expect(totalRows).toBe(918);

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

  it('fecha o target 51 incorporando os 10 modelos antes fora do pacote (Decisao 15)', () => {
    const data = loadSimuladoresMatrizV6Data();
    const codes = new Set(data.models.map((model) => model.modelCode));

    for (const modelCode of CLOSING_10_MODELS) {
      expect(codes.has(modelCode), `modelo do target 51 ausente: ${modelCode}`).toBe(true);
    }
  });

  it('SK76-S-02/02 usa S76-LGB-47 e nao usa S76-LGE-44 (Decisao 16)', () => {
    const data = loadSimuladoresMatrizV6Data();
    const model = data.models.find((item) => item.modelCode === 'SK76-S-02/02');
    expect(model).toBeDefined();

    const codes = model?.rows.map((row) => row.codigo) ?? [];
    expect(codes).toContain('S76-LGB-47');
    expect(codes).not.toContain('S76-LGE-44');
  });

  it('S76-NOT-02 termina em S76-FLU-01 e nao contem S76-EST-01 (Decisao 17)', () => {
    const data = loadSimuladoresMatrizV6Data();
    const model = data.models.find((item) => item.modelCode === 'S76-NOT-02');
    expect(model).toBeDefined();

    const codes = model?.rows.map((row) => row.codigo) ?? [];
    expect(model?.rows[model.rows.length - 1]?.codigo).toBe('S76-FLU-01');
    expect(codes).not.toContain('S76-EST-01');
  });

  it('mantem os 15 NOTECHS fora das 18 tecnicas', () => {
    const data = loadSimuladoresMatrizV6Data();

    expect(data.notechsCodes).toHaveLength(15);
    expect(data.notechsCodes[0]).toBe('NOTECHS-COO-01');
    expect(data.notechsCodes[14]).toBe('NOTECHS-TMD-15');

    for (const model of data.models) {
      expect(model.rows.some((row) => row.codigo.startsWith('NOTECHS-'))).toBe(false);
    }
  });

  it('inclui TRE-INST e CRED-EXA no alvo com 18 tecnicas e sem NOTECHS legados nas tecnicas', () => {
    const data = loadSimuladoresMatrizV6Data();
    const treInst = data.models.find((item) => item.modelCode === 'TRE-INST');
    const credExa = data.models.find((item) => item.modelCode === 'CRED-EXA');

    expect(treInst?.aircraft).toBe('N/A');
    expect(credExa?.aircraft).toBe('N/A');
    expect(treInst?.kind).toBe('instrutor');
    expect(credExa?.kind).toBe('examinador');
    expect(treInst?.rows).toHaveLength(18);
    expect(credExa?.rows).toHaveLength(18);
    expect(treInst?.rows.some((row) => row.codigo.startsWith('INV-CRM-'))).toBe(false);
    expect(credExa?.rows.some((row) => row.codigo.startsWith('EXA-NTS-'))).toBe(false);
    expect(treInst?.rows.some((row) => row.codigo === 'INV-ETH-01')).toBe(true);
    expect(credExa?.sourceNotes.some((note) => /EXA-CND-01.*EXA-PLN-01/i.test(note))).toBe(true);
    expect(credExa?.sourceNotes.some((note) => /rubricas internas separadas/i.test(note))).toBe(true);
  });

  it('renomeia os 6 ciclos IFR para IFR-emergencias quando nao ha conteudo noturno-offshore real', () => {
    const data = loadSimuladoresMatrizV6Data();
    const expectedNames = new Map([
      ['A139-P-C1/IFR', 'Ciclo 1 / IFR-emergências'],
      ['A139-P-C2/IFR', 'Ciclo 2 / IFR-emergências'],
      ['A139-P-C3/IFR', 'Ciclo 3 / IFR-emergências'],
      ['S76-P-02/04-C1', 'Ciclo 1 / IFR-emergências'],
      ['S76-P-02/04-C2', 'Ciclo 2 / IFR-emergências'],
      ['S76-P-02/04-C3', 'Ciclo 3 / IFR-emergências'],
    ]);

    for (const [modelCode, modelName] of expectedNames.entries()) {
      const model = data.models.find((item) => item.modelCode === modelCode);
      expect(model?.modelName).toBe(modelName);
    }
  });

  it('reintroduz black hole/ilusao visual noturna nas 6 sessoes aprovadas e autorrotacao noturna dedicada AW139 nas 2 sessoes aprovadas', () => {
    const data = loadSimuladoresMatrizV6Data();
    const blackHoleModels = [
      'A139-NOT-01',
      'A139-NOT-02',
      'A139-S-01/02',
      'S76-NOT-01',
      'S76-NOT-02',
      'SK76-S-01/02',
    ];

    for (const modelCode of blackHoleModels) {
      const model = data.models.find((item) => item.modelCode === modelCode);
      expect(model?.rows.some((row) => row.codigo === 'OPS-NOT-X1')).toBe(true);
    }

    for (const modelCode of ['A139-NOT-01', 'A139-S-01/02']) {
      const model = data.models.find((item) => item.modelCode === modelCode);
      expect(model?.rows.some((row) => row.codigo === 'A139-AUT-03')).toBe(true);
    }
  });

  it('marca sessoes de check como avaliativas, sem contaminar sessoes de treino puro', () => {
    const data = loadSimuladoresMatrizV6Data();
    const checkCodes = ['A139-I-12/12', 'A139-P-LOFT/CHECK', 'SK76-I-12/12', 'SK76-P-CHECK'];
    const trainCodes = ['A139-I-11/12', 'A139-P-LOFT/OFFSHORE', 'SK76-I-11/12', 'S76-P-01/04-C1'];  // replaced S76-P-C1/VFR

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
    const sk76I04 = data.models.find((item) => item.modelCode === 'SK76-I-04/12');
    const sk76I05 = data.models.find((item) => item.modelCode === 'SK76-I-05/12');
    const sk76I06 = data.models.find((item) => item.modelCode === 'SK76-I-06/12');

    expect(sk76I04?.rows.some((row) => row.codigo === '76-PRGGP')).toBe(true);
    expect(sk76I05?.rows.some((row) => row.codigo === '76-APXPR')).toBe(true);
    expect(sk76I06?.rows.some((row) => row.codigo === '76-POUMO')).toBe(true);
  });

  it('promove o IFR basico para A139-I-05/12 e SK76-I-05/12, mantendo 03/12 e 04/12 sem bloco principal de aproximacoes IFR', () => {
    const data = loadSimuladoresMatrizV6Data();
    const a139I03 = data.models.find((item) => item.modelCode === 'A139-I-03/12');
    const a139I04 = data.models.find((item) => item.modelCode === 'A139-I-04/12');
    const a139I05 = data.models.find((item) => item.modelCode === 'A139-I-05/12');
    const sk76I03 = data.models.find((item) => item.modelCode === 'SK76-I-03/12');
    const sk76I04 = data.models.find((item) => item.modelCode === 'SK76-I-04/12');
    const sk76I05 = data.models.find((item) => item.modelCode === 'SK76-I-05/12');

    expect(a139I03?.modelName).toMatch(/Sistema Elétrico/i);
    expect(a139I04?.modelName).toMatch(/AFCS, Aviônicos/i);
    expect(a139I05?.modelName).toMatch(/IFR\/PBN Básico/i);
    expect(a139I03?.rows.some((row) => row.codigo.startsWith('OPS-APP-'))).toBe(false);
    expect(a139I04?.rows.some((row) => row.codigo.startsWith('OPS-APP-'))).toBe(false);
    expect(a139I05?.rows.some((row) => row.codigo.startsWith('OPS-APP-'))).toBe(true);

    expect(sk76I03?.modelName).toMatch(/Sistemas Básicos/i);
    expect(sk76I04?.modelName).toMatch(/Automação, Aviônicos/i);
    expect(sk76I05?.modelName).toMatch(/IFR \/ Navegação Básico/i);
    expect(sk76I03?.rows.some((row) => /APX|RNV|ILS|VOR/.test(row.codigo))).toBe(false);
    expect(sk76I04?.rows.some((row) => /APX|RNV|ILS|VOR/.test(row.codigo))).toBe(false);
    expect(sk76I05?.rows.some((row) => /APX|RNV|ILS|VOR/.test(row.codigo))).toBe(true);
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

  it('sessoes com LOFT no nome mantem evidencia LOFT por codigo aprovado ou enquadramento estruturado', () => {
    const data = loadSimuladoresMatrizV6Data();
    const loftModels = data.models.filter((item) => /loft/i.test(item.modelName));

    expect(loftModels.length).toBeGreaterThan(0);
    for (const model of loftModels) {
      expect(model.loftEvidence, `sessao LOFT sem evidencia: ${model.modelCode}`).toBe(true);
    }

    const semestralLoft = ['A139-S-01/02', 'A139-S-02/02', 'SK76-S-01/02', 'SK76-S-02/02'];
    for (const modelCode of semestralLoft) {
      const model = data.models.find((item) => item.modelCode === modelCode);
      expect(model?.loftScenario, `sessao semestral sem bloco LOFT estruturado: ${modelCode}`).toBe(true);
    }
  });

  it('reaquisicoes nao carregam rotulo noturno indevido nas descricoes e fases', () => {
    const data = loadSimuladoresMatrizV6Data();
    const reqCodes = ['A139-REQ-01', 'S76-REQ-01'];

    for (const modelCode of reqCodes) {
      const model = data.models.find((item) => item.modelCode === modelCode);
      expect(model).toBeDefined();
      for (const row of model?.rows ?? []) {
        expect(row.nome).not.toMatch(/preparaç[aã]o noturna|p[oó]s-voo noturno|pouso normal noturno|aproximaç[aã]o normal visual noturna/i);
        expect(row.fase_voo ?? '').not.toMatch(/p[oó]s-voo noturno/i);
      }
    }
  });

  it('matriz de aceite registra o achado LOFT, a decisao do owner e a acao corretiva nas 4 sessoes semestrais', () => {
    const matrix = fs.readFileSync(ACCEPTANCE_MATRIX, 'utf8');

    expect(matrix).toMatch(/risco de [`'"]?LOFT no nome sem evid[eê]ncia estrutural/i);
    expect(matrix).toMatch(/decis[aã]o do owner: manter LOFT/i);
    expect(matrix).toMatch(/a[cç][aã]o tomada: enquadramento LOFT estruturado/i);

    for (const modelCode of ['A139-S-01/02', 'A139-S-02/02', 'SK76-S-01/02', 'SK76-S-02/02']) {
      const row = matrix.split('\n').find((line) => line.startsWith('|') && line.includes(`\`${modelCode}\``));
      expect(row, `linha ausente na matriz: ${modelCode}`).toBeDefined();
      expect(row).toMatch(/sim \(com bloco LOFT estruturado\)/i);
      expect(row).toMatch(/GO/i);
      expect(row).toMatch(/achado LOFT documentado; owner manteve o nome; enquadramento estruturado adicionado/i);
    }
  });

  it('buildRowReferencias continua separado do nome/descricao publico', () => {
    const refsQrh = buildRowReferencias({ codigo: 'S76-FCR-17', nome: 'Falha de Motor em Cruzeiro', fap_refs: 'QRH S76' });
    expect(refsQrh).toContainEqual(expect.objectContaining({ tipo: 'QRH', status: 'FONTE_OPERADOR' }));

    const refsFap = buildRowReferencias({ codigo: 'OPS-APP-X1', nome: 'Precision approach', fap_refs: 'FAP06 IAP3.2' });
    expect(refsFap).toContainEqual(expect.objectContaining({ tipo: 'FAP', item: 'IAP3.2', status: 'CONFIRMADA' }));
  });

  it('classifica explicitamente os novos codigos OPS-NOT-X1 e INV-ETH-01 sem cair em fallback', () => {
    const data = loadSimuladoresMatrizV6Data();

    for (const modelCode of ['A139-NOT-01', 'A139-NOT-02', 'A139-S-01/02', 'S76-NOT-01', 'S76-NOT-02', 'SK76-S-01/02']) {
      const model = data.models.find((item) => item.modelCode === modelCode);
      const opsNotRow = model?.rows.find((row) => row.codigo === 'OPS-NOT-X1');
      expect(opsNotRow?.categoria).toBe('EMERGENCIA');
    }

    const treInst = data.models.find((item) => item.modelCode === 'TRE-INST');
    const invEthRow = treInst?.rows.find((row) => row.codigo === 'INV-ETH-01');
    expect(invEthRow?.categoria).toBe('TREINAMENTO');

    for (const modelCode of ['A139-NOT-01', 'A139-S-01/02']) {
      const model = data.models.find((item) => item.modelCode === modelCode);
      const autRow = model?.rows.find((row) => row.codigo === 'A139-AUT-03');
      expect(autRow?.categoria).toBe('EMERGENCIA');
    }
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
