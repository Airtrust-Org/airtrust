/**
 * GERADOR DE CERTIFICADOS EM PDF
 * Template simplificado com layout vertical ajustado
 */

import { PDFDocument, rgb, StandardFonts, PDFPage, PDFFont } from 'pdf-lib';
import qrcode from 'qrcode-generator';

export interface CertificadoData {
  funcionario_nome: string;
  funcionario_cpf: string;
  funcionario_codigo_anac: string;
  funcionario_matricula: string;
  qualificacao_nome: string;
  qualificacao_codigo: string;
  qualificacao_categoria: string;
  data_conclusao: string;
  data_vencimento: string;
  numero_certificado: string;
  carga_horaria?: number;
  instrutor?: string;
  local?: string;
  nota?: number;
  logoBytes?: Uint8Array;
  templateHtml?: string;
  nome_empresa?: string;
  conteudo?: string;
  funcao?: string;
  verification_base_url?: string;
}

function normalizeCompanyDisplayName(value?: string | null): string {
  const raw = String(value || 'AirTrust')
    .replace(/\s+/g, ' ')
    .trim();
  if (!raw) return 'AirTrust';

  if (/^airtrust(?:\s+airtrust)?\s+test$/i.test(raw)) {
    return 'AirTrust';
  }

  const tokens = raw.split(' ');
  const normalizedTokens = tokens.filter((token, index) => {
    if (index === 0) return true;
    return token.toLowerCase() !== tokens[index - 1].toLowerCase();
  });

  const normalized = normalizedTokens.join(' ');
  if (/^airtrust\s+test$/i.test(normalized)) {
    return 'AirTrust';
  }

  return normalized;
}

function parseDateOnly(value?: string | null): Date | null {
  const raw = String(value || '').trim();
  if (!raw) return null;
  const match = raw.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!match) return null;
  return new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
}

// Cores do template
const COLORS = {
  primary: rgb(0, 0.23, 0.44), // #003b6f
  secondary: rgb(0.06, 0.44, 0.75), // #0f6fbf
  accent: rgb(0.96, 0.69, 0), // #f4b000
  textMain: rgb(0.13, 0.13, 0.13), // #222222
  textMuted: rgb(0.4, 0.4, 0.4), // #666666
  borderSoft: rgb(0.83, 0.86, 0.9), // #d4dce5
  bgSoft: rgb(0.96, 0.97, 0.98), // #f5f7fb
  white: rgb(1, 1, 1),
};

/**
 * Gera certificado em PDF com template profissional corporativo
 */
