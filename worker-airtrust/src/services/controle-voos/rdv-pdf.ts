/**
 * Gerador do "Relatório de Voo" (RDV) no layout de referência do contrato
 * Petrobras. Usa pdf-lib (A4 paisagem). Totais já vêm calculados do backend —
 * este módulo apenas apresenta os dados, nunca recalcula.
 *
 * Layout: quebra automática de texto, altura dinâmica de células, paginação
 * por espaço vertical (não só por contagem de trechos), páginas de
 * continuação para tripulação / abastecimentos / aprovações / observações,
 * cabeçalho+rodapé+marca d'água em todas as páginas.
 *
 * Nesta entrega (N1, dados fictícios, sem homologação ANAC), toda saída
 * carrega marca d'água "TESTE — NÃO ENVIAR À PETROBRAS" em todas as
 * páginas. Não há flag para suprimi-la. Registros de confirmação/aprovação
 * NÃO constituem assinatura digital.
 */

import { PDFDocument, rgb, StandardFonts, PDFPage, PDFFont, degrees } from 'pdf-lib';

export interface RelatorioPetrobrasEtapa {
  numero_etapa: number;
  origem_icao: string | null;
  destino_icao: string | null;
  horario_motor_ligado: string | null;
  horario_decolagem: string | null;
  horario_pouso: string | null;
  horario_motor_desligado: string | null;
  tempo_decolagem_pouso: string | null;
  tempo_total: string | null;
  pousos_diurnos: number | null;
  pousos_noturnos: number | null;
  pax: number | null;
  payload: number | null;
  combustivel_inicio: number | null;
  combustivel_fim: number | null;
}

export interface RelatorioPetrobrasTripulante {
  nome: string;
  codigo_anac: string | null;
  funcao: string;
}

export interface RelatorioPetrobrasAbastecimento {
  fornecedor: string | null;
  localidade: string | null;
  combustivel_abastecido: number | null;
  unidade: string;
  numero_ce: string | null;
  data_hora: string;
}

export interface RelatorioPetrobrasAprovacao {
  tipo_aprovacao: string;
  status: string;
  created_at: string;
}

export interface RelatorioPetrobrasData {
  empresa_nome: string;
  base: string | null;
  contrato: string | null;
  cliente: string | null;
  data_voo: string;
  prefixo: string;
  modelo_aeronave: string | null;
  numero_voo: string | null;
  numero_relatorio: string;
  numero_sap: string | null;
  tripulantes: RelatorioPetrobrasTripulante[];
  etapas: RelatorioPetrobrasEtapa[];
  abastecimentos: RelatorioPetrobrasAbastecimento[];
  totais: {
    horas_voadas: number | null;
    numero_pousos: number | null;
    ciclos: number | null;
    combustivel_decolagem: number | null;
    combustivel_pouso: number | null;
    combustivel_consumo: number | null;
    pob: number | null;
    carga_kg: number | null;
  };
  ocorrencias: string | null;
  divergencias: string | null;
  aprovacoes: RelatorioPetrobrasAprovacao[];
  status_workflow: string;
  versao: number;
  gerado_em: string;
  identificador_interno: string;
  hash_integridade: string;
}

/** Texto da marca d'água — exportado para asserts em testes. */
export const RDV_PDF_WATERMARK_TEXT = 'TESTE — NÃO ENVIAR À PETROBRAS';

const COLORS = {
  primary: rgb(0, 0.23, 0.44),
  textMain: rgb(0.13, 0.13, 0.13),
  textMuted: rgb(0.4, 0.4, 0.4),
  borderSoft: rgb(0.83, 0.86, 0.9),
  bgSoft: rgb(0.96, 0.97, 0.98),
  watermark: rgb(0.82, 0.15, 0.15),
  white: rgb(1, 1, 1),
};

