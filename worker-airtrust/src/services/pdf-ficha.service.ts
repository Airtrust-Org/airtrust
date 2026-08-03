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
  getSpecialEventSessionDefinition,
  splitSpecialTechnicalBlocks,
} from '../../../src/shared/simuladores/special-event-sessions';
import {
  buildFichaHeaderRows,
  buildFichaHeaderTitle,
} from '../../../src/shared/simuladores/ficha-header';

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
  /** Nome descritivo da sessão (sem o código), usado na linha "<código> — <nome>" do cabeçalho do PDF. */
  sessao_nome?: string;
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
  simulador_modelo?: string;
  equipamento_utilizado?: string;
  dispositivo_identificacao?: string;
  assento_instrucao_utilizado?: string;
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

interface PdfRenderContext {
  pdfDoc: PDFDocument;
  fontRegular: PDFFont;
  fontBold: PDFFont;
  dados: FichaPDFData;
  contentWidth: number;
}

interface RenderPosition {
  page: PDFPage;
  y: number;
}

const CONTENT_BOTTOM = PAGE.margin + 38;

function addContinuationPage(ctx: PdfRenderContext, sectionLabel: string): RenderPosition {
  const page = ctx.pdfDoc.addPage([PAGE.width, PAGE.height]);
  const topY = PAGE.height - PAGE.margin;
  drawText(
    page,
    'FICHA DE TREINAMENTO / AVALIAÇÃO',
    PAGE.margin,
    topY - 4,
    ctx.fontBold,
    9,
    COLOR.text,
  );
  drawText(
    page,
    `Ficha ID: ${ctx.dados.fichaId} — ${sectionLabel}`,
    PAGE.margin,
    topY - 18,
    ctx.fontRegular,
    6.5,
    COLOR.textSecondary,
  );
  drawDivider(page, topY - 26);
  return { page, y: topY - 40 };
}

function ensureSpace(
  ctx: PdfRenderContext,
  position: RenderPosition,
  requiredHeight: number,
  sectionLabel: string,
): RenderPosition {
  if (position.y - requiredHeight >= CONTENT_BOTTOM) return position;
  return addContinuationPage(ctx, sectionLabel);
}

