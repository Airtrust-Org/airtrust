/**
 * SERVICE: Geração de PDF da Ficha de Treinamento
 * Stack: pdf-lib + TypeScript
 * Output: PDF A4 compatível com Cloudflare Workers
 * Arquivo: worker-airtrust/src/services/pdf-ficha.service.ts
 *
 * ESCOPO: gera PDF apenas de fichas REAIS/preenchidas (linha existente em
 * fichas_sessao, com aluno e instrutor), acionado pela rota
 * POST /fichas/:id/pdf em worker-airtrust/src/routes/simuladores-fichas.ts.
 * NUNCA usado para ficha-modelo em branco — o modelo em branco (18
 * técnicas + 15 NOTECHS) é gerado exclusivamente no cliente por
 * gerarPDFFichaCliente() em src/react-app/services/pdf-ficha-client.ts.
 *
 * Mantém compat de template por data de criação da ficha: registros
 * criados antes de 2026-07-01 preservam o layout legado (com régua de
 * avaliação); a partir dessa data usam o layout V6.2 (sem régua). Isso é
 * compatibilidade de fichas históricas reais, não um "gerador antigo"
 * concorrente do renderer V6.2 client-side.
 */

import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from 'pdf-lib';
import {
  getExaminerEventSessionDefinition,
  splitExaminerTechnicalBlocks,
} from '../../../src/shared/simuladores/examiner-event-sessions';

// ── Sanitização de metadados internos (mesma lógica de src/shared/simuladores/modelos-sessao-observacoes.ts) ──
const INTERNAL_METADATA_LEAK_RE = new RegExp(
  [
    'tipo_item\\s*=',
    'fase_voo\\s*=',
    'carater\\s*=',
    'fap_refs\\s*=',
    'matriz_v6_modelo\\s*=',
    'sourceNotes',
    'source_notes',
    '\\bprompt\\b',
    '\\bdebug\\b',
    '\\brbac\\b',
    '\\brole\\b',
    '\\btenant\\b',
    '\\bmigration\\b',
    '\\bseed\\b',
    '\\bfixture\\b',
    '\\bbanco\\b',
    '\\bbd\\b',
    'empresa_id',
    '\\bauth\\b',
    '\\bjwt\\b',
    '\\btoken\\b',
    'auditoria\\s+interna',
    'bastidor(?:es)?\\s+t[eé]cnico',
    'instru[cç][aã]o\\s+de\\s+agente',
    '[{}]',
    `["'](?:source|metadata|internal|audit)["']`,
  ].join('|'),
  'i',
);

function sanitizeForPdf(value: unknown): string {
  const text = String(value || '').trim();
  if (!text) return '';
  return INTERNAL_METADATA_LEAK_RE.test(text) ? '' : text;
}

const NOTECHS_CALIBRATION_WARNING =
  'Nota: os descritores NOTECHS apresentados nesta ficha são estrutura de apoio à observação comportamental e devem ser calibrados pela empresa contra sua ficha-fonte, manual de treinamento e critérios internos antes de uso avaliativo formal.';

const REGULATORY_DISCLAIMER =
  'Esta ficha é instrumento interno de treinamento e avaliação operacional da empresa. Não substitui FAP oficial, documento ANAC, homologação, aprovação ou aceite formal da ANAC. A aderência regulatória deve ser verificada contra os documentos oficiais vigentes da empresa, da ANAC e dos contratantes aplicáveis.';

interface FichaPDFData {
  fichaId: string;
  sessao_codigo?: string;
  sessao_titulo: string;
  sessao_titulo_linha1?: string;
  sessao_titulo_linha2?: string;
  tripulante_nome: string;
  tripulante_codigo_anac: string;
  tripulante_funcao: string;
  instrutor_nome: string;
  instrutor_codigo_anac: string;
  data: string;
  horario_inicio: string;
  horario_fim: string;
  simulador: string;
  carga_horaria_total: string;
  status: string;
  observacoes_gerais: string;
  assinatura_aluno_timestamp: string | null;
  assinatura_instrutor_timestamp: string | null;
  logoBytes?: Buffer;
  /** Template version: 'legacy' = pre-V6.2 (with régua), 'v6' = V6.2+ (no régua). */
  templateVersion?: 'legacy' | 'v6';
  manobras: Array<{
    ordem: number;
    descricao: string;
    codigo: string;
    resultado: number | null;
    categoria?: string | null;
    observacoes?: string | null;
    tripulante?: string | null;
  }>;
}