export async function gerarCertificadoPDF(data: CertificadoData): Promise<Uint8Array> {
  try {
    const pdfDoc = await PDFDocument.create();
    const page = pdfDoc.addPage([595.28, 841.89]); // A4

    // Carregar fontes
    const fontBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
    const fontRegular = await pdfDoc.embedFont(StandardFonts.Helvetica);

    const { width, height } = page.getSize();
    const marginX = 79; // 28mm
    const marginY = 40; // REDUZIDO de 60 para 40 - sobe ainda mais o conteúdo

    let currentY = height - marginY;

    // REMOVIDO: ID do certificado no topo direito

    // ========================================
    // 1. LOGO CENTRALIZADO (SEM MOLDURA)
    // ========================================

    if (data.logoBytes && data.logoBytes.length > 0) {
      try {
        let logoImage;
        try {
          logoImage = await pdfDoc.embedPng(data.logoBytes);
        } catch (e) {
          logoImage = await pdfDoc.embedJpg(data.logoBytes);
        }

        if (logoImage) {
          const maxLogoHeight = 50; // 50% do tamanho original (100px)
          const scaleFactor = maxLogoHeight / logoImage.height;
          const drawWidth = logoImage.width * scaleFactor;
          const drawHeight = maxLogoHeight;

          // Centralizar logo
          const logoX = (width - drawWidth) / 2;

          page.drawImage(logoImage, {
            x: logoX,
            y: currentY - drawHeight,
            width: drawWidth,
            height: drawHeight,
          });

          currentY -= drawHeight + 20;
        }
      } catch (err) {
        console.warn('Erro ao embutir logo:', err);
        currentY -= 100;
      }
    } else {
      currentY -= 100;
    }

    // Linha separadora
    page.drawLine({
      start: { x: marginX, y: currentY },
      end: { x: width - marginX, y: currentY },
      thickness: 2,
      color: COLORS.borderSoft,
    });

    currentY -= 40;

    // ========================================
    // 2. TÍTULO DO CERTIFICADO
    // ========================================

    // Título "CERTIFICADO"
    const titleText = 'CERTIFICADO';
    const titleSize = 28;
    const titleWidth = fontBold.widthOfTextAtSize(titleText, titleSize);
    page.drawText(titleText, {
      x: (width - titleWidth) / 2,
      y: currentY,
      size: titleSize,
      font: fontBold,
      color: COLORS.primary,
    });

    currentY -= 50;

    // ========================================
    // 3. SEÇÕES VERTICAIS (FUNCIONÁRIO PRIMEIRO, QUALIFICAÇÃO DEPOIS)
    // ========================================

    const sectionWidth = width - marginX * 2;

    // SEÇÃO 1: FUNCIONÁRIO (primeiro - trocado de posição)
    const funcionarioHeight = 100;
    const funcao = data.funcao || 'N/A'; // Função do funcionário (Copiloto, Comandante, etc.)

    drawDataSection(
      page,
      marginX,
      currentY,
      sectionWidth,
      funcionarioHeight,
      'FUNCIONÁRIO',
      [
        { label: 'NOME', value: truncateText(data.funcionario_nome, 50) },
        {
          label: 'CÓDIGO ANAC',
          value: data.funcionario_codigo_anac || 'N/A',
        },
        {
          label: 'CPF',
          value: formatarCPF(data.funcionario_cpf),
        },
        {
          label: 'FUNÇÃO',
          value: funcao,
        },
      ],
      fontBold,
      fontRegular,
    );

    currentY -= funcionarioHeight + 20;

    // SEÇÃO 2: QUALIFICAÇÃO (depois - trocado de posição)
    // Altura aumentada para acomodar nome completo da qualificação E evitar texto colado na borda
    const qualificacaoHeight = 185;

    // Calcular validade TOTAL da qualificação (diferença entre vencimento e conclusão)
    let validadeMeses = 'Indeterminada';
    if (data.data_vencimento && data.data_conclusao) {
      const conclusao = parseDateOnly(data.data_conclusao);
      const vencimento = parseDateOnly(data.data_vencimento);

      if (conclusao && vencimento) {
        // Calcular diferença em meses entre conclusão e vencimento
        let meses = (vencimento.getFullYear() - conclusao.getFullYear()) * 12;
        meses += vencimento.getMonth() - conclusao.getMonth();

        if (meses <= 0) {
          validadeMeses = 'Indeterminada';
        } else if (meses === 1) {
          validadeMeses = '1 mês';
        } else {
          validadeMeses = `${meses} meses`;
        }
      }
    }

    drawQualificacaoSection(
      page,
      marginX,
      currentY,
      sectionWidth,
      qualificacaoHeight,
      'QUALIFICAÇÃO',
      {
        nome: data.qualificacao_nome, // Nome completo sem truncar
        codigo: data.qualificacao_codigo,
        categoria: data.qualificacao_categoria || 'N/A',
        conclusao: formatarData(data.data_conclusao),
        vencimento: data.data_vencimento ? formatarData(data.data_vencimento) : 'Indeterminada',
        validade: validadeMeses,
      },
      fontBold,
      fontRegular,
    );

    currentY -= qualificacaoHeight + 30;

    // ========================================
    // 4. FOOTER SECTION (VERTICAL - ASSINATURA + VERIFICAÇÃO)
    // ========================================

    const nomeEmpresa = normalizeCompanyDisplayName(data.nome_empresa);
    const certId = data.numero_certificado || 'N/A';

    // ASSINATURA CENTRALIZADA
    const assinaturaY = currentY;

    // Linha de assinatura centralizada
    const linhaWidth = 200;
    const linhaX = (width - linhaWidth) / 2;

    page.drawLine({
      start: { x: linhaX, y: assinaturaY },
      end: { x: linhaX + linhaWidth, y: assinaturaY },
      thickness: 1,
      color: COLORS.borderSoft,
    });

    currentY = assinaturaY - 16;

    // Textos centralizados
    const textos = [
      { text: 'ASSINATURA ELETRÔNICA AUTENTICADA', size: 9, font: fontRegular },
      { text: 'Responsável pela Certificação Digital', size: 10, font: fontBold },
      { text: `${nomeEmpresa} - Departamento de Treinamento`, size: 9, font: fontRegular },
    ];

    textos.forEach((item, index) => {
      const textWidth = item.font.widthOfTextAtSize(item.text, item.size);
      page.drawText(item.text, {
        x: (width - textWidth) / 2,
        y: currentY,
        size: item.size,
        font: item.font,
        color: index === 0 ? COLORS.textMuted : index === 1 ? COLORS.textMain : COLORS.textMuted,
      });
      currentY -= item.size + 4;
    });

    currentY -= 5; // Espaçamento de 5px entre assinatura e quadro de verificação

    // VERIFICAÇÃO (ABAIXO DA ASSINATURA)
    const verificationBoxY = currentY;
    const verificationBoxWidth = sectionWidth * 0.65; // 65% da largura para mais espaço
    const verificationBoxX = (width - verificationBoxWidth) / 2; // Centralizado
    const verificationBoxHeight = 110; // Aumentado para 110 para dar mais espaço

    // Borda tracejada
    page.drawRectangle({
      x: verificationBoxX,
      y: verificationBoxY - verificationBoxHeight,
      width: verificationBoxWidth,
      height: verificationBoxHeight,
      borderColor: COLORS.borderSoft,
      borderWidth: 1,
      borderDashArray: [3, 3],
    });

    let verifyY = verificationBoxY - 15;

    // Título
    const verifyTitleText = 'VERIFICAÇÃO';
    const verifyTitleWidth = fontBold.widthOfTextAtSize(verifyTitleText, 9);
    page.drawText(verifyTitleText, {
      x: verificationBoxX + (verificationBoxWidth - verifyTitleWidth) / 2,
      y: verifyY,
      size: 9,
      font: fontBold,
      color: COLORS.primary,
    });

    verifyY -= 22;

    // Hash - USAR AWAIT porque função é async agora
    const hash = await gerarHashCertificado(data);
    page.drawText('HASH', {
      x: verificationBoxX + 10,
      y: verifyY,
      size: 8,
      font: fontRegular,
      color: COLORS.textMuted,
    });

    verifyY -= 12;

    // Hash em 2 linhas
    const hashPart1 = hash.substring(0, 8);
    const hashPart2 = hash.substring(8, 16);

    page.drawText(hashPart1, {
      x: verificationBoxX + 10,
      y: verifyY,
      size: 9,
      font: fontRegular,
      color: COLORS.textMain,
    });

    verifyY -= 10;

    page.drawText(hashPart2, {
      x: verificationBoxX + 10,
      y: verifyY,
      size: 9,
      font: fontRegular,
      color: COLORS.textMain,
    });

    verifyY -= 18;

    // ID - Truncar se necessário para não sair da margem
    page.drawText('ID', {
      x: verificationBoxX + 10,
      y: verifyY,
      size: 8,
      font: fontRegular,
      color: COLORS.textMuted,
    });

    verifyY -= 12;

    // Truncar ID para caber na caixa (máximo ~40 caracteres para fonte 9)
    const maxIdWidth = verificationBoxWidth - 20;
    let displayId = certId;
    let idWidth = fontRegular.widthOfTextAtSize(displayId, 9);

    while (idWidth > maxIdWidth && displayId.length > 10) {
      displayId = displayId.substring(0, displayId.length - 4) + '...';
      idWidth = fontRegular.widthOfTextAtSize(displayId, 9);
    }

    page.drawText(displayId, {
      x: verificationBoxX + 10,
      y: verifyY,
      size: 9,
      font: fontRegular,
      color: COLORS.textMain,
    });

    // QR Code REAL com URL de verificação
    const qrSize = 50; // Aumentado de 35 para 50 para melhor visibilidade
    const qrX = verificationBoxX + verificationBoxWidth - qrSize - 15;
    const qrY = verificationBoxY - verificationBoxHeight + 15;

    try {
      const verificationBaseUrl = (data.verification_base_url || 'https://airtrust.online').replace(
        /\/$/,
        '',
      );
      const verificationUrl = `${verificationBaseUrl}/validar/${hash}`;

      console.log(`🔍 [PDF] Gerando QR Code para URL: ${verificationUrl}`);

      // Criar QR Code usando qrcode-generator (funciona sem canvas)
      const qr = qrcode(0, 'M'); // type 0 = auto, error correction level M
      qr.addData(verificationUrl);
      qr.make();

      const moduleCount = qr.getModuleCount();

      // Calcular tamanho de cada módulo para caber no espaço disponível
      const moduleSize = qrSize / moduleCount;

      console.log(
        `🔍 [PDF] QR Code: ${moduleCount}x${moduleCount} módulos, tamanho módulo: ${moduleSize}px`,
      );

      // Desenhar QR Code diretamente no PDF usando retângulos
      // Fundo branco
      page.drawRectangle({
        x: qrX,
        y: qrY,
        width: qrSize,
        height: qrSize,
        color: rgb(1, 1, 1), // Branco
      });

      // Desenhar módulos pretos
      for (let row = 0; row < moduleCount; row++) {
        for (let col = 0; col < moduleCount; col++) {
          if (qr.isDark(row, col)) {
            page.drawRectangle({
              x: qrX + col * moduleSize,
              y: qrY + (moduleCount - 1 - row) * moduleSize, // Inverter Y
              width: moduleSize,
              height: moduleSize,
              color: rgb(0, 0.23, 0.44), // #003b6f convertido para RGB
            });
          }
        }
      }

      console.log(`✅ [PDF] QR Code desenhado com sucesso!`);
    } catch (qrError) {
      console.error('❌ [PDF] Erro ao gerar QR Code:', qrError);
      console.error('❌ [PDF] Stack:', (qrError as Error).stack);
      // Fallback: desenhar texto QR se falhar
      page.drawText('QR', {
        x: qrX + 10,
        y: qrY + 12,
        size: 10,
        font: fontBold,
        color: COLORS.textMuted,
      });
    }

    // ========================================
    // 5. META FOOTER
    // ========================================

    const metaY = 60;

    // Linha separadora
    page.drawLine({
      start: { x: marginX, y: metaY + 18 },
      end: { x: width - marginX, y: metaY + 18 },
      thickness: 1,
      color: COLORS.borderSoft,
    });

    // Lado esquerdo
    page.drawText('Documento eletrônico • Válido somente com verificação digital', {
      x: marginX,
      y: metaY,
      size: 8,
      font: fontRegular,
      color: COLORS.textMuted,
    });

    // Lado direito
    const metaRight1 = `Qualificação: ${data.qualificacao_codigo}`;
    const metaRight2 = `Emitido por: ${nomeEmpresa}`;

    const meta1Width = fontRegular.widthOfTextAtSize(metaRight1, 8);
    const meta2Width = fontRegular.widthOfTextAtSize(metaRight2, 8);

    page.drawText(metaRight1, {
      x: width - marginX - meta1Width,
      y: metaY + 10,
      size: 8,
      font: fontRegular,
      color: COLORS.textMuted,
    });

    page.drawText(metaRight2, {
      x: width - marginX - meta2Width,
      y: metaY,
      size: 8,
      font: fontRegular,
      color: COLORS.textMuted,
    });

    // Serializar PDF
    const pdfBytes = await pdfDoc.save();
    const pdfResult = pdfBytes instanceof Uint8Array ? pdfBytes : new Uint8Array(pdfBytes);

    console.log(`✅ [PDF] Certificado gerado: ${pdfResult.length} bytes`);
    return pdfResult;
  } catch (error) {
    console.error('❌ [PDF] Erro ao gerar:', error);
    throw new Error(
      `Falha ao gerar PDF: ${error instanceof Error ? error.message : 'Erro desconhecido'}`,
    );
  }
}