const PAGE_SIZE: [number, number] = [841.89, 595.28]; // A4 landscape
const MARGIN = 32;
const HEADER_BAND = 64;
const META_BLOCK = 40;
/** Y máximo do conteúdo (abaixo do bloco de metadados do voo). */
const CONTENT_TOP = PAGE_SIZE[1] - HEADER_BAND - META_BLOCK - 24;
/** Y mínimo do conteúdo (acima do rodapé). */
const CONTENT_BOTTOM = MARGIN + 36;
const CELL_PAD_X = 3;
const CELL_PAD_Y = 4;
const LINE_GAP = 2;
const SECTION_TITLE_SIZE = 9;
const SECTION_TITLE_GAP = 14;
const TABLE_FONT_SIZE = 7.5;
const TABLE_HEADER_MIN_H = 16;
const BODY_FONT_SIZE = 8;
const SECTION_GAP = 18;

type PlannedBlock =
  | { kind: 'section_title'; text: string }
  | { kind: 'table_header'; headers: string[]; colWidths: number[] }
  | {
      kind: 'table_row';
      cells: string[][];
      colWidths: number[];
      height: number;
    }
  | { kind: 'paragraph'; lines: string[]; height: number }
  | { kind: 'spacer'; height: number };

type PlannedPage = { blocks: PlannedBlock[] };

function fmtNum(value: number | null | undefined): string {
  return value === null || value === undefined ? '-' : String(value);
}

/**
 * Quebra texto em linhas que cabem em `maxWidth` (medida real com a fonte).
 * Preserva quebras de parágrafo (`\n`). Palavras longas demais são partidas
 * caractere a caractere — nunca trunca com `.slice`.
 */
export function wrapText(text: string, font: PDFFont, size: number, maxWidth: number): string[] {
  const safe = String(text ?? '');
  if (!safe.trim()) return ['-'];
  const paragraphs = safe.split(/\r?\n/);
  const lines: string[] = [];

  for (const paragraph of paragraphs) {
    const words = paragraph.split(/\s+/).filter(Boolean);
    if (!words.length) {
      lines.push('');
      continue;
    }

    let current = '';
    for (const word of words) {
      const candidate = current ? `${current} ${word}` : word;
      if (font.widthOfTextAtSize(candidate, size) <= maxWidth) {
        current = candidate;
        continue;
      }
      if (current) lines.push(current);
      if (font.widthOfTextAtSize(word, size) <= maxWidth) {
        current = word;
        continue;
      }
      // Palavra maior que a coluna: partir por caractere.
      let chunk = '';
      for (const ch of word) {
        const next = chunk + ch;
        if (font.widthOfTextAtSize(next, size) <= maxWidth) {
          chunk = next;
        } else {
          if (chunk) lines.push(chunk);
          chunk = ch;
        }
      }
      current = chunk;
    }
    if (current) lines.push(current);
  }

  return lines.length ? lines : ['-'];
}

function linesHeight(lineCount: number, fontSize: number): number {
  return Math.max(
    TABLE_HEADER_MIN_H,
    CELL_PAD_Y * 2 + lineCount * fontSize + Math.max(0, lineCount - 1) * LINE_GAP,
  );
}

/**
 * Rótulo legível do registro de workflow — confirmação vs aprovação.
 * Nunca usa a expressão "assinatura digital".
 */
export function labelAprovacaoTipo(tipo: string): string {
  const key = String(tipo || '')
    .trim()
    .toUpperCase();
  switch (key) {
    case 'COMANDANTE':
      return 'Confirmação do COMANDANTE';
    case 'COORDENACAO':
      return 'Aprovação da COORDENAÇÃO';
    case 'COMERCIAL':
      return 'Aprovação COMERCIAL';
    case 'CONTRATANTE':
      return 'Aprovação do CONTRATANTE';
    default:
      return `Registro: ${tipo || '-'}`;
  }
}