const PAGE = {
  width: 595.28,
  height: 841.89,
  margin: 24,
};

const COLOR = {
  primary: rgb(0.13, 0.5, 0.69),
  danger: rgb(0.75, 0.08, 0.18),
  warning: rgb(0.66, 0.29, 0.18),
  success: rgb(0.13, 0.5, 0.56),
  text: rgb(0.07, 0.26, 0.32),
  textSecondary: rgb(0.39, 0.42, 0.49),
  border: rgb(0.88, 0.89, 0.91),
  bgLight: rgb(0.96, 0.97, 0.98),
  white: rgb(1, 1, 1),
  tripA: rgb(0.86, 0.93, 0.98),
  tripB: rgb(0.98, 0.93, 0.78),
};

const NOTECHS_CATEGORIA = 'NOTECHS';

export async function gerarPDFFicha(dados: FichaPDFData): Promise<Buffer> {
  const pdfDoc = await PDFDocument.create();
  const page = pdfDoc.addPage([PAGE.width, PAGE.height]);

  const fontRegular = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const fontBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);

  let currentY = PAGE.height - PAGE.margin;
  const contentWidth = PAGE.width - PAGE.margin * 2;

  if (dados.logoBytes?.length) {
    currentY = await drawLogo(pdfDoc, page, dados.logoBytes, PAGE.margin, currentY);
  }

  drawHeader(page, fontRegular, fontBold, dados, currentY, contentWidth);
  currentY -= dados.logoBytes?.length ? 54 : 32;

  drawDivider(page, currentY);
  currentY -= 14;

  currentY = drawInfoSection(page, fontRegular, fontBold, dados, currentY, contentWidth);
  currentY -= 6;

  drawDivider(page, currentY);
  currentY -= 14;

  currentY = drawManobrasSection(page, fontRegular, fontBold, dados, currentY, contentWidth);
  currentY -= 10;

  // Régua de avaliação: apenas para template legado (pre-V6.2).
  // Fichas V6.2 NUNCA exibem régua.
  if (dados.templateVersion === 'legacy') {
    currentY = drawAvaliacaoScaleSection(page, fontRegular, fontBold, currentY, contentWidth);
    currentY -= 10;
  }

  currentY = drawObservacoesSection(page, fontRegular, fontBold, dados, currentY, contentWidth);
  currentY -= 14;

  drawAssinaturasSection(page, fontRegular, fontBold, dados, currentY, contentWidth);
  currentY -= 20;

  // NOTECHS calibration warning + regulatory disclaimer
  const hasNotechs = dados.manobras.some(
    (m) => (m.categoria || '').toUpperCase() === NOTECHS_CATEGORIA,
  );
  if (hasNotechs) {
    currentY = drawDisclaimerText(
      page,
      fontRegular,
      NOTECHS_CALIBRATION_WARNING,
      currentY,
      contentWidth,
    );
  }
  currentY = drawDisclaimerText(page, fontRegular, REGULATORY_DISCLAIMER, currentY, contentWidth);

  drawFooter(page, fontRegular, dados, contentWidth);

  const bytes = await pdfDoc.save();
  return Buffer.from(bytes);
}

async function drawLogo(
  pdfDoc: PDFDocument,
  page: PDFPage,
  logoBytes: Uint8Array,
  x: number,
  topY: number,
): Promise<number> {
  try {
    const image = await embedImage(pdfDoc, logoBytes);
    if (!image) return topY;

    const maxWidth = 120;
    const maxHeight = 40;
    const scale = Math.min(maxWidth / image.width, maxHeight / image.height, 1);
    const width = image.width * scale;
    const height = image.height * scale;

    page.drawImage(image, {
      x,
      y: topY - height,
      width,
      height,
    });

    return topY - height - 10;
  } catch (error) {
    console.warn('Erro ao embutir logo no PDF:', error);
    return topY;
  }
}

