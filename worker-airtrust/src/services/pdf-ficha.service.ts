/**
 * SERVICE: Geração de PDF da Ficha de Treinamento
 * Stack: pdf-lib + TypeScript
 * Output: PDF A4 compatível com Cloudflare Workers
 * Arquivo: worker-airtrust/src/services/pdf-ficha.service.ts
 */

import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from 'pdf-lib';

interface FichaPDFData {
  fichaId: string;
  sessao_titulo: string;
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
  manobras: Array<{
    ordem: number;
    descricao: string;
    codigo: string;
    resultado: number | null;
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
};

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
  currentY -= dados.logoBytes?.length ? 72 : 48;

  drawDivider(page, currentY);
  currentY -= 14;

  currentY = drawInfoSection(page, fontRegular, fontBold, dados, currentY, contentWidth);
  currentY -= 6;

  drawDivider(page, currentY);
  currentY -= 14;

  currentY = drawManobrasSection(page, fontRegular, fontBold, dados, currentY, contentWidth);
  currentY -= 10;

  currentY = drawObservacoesSection(page, fontRegular, fontBold, dados, currentY, contentWidth);
  currentY -= 14;

  drawAssinaturasSection(page, fontRegular, fontBold, dados, currentY, contentWidth);
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
  const titleY = topY - 4;
  drawText(page, 'FICHA DE TREINAMENTO DE VOO', PAGE.margin, titleY, fontBold, 10, COLOR.text);

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

  const subtitleLines = wrapText(dados.sessao_titulo, fontRegular, 8, contentWidth);
  drawWrappedText(
    page,
    subtitleLines,
    PAGE.margin,
    titleY - 18,
    fontRegular,
    8,
    10,
    COLOR.textSecondary,
  );
}

function drawInfoSection(
  page: PDFPage,
  fontRegular: PDFFont,
  fontBold: PDFFont,
  dados: FichaPDFData,
  startY: number,
  contentWidth: number,
): number {
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
    'TRIPULANTE',
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
    'INSTRUTOR',
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
    'SIMULADOR',
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
    'CARGA HORÁRIA TOTAL',
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
  drawText(page, 'ITENS AVALIADOS', PAGE.margin, startY, fontBold, 7, COLOR.text);

  const colGap = 16;
  const colWidth = (contentWidth - colGap) / 2;
  const leftX = PAGE.margin;
  const rightX = leftX + colWidth + colGap;
  const rowsPerColumn = Math.ceil(dados.manobras.length / 2);
  const leftItems = dados.manobras.slice(0, rowsPerColumn);
  const rightItems = dados.manobras.slice(rowsPerColumn);

  const leftEndY = drawManobraColumn(
    page,
    fontRegular,
    fontBold,
    leftItems,
    leftX,
    startY - 14,
    colWidth,
  );
  const rightEndY = drawManobraColumn(
    page,
    fontRegular,
    fontBold,
    rightItems,
    rightX,
    startY - 14,
    colWidth,
  );

  return Math.min(leftEndY, rightEndY);
}

function drawManobraColumn(
  page: PDFPage,
  fontRegular: PDFFont,
  fontBold: PDFFont,
  manobras: FichaPDFData['manobras'],
  x: number,
  startY: number,
  width: number,
): number {
  let y = startY;

  for (const manobra of manobras) {
    const title = `${manobra.ordem}. ${manobra.descricao}`;
    const titleLines = wrapText(title, fontBold, 6, width - 28);
    const codeLines = wrapText(manobra.codigo || '-', fontRegular, 5, width - 28);
    const blockHeight = Math.max(18, titleLines.length * 7 + codeLines.length * 6 + 2);

    drawWrappedText(page, titleLines, x, y, fontBold, 6, 7, COLOR.text);
    drawWrappedText(
      page,
      codeLines,
      x,
      y - titleLines.length * 7 - 1,
      fontRegular,
      5,
      6,
      COLOR.textSecondary,
    );

    drawScoreBadge(page, fontBold, manobra.resultado, x + width - 18, y - 2);
    y -= blockHeight;
  }

  return y;
}

function drawScoreBadge(
  page: PDFPage,
  fontBold: PDFFont,
  score: number | null,
  x: number,
  topY: number,
): void {
  const size = 16;
  page.drawRectangle({
    x,
    y: topY - size + 2,
    width: size,
    height: size,
    color: getScoreBgColor(score),
  });

  if (score === null) return;
  drawTextCentered(page, String(score), x, topY - 7, size, fontBold, 8, COLOR.white);
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
  const boxHeight = 50;
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
  ).slice(0, 6);
  drawWrappedText(page, textLines, PAGE.margin + 5, boxTop - 8, fontRegular, 6, 8, COLOR.text);

  return boxTop - boxHeight;
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