function measureTableRow(
  cells: string[],
  colWidths: number[],
  font: PDFFont,
  fontSize: number,
): { wrapped: string[][]; height: number } {
  const wrapped = cells.map((cell, i) =>
    wrapText(cell || '-', font, fontSize, Math.max(8, colWidths[i] - CELL_PAD_X * 2)),
  );
  const maxLines = Math.max(1, ...wrapped.map((l) => l.length));
  return { wrapped, height: linesHeight(maxLines, fontSize) };
}

function blockHeight(block: PlannedBlock): number {
  switch (block.kind) {
    case 'section_title':
      return SECTION_TITLE_GAP;
    case 'table_header':
      return TABLE_HEADER_MIN_H;
    case 'table_row':
      return block.height;
    case 'paragraph':
      return block.height;
    case 'spacer':
      return block.height;
    default:
      return 0;
  }
}

function pushBlock(pages: PlannedPage[], block: PlannedBlock, yRef: { y: number }): void {
  const h = blockHeight(block);
  if (yRef.y - h < CONTENT_BOTTOM) {
    pages.push({ blocks: [] });
    yRef.y = CONTENT_TOP;
  }
  pages[pages.length - 1].blocks.push(block);
  yRef.y -= h;
}

function ensureSectionTitle(
  pages: PlannedPage[],
  yRef: { y: number },
  title: string,
  continuation: boolean,
  minBodyHeight: number,
): void {
  const titleH = SECTION_TITLE_GAP;
  const needed = titleH + minBodyHeight;
  if (yRef.y - needed < CONTENT_BOTTOM) {
    pages.push({ blocks: [] });
    yRef.y = CONTENT_TOP;
  }
  const label = continuation ? `${title} (continuação)` : title;
  pushBlock(pages, { kind: 'section_title', text: label }, yRef);
}

function planWrappedTable(
  pages: PlannedPage[],
  yRef: { y: number },
  title: string,
  headers: string[],
  rows: string[][],
  colWidths: number[],
  font: PDFFont,
): void {
  if (rows.length === 0) {
    ensureSectionTitle(pages, yRef, title, false, TABLE_HEADER_MIN_H);
    pushBlock(pages, { kind: 'table_header', headers, colWidths }, yRef);
    const empty = measureTableRow(
      headers.map(() => '-'),
      colWidths,
      font,
      TABLE_FONT_SIZE,
    );
    pushBlock(
      pages,
      { kind: 'table_row', cells: empty.wrapped, colWidths, height: empty.height },
      yRef,
    );
    return;
  }

  let started = false;
  let continuation = false;

  for (const row of rows) {
    const measured = measureTableRow(row, colWidths, font, TABLE_FONT_SIZE);
    const headerH = TABLE_HEADER_MIN_H;
    const titleH = SECTION_TITLE_GAP;

    if (!started) {
      ensureSectionTitle(pages, yRef, title, false, headerH + measured.height);
      pushBlock(pages, { kind: 'table_header', headers, colWidths }, yRef);
      started = true;
    } else if (yRef.y - measured.height < CONTENT_BOTTOM) {
      pages.push({ blocks: [] });
      yRef.y = CONTENT_TOP;
      continuation = true;
      ensureSectionTitle(pages, yRef, title, continuation, headerH + measured.height);
      pushBlock(pages, { kind: 'table_header', headers, colWidths }, yRef);
    }

    // Se a linha sozinha ainda não couber (texto muito longo), forçar nova
    // página e repetir cabeçalho — a linha pode ocupar quase a página inteira.
    if (yRef.y - measured.height < CONTENT_BOTTOM) {
      pages.push({ blocks: [] });
      yRef.y = CONTENT_TOP;
      ensureSectionTitle(
        pages,
        yRef,
        title,
        true,
        headerH + Math.min(measured.height, CONTENT_TOP - CONTENT_BOTTOM - titleH),
      );
      pushBlock(pages, { kind: 'table_header', headers, colWidths }, yRef);
    }

    pushBlock(
      pages,
      { kind: 'table_row', cells: measured.wrapped, colWidths, height: measured.height },
      yRef,
    );
  }
}