function drawHeader(
  page: PDFPage,
  fontRegular: PDFFont,
  fontBold: PDFFont,
  dados: FichaPDFData,
  topY: number,
  contentWidth: number,
): void {
  const examinerDefinition = getExaminerEventSessionDefinition(dados.sessao_codigo);
  const titleY = topY - 4;
  let title1 = dados.sessao_titulo_linha1 || examinerDefinition?.headerTitle;
  let title2 = dados.sessao_titulo_linha2 || examinerDefinition?.headerSubtitle;

  if (!title1 && !title2 && dados.sessao_titulo) {
    if (dados.sessao_titulo.includes(' - ')) {
      const parts = dados.sessao_titulo.split(' - ');
      title1 = parts[0].trim();
      title2 = parts.slice(1).join(' - ').trim();
    } else {
      title1 = dados.sessao_titulo;
      title2 = '';
    }
  } else {
    title1 = title1 || dados.sessao_titulo || 'FICHA DE TREINAMENTO DE VOO';
    title2 = title2 || '';
  }

  drawText(
    page,
    title1,
    PAGE.margin,
    titleY,
    fontBold,
    10,
    COLOR.text,
  );

  const badgeText = dados.status === 'PENDENTE' ? 'PENDENTE' : 'ASSINADO';
  const badgeColor = dados.status === 'PENDENTE' ? COLOR.danger : COLOR.success;
  const badgeWidth = 82;
  const badgeHeight = 20;
  const badgeX = PAGE.margin + contentWidth - badgeWidth;
  const badgeY = titleY - 8;

  page.drawRectangle({
    x: badgeX,
    y: badgeY,
    width: badgeWidth,
    height: badgeHeight,
    color: badgeColor,
  });
  drawTextCentered(page, badgeText, badgeX, badgeY + 6, badgeWidth, fontBold, 9, COLOR.white);

  if (title2) {
    const subtitleLines = wrapText(title2, fontRegular, 8, contentWidth);
    drawWrappedText(
      page,
      subtitleLines,
      PAGE.margin,
      titleY - 14,
      fontRegular,
      8,
      10,
      COLOR.textSecondary,
    );
  }
}

function drawInfoSection(
  page: PDFPage,
  fontRegular: PDFFont,
  fontBold: PDFFont,
  dados: FichaPDFData,
  startY: number,
  contentWidth: number,
): number {
  const examinerDefinition = getExaminerEventSessionDefinition(dados.sessao_codigo);
  const colGap = 16;
  const colWidth = (contentWidth - colGap) / 2;
  const leftX = PAGE.margin;
  const rightX = leftX + colWidth + colGap;

  let leftY = startY;
  let rightY = startY;

  leftY = drawLabelValue(
    page,
    fontRegular,
    fontBold,
    examinerDefinition ? 'PARTICIPANTE AVALIADO' : 'TRIPULANTE',
    dados.tripulante_nome,
    leftX,
    leftY,
    colWidth,
  );
  leftY = drawSmallText(
    page,
    fontRegular,
    `ANAC: ${dados.tripulante_codigo_anac}`,
    leftX,
    leftY - 2,
    7,
    COLOR.textSecondary,
  );
  leftY -= 10;
  leftY = drawLabelValue(
    page,
    fontRegular,
    fontBold,
    'FUNÇÃO',
    dados.tripulante_funcao || 'ALUNO',
    leftX,
    leftY,
    colWidth,
  );
  leftY -= 2;
  leftY = drawLabelValue(
    page,
    fontRegular,
    fontBold,
    examinerDefinition ? 'INSTRUTOR SUPERVISOR' : 'INSTRUTOR',
    dados.instrutor_nome,
    leftX,
    leftY,
    colWidth,
  );
  leftY = drawSmallText(
    page,
    fontRegular,
    `ANAC: ${dados.instrutor_codigo_anac}`,
    leftX,
    leftY - 2,
    7,
    COLOR.textSecondary,
  );

  rightY = drawLabelValue(
    page,
    fontRegular,
    fontBold,
    'DATA',
    dados.data,
    rightX,
    rightY,
    colWidth,
  );
  rightY -= 2;
  rightY = drawLabelValue(
    page,
    fontRegular,
    fontBold,
    'HORÁRIOS',
    `${dados.horario_inicio} / ${dados.horario_fim}`,
    rightX,
    rightY,
    colWidth,
  );
  rightY -= 2;
  rightY = drawLabelValue(
    page,
    fontRegular,
    fontBold,
    examinerDefinition ? 'EQUIPAMENTO UTILIZADO' : 'SIMULADOR',
    dados.simulador,
    rightX,
    rightY,
    colWidth,
  );
  rightY -= 2;
  rightY = drawLabelValue(
    page,
    fontRegular,
    fontBold,
    examinerDefinition ? 'DURAÇÃO CURRICULAR' : 'CARGA HORÁRIA TOTAL',
    dados.carga_horaria_total,
    rightX,
    rightY,
    colWidth,
  );

  return Math.min(leftY, rightY) - 10;
}