/**
 * Desenha uma seção de dados em largura total (padrão)
 */
function drawDataSection(
  page: PDFPage,
  x: number,
  y: number,
  width: number,
  height: number,
  title: string,
  fields: Array<{ label: string; value: string }>,
  fontBold: PDFFont,
  fontRegular: PDFFont,
) {
  // Fundo e borda
  page.drawRectangle({
    x,
    y: y - height,
    width,
    height,
    color: COLORS.bgSoft,
    borderColor: COLORS.borderSoft,
    borderWidth: 1,
  });

  // Título
  page.drawText(title, {
    x: x + 12,
    y: y - 18,
    size: 10,
    font: fontBold,
    color: COLORS.textMuted,
  });

  // Campos em 2 colunas
  const columnWidth = (width - 40) / 2;
  let fieldY = y - 40;
  let column = 0;

  fields.forEach((field, index) => {
    const fieldX = x + 12 + column * (columnWidth + 16);

    // Label
    page.drawText(field.label, {
      x: fieldX,
      y: fieldY,
      size: 8,
      font: fontRegular,
      color: COLORS.textMuted,
    });

    // Value
    const valueSize = 10;
    page.drawText(truncateText(field.value, 35), {
      x: fieldX,
      y: fieldY - 14,
      size: valueSize,
      font: fontBold,
      color: COLORS.textMain,
    });

    // Alternar coluna
    column++;
    if (column >= 2) {
      column = 0;
      fieldY -= 36;
    }
  });
}