export async function gerarPDFFicha(dados: FichaPDFData): Promise<Buffer> {
  const pdfDoc = await PDFDocument.create();
  const firstPage = pdfDoc.addPage([PAGE.width, PAGE.height]);

  const fontRegular = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const fontBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
  const contentWidth = PAGE.width - PAGE.margin * 2;
  const ctx: PdfRenderContext = { pdfDoc, fontRegular, fontBold, dados, contentWidth };

  let currentY = PAGE.height - PAGE.margin;
  if (dados.logoBytes?.length) {
    currentY = await drawLogo(pdfDoc, firstPage, dados.logoBytes, PAGE.margin, currentY);
  }

  drawHeader(firstPage, fontRegular, fontBold, dados, currentY, contentWidth);
  currentY -= dados.logoBytes?.length ? 54 : 32;
  drawDivider(firstPage, currentY);
  currentY -= 14;
  currentY = drawInfoSection(firstPage, fontRegular, fontBold, dados, currentY, contentWidth);
  currentY -= 6;
  drawDivider(firstPage, currentY);
  currentY -= 14;

  let position = drawManobrasSection(ctx, { page: firstPage, y: currentY });
  position.y -= 10;

  if (dados.templateVersion === 'legacy') {
    position = ensureSpace(ctx, position, 48, 'Régua de avaliação');
    position.y = drawAvaliacaoScaleSection(
      position.page,
      fontRegular,
      fontBold,
      position.y,
      contentWidth,
    );
    position.y -= 10;
  }

  position = drawObservacoesSection(ctx, position);
  position.y -= 14;

  position = ensureSpace(ctx, position, 54, 'Assinaturas');
  drawAssinaturasSection(position.page, fontRegular, fontBold, dados, position.y, contentWidth);
  position.y -= 48;

  const hasNotechs = dados.manobras.some(
    (m) => (m.categoria || '').toUpperCase() === NOTECHS_CATEGORIA,
  );
  if (hasNotechs) {
    position = drawDisclaimerTextPaginated(ctx, position, NOTECHS_CALIBRATION_WARNING);
  }
  drawDisclaimerTextPaginated(ctx, position, REGULATORY_DISCLAIMER);

  const pages = pdfDoc.getPages();
  pages.forEach((page, index) =>
    drawFooter(page, fontRegular, dados, contentWidth, index + 1, pages.length),
  );

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
  const { title1, title2 } = buildFichaHeaderTitle({
    sessaoCodigo: dados.sessao_codigo,
    sessaoNome: dados.sessao_nome,
  });

  drawText(page, title1, PAGE.margin, titleY, fontBold, 10, COLOR.text);

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
  const rows = buildFichaHeaderRows({
    sessaoCodigo: dados.sessao_codigo,
    data: dados.data,
    horarioInicio: dados.horario_inicio,
    horarioFim: dados.horario_fim,
    cargaHorariaTotal: dados.carga_horaria_total,
    tripulanteNome: dados.tripulante_nome,
    tripulanteCodigoAnac: dados.tripulante_codigo_anac,
    tripulanteFuncao: dados.tripulante_funcao,
    instrutorNome: dados.instrutor_nome,
    instrutorCodigoAnac: dados.instrutor_codigo_anac,
    simuladorDisplayName: dados.simulador,
    simuladorModelo: dados.simulador_modelo,
    equipamentoUtilizado: dados.equipamento_utilizado,
    dispositivoIdentificacao: dados.dispositivo_identificacao,
    assentoInstrucaoUtilizado: dados.assento_instrucao_utilizado,
  });

  const boxTop = startY - 2;
  const rowHeight = 18;
  const boxHeight = rows.length * rowHeight + 10;
  page.drawRectangle({
    x: PAGE.margin,
    y: boxTop - boxHeight,
    width: contentWidth,
    height: boxHeight,
    color: COLOR.bgLight,
    borderColor: COLOR.border,
    borderWidth: 0.5,
  });

  const FIELD_WEIGHT_BY_LABEL: Record<string, number> = {
    ANAC: 0.8,
    Assento: 1.2,
    'Carga Horária': 1.4,
    Data: 0.95,
    'Dispositivo/Matrícula': 1.75,
    Função: 1.0,
    Horário: 1.25,
    Instrutor: 1.7,
    'Instrutor-aluno': 2.15,
    'Instrutor supervisor': 2.2,
    Modelo: 1.55,
    PF: 0.75,
    PM: 0.75,
    Simulador: 2.2,
    Tripulante: 1.7,
  };

  const getFieldBoxes = (row: (typeof rows)[number]) => {
    const horizontalPadding = 6;
    const gap = 8;
    const innerWidth = contentWidth - horizontalPadding * 2;
    const totalGap = gap * Math.max(0, row.length - 1);
    const availableWidth = innerWidth - totalGap;
    const weights = row.map((field) => FIELD_WEIGHT_BY_LABEL[field.label] || 1);
    const totalWeight = weights.reduce((sum, weight) => sum + weight, 0) || row.length;

    let currentX = PAGE.margin + horizontalPadding;
    return row.map((field, index) => {
      const isLast = index === row.length - 1;
      const width = isLast
        ? PAGE.margin + horizontalPadding + innerWidth - currentX
        : (availableWidth * weights[index]) / totalWeight;
      const box = { x: currentX, width };
      currentX += width + gap;
      return box;
    });
  };

  const fitTextToWidth = (text: string, maxWidth: number, font: PDFFont, size: number) => {
    const safeText = String(text || '').trim() || '________________';
    if (maxWidth <= 12) return '...';
    if (font.widthOfTextAtSize(safeText, size) <= maxWidth) return safeText;

    const ellipsis = '...';
    let truncated = safeText;
    while (
      truncated.length > 1 &&
      font.widthOfTextAtSize(`${truncated}${ellipsis}`, size) > maxWidth
    ) {
      truncated = truncated.slice(0, -1).trimEnd();
    }
    return truncated ? `${truncated}${ellipsis}` : ellipsis;
  };

  let currentRowTop = boxTop - 14;
  for (const row of rows) {
    const fieldBoxes = getFieldBoxes(row);
    row.forEach((field, index) => {
      const box = fieldBoxes[index] ||
        fieldBoxes.at(-1) || { x: PAGE.margin + 6, width: contentWidth - 12 };
      const labelText = `${field.label}:`;
      const labelSize = 6.5;
      const valueSize = 7;
      const labelWidth = fontBold.widthOfTextAtSize(labelText, labelSize);
      const valueX = box.x + labelWidth + 4;
      const valueWidth = Math.max(14, box.width - labelWidth - 5);
      drawText(page, labelText, box.x, currentRowTop, fontBold, labelSize, COLOR.textSecondary);
      drawText(
        page,
        fitTextToWidth(field.value, valueWidth, fontRegular, valueSize),
        valueX,
        currentRowTop,
        fontRegular,
        valueSize,
        COLOR.text,
      );
    });
    currentRowTop -= rowHeight;
  }

  return boxTop - boxHeight - 8;
}