function drawManobrasSection(
  page: PDFPage,
  fontRegular: PDFFont,
  fontBold: PDFFont,
  dados: FichaPDFData,
  startY: number,
  contentWidth: number,
): number {
  const TABLE_HEADER_H = 14;
  const ROW_H_BASE = 11;
  const LINE_SPACING = 6.5;
  const TABLE_FONT = 7;
  const TABLE_FONT_SMALL = 5.5;

  // Column layout: # (7mm) | CÓDIGO (27mm) | TRIP. (12mm) | ITENS (44mm) | OBS (55mm) | NOTA (14mm)
  const margin = PAGE.margin;
  const colNum = { x: margin + 1, w: 7 };
  const colCodigo = { x: colNum.x + colNum.w + 2, w: 27 };
  const colTrip = { x: colCodigo.x + colCodigo.w + 5, w: 12 };
  const colItens = { x: colTrip.x + colTrip.w + 3, w: 44 };
  const colObs = { x: colItens.x + colItens.w + 3, w: 55 };
  const colNota = { x: colObs.x + colObs.w + 2, w: 14 };

  // Draw table header
  drawText(page, 'ITENS AVALIADOS', margin, startY, fontBold, 8, COLOR.text);
  const headerY = startY - 12;
  page.drawRectangle({
    x: margin,
    y: headerY - TABLE_HEADER_H,
    width: contentWidth,
    height: TABLE_HEADER_H,
    color: COLOR.primary,
  });

  const headerTextY = headerY - 10;
  drawText(page, '#', colNum.x, headerTextY, fontBold, 7, COLOR.white);
  drawText(page, 'CÓDIGO', colCodigo.x, headerTextY, fontBold, 7, COLOR.white);
  drawText(page, 'TRIP.', colTrip.x, headerTextY, fontBold, 7, COLOR.white);
  drawText(page, 'ITENS', colItens.x, headerTextY, fontBold, 7, COLOR.white);
  drawText(page, 'OBSERVAÇÕES', colObs.x, headerTextY, fontBold, 7, COLOR.white);
  drawTextCentered(page, 'NOTA', colNota.x, headerTextY, colNota.w, fontBold, 7, COLOR.white);

  // Split maneuvers into technical and NOTECHS
  const tecnicas = dados.manobras.filter(
    (m) => (m.categoria || '').toUpperCase() !== NOTECHS_CATEGORIA,
  );
  const examinerBlocks = splitExaminerTechnicalBlocks(dados.sessao_codigo, tecnicas);
  const notechs = dados.manobras.filter(
    (m) => (m.categoria || '').toUpperCase() === NOTECHS_CATEGORIA,
  );

  // Combine: technical first, then NOTECHS with dividers and sub-category labels
  const allRows: Array<{
    tipo: 'tecnica' | 'notechs';
    idx: number;
    codigo: string;
    nome: string;
    resultado: number | null;
    observacoes: string;
    tripulante: string;
  }> = [];

  tecnicas.forEach((m, i) => {
    allRows.push({
      tipo: 'tecnica',
      idx: i + 1,
      codigo: m.codigo || '-',
      nome: sanitizeForPdf(m.descricao) || m.descricao || '-',
      resultado: m.resultado,
      observacoes: sanitizeForPdf(m.observacoes) || (m.observacoes || '').trim(),
      tripulante: (m.tripulante || 'AB').toUpperCase(),
    });
  });

  notechs.forEach((m) => {
    allRows.push({
      tipo: 'notechs',
      idx: 0,
      codigo: m.codigo || '-',
      nome: sanitizeForPdf(m.descricao) || m.descricao || '-',
      resultado: m.resultado,
      observacoes: sanitizeForPdf(m.observacoes) || (m.observacoes || '').trim(),
      tripulante: 'AB',
    });
  });

  // Add NOTECHS divider row
  let currentY = headerY - TABLE_HEADER_H;
  const hasNotechs = notechs.length > 0;

  let notecsRowIdx = 0;
  let activeTechnicalBlockIndex = 0;
  let nextTechnicalBlock =
    examinerBlocks && examinerBlocks.length > 0 ? examinerBlocks[activeTechnicalBlockIndex] : null;

  // Draw all rows
  for (let ri = 0; ri < allRows.length; ri++) {
    const row = allRows[ri];
    if (
      row.tipo === 'tecnica' &&
      nextTechnicalBlock &&
      row.idx === nextTechnicalBlock.definition.startOrder
    ) {
      page.drawRectangle({
        x: margin,
        y: currentY - 8,
        width: contentWidth,
        height: 8,
        color: rgb(0.9, 0.94, 0.96),
      });
      drawText(page, nextTechnicalBlock.definition.title, margin + 3, currentY - 5.2, fontBold, 6, COLOR.text);
      currentY -= 9;
      activeTechnicalBlockIndex += 1;
      nextTechnicalBlock = examinerBlocks?.[activeTechnicalBlockIndex] || null;
    }
    const isNotechsStart =
      row.tipo === 'notechs' && (ri === 0 || allRows[ri - 1].tipo === 'tecnica');

    // NOTECHS section banner — subtle background, single line
    if (isNotechsStart) {
      notecsRowIdx = 0;
      // Subtle gray-blue banner background
      page.drawRectangle({
        x: margin,
        y: currentY - 8,
        width: contentWidth,
        height: 8,
        color: rgb(0.91, 0.93, 0.94),
      });
      currentY -= 2;
      page.drawLine({
        start: { x: margin, y: currentY },
        end: { x: margin + contentWidth, y: currentY },
        color: COLOR.border,
        thickness: 0.5,
      });
      drawText(
        page,
        'NOTECHS \u2014 Non-Technical Skills / Habilidades N\u00E3o T\u00E9cnicas e Comportamentais',
        margin + 3,
        currentY - 4,
        fontBold,
        6,
        COLOR.text,
      );
      currentY -= 8;
      page.drawLine({
        start: { x: margin, y: currentY },
        end: { x: margin + contentWidth, y: currentY },
        color: COLOR.border,
        thickness: 0.5,
      });
      currentY -= 2;
    }

    // NOTECHS row numbering (1-indexed, reset after each group for clarity — use global 1-15)
    if (row.tipo === 'notechs') {
      notecsRowIdx++;
    }

    // Alternate row background
    const isEven = ri % 2 === 0;
    if (isEven) {
      page.drawRectangle({
        x: margin,
        y: currentY - ROW_H_BASE - 1,
        width: contentWidth,
        height: ROW_H_BASE + 1,
        color: COLOR.bgLight,
      });
    }

    const textY = currentY - 4;

    // Row number
    const rowNum = row.tipo === 'notechs' ? notecsRowIdx : row.idx;
    drawText(
      page,
      String(rowNum).padStart(2, '0'),
      colNum.x,
      textY,
      fontRegular,
      TABLE_FONT,
      COLOR.textSecondary,
    );

    // Code
    const codeText = row.codigo.length > 13 ? row.codigo.substring(0, 12) + '…' : row.codigo;
    drawText(
      page,
      codeText,
      colCodigo.x,
      textY,
      fontRegular,
      TABLE_FONT_SMALL,
      COLOR.textSecondary,
    );

    // Tripulante badge
    const tripBadgeW = 8;
    const tripBadgeH = 5;
    const tripBadgeX = colTrip.x + (colTrip.w - tripBadgeW) / 2;
    const tripBadgeY = currentY - ROW_H_BASE + 2;
    const tripColor =
      row.tripulante === 'A' ? COLOR.tripA : row.tripulante === 'B' ? COLOR.tripB : COLOR.border;
    page.drawRectangle({
      x: tripBadgeX,
      y: tripBadgeY,
      width: tripBadgeW,
      height: tripBadgeH,
      color: tripColor,
    });
    drawTextCentered(
      page,
      row.tripulante,
      tripBadgeX,
      tripBadgeY + 1.2,
      tripBadgeW,
      fontBold,
      5,
      COLOR.text,
    );

    // Item name (with word wrap)
    const nomeLines = wrapText(row.nome, fontRegular, TABLE_FONT, colItens.w);
    for (let li = 0; li < Math.min(nomeLines.length, 3); li++) {
      drawText(
        page,
        nomeLines[li],
        colItens.x,
        textY - li * LINE_SPACING,
        fontRegular,
        TABLE_FONT,
        COLOR.text,
      );
    }

    // Observações
    if (row.observacoes) {
      const obsLines = wrapText(row.observacoes, fontRegular, TABLE_FONT_SMALL, colObs.w).slice(
        0,
        2,
      );
      for (let li = 0; li < obsLines.length; li++) {
        drawText(
          page,
          obsLines[li],
          colObs.x,
          textY - li * LINE_SPACING,
          fontRegular,
          TABLE_FONT_SMALL,
          COLOR.textSecondary,
        );
      }
    }

    // Nota badge
    const badgeSize = 10;
    const badgeX = colNota.x + (colNota.w - badgeSize) / 2;
    const badgeY = currentY - ROW_H_BASE + 2;
    const score = row.resultado;
    const isNR = score === null;

    if (!isNR && score !== null) {
      page.drawRectangle({
        x: badgeX,
        y: badgeY,
        width: badgeSize,
        height: badgeSize,
        color: getScoreBgColor(score),
      });
      drawTextCentered(
        page,
        String(score),
        badgeX,
        badgeY + 3,
        badgeSize,
        fontBold,
        7,
        COLOR.white,
      );
    } else {
      page.drawRectangle({
        x: badgeX,
        y: badgeY,
        width: badgeSize,
        height: badgeSize,
        color: COLOR.border,
      });
      drawTextCentered(
        page,
        '-',
        badgeX,
        badgeY + 3,
        badgeSize,
        fontRegular,
        6,
        COLOR.textSecondary,
      );
    }

    currentY -= ROW_H_BASE + 1;
  }

  return currentY;
}