function planParagraphSection(
  pages: PlannedPage[],
  yRef: { y: number },
  title: string,
  paragraphs: string[],
  font: PDFFont,
  contentWidth: number,
): void {
  const allLines: string[] = [];
  for (const p of paragraphs) {
    const wrapped = wrapText(p, font, BODY_FONT_SIZE, contentWidth);
    allLines.push(...wrapped);
    allLines.push(''); // espaçamento entre blocos
  }
  while (allLines.length && allLines[allLines.length - 1] === '') allLines.pop();
  if (!allLines.length) return;

  const lineH = BODY_FONT_SIZE + LINE_GAP;
  /** Mínimo de linhas de corpo junto do título — evita título órfão no rodapé. */
  const minBodyLines = 3;
  let idx = 0;
  let continuation = false;

  while (idx < allLines.length) {
    const minNeeded = SECTION_TITLE_GAP + minBodyLines * lineH + CELL_PAD_Y;
    if (yRef.y - minNeeded < CONTENT_BOTTOM) {
      pages.push({ blocks: [] });
      yRef.y = CONTENT_TOP;
    }

    ensureSectionTitle(pages, yRef, title, continuation, minBodyLines * lineH + CELL_PAD_Y);
    continuation = true;

    // Dimensiona o chunk para caber na página atual — NÃO usar pushBlock aqui,
    // senão o parágrafo pode migrar sozinho e deixar o título órfão.
    const usable = Math.max(lineH, yRef.y - CONTENT_BOTTOM - CELL_PAD_Y);
    const maxLines = Math.max(1, Math.floor(usable / lineH));
    const chunk = allLines.slice(idx, idx + maxLines);
    idx += chunk.length;
    if (!chunk.length) break;
    const height = chunk.length * lineH + CELL_PAD_Y;
    pages[pages.length - 1].blocks.push({
      kind: 'paragraph',
      lines: chunk,
      height,
    });
    yRef.y -= height;
  }
}