/**
 * Desenha seção de qualificação com nome completo
 */
function drawQualificacaoSection(
  page: PDFPage,
  x: number,
  y: number,
  width: number,
  height: number,
  title: string,
  data: {
    nome: string;
    codigo: string;
    categoria: string;
    carga_horaria?: string;
    conclusao: string;
    vencimento: string;
    validade: string;
  },
  fontBold: PDFFont,
  fontRegular: PDFFont,
) {
  // Fundo e borda
  page.drawRectangle({
    x,
    y: y - height,
    width,
    height,
    color: COLORS.bgSoft,
    borderColor: COLORS.borderSoft,
    borderWidth: 1,
  });

  // Título
  page.drawText(title, {
    x: x + 12,
    y: y - 18,
    size: 10,
    font: fontBold,
    color: COLORS.textMuted,
  });

  let fieldY = y - 40;

  // NOME - Linha completa, pode quebrar em 2 linhas se necessário
  page.drawText('NOME', {
    x: x + 12,
    y: fieldY,
    size: 8,
    font: fontRegular,
    color: COLORS.textMuted,
  });

  fieldY -= 14;

  // Quebrar nome se for muito longo (mais de 60 caracteres)
  const maxCharsPerLine = 60;
  if (data.nome.length > maxCharsPerLine) {
    const nomeParte1 = data.nome.substring(0, maxCharsPerLine);
    const nomeParte2 = data.nome.substring(maxCharsPerLine);

    page.drawText(nomeParte1, {
      x: x + 12,
      y: fieldY,
      size: 10,
      font: fontBold,
      color: COLORS.textMain,
    });

    fieldY -= 12;

    page.drawText(nomeParte2, {
      x: x + 12,
      y: fieldY,
      size: 10,
      font: fontBold,
      color: COLORS.textMain,
    });
  } else {
    page.drawText(data.nome, {
      x: x + 12,
      y: fieldY,
      size: 10,
      font: fontBold,
      color: COLORS.textMain,
    });
  }

  fieldY -= 30;

  // Demais campos em 2 colunas
  const columnWidth = (width - 40) / 2;
  const fields = [
    { label: 'CÓDIGO', value: data.codigo },
    { label: 'CATEGORIA', value: data.categoria },
    { label: 'VALIDADE', value: data.validade },
    { label: 'CONCLUSÃO', value: data.conclusao },
    { label: 'VENCIMENTO', value: data.vencimento },
  ];

  let column = 0;

  fields.forEach((field) => {
    const fieldX = x + 12 + column * (columnWidth + 16);

    // Label
    page.drawText(field.label, {
      x: fieldX,
      y: fieldY,
      size: 8,
      font: fontRegular,
      color: COLORS.textMuted,
    });

    // Value
    page.drawText(truncateText(field.value, 25), {
      x: fieldX,
      y: fieldY - 14,
      size: 10,
      font: fontBold,
      color: COLORS.textMain,
    });

    // Alternar coluna
    column++;
    if (column >= 2) {
      column = 0;
      fieldY -= 36;
    }
  });
}

