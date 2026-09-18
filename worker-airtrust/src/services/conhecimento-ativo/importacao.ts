import { normalizarModeloConhecimento } from './challenge-service';

export const CONHECIMENTO_ATIVO_TEMPLATE_VERSION = '1.0';
export const CONHECIMENTO_ATIVO_MAX_IMPORT_ROWS = 500;

export const CONHECIMENTO_ATIVO_TEMPLATE_HEADERS = [
  'versao_template',
  'aeronave_modelo',
  'fonte_tipo',
  'fonte_titulo',
  'fonte_revisao',
  'fonte_data_revisao',
  'fonte_secao',
  'fonte_pagina',
  'fonte_referencia',
  'topico_codigo',
  'topico_nome',
  'item_codigo',
  'item_titulo',
  'item_conceito',
  'item_resumo_essencial',
  'criticidade',
  'tempo_estudo_segundos',
  'questao_variante',
  'questao_tipo',
  'questao_enunciado',
  'questao_explicacao',
  'questao_o_que_guardar',
  'dificuldade',
  'alternativa_a',
  'alternativa_b',
  'alternativa_c',
  'alternativa_d',
  'alternativa_e',
  'alternativa_f',
  'alternativa_correta',
] as const;

type Header = (typeof CONHECIMENTO_ATIVO_TEMPLATE_HEADERS)[number];
type FonteTipo = 'RFM' | 'FCOM' | 'QRH' | 'SOP' | 'OM' | 'OUTRO';
type Criticidade = 'BAIXA' | 'MEDIA' | 'ALTA' | 'CRITICA';
type QuestaoTipo = 'MULTIPLA_ESCOLHA' | 'VERDADEIRO_FALSO' | 'CENARIO';

export interface ConhecimentoImportRow {
  linha: number;
  versaoTemplate: string;
  aeronaveModelo: string | null;
  fonteTipo: FonteTipo;
  fonteTitulo: string;
  fonteRevisao: string;
  fonteDataRevisao: string | null;
  fonteSecao: string | null;
  fontePagina: string | null;
  fonteReferencia: string | null;
  topicoCodigo: string;
  topicoNome: string;
  itemCodigo: string;
  itemTitulo: string;
  itemConceito: string;
  itemResumoEssencial: string | null;
  criticidade: Criticidade;
  tempoEstudoSegundos: number;
  questaoVariante: string;
  questaoTipo: QuestaoTipo;
  questaoEnunciado: string;
  questaoExplicacao: string;
  questaoOQueGuardar: string;
  dificuldade: number;
  alternativas: Array<{ letra: string; texto: string; correta: boolean; ordem: number }>;
}

export interface ConhecimentoImportIssue {
  linha: number;
  campo?: Header | string;
  erro: string;
}

export interface ConhecimentoImportValidation {
  version: string;
  totalRows: number;
  rows: ConhecimentoImportRow[];
  errors: ConhecimentoImportIssue[];
  warnings: ConhecimentoImportIssue[];
}

export interface ConhecimentoImportApplyResult {
  importacaoId: number;
  totalRows: number;
  inserted: {
    fontes: number;
    topicos: number;
    itens: number;
    questoes: number;
    alternativas: number;
  };
  ignored: {
    fontes: number;
    topicos: number;
    itens: number;
    questoes: number;
  };
}

type RawRow = { linha: number; values: Record<string, unknown> };

async function loadExcelJS(): Promise<typeof import('exceljs')> {
  return import('exceljs/dist/es5/exceljs.browser.js');
}

function rawCell(value: unknown): unknown {
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  if (typeof value === 'object' && value !== null) {
    if ('result' in value) return (value as { result?: unknown }).result;
    if ('text' in value && typeof (value as { text?: unknown }).text === 'string') {
      return (value as { text: string }).text;
    }
    if ('richText' in value && Array.isArray((value as { richText?: unknown }).richText)) {
      return (value as { richText: Array<{ text?: string }> }).richText.map((x) => x.text || '').join('');
    }
  }
  return value;
}