function planDocument(data: RelatorioPetrobrasData, fontRegular: PDFFont): PlannedPage[] {
  const pages: PlannedPage[] = [{ blocks: [] }];
  const yRef = { y: CONTENT_TOP };
  const contentWidth = PAGE_SIZE[0] - MARGIN * 2;

  // Tripulação
  planWrappedTable(
    pages,
    yRef,
    'TRIPULAÇÃO',
    ['Nome', 'Código ANAC', 'Função'],
    data.tripulantes.map((t) => [t.nome, t.codigo_anac || '-', t.funcao]),
    [360, 160, 120],
    fontRegular,
  );
  pushBlock(pages, { kind: 'spacer', height: SECTION_GAP }, yRef);

  // Trechos
  planWrappedTable(
    pages,
    yRef,
    'TRECHOS',
    [
      '#',
      'Origem',
      'Destino',
      'Decolagem',
      'Pouso',
      'Tempo total',
      'Pax',
      'Carga',
      'Comb. ini',
      'Comb. fim',
    ],
    data.etapas.map((e) => [
      String(e.numero_etapa),
      e.origem_icao || '-',
      e.destino_icao || '-',
      e.horario_decolagem || '-',
      e.horario_pouso || '-',
      e.tempo_total || '-',
      fmtNum(e.pax),
      fmtNum(e.payload),
      fmtNum(e.combustivel_inicio),
      fmtNum(e.combustivel_fim),
    ]),
    [28, 68, 68, 78, 78, 78, 40, 58, 68, 68],
    fontRegular,
  );
  pushBlock(pages, { kind: 'spacer', height: SECTION_GAP }, yRef);

  // Totais (vindos da API — sem recalcular)
  const totals = data.totais;
  const totalsLines = wrapText(
    [
      `Horas voadas: ${fmtNum(totals.horas_voadas)}`,
      `Pousos: ${fmtNum(totals.numero_pousos)}`,
      `Ciclos: ${fmtNum(totals.ciclos)}`,
      `Comb. decolagem: ${fmtNum(totals.combustivel_decolagem)}`,
      `Comb. pouso: ${fmtNum(totals.combustivel_pouso)}`,
      `Consumo: ${fmtNum(totals.combustivel_consumo)}`,
      `POB: ${fmtNum(totals.pob)}`,
      `Carga (kg): ${fmtNum(totals.carga_kg)}`,
    ].join('   ·   '),
    fontRegular,
    BODY_FONT_SIZE,
    contentWidth,
  );
  ensureSectionTitle(
    pages,
    yRef,
    'TOTAIS (calculados pelo backend)',
    false,
    linesHeight(totalsLines.length, BODY_FONT_SIZE),
  );
  pushBlock(
    pages,
    {
      kind: 'paragraph',
      lines: totalsLines,
      height: linesHeight(totalsLines.length, BODY_FONT_SIZE),
    },
    yRef,
  );
  pushBlock(pages, { kind: 'spacer', height: SECTION_GAP }, yRef);

  // Abastecimentos
  if (data.abastecimentos.length > 0) {
    planWrappedTable(
      pages,
      yRef,
      'ABASTECIMENTOS',
      ['Data/hora', 'Fornecedor', 'Localidade', 'Qtd', 'Unid.', 'Nº CE'],
      data.abastecimentos.map((a) => [
        a.data_hora,
        a.fornecedor || '-',
        a.localidade || '-',
        fmtNum(a.combustivel_abastecido),
        a.unidade,
        a.numero_ce || '-',
      ]),
      [120, 180, 160, 60, 50, 90],
      fontRegular,
    );
    pushBlock(pages, { kind: 'spacer', height: SECTION_GAP }, yRef);
  }

  // Observações / ocorrências — sem truncar
  const obsParagraphs: string[] = [];
  if (data.ocorrencias) obsParagraphs.push(`Ocorrências: ${data.ocorrencias}`);
  if (data.divergencias) obsParagraphs.push(`Divergências: ${data.divergencias}`);
  if (obsParagraphs.length) {
    planParagraphSection(
      pages,
      yRef,
      'OBSERVAÇÕES / OCORRÊNCIAS',
      obsParagraphs,
      fontRegular,
      contentWidth,
    );
    pushBlock(pages, { kind: 'spacer', height: SECTION_GAP }, yRef);
  }

  // Aprovações / confirmações — rótulos distintos, sem "assinatura digital"
  planWrappedTable(
    pages,
    yRef,
    'REGISTROS DE CONFIRMAÇÃO E APROVAÇÃO (interno AirTrust)',
    ['Tipo de registro', 'Status', 'Data'],
    data.aprovacoes.map((a) => [labelAprovacaoTipo(a.tipo_aprovacao), a.status, a.created_at]),
    [320, 180, 160],
    fontRegular,
  );

  // Remover páginas vazias (só spacer) se alguma sobrar no fim
  return pages.filter((p, i) => i === 0 || p.blocks.some((b) => b.kind !== 'spacer'));
}

function drawWatermark(page: PDFPage, font: PDFFont) {
  const { width, height } = page.getSize();
  const text = RDV_PDF_WATERMARK_TEXT;
  const fontSize = 28;
  page.drawText(text, {
    x: width / 2 - (font.widthOfTextAtSize(text, fontSize) / 2) * Math.SQRT1_2 - 40,
    y: height / 2,
    size: fontSize,
    font,
    color: COLORS.watermark,
    opacity: 0.28,
    rotate: degrees(30),
  });
}