/**
 * Trunca texto se for muito longo
 */
function truncateText(text: string, maxLength: number): string {
  if (text.length <= maxLength) return text;
  return text.substring(0, maxLength - 3) + '...';
}

/**
 * Formata CPF
 */
function formatarCPF(cpf: string): string {
  const limpo = cpf.replace(/\D/g, '');
  if (limpo.length !== 11) return cpf;
  return limpo.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, '$1.$2.$3-$4');
}

/**
 * Formata data
 */
function formatarData(isoDate: string): string {
  try {
    const date = new Date(isoDate);
    return date.toLocaleDateString('pt-BR', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
    });
  } catch {
    return 'Data inválida';
  }
}

/**
 * Gera hash SHA-256 de verificação do certificado (sem zeros no início)
 */
async function gerarHashCertificado(data: CertificadoData): Promise<string> {
  try {
    // Limpar CPF (remover formatação)
    const cpfLimpo = data.funcionario_cpf.replace(/[.\-\s]/g, '');
    const str = `${cpfLimpo}${data.qualificacao_codigo}${data.data_conclusao}${data.numero_certificado}`;

    // Converter string para bytes
    const encoder = new TextEncoder();
    const dataBytes = encoder.encode(str);

    // Gerar SHA-256
    const hashBuffer = await crypto.subtle.digest('SHA-256', dataBytes);
    const hashArray = Array.from(new Uint8Array(hashBuffer));

    // Converter para hex (primeiros 16 caracteres)
    const hashHex = hashArray
      .map((b) => b.toString(16).padStart(2, '0'))
      .join('')
      .substring(0, 16)
      .toUpperCase();

    return hashHex;
  } catch (error) {
    console.error('Erro ao gerar hash:', error);
    return 'ERROR000000000';
  }
}