function text(value: unknown): string {
  return String(rawCell(value) ?? '').trim();
}

function nullableText(value: unknown): string | null {
  const result = text(value);
  return result || null;
}

function normalizedCode(value: unknown): string {
  return text(value).toUpperCase().replace(/\s+/g, '-');
}

function parsePositiveInt(value: unknown, fallback: number): number {
  const normalized = text(value);
  if (!normalized) return fallback;
  const parsed = Number(normalized.replace(',', '.'));
  return Number.isFinite(parsed) ? Math.round(parsed) : Number.NaN;
}

function sourceKey(row: ConhecimentoImportRow): string {
  return [
    row.fonteTipo,
    row.fonteTitulo.toLocaleLowerCase('pt-BR'),
    row.fonteRevisao.toLocaleLowerCase('pt-BR'),
    row.aeronaveModelo || '',
  ].join('|');
}

function topicKey(row: ConhecimentoImportRow): string {
  return row.topicoCodigo;
}

function itemKey(row: ConhecimentoImportRow): string {
  return row.itemCodigo;
}

function questionKey(row: ConhecimentoImportRow): string {
  return row.itemCodigo + '|' + row.questaoVariante;
}

function required(
  values: Record<string, unknown>,
  campo: Header,
  linha: number,
  errors: ConhecimentoImportIssue[],
  max = 4000,
): string {
  const value = text(values[campo]);
  if (!value) {
    errors.push({ linha, campo, erro: 'Campo obrigatório.' });
    return '';
  }
  if (value.length > max) {
    errors.push({ linha, campo, erro: `Excede o limite de ${max} caracteres.` });
  }
  return value;
}

function compareOrIssue(
  seen: Map<string, string>,
  key: string,
  fingerprint: string,
  linha: number,
  campo: string,
  errors: ConhecimentoImportIssue[],
) {
  const previous = seen.get(key);
  if (previous === undefined) {
    seen.set(key, fingerprint);
    return;
  }
  if (previous !== fingerprint) {
    errors.push({
      linha,
      campo,
      erro: 'A mesma chave aparece na planilha com definições diferentes.',
    });
  }
}