function drawManobrasSection(
  ctx: PdfRenderContext,
  initialPosition: RenderPosition,
): RenderPosition {
  const { fontRegular, fontBold, dados, contentWidth } = ctx;
  const specialDefinition = getSpecialEventSessionDefinition(dados.sessao_codigo);
  const TABLE_HEADER_H = 14;
  const ROW_H_BASE = 12;
  const LINE_SPACING = 6.5;
  const TABLE_FONT = 7;
  const TABLE_FONT_SMALL = 5.5;
  const margin = PAGE.margin;
  const colNum = { x: margin + 1, w: 7 };
  const colCodigo = { x: colNum.x + colNum.w + 2, w: 27 };
  const colTrip = { x: colCodigo.x + colCodigo.w + 5, w: 12 };
  const colItens = { x: colTrip.x + colTrip.w + 3, w: 44 };
  const colObs = { x: colItens.x + colItens.w + 3, w: 55 };
  const colNota = { x: colObs.x + colObs.w + 2, w: 14 };

  const drawTableHeader = (position: RenderPosition, continued = false): RenderPosition => {
    drawText(
      position.page,
      continued ? 'ITENS AVALIADOS (continuação)' : 'ITENS AVALIADOS',
      margin,
      position.y,
      fontBold,
      8,
      COLOR.text,
    );
    const headerY = position.y - 12;
    position.page.drawRectangle({
      x: margin,
      y: headerY - TABLE_HEADER_H,
      width: contentWidth,
      height: TABLE_HEADER_H,
      color: COLOR.primary,
    });
    const headerTextY = headerY - 10;
    drawText(position.page, '#', colNum.x, headerTextY, fontBold, 7, COLOR.white);
    drawText(position.page, 'CÓDIGO', colCodigo.x, headerTextY, fontBold, 7, COLOR.white);
    drawText(
      position.page,
      specialDefinition?.hideTripulanteBadge ? '' : 'TRIP.',
      colTrip.x,
      headerTextY,
      fontBold,
      7,
      COLOR.white,
    );
    drawText(position.page, 'ITENS', colItens.x, headerTextY, fontBold, 7, COLOR.white);
    drawText(position.page, 'OBSERVAÇÕES', colObs.x, headerTextY, fontBold, 7, COLOR.white);
    drawTextCentered(
      position.page,
      'NOTA',
      colNota.x,
      headerTextY,
      colNota.w,
      fontBold,
      7,
      COLOR.white,
    );
    return { page: position.page, y: headerY - TABLE_HEADER_H };
  };

  const drawNotechsBanner = (position: RenderPosition, continued = false): RenderPosition => {
    const bannerHeight = 12;
    position.page.drawRectangle({
      x: margin,
      y: position.y - bannerHeight,
      width: contentWidth,
      height: bannerHeight,
      color: rgb(0.91, 0.93, 0.94),
    });
    drawText(
      position.page,
      continued
        ? 'NOTECHS — continuação'
        : 'NOTECHS — Non-Technical Skills / Habilidades Não Técnicas e Comportamentais',
      margin + 3,
      position.y - 8,
      fontBold,
      6,
      COLOR.text,
    );
    return { page: position.page, y: position.y - bannerHeight - 2 };
  };

  const tecnicas = dados.manobras.filter(
    (m) => (m.categoria || '').toUpperCase() !== NOTECHS_CATEGORIA,
  );
  const specialBlocks = splitSpecialTechnicalBlocks(dados.sessao_codigo, tecnicas);
  const notechs = dados.manobras.filter(
    (m) => (m.categoria || '').toUpperCase() === NOTECHS_CATEGORIA,
  );
  const allRows = [
    ...tecnicas.map((m, i) => ({
      tipo: 'tecnica' as const,
      idx: i + 1,
      codigo: m.codigo || '-',
      nome: sanitizeForPdf(m.descricao) || m.descricao || '-',
      resultado: m.resultado,
      observacoes: sanitizeForPdf(m.observacoes) || (m.observacoes || '').trim(),
      tripulante: (m.tripulante || 'AB').toUpperCase(),
    })),
    ...notechs.map((m) => ({
      tipo: 'notechs' as const,
      idx: 0,
      codigo: m.codigo || '-',
      nome: sanitizeForPdf(m.descricao) || m.descricao || '-',
      resultado: m.resultado,
      observacoes: sanitizeForPdf(m.observacoes) || (m.observacoes || '').trim(),
      tripulante: 'AB',
    })),
  ];

  let position = drawTableHeader(initialPosition);
  if (allRows.length === 0) {
    drawText(
      position.page,
      'Nenhum item avaliado.',
      margin + 3,
      position.y - 12,
      fontRegular,
      7,
      COLOR.warning,
    );
    return { page: position.page, y: position.y - 24 };
  }

  let notechsRowIdx = 0;
  let activeTechnicalBlockIndex = 0;
  let nextTechnicalBlock = specialBlocks?.[activeTechnicalBlockIndex] || null;
  let pageStartedInsideNotechs = false;

  for (let ri = 0; ri < allRows.length; ri++) {
    const row = allRows[ri];
    const nomeLines = wrapText(row.nome, fontRegular, TABLE_FONT, colItens.w).slice(0, 3);
    const obsLines = row.observacoes
      ? wrapText(row.observacoes, fontRegular, TABLE_FONT_SMALL, colObs.w).slice(0, 2)
      : [];
    const lineCount = Math.max(nomeLines.length, obsLines.length, 1);
    const rowHeight = Math.max(ROW_H_BASE, 8 + (lineCount - 1) * LINE_SPACING);
    const startsBlock =
      row.tipo === 'tecnica' &&
      nextTechnicalBlock &&
      row.idx === nextTechnicalBlock.definition.startOrder;
    const isNotechsStart =
      row.tipo === 'notechs' && (ri === 0 || allRows[ri - 1].tipo === 'tecnica');
    const required = rowHeight + (startsBlock ? 11 : 0) + (isNotechsStart ? 16 : 0);

    if (position.y - required < CONTENT_BOTTOM) {
      position = addContinuationPage(ctx, 'Itens avaliados');
      position = drawTableHeader(position, true);
      pageStartedInsideNotechs = row.tipo === 'notechs' && !isNotechsStart;
      if (pageStartedInsideNotechs) position = drawNotechsBanner(position, true);
    }

    if (startsBlock && nextTechnicalBlock) {
      position.page.drawRectangle({
        x: margin,
        y: position.y - 8,
        width: contentWidth,
        height: 8,
        color: rgb(0.9, 0.94, 0.96),
      });
      drawText(
        position.page,
        nextTechnicalBlock.definition.title,
        margin + 3,
        position.y - 5.2,
        fontBold,
        6,
        COLOR.text,
      );
      position.y -= 9;
      activeTechnicalBlockIndex += 1;
      nextTechnicalBlock = specialBlocks?.[activeTechnicalBlockIndex] || null;
    }

    if (isNotechsStart) {
      notechsRowIdx = 0;
      position = drawNotechsBanner(position);
    }
    if (row.tipo === 'notechs') notechsRowIdx += 1;

    if (ri % 2 === 0) {
      position.page.drawRectangle({
        x: margin,
        y: position.y - rowHeight,
        width: contentWidth,
        height: rowHeight,
        color: COLOR.bgLight,
      });
    }

    const textY = position.y - 4;
    const rowNum = row.tipo === 'notechs' ? notechsRowIdx : row.idx;
    drawText(
      position.page,
      String(rowNum).padStart(2, '0'),
      colNum.x,
      textY,
      fontRegular,
      TABLE_FONT,
      COLOR.textSecondary,
    );
    const codeText = row.codigo.length > 13 ? `${row.codigo.substring(0, 12)}…` : row.codigo;
    drawText(
      position.page,
      codeText,
      colCodigo.x,
      textY,
      fontRegular,
      TABLE_FONT_SMALL,
      COLOR.textSecondary,
    );

    if (!specialDefinition?.hideTripulanteBadge) {
      const badgeW = 8;
      const badgeH = 5;
      const badgeX = colTrip.x + (colTrip.w - badgeW) / 2;
      const badgeY = position.y - Math.min(rowHeight, ROW_H_BASE) + 2;
      const tripColor =
        row.tripulante === 'A' ? COLOR.tripA : row.tripulante === 'B' ? COLOR.tripB : COLOR.border;
      position.page.drawRectangle({
        x: badgeX,
        y: badgeY,
        width: badgeW,
        height: badgeH,
        color: tripColor,
      });
      drawTextCentered(
        position.page,
        row.tripulante,
        badgeX,
        badgeY + 1.2,
        badgeW,
        fontBold,
        5,
        COLOR.text,
      );
    }

    nomeLines.forEach((line, index) =>
      drawText(
        position.page,
        line,
        colItens.x,
        textY - index * LINE_SPACING,
        fontRegular,
        TABLE_FONT,
        COLOR.text,
      ),
    );
    obsLines.forEach((line, index) =>
      drawText(
        position.page,
        line,
        colObs.x,
        textY - index * LINE_SPACING,
        fontRegular,
        TABLE_FONT_SMALL,
        COLOR.textSecondary,
      ),
    );

    const badgeSize = 10;
    const badgeX = colNota.x + (colNota.w - badgeSize) / 2;
    const badgeY = position.y - Math.min(rowHeight, ROW_H_BASE) + 2;
    if (row.resultado !== null) {
      position.page.drawRectangle({
        x: badgeX,
        y: badgeY,
        width: badgeSize,
        height: badgeSize,
        color: getScoreBgColor(row.resultado),
      });
      drawTextCentered(
        position.page,
        String(row.resultado),
        badgeX,
        badgeY + 3,
        badgeSize,
        fontBold,
        7,
        COLOR.white,
      );
    } else {
      position.page.drawRectangle({
        x: badgeX,
        y: badgeY,
        width: badgeSize,
        height: badgeSize,
        color: COLOR.border,
      });
      drawTextCentered(
        position.page,
        '-',
        badgeX,
        badgeY + 3,
        badgeSize,
        fontRegular,
        6,
        COLOR.textSecondary,
      );
    }

    position.y -= rowHeight;
    pageStartedInsideNotechs = false;
  }

  return position;
}