function drawObservacoesSection(
  page: PDFPage,
  fontRegular: PDFFont,
  fontBold: PDFFont,
  dados: FichaPDFData,
  startY: number,
  contentWidth: number,
): number {
  drawText(page, 'OBSERVAÇÕES', PAGE.margin, startY, fontBold, 7, COLOR.text);

  const boxTop = startY - 10;
  const boxHeight = 65;
  page.drawRectangle({
    x: PAGE.margin,
    y: boxTop - boxHeight,
    width: contentWidth,
    height: boxHeight,
    color: COLOR.bgLight,
    borderColor: COLOR.border,
    borderWidth: 0.5,
  });

  const textLines = wrapText(
    dados.observacoes_gerais || '-',
    fontRegular,
    6,
    contentWidth - 10,
  ).slice(0, 8);
  drawWrappedText(page, textLines, PAGE.margin + 5, boxTop - 8, fontRegular, 6, 8, COLOR.text);

  return boxTop - boxHeight;
}

function drawAvaliacaoScaleSection(
  page: PDFPage,
  fontRegular: PDFFont,
  fontBold: PDFFont,
  startY: number,
  contentWidth: number,
): number {
  const notas = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
  const faixas = [
    { rangeLabel: '1-2', color: rgb(0.78, 0.16, 0.16), noteIndexes: [0, 1] },
    { rangeLabel: '3-4', color: rgb(0.94, 0.43, 0), noteIndexes: [2, 3] },
    { rangeLabel: '5-7', color: rgb(0.96, 0.77, 0.26), noteIndexes: [4, 5, 6] },
    { rangeLabel: '8-10', color: rgb(0.18, 0.49, 0.2), noteIndexes: [7, 8, 9] },
  ];

  drawText(page, 'REGUA DE AVALIACAO', PAGE.margin, startY, fontBold, 7, COLOR.text);

  const tableTop = startY - 10;
  const cellWidth = contentWidth / notas.length;
  const cellHeight = 12;

  notas.forEach((nota, index) => {
    const faixa = faixas.find((c) => c.noteIndexes.includes(index));
    const x = PAGE.margin + index * cellWidth;
    page.drawRectangle({
      x,
      y: tableTop - cellHeight,
      width: cellWidth,
      height: cellHeight,
      color: faixa?.color || COLOR.textSecondary,
      borderColor: COLOR.white,
      borderWidth: 0.5,
    });
    drawTextCentered(page, String(nota), x, tableTop - 9, cellWidth, fontBold, 7, COLOR.white);
  });

  return tableTop - cellHeight - 2;
}