function parseRows(rawRows: RawRow[], headers: string[]): ConhecimentoImportValidation {
  const errors: ConhecimentoImportIssue[] = [];
  const warnings: ConhecimentoImportIssue[] = [];
  const rows: ConhecimentoImportRow[] = [];

  const missing = CONHECIMENTO_ATIVO_TEMPLATE_HEADERS.filter((header) => !headers.includes(header));
  for (const header of missing) {
    errors.push({ linha: 1, campo: header, erro: 'Coluna obrigatória ausente no modelo.' });
  }
  if (missing.length) {
    return {
      version: CONHECIMENTO_ATIVO_TEMPLATE_VERSION,
      totalRows: rawRows.length,
      rows,
      errors,
      warnings,
    };
  }

  if (rawRows.length === 0) {
    errors.push({ linha: 2, erro: 'A planilha não possui linhas de conhecimento.' });
  }
  if (rawRows.length > CONHECIMENTO_ATIVO_MAX_IMPORT_ROWS) {
    errors.push({
      linha: 1,
      erro: `A planilha excede o limite de ${CONHECIMENTO_ATIVO_MAX_IMPORT_ROWS} linhas por lote.`,
    });
  }

  const seenSources = new Map<string, string>();
  const seenTopics = new Map<string, string>();
  const seenItems = new Map<string, string>();
  const seenQuestions = new Map<string, string>();

  for (const raw of rawRows.slice(0, CONHECIMENTO_ATIVO_MAX_IMPORT_ROWS)) {
    const v = raw.values;
    const linhaErrorsBefore = errors.length;
    const version = text(v.versao_template) || CONHECIMENTO_ATIVO_TEMPLATE_VERSION;
    if (version !== CONHECIMENTO_ATIVO_TEMPLATE_VERSION) {
      errors.push({
        linha: raw.linha,
        campo: 'versao_template',
        erro: `Versão incompatível. Use o modelo ${CONHECIMENTO_ATIVO_TEMPLATE_VERSION}.`,
      });
    }

    const modelText = nullableText(v.aeronave_modelo);
    const aeronaveModelo = modelText ? normalizarModeloConhecimento(modelText) : null;

    const fonteTipo = required(v, 'fonte_tipo', raw.linha, errors, 20).toUpperCase() as FonteTipo;
    if (!['RFM', 'FCOM', 'QRH', 'SOP', 'OM', 'OUTRO'].includes(fonteTipo)) {
      errors.push({ linha: raw.linha, campo: 'fonte_tipo', erro: 'Use RFM, FCOM, QRH, SOP, OM ou OUTRO.' });
    }
    const fonteTitulo = required(v, 'fonte_titulo', raw.linha, errors, 300);
    const fonteRevisao = required(v, 'fonte_revisao', raw.linha, errors, 100);
    const fonteDataRevisao = nullableText(v.fonte_data_revisao);
    if (fonteDataRevisao && !/^\d{4}-\d{2}-\d{2}$/.test(fonteDataRevisao)) {
      errors.push({ linha: raw.linha, campo: 'fonte_data_revisao', erro: 'Use a data no formato AAAA-MM-DD.' });
    }

    const topicoCodigo = normalizedCode(required(v, 'topico_codigo', raw.linha, errors, 100));
    const topicoNome = required(v, 'topico_nome', raw.linha, errors, 250);
    const itemCodigo = normalizedCode(required(v, 'item_codigo', raw.linha, errors, 120));
    const itemTitulo = required(v, 'item_titulo', raw.linha, errors, 300);
    const itemConceito = required(v, 'item_conceito', raw.linha, errors, 6000);
    const criticidade = required(v, 'criticidade', raw.linha, errors, 20).toUpperCase() as Criticidade;
    if (!['BAIXA', 'MEDIA', 'ALTA', 'CRITICA'].includes(criticidade)) {
      errors.push({ linha: raw.linha, campo: 'criticidade', erro: 'Use BAIXA, MEDIA, ALTA ou CRITICA.' });
    }
    const tempoEstudoSegundos = parsePositiveInt(v.tempo_estudo_segundos, 60);
    if (!Number.isFinite(tempoEstudoSegundos) || tempoEstudoSegundos < 15 || tempoEstudoSegundos > 900) {
      errors.push({
        linha: raw.linha,
        campo: 'tempo_estudo_segundos',
        erro: 'Informe um inteiro entre 15 e 900 segundos.',
      });
    }

    const questaoVariante = normalizedCode(required(v, 'questao_variante', raw.linha, errors, 80));
    const questaoTipo = required(v, 'questao_tipo', raw.linha, errors, 40).toUpperCase() as QuestaoTipo;
    if (!['MULTIPLA_ESCOLHA', 'VERDADEIRO_FALSO', 'CENARIO'].includes(questaoTipo)) {
      errors.push({
        linha: raw.linha,
        campo: 'questao_tipo',
        erro: 'Use MULTIPLA_ESCOLHA, VERDADEIRO_FALSO ou CENARIO.',
      });
    }
    const questaoEnunciado = required(v, 'questao_enunciado', raw.linha, errors, 4000);
    const questaoExplicacao = required(v, 'questao_explicacao', raw.linha, errors, 6000);
    const questaoOQueGuardar = required(v, 'questao_o_que_guardar', raw.linha, errors, 3000);
    const dificuldade = parsePositiveInt(v.dificuldade, 2);
    if (!Number.isFinite(dificuldade) || dificuldade < 1 || dificuldade > 5) {
      errors.push({ linha: raw.linha, campo: 'dificuldade', erro: 'Informe um inteiro de 1 a 5.' });
    }

    const alternativesRaw = [
      ['A', 'alternativa_a'],
      ['B', 'alternativa_b'],
      ['C', 'alternativa_c'],
      ['D', 'alternativa_d'],
      ['E', 'alternativa_e'],
      ['F', 'alternativa_f'],
    ] as const;
    const alternativaCorreta = required(v, 'alternativa_correta', raw.linha, errors, 1).toUpperCase();
    const alternativas = alternativesRaw
      .map(([letra, campo], index) => ({
        letra,
        texto: text(v[campo]),
        correta: letra === alternativaCorreta,
        ordem: index + 1,
      }))
      .filter((alt) => Boolean(alt.texto));

    if (alternativas.length < 2) {
      errors.push({ linha: raw.linha, campo: 'alternativa_a', erro: 'Informe pelo menos duas alternativas.' });
    }
    if (!['A', 'B', 'C', 'D', 'E', 'F'].includes(alternativaCorreta)) {
      errors.push({ linha: raw.linha, campo: 'alternativa_correta', erro: 'Use uma letra de A a F.' });
    } else if (!alternativas.some((alt) => alt.letra === alternativaCorreta)) {
      errors.push({
        linha: raw.linha,
        campo: 'alternativa_correta',
        erro: 'A alternativa marcada como correta está vazia.',
      });
    }
    const normalizedAlternatives = alternativas.map((alt) => alt.texto.trim().toLocaleLowerCase('pt-BR'));
    if (new Set(normalizedAlternatives).size !== normalizedAlternatives.length) {
      errors.push({ linha: raw.linha, campo: 'alternativa_a', erro: 'Existem alternativas repetidas na mesma questão.' });
    }

    const row: ConhecimentoImportRow = {
      linha: raw.linha,
      versaoTemplate: version,
      aeronaveModelo,
      fonteTipo,
      fonteTitulo,
      fonteRevisao,
      fonteDataRevisao,
      fonteSecao: nullableText(v.fonte_secao),
      fontePagina: nullableText(v.fonte_pagina),
      fonteReferencia: nullableText(v.fonte_referencia),
      topicoCodigo,
      topicoNome,
      itemCodigo,
      itemTitulo,
      itemConceito,
      itemResumoEssencial: nullableText(v.item_resumo_essencial),
      criticidade,
      tempoEstudoSegundos: Number.isFinite(tempoEstudoSegundos) ? tempoEstudoSegundos : 60,
      questaoVariante,
      questaoTipo,
      questaoEnunciado,
      questaoExplicacao,
      questaoOQueGuardar,
      dificuldade: Number.isFinite(dificuldade) ? dificuldade : 2,
      alternativas,
    };

    compareOrIssue(
      seenSources,
      sourceKey(row),
      JSON.stringify([row.fonteDataRevisao]),
      raw.linha,
      'fonte_titulo',
      errors,
    );
    compareOrIssue(
      seenTopics,
      topicKey(row),
      JSON.stringify([row.topicoNome, row.aeronaveModelo]),
      raw.linha,
      'topico_codigo',
      errors,
    );
    compareOrIssue(
      seenItems,
      itemKey(row),
      JSON.stringify([
        row.topicoCodigo,
        row.aeronaveModelo,
        row.itemTitulo,
        row.itemConceito,
        row.itemResumoEssencial,
        row.criticidade,
        row.tempoEstudoSegundos,
      ]),
      raw.linha,
      'item_codigo',
      errors,
    );
    compareOrIssue(
      seenQuestions,
      questionKey(row),
      JSON.stringify([
        row.questaoTipo,
        row.questaoEnunciado,
        row.questaoExplicacao,
        row.questaoOQueGuardar,
        row.dificuldade,
        row.alternativas.map((alt) => [alt.texto, alt.correta]),
      ]),
      raw.linha,
      'questao_variante',
      errors,
    );

    if (seenQuestions.has(questionKey(row)) && rows.some((x) => questionKey(x) === questionKey(row))) {
      errors.push({
        linha: raw.linha,
        campo: 'questao_variante',
        erro: 'Questão duplicada: a combinação item_codigo + questao_variante deve ser única.',
      });
    }

    if (errors.length === linhaErrorsBefore) rows.push(row);
  }

  return {
    version: CONHECIMENTO_ATIVO_TEMPLATE_VERSION,
    totalRows: rawRows.length,
    rows,
    errors,
    warnings,
  };
}

