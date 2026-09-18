import { describe, expect, it } from 'vitest';
import {
  CONHECIMENTO_ATIVO_TEMPLATE_HEADERS,
  CONHECIMENTO_ATIVO_TEMPLATE_VERSION,
  gerarTemplateConhecimentoAtivo,
  parseConhecimentoAtivoWorkbook,
} from '../../services/conhecimento-ativo/importacao';

async function loadWorkbook(buffer: Uint8Array) {
  const ExcelJS = await import('exceljs');
  const workbook = new ExcelJS.Workbook();
  const exact = buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength);
  await workbook.xlsx.load(exact as ArrayBuffer);
  return workbook;
}

async function writeBuffer(workbook: Awaited<ReturnType<typeof loadWorkbook>>): Promise<ArrayBuffer> {
  return workbook.xlsx.writeBuffer();
}

function fillValidRow(
  worksheet: import('exceljs').Worksheet,
  rowNumber: number,
  overrides: Record<string, string | number> = {},
) {
  const values: Record<string, string | number> = {
    versao_template: CONHECIMENTO_ATIVO_TEMPLATE_VERSION,
    aeronave_modelo: 'S-76',
    fonte_tipo: 'RFM',
    fonte_titulo: 'S-76 Rotorcraft Flight Manual',
    fonte_revisao: 'Rev. 10',
    fonte_data_revisao: '2026-01-15',
    fonte_secao: '2',
    fonte_pagina: '2-10',
    fonte_referencia: 'Limitação técnica controlada',
    topico_codigo: 'SK76-LIMITACOES',
    topico_nome: 'Limitações',
    item_codigo: 'CA-SK76-LIM-001',
    item_titulo: 'Limitação exemplo',
    item_conceito: 'Conceito técnico validado na fonte.',
    item_resumo_essencial: 'Resumo essencial.',
    criticidade: 'ALTA',
    tempo_estudo_segundos: 60,
    questao_variante: 'A',
    questao_tipo: 'MULTIPLA_ESCOLHA',
    questao_enunciado: 'Qual alternativa representa corretamente o conceito?',
    questao_explicacao: 'Explicação didática baseada na fonte.',
    questao_o_que_guardar: 'Ponto essencial a reter.',
    dificuldade: 2,
    alternativa_a: 'Alternativa incorreta',
    alternativa_b: 'Alternativa correta',
    alternativa_c: 'Outra alternativa',
    alternativa_d: 'Mais uma alternativa',
    alternativa_e: '',
    alternativa_f: '',
    alternativa_correta: 'B',
    ...overrides,
  };

  for (const [header, value] of Object.entries(values)) {
    const index = CONHECIMENTO_ATIVO_TEMPLATE_HEADERS.indexOf(
      header as (typeof CONHECIMENTO_ATIVO_TEMPLATE_HEADERS)[number],
    );
    if (index >= 0) worksheet.getCell(rowNumber, index + 1).value = value;
  }
}

describe('Conhecimento Ativo — modelo XLSX padronizado', () => {
  it('gera workbook com abas Conhecimento, Instrucoes e Exemplo', async () => {
    const buffer = await gerarTemplateConhecimentoAtivo();
    const workbook = await loadWorkbook(buffer);

    expect(workbook.worksheets.map((sheet) => sheet.name)).toEqual([
      'Conhecimento',
      'Instrucoes',
      'Exemplo',
    ]);

    const data = workbook.getWorksheet('Conhecimento');
    expect(data).toBeDefined();
    const headers = CONHECIMENTO_ATIVO_TEMPLATE_HEADERS.map((_, index) =>
      String(data?.getCell(1, index + 1).value || ''),
    );
    expect(headers).toEqual([...CONHECIMENTO_ATIVO_TEMPLATE_HEADERS]);
  });

  it('não interpreta as linhas pré-formatadas vazias como dados', async () => {
    const buffer = await gerarTemplateConhecimentoAtivo();
    const parsed = await parseConhecimentoAtivoWorkbook(
      buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength) as ArrayBuffer,
    );

    expect(parsed.totalRows).toBe(0);
    expect(parsed.rows).toHaveLength(0);
    expect(parsed.errors.some((error) => error.erro.includes('não possui linhas'))).toBe(true);
  });

  it('faz round-trip de uma linha válida e normaliza S-76 para SK76', async () => {
    const buffer = await gerarTemplateConhecimentoAtivo();
    const workbook = await loadWorkbook(buffer);
    const sheet = workbook.getWorksheet('Conhecimento');
    if (!sheet) throw new Error('Aba Conhecimento ausente');
    fillValidRow(sheet, 2);

    const parsed = await parseConhecimentoAtivoWorkbook(await writeBuffer(workbook));

    expect(parsed.errors).toEqual([]);
    expect(parsed.totalRows).toBe(1);
    expect(parsed.rows).toHaveLength(1);
    expect(parsed.rows[0]).toMatchObject({
      aeronaveModelo: 'SK76',
      itemCodigo: 'CA-SK76-LIM-001',
      questaoVariante: 'A',
      criticidade: 'ALTA',
      dificuldade: 2,
    });
    expect(parsed.rows[0].alternativas).toHaveLength(4);
    expect(parsed.rows[0].alternativas.find((alt) => alt.correta)?.letra).toBe('B');
  });

  it('bloqueia alternativa correta apontando para opção vazia', async () => {
    const buffer = await gerarTemplateConhecimentoAtivo();
    const workbook = await loadWorkbook(buffer);
    const sheet = workbook.getWorksheet('Conhecimento');
    if (!sheet) throw new Error('Aba Conhecimento ausente');
    fillValidRow(sheet, 2, { alternativa_correta: 'F' });

    const parsed = await parseConhecimentoAtivoWorkbook(await writeBuffer(workbook));

    expect(
      parsed.errors.some(
        (error) =>
          error.campo === 'alternativa_correta' && error.erro.includes('está vazia'),
      ),
    ).toBe(true);
  });

  it('bloqueia item+variante duplicados no mesmo arquivo', async () => {
    const buffer = await gerarTemplateConhecimentoAtivo();
    const workbook = await loadWorkbook(buffer);
    const sheet = workbook.getWorksheet('Conhecimento');
    if (!sheet) throw new Error('Aba Conhecimento ausente');
    fillValidRow(sheet, 2);
    fillValidRow(sheet, 3);

    const parsed = await parseConhecimentoAtivoWorkbook(await writeBuffer(workbook));

    expect(
      parsed.errors.some(
        (error) =>
          error.campo === 'questao_variante' && error.erro.includes('Questão duplicada'),
      ),
    ).toBe(true);
  });
});