/**
 * Cria PNG do QR Code sem usar canvas (compatível com Cloudflare Workers)
 */
function createQRPNG(qr: any, scale: number): Uint8Array {
  const moduleCount = qr.getModuleCount();
  const size = moduleCount * scale;

  // Criar bitmap simples (preto e branco) - cada pixel: 4 bytes (RGBA)
  const pixels = new Uint8Array(size * size * 4);

  for (let row = 0; row < moduleCount; row++) {
    for (let col = 0; col < moduleCount; col++) {
      const isDark = qr.isDark(row, col);

      for (let dy = 0; dy < scale; dy++) {
        for (let dx = 0; dx < scale; dx++) {
          const y = row * scale + dy;
          const x = col * scale + dx;
          const idx = (y * size + x) * 4;

          if (isDark) {
            pixels[idx] = 0;
            pixels[idx + 1] = 59;
            pixels[idx + 2] = 111;
            pixels[idx + 3] = 255;
          } else {
            pixels[idx] = 255;
            pixels[idx + 1] = 255;
            pixels[idx + 2] = 255;
            pixels[idx + 3] = 255;
          }
        }
      }
    }
  }

  return encodePNG(pixels, size, size);
}

function encodePNG(pixels: Uint8Array, width: number, height: number): Uint8Array {
  const signature = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]);
  const ihdr = createPNGChunk(
    'IHDR',
    new Uint8Array([...intToBytes(width, 4), ...intToBytes(height, 4), 8, 6, 0, 0, 0]),
  );

  const imageData = new Uint8Array(height * (1 + width * 4));
  for (let y = 0; y < height; y++) {
    imageData[y * (1 + width * 4)] = 0;
    for (let x = 0; x < width; x++) {
      const srcIdx = (y * width + x) * 4;
      const dstIdx = y * (1 + width * 4) + 1 + x * 4;
      imageData[dstIdx] = pixels[srcIdx];
      imageData[dstIdx + 1] = pixels[srcIdx + 1];
      imageData[dstIdx + 2] = pixels[srcIdx + 2];
      imageData[dstIdx + 3] = pixels[srcIdx + 3];
    }
  }

  const compressed = deflateSimple(imageData);
  const idat = createPNGChunk('IDAT', compressed);
  const iend = createPNGChunk('IEND', new Uint8Array(0));

  const totalLength = signature.length + ihdr.length + idat.length + iend.length;
  const png = new Uint8Array(totalLength);
  let offset = 0;
  png.set(signature, offset);
  offset += signature.length;
  png.set(ihdr, offset);
  offset += ihdr.length;
  png.set(idat, offset);
  offset += idat.length;
  png.set(iend, offset);

  return png;
}