function drawHeader(
  page: PDFPage,
  fontBold: PDFFont,
  fontRegular: PDFFont,
  data: RelatorioPetrobrasData,
  pageNumber: number,
  totalPages: number,
) {
  const { width, height } = page.getSize();

  page.drawRectangle({
    x: 0,
    y: height - HEADER_BAND,
    width,
    height: HEADER_BAND,
    color: COLORS.primary,
  });
  page.drawText('RELATÓRIO DE VOO (RDV) — REFERÊNCIA CONTRATUAL PETROBRAS', {
    x: MARGIN,
    y: height - 30,
    size: 13,
    font: fontBold,
    color: COLORS.white,
  });
  const subtitle = `${data.empresa_nome}  |  Base: ${data.base || '-'}  |  Contrato: ${data.contrato || '-'}  |  Cliente: ${data.cliente || '-'}`;
  const subtitleLines = wrapText(subtitle, fontRegular, 9, width - MARGIN * 2 - 80);
  page.drawText(subtitleLines[0], {
    x: MARGIN,
    y: height - 48,
    size: 9,
    font: fontRegular,
    color: COLORS.white,
  });

  const y = height - HEADER_BAND - 20;
  const fields = [
    ['Data do voo', data.data_voo],
    ['Prefixo', data.prefixo],
    ['Modelo', data.modelo_aeronave || '-'],
    ['Nº voo', data.numero_voo || '-'],
    ['Nº relatório', data.numero_relatorio],
    ['Nº SAP', data.numero_sap || '-'],
  ];
  const colWidth = (width - MARGIN * 2) / fields.length;
  fields.forEach(([label, value], index) => {
    const x = MARGIN + index * colWidth;
    page.drawText(String(label), { x, y, size: 8, font: fontRegular, color: COLORS.textMuted });
    const valueLines = wrapText(String(value), fontBold, 10, colWidth - 4);
    page.drawText(valueLines[0], {
      x,
      y: y - 13,
      size: 10,
      font: fontBold,
      color: COLORS.textMain,
    });
  });

  page.drawText(`Página ${pageNumber} de ${totalPages}`, {
    x: width - MARGIN - 70,
    y: MARGIN - 8,
    size: 8,
    font: fontRegular,
    color: COLORS.textMuted,
  });
}

function drawFooter(page: PDFPage, fontRegular: PDFFont, data: RelatorioPetrobrasData) {
  const { width } = page.getSize();
  page.drawLine({
    start: { x: MARGIN, y: MARGIN + 18 },
    end: { x: width - MARGIN, y: MARGIN + 18 },
    thickness: 0.5,
    color: COLORS.borderSoft,
  });
  const footerMain = `Versão ${data.versao} · Gerado em ${data.gerado_em} · ID interno ${data.identificador_interno} · Integridade ${data.hash_integridade.slice(0, 16)}`;
  const footerMainLines = wrapText(footerMain, fontRegular, 7, width - MARGIN * 2);
  page.drawText(footerMainLines[0], {
    x: MARGIN,
    y: MARGIN + 4,
    size: 7,
    font: fontRegular,
    color: COLORS.textMuted,
  });
  const disclaimer =
    'Documento interno de operação AirTrust. Registros de confirmação/aprovação não constituem assinatura digital, validação ou homologação regulatória.';
  const disclaimerLines = wrapText(disclaimer, fontRegular, 6.5, width - MARGIN * 2);
  page.drawText(disclaimerLines[0], {
    x: MARGIN,
    y: MARGIN - 6,
    size: 6.5,
    font: fontRegular,
    color: COLORS.textMuted,
  });
}

function drawTableHeader(
  page: PDFPage,
  fontBold: PDFFont,
  yTop: number,
  headers: string[],
  colWidths: number[],
): number {
  const h = TABLE_HEADER_MIN_H;
  let x = MARGIN;
  headers.forEach((header, i) => {
    page.drawRectangle({
      x,
      y: yTop - h,
      width: colWidths[i],
      height: h,
      color: COLORS.bgSoft,
    });
    const lines = wrapText(header, fontBold, TABLE_FONT_SIZE, colWidths[i] - CELL_PAD_X * 2);
    page.drawText(lines[0], {
      x: x + CELL_PAD_X,
      y: yTop - h + CELL_PAD_Y,
      size: TABLE_FONT_SIZE,
      font: fontBold,
      color: COLORS.textMain,
    });
    x += colWidths[i];
  });
  return yTop - h;
}