function drawAssinaturasSection(
  page: PDFPage,
  fontRegular: PDFFont,
  fontBold: PDFFont,
  dados: FichaPDFData,
  startY: number,
  contentWidth: number,
): void {
  drawText(page, 'ASSINATURAS', PAGE.margin, startY, fontBold, 7, COLOR.text);

  const colGap = 16;
  const colWidth = (contentWidth - colGap) / 2;
  const leftX = PAGE.margin;
  const rightX = leftX + colWidth + colGap;
  const labelY = startY - 14;

  drawText(page, 'Tripulante', leftX, labelY, fontRegular, 6, COLOR.textSecondary);
  drawSignatureStatus(page, fontRegular, dados.assinatura_aluno_timestamp, leftX, labelY - 12);

  drawText(page, 'Instrutor', rightX, labelY, fontRegular, 6, COLOR.textSecondary);
  drawSignatureStatus(page, fontRegular, dados.assinatura_instrutor_timestamp, rightX, labelY - 12);
}

function drawSignatureStatus(
  page: PDFPage,
  fontRegular: PDFFont,
  timestamp: string | null,
  x: number,
  y: number,
): void {
  if (timestamp) {
    drawText(page, `Assinado ${formatTime(timestamp)}`, x, y, fontRegular, 6, COLOR.success);
    return;
  }

  drawText(page, 'Aguardando assinatura', x, y, fontRegular, 6, COLOR.warning);
}

