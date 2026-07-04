import { describe, expect, it } from 'vitest';

import {
  buildRowReferencias,
  loadSimuladoresMatrizV6Data,
  normalizeRpeaAlias,
  RPEA_PENDING_GAPS,
} from '../../scripts/maintenance/lib/simuladores-matriz-v6-data.mjs';

const FICHAS_RESTANTES_CODES = [
  'A139-S-01/02',
  'A139-S-02/02',
  'A139-REQ-01',
  'S76-REQ-01',
  'A139-NOT-01',
  'A139-NOT-02',
  'S76-NOT-01',
  'S76-NOT-02',
];

const GENERIC_CODE_PATTERN = /^LOFT-(NOT|CHK|OFF)-/;
const FORBIDDEN_S76_REQ_CODES = ['S76-CRM-01', 'S76-COM-01', 'S76-ATC-01'];

describe('simuladores matriz v6 data', () => {
  it('gera 49 modelos-alvo com 18 técnicas distintas cada (39 V6 + 2 SK76 semestral + 8 fichas restantes)', () => {
    const data = loadSimuladoresMatrizV6Data();

    expect(data.issues).toEqual([]);
    expect(data.models).toHaveLength(49);

    for (const model of data.models) {
      expect(model.rows).toHaveLength(18);
      expect(new Set(model.rows.map((row) => row.codigo)).size).toBe(18);
    }
  });

  it('preserva os checks/LOFT distintos via caráter avaliativo', () => {
    const data = loadSimuladoresMatrizV6Data();
    const checks = data.models.filter((model) => model.modelCode.includes('12/12') || model.modelCode.includes('CHECK'));

    expect(checks.length).toBeGreaterThan(0);
    for (const model of checks) {
      expect(new Set(model.rows.map((row) => row.carater))).toEqual(new Set(['avaliativo']));
    }
  });

  it('mantém os quatro modelos de preview exigidos', () => {
    const data = loadSimuladoresMatrizV6Data();
    const codes = new Set(data.models.map((model) => model.modelCode));

    expect(codes.has('SK76-I-01/12')).toBe(true);
    expect(codes.has('SK76-I-12/12')).toBe(true);
    expect(codes.has('A139-I-01/12')).toBe(true);
    expect(codes.has('A139-I-12/12')).toBe(true);
  });

  it('inclui os dois SK76 semestrais convertidos sem LOFT genérico nas 18 técnicas', () => {
    const data = loadSimuladoresMatrizV6Data();

    for (const modelCode of ['SK76-S-01/02', 'SK76-S-02/02']) {
      const model = data.models.find((item) => item.modelCode === modelCode);
      expect(model).toBeDefined();
      expect(model?.rows).toHaveLength(18);
      expect(model?.rows.some((row) => row.codigo.startsWith('LOFT-NOT-'))).toBe(false);
      expect(model?.rows.some((row) => row.codigo.startsWith('LOFT-CHK-'))).toBe(false);
      expect(model?.rows.some((row) => ['S76-CRM-01', 'S76-COM-01', 'S76-ATC-01'].includes(row.codigo))).toBe(false);
    }
  });

  it('inclui as 8 fichas restantes V6.1 com exatamente 18 técnicas cada', () => {
    const data = loadSimuladoresMatrizV6Data();

    for (const modelCode of FICHAS_RESTANTES_CODES) {
      const model = data.models.find((item) => item.modelCode === modelCode);
      expect(model, `modelo ausente: ${modelCode}`).toBeDefined();
      expect(model?.rows).toHaveLength(18);
      expect(new Set(model?.rows.map((row) => row.codigo)).size).toBe(18);
    }
  });

  it('as 15 NOTECHS continuam disponíveis como catálogo global para as fichas restantes', () => {
    // NOTECHS não entram em `model.rows` (mesmo padrão de SK76_SEMESTRAL_MODELS
    // já em produção) — o vínculo por ficha é feito em runtime pelo backend
    // (worker-airtrust/src/routes/simuladores-fichas.ts), não por este loader.
    // O que este loader garante é: (a) o catálogo global de 15 NOTECHS-01..15
    // permanece intacto, e (b) as 8 fichas passam a fazer parte de `data.models`,
    // que é a lista elegível para esse vínculo automático — a mesma condição já
    // válida hoje para SK76-S-01/02 e SK76-S-02/02.
    const data = loadSimuladoresMatrizV6Data();

    expect(data.notechsCodes).toHaveLength(15);
    expect(data.notechsCodes[0]).toBe('NOTECHS-01');
    expect(data.notechsCodes[14]).toBe('NOTECHS-15');

    const modelCodes = new Set(data.models.map((model) => model.modelCode));
    for (const modelCode of FICHAS_RESTANTES_CODES) {
      expect(modelCodes.has(modelCode)).toBe(true);
    }
  });

  it('nenhuma das 8 fichas restantes mantém LOFT-NOT-*/LOFT-CHK-*/LOFT-OFF-* genérico dentro das 18 técnicas', () => {
    const data = loadSimuladoresMatrizV6Data();

    for (const modelCode of FICHAS_RESTANTES_CODES) {
      const model = data.models.find((item) => item.modelCode === modelCode);
      const genericLeftovers = model?.rows.filter((row) => GENERIC_CODE_PATTERN.test(row.codigo)) ?? [];
      expect(genericLeftovers, `${modelCode} ainda tem código LOFT genérico: ${JSON.stringify(genericLeftovers)}`).toHaveLength(0);
    }
  });

  it('A139-S-02/02 (OPC/check IFR) está pronta para o vínculo automático de NOTECHS e referencia 690-2.46C.6', () => {
    const data = loadSimuladoresMatrizV6Data();
    const model = data.models.find((item) => item.modelCode === 'A139-S-02/02');
    expect(model).toBeDefined();

    const rowWithRpeaRef = model?.rows.find((row) => Array.isArray(row.rpea_refs) && row.rpea_refs.includes('690-2.46C.6'));
    expect(rowWithRpeaRef, 'A139-S-02/02 deveria referenciar 690-2.46C.6 (OPC com avaliação CRM/LOFT)').toBeDefined();

    const referencias = buildRowReferencias(rowWithRpeaRef);
    expect(referencias).toContainEqual(
      expect.objectContaining({ tipo: 'OUTRO', item: '690-2.46C.6', status: 'CONFIRMADA' }),
    );
  });

  it('A139-S-01/02 (semestral noturno) está pronta para o vínculo automático de NOTECHS e referencia 690-2.44C.1E', () => {
    const data = loadSimuladoresMatrizV6Data();
    const model = data.models.find((item) => item.modelCode === 'A139-S-01/02');
    expect(model).toBeDefined();

    const rowWithRpeaRef = model?.rows.find((row) => Array.isArray(row.rpea_refs) && row.rpea_refs.includes('690-2.44C.1E'));
    expect(rowWithRpeaRef, 'A139-S-01/02 deveria referenciar 690-2.44C.1E (recorrente semestral FSTD)').toBeDefined();

    const referencias = buildRowReferencias(rowWithRpeaRef);
    expect(referencias).toContainEqual(
      expect.objectContaining({ tipo: 'OUTRO', item: '690-2.44C.1E', status: 'CONFIRMADA' }),
    );
  });

  it('S76-REQ-01 não contém S76-CRM-01, S76-COM-01 nem S76-ATC-01 nas 18 técnicas', () => {
    const data = loadSimuladoresMatrizV6Data();
    const model = data.models.find((item) => item.modelCode === 'S76-REQ-01');
    expect(model).toBeDefined();

    const codes = model?.rows.map((row) => row.codigo) ?? [];
    for (const forbidden of FORBIDDEN_S76_REQ_CODES) {
      expect(codes).not.toContain(forbidden);
    }
  });

  it('S76-REQ-01, SK76-S-01/02 e SK76-S-02/02 terminam (ordem 18) com S76-EST-01, não com manobra operacional de heliponto', () => {
    // PR #247 corrigiu S76-REQ-01 mas afirmou incorretamente que os dois
    // semestrais SK76 já terminavam em S76-EST-01 — nenhum teste cobria isso.
    const data = loadSimuladoresMatrizV6Data();

    for (const modelCode of ['S76-REQ-01', 'SK76-S-01/02', 'SK76-S-02/02']) {
      const model = data.models.find((item) => item.modelCode === modelCode);
      expect(model, `modelo ausente: ${modelCode}`).toBeDefined();
      const lastRow = model?.rows.find((row) => row.ordem === 18);
      expect(lastRow?.codigo, `${modelCode} deveria encerrar com S76-EST-01`).toBe('S76-EST-01');
      expect(model?.rows.some((row) => row.codigo === 'S76-LDP-00')).toBe(false);
    }
  });

  it('TRE-INST e CRED-EXA permanecem fora do loader/apply operacional (GO documental preliminar, sem fonte FAP/PTO interna confirmada)', () => {
    const data = loadSimuladoresMatrizV6Data();
    const codes = new Set(data.models.map((model) => model.modelCode));

    expect(codes.has('TRE-INST')).toBe(false);
    expect(codes.has('CRED-EXA')).toBe(false);
  });

  it('referencias_json nunca é concatenado em nome/descricao — permanece como estrutura separada', () => {
    const data = loadSimuladoresMatrizV6Data();
    const model = data.models.find((item) => item.modelCode === 'A139-S-01/02');
    const row = model?.rows.find((item) => item.ordem === 7); // CAU-DCG-53, fonte QRH AW139
    expect(row).toBeDefined();

    const referencias = buildRowReferencias(row);
    expect(Array.isArray(referencias)).toBe(true);
    expect(row?.nome).not.toMatch(/QRH|FAP|referencias_json|\[.*tipo.*\]/i);
    // nome/descricao da manobra nunca deve conter um JSON serializado de referências.
    expect(row?.nome).not.toContain('{');
    expect(row?.nome).not.toContain('[');
  });

  it('classifica fontes QRH/AFM/FCTM/MGO/MOM/SOP/FTV/PRG-OPS como FONTE_OPERADOR (não presentes no repo)', () => {
    const refsQrh = buildRowReferencias({ codigo: 'CAU-DCG-53', nome: 'teste', fap_refs: 'QRH AW139' });
    expect(refsQrh).toContainEqual(expect.objectContaining({ tipo: 'QRH', status: 'FONTE_OPERADOR' }));

    const refsFap = buildRowReferencias({ codigo: 'OPS-APP-X1', nome: 'teste', fap_refs: 'FAP06 IAP3.2' });
    expect(refsFap).toContainEqual(expect.objectContaining({ tipo: 'FAP', status: 'CONFIRMADA', item: 'IAP3.2' }));
  });

  it('normaliza os aliases RPEA (Lista analisada) -> PQ-C/escopo do mandato', () => {
    expect(normalizeRpeaAlias('690-2.43BA')).toBe('690-2.43BB');
    expect(normalizeRpeaAlias('690-2.43C.1A')).toBe('690-2.43C.1B');
    expect(normalizeRpeaAlias('690-2.43C.2')).toBe('690-2.43C.2A');
    expect(normalizeRpeaAlias('690-2.44C.1C')).toBe('690-2.44C.1E');
    expect(normalizeRpeaAlias('690-2.44C.3')).toBe('690-2.44C.3B');
    expect(normalizeRpeaAlias('690-2.45BA')).toBe('690-2.45BB');
    // Códigos já canônicos (PQ-C) e códigos desconhecidos passam intactos.
    expect(normalizeRpeaAlias('690-2.9C.4')).toBe('690-2.9C.4');
    expect(normalizeRpeaAlias('690-2.46C.6')).toBe('690-2.46C.6');
  });

  it('690-2.50C.2 e 690-2.51C.1/51C.2 não são falsamente marcados como cobertos por nenhuma ficha restante', () => {
    // Auditoria RPEA/PQ-C (COSTA_DO_SOL_RPEA_PQC_CROSSWALK_AUDITORIA_20260703.md)
    // concluiu que estes 3 itens não têm manobra/procedimento técnico
    // correspondente na matriz de simulador e não devem ser fechados
    // automaticamente pela conversão das 8 fichas restantes.
    const data = loadSimuladoresMatrizV6Data();
    const pendingRpeaItems = ['690-2.50C.2', '690-2.51C.1', '690-2.51C.2'];

    for (const modelCode of FICHAS_RESTANTES_CODES) {
      const model = data.models.find((item) => item.modelCode === modelCode);
      for (const row of model?.rows ?? []) {
        const rpeaRefs = Array.isArray(row.rpea_refs) ? row.rpea_refs.map((code) => normalizeRpeaAlias(code)) : [];
        for (const pending of pendingRpeaItems) {
          expect(
            rpeaRefs,
            `${modelCode}/${row.codigo} não deveria referenciar ${pending} (lacuna/pendência, não cobertura)`,
          ).not.toContain(pending);
        }
      }
    }
  });

  it('expõe a lista canônica de lacunas RPEA pendentes sem duplicar mapas concorrentes de alias', () => {
    const data = loadSimuladoresMatrizV6Data();

    expect(data.rpeaPendingGaps).toEqual(RPEA_PENDING_GAPS);
    expect(RPEA_PENDING_GAPS).toEqual([
      expect.objectContaining({ item: '690-2.50C.2', status: 'PENDENTE_OWNER' }),
      expect.objectContaining({ item: '690-2.51C.1', status: 'TREINAMENTO_OPERACIONAL_SEPARADO' }),
      expect.objectContaining({ item: '690-2.51C.2', status: 'TREINAMENTO_OPERACIONAL_SEPARADO' }),
      expect.objectContaining({ item: '690-2.43C.2A', status: 'PENDENTE_FONTE' }),
    ]);
  });
});