function drawTableRow(
  page: PDFPage,
  fontRegular: PDFFont,
  yTop: number,
  cells: string[][],
  colWidths: number[],
  rowHeight: number,
): number {
  let x = MARGIN;
  cells.forEach((lines, i) => {
    let textY = yTop - CELL_PAD_Y - TABLE_FONT_SIZE;
    for (const line of lines) {
      page.drawText(line, {
        x: x + CELL_PAD_X,
        y: textY,
        size: TABLE_FONT_SIZE,
        font: fontRegular,
        color: COLORS.textMain,
      });
      textY -= TABLE_FONT_SIZE + LINE_GAP;
    }
    x += colWidths[i];
  });
  const tableWidth = colWidths.reduce((a, b) => a + b, 0);
  page.drawLine({
    start: { x: MARGIN, y: yTop - rowHeight },
    end: { x: MARGIN + tableWidth, y: yTop - rowHeight },
    thickness: 0.4,
    color: COLORS.borderSoft,
  });
  return yTop - rowHeight;
}

function renderPlannedPage(
  page: PDFPage,
  fontBold: PDFFont,
  fontRegular: PDFFont,
  data: RelatorioPetrobrasData,
  planned: PlannedPage,
  pageNumber: number,
  totalPages: number,
) {
  drawWatermark(page, fontBold);
  drawHeader(page, fontBold, fontRegular, data, pageNumber, totalPages);

  let y = CONTENT_TOP;
  for (const block of planned.blocks) {
    switch (block.kind) {
      case 'section_title':
        page.drawText(block.text, {
          x: MARGIN,
          y: y - SECTION_TITLE_SIZE,
          size: SECTION_TITLE_SIZE,
          font: fontBold,
          color: COLORS.primary,
        });
        y -= SECTION_TITLE_GAP;
        break;
      case 'table_header':
        y = drawTableHeader(page, fontBold, y, block.headers, block.colWidths);
        break;
      case 'table_row':
        y = drawTableRow(page, fontRegular, y, block.cells, block.colWidths, block.height);
        break;
      case 'paragraph': {
        let textY = y - BODY_FONT_SIZE;
        for (const line of block.lines) {
          if (line) {
            page.drawText(line, {
              x: MARGIN,
              y: textY,
              size: BODY_FONT_SIZE,
              font: fontRegular,
              color: COLORS.textMain,
            });
          }
          textY -= BODY_FONT_SIZE + LINE_GAP;
        }
        y -= block.height;
        break;
      }
      case 'spacer':
        y -= block.height;
        break;
    }
  }

  drawFooter(page, fontRegular, data);
}

export async function gerarRelatorioPetrobrasPdf(
  data: RelatorioPetrobrasData,
): Promise<Uint8Array> {
  const pdfDoc = await PDFDocument.create();
  const fontBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
  const fontRegular = await pdfDoc.embedFont(StandardFonts.Helvetica);

  const planned = planDocument(data, fontRegular);
  const totalPages = Math.max(1, planned.length);

  for (let i = 0; i < totalPages; i += 1) {
    const page = pdfDoc.addPage(PAGE_SIZE);
    renderPlannedPage(
      page,
      fontBold,
      fontRegular,
      data,
      planned[i] || { blocks: [] },
      i + 1,
      totalPages,
    );
  }

  return pdfDoc.save();
}

export async function computeIntegrityHash(payload: unknown): Promise<string> {
  const encoder = new TextEncoder();
  const bytes = encoder.encode(JSON.stringify(payload));
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}