function drawDisclaimerText(
  page: PDFPage,
  fontRegular: PDFFont,
  text: string,
  startY: number,
  contentWidth: number,
): number {
  const lines = wrapText(text, fontRegular, 5.5, contentWidth - 4);
  let y = startY;
  for (const line of lines) {
    y -= 8;
    drawText(page, line, PAGE.margin + 2, y, fontRegular, 5.5, COLOR.textSecondary);
  }
  return y - 4;
}

function drawFooter(
  page: PDFPage,
  fontRegular: PDFFont,
  dados: FichaPDFData,
  contentWidth: number,
): void {
  const footerY = PAGE.margin + 18;
  page.drawLine({
    start: { x: PAGE.margin, y: footerY + 10 },
    end: { x: PAGE.margin + contentWidth, y: footerY + 10 },
    color: COLOR.border,
    thickness: 0.5,
  });

  drawText(
    page,
    `Ficha ID: ${dados.fichaId}`,
    PAGE.margin,
    footerY,
    fontRegular,
    6,
    COLOR.textSecondary,
  );

  const generatedAt = `Gerado em: ${new Date().toLocaleString('pt-BR')}`;
  const textWidth = fontRegular.widthOfTextAtSize(generatedAt, 6);
  drawText(
    page,
    generatedAt,
    PAGE.margin + contentWidth - textWidth,
    footerY,
    fontRegular,
    6,
    COLOR.textSecondary,
  );
}