export async function parseConhecimentoAtivoWorkbook(
  buffer: ArrayBuffer,
): Promise<ConhecimentoImportValidation> {
  const ExcelJS = await loadExcelJS();
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(buffer);
  const worksheet = workbook.getWorksheet('Conhecimento') || workbook.worksheets[0];
  if (!worksheet) {
    return {
      version: CONHECIMENTO_ATIVO_TEMPLATE_VERSION,
      totalRows: 0,
      rows: [],
      errors: [{ linha: 1, erro: 'Planilha vazia ou inválida.' }],
      warnings: [],
    };
  }

  const headers: string[] = [];
  worksheet.getRow(1).eachCell({ includeEmpty: true }, (cell, colNumber) => {
    headers[colNumber - 1] = text(cell.value).toLowerCase();
  });

  const rawRows: RawRow[] = [];
  worksheet.eachRow({ includeEmpty: false }, (row, rowNumber) => {
    if (rowNumber === 1) return;
    const values: Record<string, unknown> = {};
    let hasValue = false;
    headers.forEach((header, index) => {
      if (!header) return;
      const value = rawCell(row.getCell(index + 1).value);
      values[header] = value;
      if (header !== 'versao_template' && text(value)) hasValue = true;
    });
    if (hasValue) rawRows.push({ linha: rowNumber, values });
  });

  return parseRows(rawRows, headers);
}