function createPNGChunk(type: string, data: Uint8Array): Uint8Array {
  const chunk = new Uint8Array(12 + data.length);
  chunk.set(intToBytes(data.length, 4), 0);
  for (let i = 0; i < 4; i++) chunk[4 + i] = type.charCodeAt(i);
  chunk.set(data, 8);
  const crc = crc32(chunk.slice(4, 8 + data.length));
  chunk.set(intToBytes(crc, 4), 8 + data.length);
  return chunk;
}

function intToBytes(value: number, bytes: number): number[] {
  const result = [];
  for (let i = bytes - 1; i >= 0; i--) result.push((value >> (i * 8)) & 0xff);
  return result;
}

function crc32(data: Uint8Array): number {
  let crc = 0xffffffff;
  for (let i = 0; i < data.length; i++) {
    crc ^= data[i];
    for (let j = 0; j < 8; j++) crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function deflateSimple(data: Uint8Array): Uint8Array {
  const result = new Uint8Array(data.length + 6);
  result[0] = 0x78;
  result[1] = 0x01;
  result.set(data, 2);
  const adler = adler32(data);
  result[result.length - 4] = (adler >> 24) & 0xff;
  result[result.length - 3] = (adler >> 16) & 0xff;
  result[result.length - 2] = (adler >> 8) & 0xff;
  result[result.length - 1] = adler & 0xff;
  return result;
}

function adler32(data: Uint8Array): number {
  let a = 1,
    b = 0;
  for (let i = 0; i < data.length; i++) {
    a = (a + data[i]) % 65521;
    b = (b + a) % 65521;
  }
  return (b << 16) | a;
}