function drawLabelValue(
  page: PDFPage,
  fontRegular: PDFFont,
  fontBold: PDFFont,
  label: string,
  value: string,
  x: number,
  startY: number,
  width: number,
): number {
  drawText(page, label, x, startY, fontBold, 7, COLOR.textSecondary);
  const lines = wrapText(value || '-', fontRegular, 8, width);
  drawWrappedText(page, lines, x, startY - 11, fontRegular, 8, 10, COLOR.text);
  return startY - 12 - lines.length * 10;
}

function drawSmallText(
  page: PDFPage,
  fontRegular: PDFFont,
  text: string,
  x: number,
  y: number,
  size: number,
  color: ReturnType<typeof rgb>,
): number {
  drawText(page, text, x, y, fontRegular, size, color);
  return y - size - 2;
}

function drawDivider(page: PDFPage, y: number): void {
  page.drawLine({
    start: { x: PAGE.margin, y },
    end: { x: PAGE.width - PAGE.margin, y },
    color: COLOR.border,
    thickness: 0.5,
  });
}

function drawWrappedText(
  page: PDFPage,
  lines: string[],
  x: number,
  startY: number,
  font: PDFFont,
  size: number,
  lineHeight: number,
  color: ReturnType<typeof rgb>,
): void {
  lines.forEach((line, index) => {
    drawText(page, line, x, startY - index * lineHeight, font, size, color);
  });
}

function drawText(
  page: PDFPage,
  text: string,
  x: number,
  y: number,
  font: PDFFont,
  size: number,
  color: ReturnType<typeof rgb>,
): void {
  page.drawText(text, { x, y, font, size, color });
}

function drawTextCentered(
  page: PDFPage,
  text: string,
  x: number,
  y: number,
  width: number,
  font: PDFFont,
  size: number,
  color: ReturnType<typeof rgb>,
): void {
  const textWidth = font.widthOfTextAtSize(text, size);
  const centeredX = x + Math.max((width - textWidth) / 2, 0);
  drawText(page, text, centeredX, y, font, size, color);
}

function wrapText(text: string, font: PDFFont, size: number, maxWidth: number): string[] {
  const safeText = String(text || '').trim() || '-';
  const paragraphs = safeText.split(/\r?\n/);
  const lines: string[] = [];

  for (const paragraph of paragraphs) {
    const words = paragraph.split(/\s+/).filter(Boolean);
    if (!words.length) {
      lines.push('');
      continue;
    }

    let current = words[0];
    for (let index = 1; index < words.length; index += 1) {
      const candidate = `${current} ${words[index]}`;
      if (font.widthOfTextAtSize(candidate, size) <= maxWidth) {
        current = candidate;
      } else {
        lines.push(current);
        current = words[index];
      }
    }
    lines.push(current);
  }

  return lines;
}

function getScoreBgColor(score: number | null) {
  if (score === null) return COLOR.border;
  if (score >= 8) return COLOR.success;
  if (score >= 6) return COLOR.warning;
  return COLOR.danger;
}

async function embedImage(pdfDoc: PDFDocument, imageBytes: Uint8Array) {
  const bytes = new Uint8Array(imageBytes);

  if (isPng(bytes)) return pdfDoc.embedPng(bytes);
  if (isJpeg(bytes)) return pdfDoc.embedJpg(bytes);
  return null;
}

function isPng(bytes: Uint8Array): boolean {
  return (
    bytes.length >= 8 &&
    bytes[0] === 0x89 &&
    bytes[1] === 0x50 &&
    bytes[2] === 0x4e &&
    bytes[3] === 0x47
  );
}

function isJpeg(bytes: Uint8Array): boolean {
  return bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
}

function formatTime(timestamp: string): string {
  const date = new Date(timestamp);
  return date.toLocaleString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}