export async function gerarTemplateConhecimentoAtivo(): Promise<Uint8Array> {
  const ExcelJS = await loadExcelJS();
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'AirTrust';
  workbook.subject = 'Modelo padronizado de importação do Conhecimento Ativo';
  workbook.title = `Conhecimento Ativo - Modelo ${CONHECIMENTO_ATIVO_TEMPLATE_VERSION}`;

  const ws = workbook.addWorksheet('Conhecimento', {
    views: [{ state: 'frozen', ySplit: 1 }],
  });
  ws.addRow([...CONHECIMENTO_ATIVO_TEMPLATE_HEADERS]);
  ws.autoFilter = {
    from: 'A1',
    to: `AD1`,
  };
  ws.getRow(1).font = { bold: true };
  ws.getRow(1).height = 28;

  const widths: Record<string, number> = {
    A: 16, B: 18, C: 14, D: 30, E: 18, F: 16, G: 16, H: 14, I: 34,
    J: 20, K: 28, L: 24, M: 30, N: 46, O: 38, P: 14, Q: 22, R: 18,
    S: 22, T: 54, U: 54, V: 42, W: 12, X: 34, Y: 34, Z: 34, AA: 34,
    AB: 34, AC: 34, AD: 20,
  };
  Object.entries(widths).forEach(([col, width]) => {
    ws.getColumn(col).width = width;
  });

  for (let row = 2; row <= 501; row += 1) {
    ws.getCell(`A${row}`).value = CONHECIMENTO_ATIVO_TEMPLATE_VERSION;
    ws.getCell(`C${row}`).dataValidation = {
      type: 'list',
      allowBlank: false,
      formulae: ['"RFM,FCOM,QRH,SOP,OM,OUTRO"'],
    };
    ws.getCell(`P${row}`).dataValidation = {
      type: 'list',
      allowBlank: false,
      formulae: ['"BAIXA,MEDIA,ALTA,CRITICA"'],
    };
    ws.getCell(`S${row}`).dataValidation = {
      type: 'list',
      allowBlank: false,
      formulae: ['"MULTIPLA_ESCOLHA,VERDADEIRO_FALSO,CENARIO"'],
    };
    ws.getCell(`W${row}`).dataValidation = {
      type: 'whole',
      operator: 'between',
      allowBlank: true,
      formulae: [1, 5],
    };
    ws.getCell(`AD${row}`).dataValidation = {
      type: 'list',
      allowBlank: false,
      formulae: ['"A,B,C,D,E,F"'],
    };
  }

  const instructions = workbook.addWorksheet('Instrucoes');
  instructions.columns = [{ width: 28 }, { width: 95 }];
  const instructionRows: Array<[string, string]> = [
    ['Modelo', `Versão ${CONHECIMENTO_ATIVO_TEMPLATE_VERSION}. Não altere os nomes das colunas.`],
    ['Uma linha', 'Cada linha representa uma variante de questão vinculada a um único item de conhecimento.'],
    ['Repetição permitida', 'Fonte, tópico e item podem se repetir em várias linhas quando houver várias questões do mesmo conceito.'],
    ['Chaves', 'topico_codigo, item_codigo e a combinação item_codigo + questao_variante funcionam como chaves naturais.'],
    ['Aeronave', 'Use o modelo operacional, por exemplo AW139 ou SK76. Em branco = conhecimento geral do tenant.'],
    ['Fonte', 'Informe documento e revisão controlados. O importador cria a fonte como RASCUNHO para revisão técnica.'],
    ['Publicação', 'Importação nunca publica conteúdo automaticamente. Fonte, item e questão precisam de aprovação posterior.'],
    ['Alternativas', 'Preencha de A até F; no mínimo A e B. alternativa_correta recebe apenas a letra da opção correta.'],
    ['Criticidade', 'Use BAIXA, MEDIA, ALTA ou CRITICA.'],
    ['Questão', 'Use MULTIPLA_ESCOLHA, VERDADEIRO_FALSO ou CENARIO.'],
    ['Limite', `Até ${CONHECIMENTO_ATIVO_MAX_IMPORT_ROWS} linhas por arquivo.`],
    ['Datas', 'Use AAAA-MM-DD em fonte_data_revisao.'],
    ['Segurança', 'Se uma chave existente tiver definição diferente, a importação é bloqueada; conteúdo aprovado não é sobrescrito.'],
  ];
  instructions.addRows(instructionRows);
  instructions.getColumn(1).font = { bold: true };

  const example = workbook.addWorksheet('Exemplo');
  example.addRow([...CONHECIMENTO_ATIVO_TEMPLATE_HEADERS]);
  example.addRow([
    CONHECIMENTO_ATIVO_TEMPLATE_VERSION,
    'AW139',
    'RFM',
    'AW139 Rotorcraft Flight Manual',
    'Rev. XX',
    '2026-01-01',
    'Seção 2',
    '2-10',
    'Limitation example — substituir pelo dado técnico real.',
    'AW139-LIMITACOES',
    'Limitações',
    'CA-AW139-LIM-001',
    'Exemplo de limitação',
    'Substitua este texto por um conceito tecnicamente validado.',
    'Resumo curto do que deve permanecer disponível na memória.',
    'ALTA',
    60,
    'A',
    'MULTIPLA_ESCOLHA',
    'Exemplo de enunciado — substituir.',
    'Explicação fundamentada na fonte indicada.',
    'Frase curta com o ponto essencial.',
    2,
    'Alternativa A',
    'Alternativa B',
    'Alternativa C',
    'Alternativa D',
    '',
    '',
    'B',
  ]);
  example.getRow(1).font = { bold: true };

  const out = await workbook.xlsx.writeBuffer();
  return out instanceof Uint8Array ? out : new Uint8Array(out as ArrayBuffer);
}

export async function sha256Hex(buffer: ArrayBuffer): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', buffer);
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

export { aplicarImportacaoConhecimento, validarConflitosBanco } from './importacao-d1';