function drawObservacoesSection(
  ctx: PdfRenderContext,
  initialPosition: RenderPosition,
): RenderPosition {
  const { fontRegular, fontBold, dados, contentWidth } = ctx;
  const allLines = wrapText(dados.observacoes_gerais || '-', fontRegular, 6, contentWidth - 10);
  let position = initialPosition;
  let offset = 0;
  let continued = false;

  while (offset < allLines.length) {
    position = ensureSpace(ctx, position, 48, 'Observações');
    const availableHeight = position.y - CONTENT_BOTTOM;
    const maxLines = Math.max(1, Math.floor((availableHeight - 28) / 8));
    const chunk = allLines.slice(offset, offset + maxLines);
    const boxHeight = Math.max(28, chunk.length * 8 + 12);

    drawText(
      position.page,
      continued ? 'OBSERVAÇÕES (continuação)' : 'OBSERVAÇÕES',
      PAGE.margin,
      position.y,
      fontBold,
      7,
      COLOR.text,
    );
    const boxTop = position.y - 10;
    position.page.drawRectangle({
      x: PAGE.margin,
      y: boxTop - boxHeight,
      width: contentWidth,
      height: boxHeight,
      color: COLOR.bgLight,
      borderColor: COLOR.border,
      borderWidth: 0.5,
    });
    drawWrappedText(
      position.page,
      chunk,
      PAGE.margin + 5,
      boxTop - 8,
      fontRegular,
      6,
      8,
      COLOR.text,
    );
    position.y = boxTop - boxHeight;
    offset += chunk.length;
    continued = true;
    if (offset < allLines.length) position = addContinuationPage(ctx, 'Observações');
  }

  return position;
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

function drawDisclaimerTextPaginated(
  ctx: PdfRenderContext,
  initialPosition: RenderPosition,
  text: string,
): RenderPosition {
  const lines = wrapText(text, ctx.fontRegular, 5.5, ctx.contentWidth - 4);
  let position = initialPosition;
  for (const line of lines) {
    if (position.y - 8 < CONTENT_BOTTOM) {
      position = addContinuationPage(ctx, 'Notas e ressalvas');
    }
    position.y -= 8;
    drawText(
      position.page,
      line,
      PAGE.margin + 2,
      position.y,
      ctx.fontRegular,
      5.5,
      COLOR.textSecondary,
    );
  }
  position.y -= 4;
  return position;
}

function drawFooter(
  page: PDFPage,
  fontRegular: PDFFont,
  dados: FichaPDFData,
  contentWidth: number,
  pageNumber: number,
  totalPages: number,
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

  const generatedAt = `Gerado em: ${new Date().toLocaleString('pt-BR')} | Página ${pageNumber}/${totalPages}`;
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
