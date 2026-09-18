import type { Env } from '../../types';
import { normalizarModeloConhecimento } from './challenge-service';

export const CONHECIMENTO_ATIVO_TEMPLATE_VERSION = '1.0';
export const CONHECIMENTO_ATIVO_MAX_IMPORT_ROWS = 2000;

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
  return (await import('exceljs/dist/es5/exceljs.browser.js')) as unknown as typeof import('exceljs');
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

function dbConflict(linha: number, campo: string, erro: string): ConhecimentoImportIssue {
  return { linha, campo, erro };
}

export async function validarConflitosBanco(params: {
  db: D1Database;
  empresaId: number;
  rows: ConhecimentoImportRow[];
}): Promise<ConhecimentoImportIssue[]> {
  const { db, empresaId, rows } = params;
  const errors: ConhecimentoImportIssue[] = [];

  const uniqueSources = new Map<string, ConhecimentoImportRow>();
  const uniqueTopics = new Map<string, ConhecimentoImportRow>();
  const uniqueItems = new Map<string, ConhecimentoImportRow>();
  const uniqueQuestions = new Map<string, ConhecimentoImportRow>();
  for (const row of rows) {
    uniqueSources.set(sourceKey(row), row);
    uniqueTopics.set(topicKey(row), row);
    uniqueItems.set(itemKey(row), row);
    uniqueQuestions.set(questionKey(row), row);
  }

  for (const row of uniqueSources.values()) {
    const existing = await db
      .prepare(
        'SELECT id,data_revisao FROM conhecimento_ativo_fontes ' +
          'WHERE empresa_id=? AND tipo_documento=? AND titulo=? AND revisao=? ' +
          "AND COALESCE(aeronave_modelo,'')=? AND deleted_at IS NULL LIMIT 1",
      )
      .bind(
        empresaId,
        row.fonteTipo,
        row.fonteTitulo,
        row.fonteRevisao,
        row.aeronaveModelo || '',
      )
      .first<{ id: number; data_revisao: string | null }>();
    if (existing && (existing.data_revisao || null) !== row.fonteDataRevisao) {
      errors.push(dbConflict(row.linha, 'fonte_revisao', 'A fonte já existe com metadados diferentes.'));
    }
  }

  for (const row of uniqueTopics.values()) {
    const existing = await db
      .prepare(
        'SELECT id,nome,aeronave_modelo FROM conhecimento_ativo_topicos ' +
          'WHERE empresa_id=? AND codigo=? AND deleted_at IS NULL LIMIT 1',
      )
      .bind(empresaId, row.topicoCodigo)
      .first<{ id: number; nome: string; aeronave_modelo: string | null }>();
    if (
      existing &&
      (existing.nome !== row.topicoNome ||
        (existing.aeronave_modelo || null) !== row.aeronaveModelo)
    ) {
      errors.push(dbConflict(row.linha, 'topico_codigo', 'O tópico já existe com definição diferente.'));
    }
  }

  for (const row of uniqueItems.values()) {
    const existing = await db
      .prepare(
        'SELECT i.id,i.titulo,i.conceito,i.resumo_essencial,i.criticidade,i.tempo_estudo_segundos, ' +
          'i.aeronave_modelo,t.codigo AS topico_codigo ' +
          'FROM conhecimento_ativo_itens i ' +
          'JOIN conhecimento_ativo_topicos t ON t.id=i.topico_id AND t.empresa_id=i.empresa_id ' +
          'WHERE i.empresa_id=? AND i.codigo=? AND i.deleted_at IS NULL LIMIT 1',
      )
      .bind(empresaId, row.itemCodigo)
      .first<{
        id: number;
        titulo: string;
        conceito: string;
        resumo_essencial: string | null;
        criticidade: string;
        tempo_estudo_segundos: number;
        aeronave_modelo: string | null;
        topico_codigo: string;
      }>();
    if (
      existing &&
      (existing.titulo !== row.itemTitulo ||
        existing.conceito !== row.itemConceito ||
        (existing.resumo_essencial || null) !== row.itemResumoEssencial ||
        existing.criticidade !== row.criticidade ||
        Number(existing.tempo_estudo_segundos) !== row.tempoEstudoSegundos ||
        (existing.aeronave_modelo || null) !== row.aeronaveModelo ||
        existing.topico_codigo !== row.topicoCodigo)
    ) {
      errors.push(dbConflict(row.linha, 'item_codigo', 'O item já existe com conteúdo diferente.'));
    }
  }

  for (const row of uniqueQuestions.values()) {
    const existing = await db
      .prepare(
        'SELECT q.id,q.tipo,q.enunciado,q.explicacao,q.o_que_guardar,q.dificuldade ' +
          'FROM conhecimento_ativo_questoes q ' +
          'JOIN conhecimento_ativo_itens i ON i.id=q.item_id AND i.empresa_id=q.empresa_id ' +
          'WHERE q.empresa_id=? AND i.codigo=? AND q.variante_chave=? AND q.deleted_at IS NULL LIMIT 1',
      )
      .bind(empresaId, row.itemCodigo, row.questaoVariante)
      .first<{
        id: number;
        tipo: string;
        enunciado: string;
        explicacao: string;
        o_que_guardar: string | null;
        dificuldade: number;
      }>();
    if (
      existing &&
      (existing.tipo !== row.questaoTipo ||
        existing.enunciado !== row.questaoEnunciado ||
        existing.explicacao !== row.questaoExplicacao ||
        (existing.o_que_guardar || '') !== row.questaoOQueGuardar ||
        Number(existing.dificuldade) !== row.dificuldade)
    ) {
      errors.push(
        dbConflict(
          row.linha,
          'questao_variante',
          'A questão já existe com conteúdo diferente. Use nova variante ou revise manualmente.',
        ),
      );
    } else if (existing) {
      const alternatives = await db
        .prepare(
          'SELECT texto,correta,ordem FROM conhecimento_ativo_alternativas ' +
            'WHERE empresa_id=? AND questao_id=? AND deleted_at IS NULL ORDER BY ordem',
        )
        .bind(empresaId, existing.id)
        .all<{ texto: string; correta: number; ordem: number }>();
      const current = (alternatives.results || []).map((alt) => [alt.texto, Number(alt.correta) === 1]);
      const incoming = row.alternativas.map((alt) => [alt.texto, alt.correta]);
      if (JSON.stringify(current) !== JSON.stringify(incoming)) {
        errors.push(
          dbConflict(
            row.linha,
            'alternativa_a',
            'A questão já existe com alternativas diferentes. Use nova variante ou revise manualmente.',
          ),
        );
      }
    }
  }

  return errors;
}

async function insertLineage(params: {
  db: D1Database;
  empresaId: number;
  importacaoId: number;
  linha: number;
  entidade: 'FONTE' | 'TOPICO' | 'ITEM' | 'QUESTAO' | 'ALTERNATIVA';
  registroId: number | null;
  acao: 'INSERIDO' | 'IGNORADO';
  chave: string;
}) {
  await params.db
    .prepare(
      'INSERT INTO conhecimento_ativo_importacao_registros ' +
        '(empresa_id,importacao_id,linha_numero,entidade,registro_id,acao,chave_natural) ' +
        'VALUES (?,?,?,?,?,?,?)',
    )
    .bind(
      params.empresaId,
      params.importacaoId,
      params.linha,
      params.entidade,
      params.registroId,
      params.acao,
      params.chave,
    )
    .run();
}

export async function aplicarImportacaoConhecimento(params: {
  env: Env;
  empresaId: number;
  userId: number;
  arquivoNome: string;
  arquivoSha256: string;
  rows: ConhecimentoImportRow[];
}): Promise<ConhecimentoImportApplyResult> {
  const { env, empresaId, userId, arquivoNome, arquivoSha256, rows } = params;
  const db = env.DB;

  const importRow = await db
    .prepare(
      'INSERT INTO conhecimento_ativo_importacoes ' +
        '(empresa_id,arquivo_nome,arquivo_sha256,template_versao,status,total_linhas,total_erros,criado_por_usuario_id) ' +
        "VALUES (?,?,?,?, 'APLICANDO', ?,0,?) RETURNING id",
    )
    .bind(
      empresaId,
      arquivoNome,
      arquivoSha256,
      CONHECIMENTO_ATIVO_TEMPLATE_VERSION,
      rows.length,
      userId,
    )
    .first<{ id: number }>();
  if (!importRow?.id) throw new Error('Não foi possível registrar o lote de importação.');

  const inserted = { fontes: 0, topicos: 0, itens: 0, questoes: 0, alternativas: 0 };
  const ignored = { fontes: 0, topicos: 0, itens: 0, questoes: 0 };

  const sourceIds = new Map<string, number>();
  const topicIds = new Map<string, number>();
  const itemIds = new Map<string, number>();
  const questionIds = new Map<string, number>();

  try {
    for (const row of rows) {
      const skey = sourceKey(row);
      let sourceId = sourceIds.get(skey);
      if (!sourceId) {
        const existing = await db
          .prepare(
            'SELECT id FROM conhecimento_ativo_fontes ' +
              'WHERE empresa_id=? AND tipo_documento=? AND titulo=? AND revisao=? ' +
              "AND COALESCE(aeronave_modelo,'')=? AND deleted_at IS NULL LIMIT 1",
          )
          .bind(
            empresaId,
            row.fonteTipo,
            row.fonteTitulo,
            row.fonteRevisao,
            row.aeronaveModelo || '',
          )
          .first<{ id: number }>();
        if (existing) {
          sourceId = existing.id;
          ignored.fontes += 1;
          await insertLineage({
            db, empresaId, importacaoId: importRow.id, linha: row.linha, entidade: 'FONTE',
            registroId: sourceId, acao: 'IGNORADO', chave: skey,
          });
        } else {
          const created = await db
            .prepare(
              'INSERT INTO conhecimento_ativo_fontes ' +
                '(empresa_id,tipo_documento,titulo,aeronave_modelo,revisao,data_revisao,status) ' +
                "VALUES (?,?,?,?,?,?,'RASCUNHO') RETURNING id",
            )
            .bind(
              empresaId,
              row.fonteTipo,
              row.fonteTitulo,
              row.aeronaveModelo,
              row.fonteRevisao,
              row.fonteDataRevisao,
            )
            .first<{ id: number }>();
          if (!created?.id) throw new Error('Falha ao criar fonte técnica importada.');
          sourceId = created.id;
          inserted.fontes += 1;
          await insertLineage({
            db, empresaId, importacaoId: importRow.id, linha: row.linha, entidade: 'FONTE',
            registroId: sourceId, acao: 'INSERIDO', chave: skey,
          });
        }
        sourceIds.set(skey, sourceId);
      }

      const tkey = topicKey(row);
      let topicId = topicIds.get(tkey);
      if (!topicId) {
        const existing = await db
          .prepare(
            'SELECT id FROM conhecimento_ativo_topicos WHERE empresa_id=? AND codigo=? AND deleted_at IS NULL LIMIT 1',
          )
          .bind(empresaId, row.topicoCodigo)
          .first<{ id: number }>();
        if (existing) {
          topicId = existing.id;
          ignored.topicos += 1;
          await insertLineage({
            db, empresaId, importacaoId: importRow.id, linha: row.linha, entidade: 'TOPICO',
            registroId: topicId, acao: 'IGNORADO', chave: tkey,
          });
        } else {
          const created = await db
            .prepare(
              'INSERT INTO conhecimento_ativo_topicos ' +
                '(empresa_id,codigo,nome,aeronave_modelo,ordem) VALUES (?,?,?,?,0) RETURNING id',
            )
            .bind(empresaId, row.topicoCodigo, row.topicoNome, row.aeronaveModelo)
            .first<{ id: number }>();
          if (!created?.id) throw new Error('Falha ao criar tópico importado.');
          topicId = created.id;
          inserted.topicos += 1;
          await insertLineage({
            db, empresaId, importacaoId: importRow.id, linha: row.linha, entidade: 'TOPICO',
            registroId: topicId, acao: 'INSERIDO', chave: tkey,
          });
        }
        topicIds.set(tkey, topicId);
      }

      const ikey = itemKey(row);
      let itemId = itemIds.get(ikey);
      if (!itemId) {
        const existing = await db
          .prepare(
            'SELECT id FROM conhecimento_ativo_itens WHERE empresa_id=? AND codigo=? AND deleted_at IS NULL LIMIT 1',
          )
          .bind(empresaId, row.itemCodigo)
          .first<{ id: number }>();
        if (existing) {
          itemId = existing.id;
          ignored.itens += 1;
          await insertLineage({
            db, empresaId, importacaoId: importRow.id, linha: row.linha, entidade: 'ITEM',
            registroId: itemId, acao: 'IGNORADO', chave: ikey,
          });
        } else {
          const created = await db
            .prepare(
              'INSERT INTO conhecimento_ativo_itens ' +
                '(empresa_id,topico_id,codigo,aeronave_modelo,titulo,conceito,resumo_essencial,criticidade,tempo_estudo_segundos,status) ' +
                "VALUES (?,?,?,?,?,?,?,?,?,'EM_REVISAO') RETURNING id",
            )
            .bind(
              empresaId,
              topicId,
              row.itemCodigo,
              row.aeronaveModelo,
              row.itemTitulo,
              row.itemConceito,
              row.itemResumoEssencial,
              row.criticidade,
              row.tempoEstudoSegundos,
            )
            .first<{ id: number }>();
          if (!created?.id) throw new Error('Falha ao criar item importado.');
          itemId = created.id;
          inserted.itens += 1;
          await insertLineage({
            db, empresaId, importacaoId: importRow.id, linha: row.linha, entidade: 'ITEM',
            registroId: itemId, acao: 'INSERIDO', chave: ikey,
          });
        }
        itemIds.set(ikey, itemId);
      }

      await db
        .prepare(
          'INSERT OR IGNORE INTO conhecimento_ativo_item_fontes ' +
            '(empresa_id,item_id,fonte_id,secao,pagina,referencia,principal) VALUES (?,?,?,?,?,?,1)',
        )
        .bind(
          empresaId,
          itemId,
          sourceId,
          row.fonteSecao,
          row.fontePagina,
          row.fonteReferencia,
        )
        .run();

      const qkey = questionKey(row);
      let questionId = questionIds.get(qkey);
      if (!questionId) {
        const existing = await db
          .prepare(
            'SELECT q.id FROM conhecimento_ativo_questoes q ' +
              'JOIN conhecimento_ativo_itens i ON i.id=q.item_id AND i.empresa_id=q.empresa_id ' +
              'WHERE q.empresa_id=? AND i.codigo=? AND q.variante_chave=? AND q.deleted_at IS NULL LIMIT 1',
          )
          .bind(empresaId, row.itemCodigo, row.questaoVariante)
          .first<{ id: number }>();
        if (existing) {
          questionId = existing.id;
          ignored.questoes += 1;
          await insertLineage({
            db, empresaId, importacaoId: importRow.id, linha: row.linha, entidade: 'QUESTAO',
            registroId: questionId, acao: 'IGNORADO', chave: qkey,
          });
        } else {
          const created = await db
            .prepare(
              'INSERT INTO conhecimento_ativo_questoes ' +
                '(empresa_id,item_id,variante_chave,tipo,enunciado,explicacao,o_que_guardar,dificuldade,status) ' +
                "VALUES (?,?,?,?,?,?,?,?,'EM_REVISAO') RETURNING id",
            )
            .bind(
              empresaId,
              itemId,
              row.questaoVariante,
              row.questaoTipo,
              row.questaoEnunciado,
              row.questaoExplicacao,
              row.questaoOQueGuardar,
              row.dificuldade,
            )
            .first<{ id: number }>();
          if (!created?.id) throw new Error('Falha ao criar questão importada.');
          questionId = created.id;
          inserted.questoes += 1;
          await insertLineage({
            db, empresaId, importacaoId: importRow.id, linha: row.linha, entidade: 'QUESTAO',
            registroId: questionId, acao: 'INSERIDO', chave: qkey,
          });

          for (const alternative of row.alternativas) {
            const alt = await db
              .prepare(
                'INSERT INTO conhecimento_ativo_alternativas ' +
                  '(empresa_id,questao_id,texto,correta,ordem) VALUES (?,?,?,?,?) RETURNING id',
              )
              .bind(
                empresaId,
                questionId,
                alternative.texto,
                alternative.correta ? 1 : 0,
                alternative.ordem,
              )
              .first<{ id: number }>();
            if (!alt?.id) throw new Error('Falha ao criar alternativa importada.');
            inserted.alternativas += 1;
            await insertLineage({
              db,
              empresaId,
              importacaoId: importRow.id,
              linha: row.linha,
              entidade: 'ALTERNATIVA',
              registroId: alt.id,
              acao: 'INSERIDO',
              chave: qkey + '|' + alternative.letra,
            });
          }
        }
        questionIds.set(qkey, questionId);
      }
    }

    const totalInserted =
      inserted.fontes + inserted.topicos + inserted.itens + inserted.questoes + inserted.alternativas;
    const totalIgnored = ignored.fontes + ignored.topicos + ignored.itens + ignored.questoes;
    await db
      .prepare(
        "UPDATE conhecimento_ativo_importacoes SET status='APLICADO',total_inseridos=?,total_ignorados=?, " +
          "resumo_json=?,aplicado_em=datetime('now') WHERE id=? AND empresa_id=?",
      )
      .bind(totalInserted, totalIgnored, JSON.stringify({ inserted, ignored }), importRow.id, empresaId)
      .run();

    return {
      importacaoId: importRow.id,
      totalRows: rows.length,
      inserted,
      ignored,
    };
  } catch (error) {
    await db
      .prepare(
        "UPDATE conhecimento_ativo_importacoes SET status='FALHOU',erro=? WHERE id=? AND empresa_id=?",
      )
      .bind(
        error instanceof Error ? error.message.slice(0, 500) : 'Falha desconhecida',
        importRow.id,
        empresaId,
      )
      .run();
    throw error;
  }
}
