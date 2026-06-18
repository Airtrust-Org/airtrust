/**
 * SERVICE: Geração de PDF da Ficha de Treinamento (Cliente)
 * Stack: jsPDF
 * Output: PDF A4 comprimido
 *
 * Este serviço gera o PDF no navegador do cliente,
 * evitando problemas de compatibilidade com Cloudflare Workers.
 *
 * Versão: 2.0 - Layout melhorado
 */

export interface FichaPDFData {
  fichaId: string | number;
  sessao_titulo: string;
  tripulante_nome: string;
  tripulante_codigo_anac?: string;
  tripulante_funcao: string;
  instrutor_nome: string;
  instrutor_codigo_anac?: string;
  data: string;
  horario_inicio: string;
  horario_fim: string;
  simulador: string;
  carga_horaria_total?: string;
  carga_horaria_pf?: string;
  carga_horaria_pm?: string;
  tripulacao_nomes?: string;
  status: string;
  observacoes_gerais?: string;
  assinatura_aluno_timestamp?: string | null;
  assinatura_instrutor_timestamp?: string | null;
  assinatura_aluno_dataUrl?: string | null;
  assinatura_instrutor_dataUrl?: string | null;
  logoUrl?: string; // URL do logo da empresa
  modoModelo?: boolean;
  fileName?: string;
  manobras: Array<{
    ordem: number;
    nome?: string;
    descricao: string;
    codigo: string;
    resultado: number | string | null;
    observacoes?: string;
    tripulante?: 'A' | 'B' | 'AB';
  }>;
}

export interface FichaPdfTableLayout {
  codigoWidth: number;
  itensWidth: number;
  notaBadgeHeight: number;
  notaBadgeWidth: number;
  obsWidth: number;
  positions: {
    codigo: number;
    itens: number;
    nota: number;
    num: number;
    obs: number;
    tripulante: number;
  };
  tripulanteWidth: number;
}

export function getFichaPdfTableHeaders() {
  return ['#', 'CÓDIGO', 'TRIP.', 'ITENS', 'OBSERVAÇÕES', 'NOTA'] as const;
}

import { getAccessToken } from '@/react-app/config/api';
import { apiFetch } from '@/react-app/lib/apiFetch';
import { previewPdfBeforeDownload } from '@/react-app/utils/pdfPreview';
import { FICHA_AVALIACAO_FAIXAS, FICHA_AVALIACAO_NOTAS } from '@/react-app/pages/simuladores/fichas/avaliacaoScale';

function isSafariBrowser(): boolean {
  if (typeof navigator === 'undefined') return false;
  const ua = navigator.userAgent;
  const vendor = navigator.vendor || '';
  const isApple = /Apple/i.test(vendor);
  const hasSafari = /Safari/i.test(ua);
  const isChromium = /Chrome|CriOS|Edg|OPR|Brave/i.test(ua);
  return isApple && hasSafari && !isChromium;
}

function downloadBlobDirect(blob: Blob, fileName: string): void {
  const objectUrl = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = objectUrl;
  anchor.download = fileName;
  document.body.appendChild(anchor);
  anchor.click();
  document.body.removeChild(anchor);
  URL.revokeObjectURL(objectUrl);
}

// Cores do Design System
const COLORS = {
  primary: '#2180B0',
  danger: '#C0152F',
  success: '#208090',
  warning: '#F5A623',
  orange: '#E67E22',
  yellow: '#F1C40F',
  text: '#134252',
  textSecondary: '#626C7C',
  border: '#E0E4E8',
  bgLight: '#F5F7FA',
  white: '#FFFFFF',
};

const FICHA_AVALIACAO_SCALE_HEIGHT = 26;

export function getFichaPdfTableLayout(margin: number): FichaPdfTableLayout {
  return {
    positions: {
      num: margin + 3,
      codigo: margin + 10,
      tripulante: margin + 28,
      itens: margin + 35,
      obs: margin + 80,
      nota: margin + 172,
    },
    codigoWidth: 16,
    tripulanteWidth: 10,
    itensWidth: 43,
    obsWidth: 80,
    notaBadgeWidth: 10,
    notaBadgeHeight: 4,
  };
}

function getTripulanteBadgeColors(tripulante?: 'A' | 'B' | 'AB') {
  if (tripulante === 'A') {
    return { fill: '#DBEAFE', text: '#1D4ED8' };
  }

  if (tripulante === 'B') {
    return { fill: '#FEF3C7', text: '#B45309' };
  }

  return { fill: '#E2E8F0', text: '#334155' };
}

function getContrastTextColor(hex: string): string {
  const normalized = hex.replace('#', '');
  const red = parseInt(normalized.slice(0, 2), 16);
  const green = parseInt(normalized.slice(2, 4), 16);
  const blue = parseInt(normalized.slice(4, 6), 16);
  const brightness = (red * 299 + green * 587 + blue * 114) / 1000;
  return brightness > 150 ? '#111827' : '#FFFFFF';
}

function drawFichaAvaliacaoScale(
  doc: {
    setFont: (family: string, style?: string) => void;
    setFontSize: (size: number) => void;
    setTextColor: (color: string | number, g?: number, b?: number) => void;
    setDrawColor: (color: string | number, g?: number, b?: number) => void;
    setFillColor: (color: string | number, g?: number, b?: number) => void;
    rect: (x: number, y: number, w: number, h: number, style?: string) => void;
    roundedRect: (x: number, y: number, w: number, h: number, rx: number, ry: number, style?: string) => void;
    text: (text: string | string[], x: number, y: number, options?: Record<string, unknown>) => void;
    splitTextToSize: (text: string, maxWidth: number) => string[];
  },
  x: number,
  y: number,
  width: number,
): number {
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8);
  doc.setTextColor(COLORS.text);
  doc.text('REGUA DE AVALIACAO', x, y);

  const tableY = y + 3;
  const cellWidth = width / FICHA_AVALIACAO_NOTAS.length;
  const cellHeight = 7;

  FICHA_AVALIACAO_NOTAS.forEach((nota, index) => {
    const faixa = FICHA_AVALIACAO_FAIXAS.find((candidate) => candidate.noteIndexes.includes(index));
    const fill = faixa?.color || '#94A3B8';
    doc.setFillColor(fill);
    doc.setDrawColor(COLORS.text);
    doc.rect(x + index * cellWidth, tableY, cellWidth, cellHeight, 'FD');
    doc.setTextColor(getContrastTextColor(fill));
    doc.text(String(nota), x + index * cellWidth + cellWidth / 2, tableY + 4.7, { align: 'center' });
  });

  const legendTop = tableY + cellHeight + 2;
  const legendGap = 2;
  const legendWidth = (width - legendGap) / 2;
  const legendHeight = 6.5;

  FICHA_AVALIACAO_FAIXAS.forEach((faixa, index) => {
    const column = index % 2;
    const row = Math.floor(index / 2);
    const bandX = x + column * (legendWidth + legendGap);
    const bandY = legendTop + row * (legendHeight + 1.5);

    doc.setFillColor(COLORS.bgLight);
    doc.setDrawColor(COLORS.border);
    doc.roundedRect(bandX, bandY, legendWidth, legendHeight, 1.5, 1.5, 'FD');

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(5.7);
    doc.setTextColor(faixa.color);
    doc.text(faixa.rangeLabel, bandX + 2, bandY + 2.5);

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(4.9);
    doc.setTextColor(COLORS.textSecondary);
    const lines = doc.splitTextToSize(faixa.description, legendWidth - 12).slice(0, 3);
    doc.text(lines, bandX + 10, bandY + 2.5);
  });

  return legendTop + legendHeight * 2 + 2.5;
}

/**
 * Formata data para dd/mm/yyyy
 */
function formatarData(data: string): string {
  if (!data) return '';

  // Se já estiver no formato dd/mm/yyyy, retorna
  if (/^\d{2}\/\d{2}\/\d{4}$/.test(data)) return data;

  // Para formatos ISO iniciando com yyyy-mm-dd, usar SEMPRE a parte da data local.
  // Isso evita o off-by-1 quando a string vem com timezone UTC (ex: 2026-03-25T00:00:00Z)
  // e o browser converte para UTC-3, exibindo 24/03/2026.
  const isoDateOnly = /^(\d{4})-(\d{2})-(\d{2})(?:$|T)/.exec(data);
  if (isoDateOnly) {
    const [, y, m, d] = isoDateOnly;
    return `${d}/${m}/${y}`;
  }

  // ISO com hora: usar Date normal
  try {
    const d = new Date(data);
    if (isNaN(d.getTime())) return data;
    return d.toLocaleDateString('pt-BR');
  } catch {
    return data;
  }
}

/**
 * Retorna cor baseada na nota (apenas 3 cores: vermelho, amarelo, verde)
 * Mesmas cores da tela de avaliação
 */
function getNotaColor(nota: number): string {
  if (nota >= 8) return '#10B981'; // Verde (8-10) - Excelente
  if (nota >= 5) return '#F59E0B'; // Amarelo (5-7) - Regular/Bom
  return '#EF4444'; // Vermelho (1-4) - Insatisfatório
}

function fitImageWithinBox(
  originalWidth: number,
  originalHeight: number,
  maxWidth: number,
  maxHeight: number,
): { width: number; height: number } {
  if (!originalWidth || !originalHeight) {
    return { width: maxWidth, height: maxHeight };
  }

  const scale = Math.min(maxWidth / originalWidth, maxHeight / originalHeight);

  return {
    width: originalWidth * scale,
    height: originalHeight * scale,
  };
}

function limitTextLines(lines: string[], maxLines: number): string[] {
  if (lines.length <= maxLines) {
    return lines;
  }

  const trimmed = lines.slice(0, maxLines);
  trimmed[maxLines - 1] = `${trimmed[maxLines - 1].trimEnd()}...`;
  return trimmed;
}

/**
 * Carrega uma imagem de URL e retorna como base64
 * Suporta URLs da API com autenticação e URLs externas
 */
async function loadImageAsBase64(url: string): Promise<string | null> {
  try {
    console.log('🎨 [PDF-FICHA] loadImageAsBase64 chamado com URL:', url);

    if (!url) {
      console.log('⚠️ [PDF-FICHA] URL vazia');
      return null;
    }

    // Preparar headers - adicionar token para URLs da API
    const headers: HeadersInit = {};
    const token = getAccessToken();

    // Se for URL da API (relativa ou do domínio airtrust), adicionar token
    if (url.startsWith('/api/') || url.startsWith('/') || url.includes('airtrust.workers.dev')) {
      if (token) {
        headers['Authorization'] = `Bearer ${token}`;
        console.log('🔐 [PDF-FICHA] Token adicionado ao header');
      } else {
        console.warn('⚠️ [PDF-FICHA] Token não encontrado no localStorage');
      }
    }

    console.log('📡 [PDF-FICHA] Fazendo fetch para:', url);
    // Usar apiFetch para garantir URL correta do worker em produção
    const response = await apiFetch(url, {
      mode: 'cors',
      credentials: 'omit', // Não enviar cookies para evitar problemas de CORS
      headers,
    });

    console.log(`📊 [PDF-FICHA] Response status: ${response.status}`);

    if (!response.ok) {
      console.warn(
        `❌ [PDF-FICHA] Erro ao carregar imagem: ${response.status} ${response.statusText}`,
      );
      return null;
    }

    const blob = await response.blob();
    console.log(`📦 [PDF-FICHA] Blob recebido: ${blob.size} bytes, type: ${blob.type}`);

    return new Promise((resolve) => {
      const reader = new FileReader();
      reader.onloadend = () => {
        const result = reader.result as string;
        console.log(`✅ [PDF-FICHA] Base64 gerado com sucesso: ${result.substring(0, 50)}...`);
        resolve(result);
      };
      reader.onerror = () => {
        console.warn('❌ [PDF-FICHA] Erro ao converter imagem para base64');
        resolve(null);
      };
      reader.readAsDataURL(blob);
    });
  } catch (error) {
    console.warn('❌ [PDF-FICHA] Erro ao carregar imagem:', error);
    return null;
  }
}

/**
 * Converte uma data (dd/mm/yyyy, yyyy-mm-dd ou ISO) para formato DDMMAAAA usado no nome do arquivo.
 */
function dateToFilenamePart(data: string): string {
  if (!data) return new Date().toLocaleDateString('pt-BR').replace(/\//g, '');
  // dd/mm/yyyy → DDMMAAAA
  const ptBr = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(data);
  if (ptBr) return `${ptBr[1]}${ptBr[2]}${ptBr[3]}`;
  // yyyy-mm-dd → DDMMAAAA
  const iso = /^(\d{4})-(\d{2})-(\d{2})/.exec(data);
  if (iso) return `${iso[3]}${iso[2]}${iso[1]}`;
  // fallback: remover separadores, pegar 8 chars
  return data.replace(/[/\-]/g, '').substring(0, 8);
}

/**
 * Gera o nome oficial padronizado de uma ficha de treinamento.
 * Padrão: FICHA-{NOME}-{SESSAO}-{DDMMAAAA}-{ID}.pdf
 * Exemplo: FICHA-JOAO_DA_SILVA-TRE_ATR72-15032026-000042.pdf
 */
export function buildNomeFichaOficial(
  dados: Pick<FichaPDFData, 'fichaId' | 'tripulante_nome' | 'sessao_titulo' | 'data'>,
): string {
  const sanitize = (str: string, maxLen: number) =>
    (str || '')
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-zA-Z0-9\s]/g, '')
      .replace(/\s+/g, '_')
      .toUpperCase()
      .substring(0, maxLen);

  const nome = sanitize(dados.tripulante_nome || 'SEM_NOME', 25);
  const sessao = sanitize(dados.sessao_titulo || 'SESSAO', 20);
  const data = dateToFilenamePart(dados.data || '');
  const id = String(dados.fichaId || '').padStart(6, '0');
  return `SIM-${nome}-${sessao}-${data}-${id}.pdf`;
}

/**
 * Gera PDF da ficha de treinamento
 */
export async function gerarPDFFichaCliente(
  dados: FichaPDFData,
  opts?: { previewWindow?: Window | null; mode?: 'preview' | 'download' },
): Promise<void> {
  const { jsPDF } = await import('jspdf');
  const doc = new jsPDF({
    orientation: 'portrait',
    unit: 'mm',
    format: 'a4',
  });

  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const margin = 15;
  const contentWidth = pageWidth - 2 * margin;
  let currentY = margin;
  const isModoModelo = dados.modoModelo === true;
  // ── Geometria base do header (compacto) ───────────────────────────────────
  const headerTop = 4;
  const headerHeight = 22; // compacto — logo landscape rende ~13mm de altura
  const headerBottom = headerTop + headerHeight; // = 26
  const headerCenterX = pageWidth / 2;
  const headerGap = 1;
  // Col1: logo — box mais justo para liberar largura útil à coluna central
  const logoBox = {
    x: margin,
    y: headerTop + 1,
    width: 34,
    height: 16,
  };
  // Col3: badge — conteúdo igual, margem mínima de 1mm para col2
  const badgeBox = {
    width: 18,
    height: 7,
    x: pageWidth - margin - 18,
    y: headerTop + 2,
  };
  const headerTextMaxWidth = Math.max(
    0,
    2 *
      Math.min(
        headerCenterX - (logoBox.x + logoBox.width + headerGap),
        badgeBox.x - headerGap - headerCenterX,
      ),
  );
  // Col2: fica realmente centralizada na folha e usa a maior largura possível sem colidir
  const headerText = {
    x: headerCenterX - headerTextMaxWidth / 2,
    width: headerTextMaxWidth,
  };

  const getDisplayValue = (value?: string, placeholder = '________________'): string => {
    const normalized = String(value || '').trim();
    if (normalized) return normalized;
    return isModoModelo ? placeholder : '';
  };

  // ========== HEADER COM LOGO (Fundo Branco) ==========
  doc.setDrawColor(COLORS.border);
  doc.setLineWidth(0.5);
  doc.line(0, headerBottom, pageWidth, headerBottom);

  // Carregar e desenhar logo se disponível
  let logoLoaded = false;
  if (dados.logoUrl) {
    try {
      console.log('🎨 [PDF-FICHA] Tentando carregar logo do servidor');

      // Usar novo endpoint que retorna logo em base64
      const logoUrlFinal = '/api/empresas/minha/logo-base64';

      console.log('📥 [PDF-FICHA] Buscando logo em:', logoUrlFinal);

      // Fetch com token via apiFetch (garante URL correta em produção)
      const token = getAccessToken();
      const logoRes = await apiFetch(logoUrlFinal, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });

      if (logoRes.ok) {
        const logoData = await logoRes.json();
        console.log('📦 [PDF-FICHA] Resposta logo:', logoData.success ? 'sucesso' : 'erro');

        if (logoData.success && logoData.data) {
          // Logo já está em base64 data:image/...
          try {
            const imageProps = doc.getImageProperties(logoData.data);
            const imageFormat = imageProps.fileType === 'JPEG' ? 'JPEG' : 'PNG';
            const fittedLogo = fitImageWithinBox(
              imageProps.width,
              imageProps.height,
              logoBox.width,
              logoBox.height,
            );
            const logoX = logoBox.x + (logoBox.width - fittedLogo.width) / 2;
            const logoY = logoBox.y + (logoBox.height - fittedLogo.height) / 2;

            doc.addImage(
              logoData.data,
              imageFormat,
              logoX,
              logoY,
              fittedLogo.width,
              fittedLogo.height,
            );
            logoLoaded = true;
            console.log('✅ [PDF-FICHA] Logo carregado com sucesso no PDF');
          } catch (imgError) {
            console.warn('⚠️ [PDF-FICHA] Erro ao adicionar logo ao PDF:', imgError);
          }
        } else {
          console.warn('⚠️ [PDF-FICHA] Logo não disponível no servidor');
        }
      } else {
        console.warn('⚠️ [PDF-FICHA] Erro ao buscar logo:', logoRes.status);
      }
    } catch (e) {
      console.warn('⚠️ [PDF-FICHA] Logo não pôde ser carregado:', e);
    }
  } else {
    console.log('ℹ️ [PDF-FICHA] Nenhum logoUrl configurado - PDF será gerado sem logo');
  }

  // Fallback: placeholder se logo não carregou
  if (!logoLoaded) {
    doc.setFillColor(245, 245, 245);
    doc.roundedRect(logoBox.x, logoBox.y, logoBox.width, logoBox.height, 2, 2, 'F');
    doc.setFontSize(6);
    doc.setTextColor(COLORS.textSecondary);
    doc.text('LOGO', logoBox.x + logoBox.width / 2, logoBox.y + logoBox.height / 2 + 1, {
      align: 'center',
    });
  }

  // Título e sessão reservando espaço fixo entre logo e badge
  const tituloX = headerCenterX;
  const sessaoNome = dados.sessao_titulo || dados.simulador || 'Sessão de Treinamento';
  const SESSAO_FONT_BASE = 8;
  const SESSAO_FONT_MIN = 6;

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(SESSAO_FONT_BASE);
  const sessaoNaturalWidth = doc.getTextWidth(sessaoNome);
  const sessaoScaleFactor =
    sessaoNaturalWidth > headerText.width ? headerText.width / sessaoNaturalWidth : 1;
  const sessaoFontSize =
    sessaoScaleFactor < 0.98
      ? Math.max(SESSAO_FONT_MIN, SESSAO_FONT_BASE * sessaoScaleFactor)
      : SESSAO_FONT_BASE;

  doc.setFontSize(sessaoFontSize);
  const sessaoLine = limitTextLines(doc.splitTextToSize(sessaoNome, headerText.width), 1);

  doc.setTextColor(COLORS.primary);
  doc.setFontSize(10.5);
  doc.setFont('helvetica', 'bold');
  doc.text('FICHA DE TREINAMENTO DE VOO', tituloX, headerTop + 6, { align: 'center' });

  doc.setFontSize(6);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(COLORS.primary);
  doc.text('SESSÃO', tituloX, headerTop + 11, { align: 'center' });

  doc.setFontSize(sessaoFontSize);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(COLORS.textSecondary);
  doc.text(sessaoLine, tituloX, headerTop + 16, { align: 'center' });

  // Status badge (canto direito)
  const statusText = dados.status || 'PENDENTE';
  const isConcluida =
    !isModoModelo &&
    (statusText.includes('ASSINADA_TOTAL') ||
      statusText.includes('CONCLUIDA') ||
      Boolean(dados.assinatura_aluno_timestamp && dados.assinatura_instrutor_timestamp));
  const badgeColor = isModoModelo ? COLORS.primary : isConcluida ? COLORS.success : COLORS.danger;
  doc.setFillColor(badgeColor);
  doc.roundedRect(badgeBox.x, badgeBox.y, badgeBox.width, badgeBox.height, 2, 2, 'F');
  doc.setFontSize(7);
  doc.setTextColor(255, 255, 255);
  doc.text(
    isModoModelo ? 'MODELO' : isConcluida ? 'CONCLUÍDA' : 'PENDENTE',
    badgeBox.x + badgeBox.width / 2,
    badgeBox.y + 4.5,
    { align: 'center' },
  );

  // Gap compacto após header (era +8)
  currentY = headerBottom + 3;

  // ========== DADOS DA SESSÃO — 3 linhas, Simulador na linha 1 ==========
  // Linha 1: Data | Horário | Carga Horária | Simulador
  // Linha 2: Tripulante | ANAC | Função
  // Linha 3: Instrutor | ANAC
  const hasOperationalDetail = Boolean(
    dados.tripulacao_nomes || dados.carga_horaria_pf || dados.carga_horaria_pm,
  );
  const SESSION_BOX_H = hasOperationalDetail ? 25.5 : 20;
  const SESSION_LINE_H = 5.5;
  doc.setDrawColor(COLORS.border);
  doc.setFillColor(COLORS.bgLight);
  doc.roundedRect(margin, currentY, contentWidth, SESSION_BOX_H, 2, 2, 'FD');

  doc.setFontSize(7.5);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(COLORS.textSecondary);

  const dataFormatada = formatarData(dados.data);
  // Valor curto para carga (só o total, sem o detalhe PF/PM que ocupa muito espaço)
  const cargaShort = dados.carga_horaria_total
    ? dados.carga_horaria_total.split('(')[0].trim()
    : `${dados.carga_horaria_pf || '0'}h`;

  // drawInfoField: posiciona label (bold) + value (normal) com espaçamento mínimo
  const drawInfoField = (label: string, value: string, x: number, labelW: number, y: number) => {
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(COLORS.text);
    doc.text(label, x, y);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(COLORS.textSecondary);
    doc.text(value, x + labelW, y);
  };

  // Linha 1: Data | Horário | Carga Horária | Simulador — 4 colunas uniformes de ~43mm
  let lineY = currentY + 4.5;
  drawInfoField('Data:', getDisplayValue(dataFormatada), margin + 3, 9, lineY);
  drawInfoField(
    'Horário:',
    getDisplayValue(
      [dados.horario_inicio, dados.horario_fim].filter(Boolean).join(' – '),
      '__:__ – __:__',
    ),
    margin + 46,
    14,
    lineY,
  );
  drawInfoField('Carga Horária:', getDisplayValue(cargaShort), margin + 90, 22, lineY);
  drawInfoField('Simulador:', getDisplayValue(dados.simulador), margin + 133, 16, lineY);

  // Linha 2: Tripulante | ANAC | Função
  lineY += SESSION_LINE_H;
  drawInfoField('Tripulante:', getDisplayValue(dados.tripulante_nome), margin + 3, 18, lineY);
  drawInfoField(
    'ANAC:',
    getDisplayValue(dados.tripulante_codigo_anac, '____________'),
    margin + 88,
    9,
    lineY,
  );
  drawInfoField(
    'Função:',
    getDisplayValue(dados.tripulante_funcao, '______'),
    margin + 145,
    12,
    lineY,
  );

  // Linha 3: Instrutor | ANAC
  lineY += SESSION_LINE_H;
  drawInfoField('Instrutor:', getDisplayValue(dados.instrutor_nome), margin + 3, 16, lineY);
  drawInfoField(
    'ANAC:',
    getDisplayValue(dados.instrutor_codigo_anac, '____________'),
    margin + 88,
    9,
    lineY,
  );

  if (hasOperationalDetail) {
    lineY += SESSION_LINE_H;
    drawInfoField(
      'PF / PM:',
      `${getDisplayValue(dados.carga_horaria_pf, '0')}h / ${getDisplayValue(dados.carga_horaria_pm, '0')}h`,
      margin + 3,
      15,
      lineY,
    );
    drawInfoField(
      'Tripulação:',
      getDisplayValue(dados.tripulacao_nomes, dados.tripulante_nome),
      margin + 65,
      18,
      lineY,
    );
  }

  // Avançar currentY: session box + gap (3mm)
  currentY += SESSION_BOX_H + 3;

  // ── Header da tabela (compacto, 6mm) ─────────────────────────────────────
  doc.setFillColor(COLORS.primary);
  doc.rect(margin, currentY, contentWidth, 6, 'F');
  doc.setTextColor(255, 255, 255);
  doc.setFontSize(7.5);
  doc.setFont('helvetica', 'bold');

  const tableLayout = getFichaPdfTableLayout(margin);
  const col = tableLayout.positions;
  const ITENS_WIDTH = tableLayout.itensWidth;
  const OBS_WIDTH = tableLayout.obsWidth;
  const TRIP_WIDTH = tableLayout.tripulanteWidth;
  const NOTA_BADGE_W = tableLayout.notaBadgeWidth;
  const NOTA_BADGE_H = tableLayout.notaBadgeHeight;

  const [numHeader, codigoHeader, tripHeader, itensHeader, obsHeader, notaHeader] =
    getFichaPdfTableHeaders();
  doc.text(numHeader, col.num, currentY + 4, { align: 'center', maxWidth: 7 });
  doc.text(codigoHeader, col.codigo, currentY + 4, {
    align: 'left',
    maxWidth: tableLayout.codigoWidth,
  });
  doc.text(tripHeader, col.tripulante, currentY + 4, { align: 'center', maxWidth: TRIP_WIDTH });
  doc.text(itensHeader, col.itens, currentY + 4, { align: 'left', maxWidth: ITENS_WIDTH });
  doc.text(obsHeader, col.obs, currentY + 4, { align: 'left', maxWidth: OBS_WIDTH });
  doc.text(notaHeader, col.nota, currentY + 4, { align: 'center', maxWidth: NOTA_BADGE_W });
  currentY += 6;

  // ── Calcular alturas uniformes ────────────────────────────────────────────
  // Regra: ITENS máx 1 linha (trunca com …), OBS máx 2 linhas (trunca com …)
  // Todas as linhas terão a MESMA altura (uniformRowH)
  const TABLE_FONT = 7;
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(TABLE_FONT);

  const manobras = dados.manobras || [];

  // 1ª passagem: altura natural de cada linha (ITENS=1 linha, OBS=3 linhas máx)
  const rowData = manobras.map((m) => {
    const nomeTxt = (m.nome || '').trim();
    const nomeLines = limitTextLines(doc.splitTextToSize(nomeTxt, ITENS_WIDTH), 1); // máx 1 linha
    const obsTxt = (m.observacoes || '').trim();
    const obsLines =
      obsTxt.length > 0
        ? limitTextLines(doc.splitTextToSize(obsTxt, OBS_WIDTH), 3) // máx 3 linhas
        : [];
    const maxLines = Math.max(1, nomeLines.length, obsLines.length);
    const rowH = Math.max(6, 2 + maxLines * 3.5); // altura variável: 1 linha=5.5, 2=9, 3=12.5
    return { m, nomeLines, obsLines, rowH };
  });

  const totalNatural = rowData.reduce((s, r) => s + r.rowH, 0);

  // Layout de baixo para cima:
  //   rodapé: 6mm no fundo (pageHeight - 6)
  //   assinaturas: SIG_RESERVED mm antes do rodapé
  //   obs gerais: 14mm antes das assinaturas
  //   gap: 4mm
  const FOOTER_H = 6; // espaço do rodapé no fundo
  const SIG_RESERVED = 40; // altura máxima reservada para as caixas de assinatura
  const OBS_RESERVED = 14; // obs gerais max
  const SCALE_RESERVED = FICHA_AVALIACAO_SCALE_HEIGHT;
  const tableBodyBudget =
    pageHeight - currentY - 4 - SCALE_RESERVED - OBS_RESERVED - 3 - SIG_RESERVED - FOOTER_H;

  // Factor de escala — só encolhe, nunca cresce
  const scaleFactor = totalNatural > tableBodyBudget ? tableBodyBudget / totalNatural : 1;
  const finalFontSize = scaleFactor < 0.95 ? Math.max(5.5, TABLE_FONT * scaleFactor) : TABLE_FONT;
  const LINE_SPACING = 3.4 * Math.min(1, scaleFactor);

  // 2ª passagem: re-split com fonte final (escala muda as quebras de linha)
  doc.setFontSize(finalFontSize);
  const scaledRows = rowData.map(({ m, nomeLines: _, obsLines: __, rowH }) => {
    const nomeTxt = (m.nome || '').trim();
    const nomeLines = limitTextLines(doc.splitTextToSize(nomeTxt, ITENS_WIDTH), 1);
    const obsTxt = (m.observacoes || '').trim();
    const obsLines =
      obsTxt.length > 0 ? limitTextLines(doc.splitTextToSize(obsTxt, OBS_WIDTH), 3) : [];
    return { m, nomeLines, obsLines, rowH: Math.max(5.5, rowH * scaleFactor) };
  });

  // 2ª passagem: renderizar
  scaledRows.forEach(({ m, nomeLines, obsLines, rowH }, index) => {
    const isEven = index % 2 === 0;
    if (isEven) {
      doc.setFillColor(COLORS.bgLight);
      doc.rect(margin, currentY, contentWidth, rowH, 'F');
    }

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(finalFontSize);
    doc.setTextColor(COLORS.text);

    // Texto sempre alinhado ao topo da linha (consistente independente da altura da linha)
    const textTopY = currentY + 2.8;

    // Número
    doc.text(String(m.ordem).padStart(2, '0'), col.num, textTopY, { align: 'center' });

    // Código
    doc.text((m.codigo || '').substring(0, 13), col.codigo, textTopY);

    // Tripulante (A/B/AB)
    const tripulante = m.tripulante || 'AB';
    const tripBadge = getTripulanteBadgeColors(tripulante);
    const tripBadgeW = 8;
    const tripBadgeH = 4;
    const tripBadgeX = col.tripulante - tripBadgeW / 2;
    const tripBadgeY = currentY + (rowH - tripBadgeH) / 2;
    const tripBadgeTextY = tripBadgeY + tripBadgeH - 1.2;
    doc.setFillColor(tripBadge.fill);
    doc.roundedRect(tripBadgeX, tripBadgeY, tripBadgeW, tripBadgeH, 1, 1, 'F');
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(Math.max(4.5, finalFontSize - 0.5));
    doc.setTextColor(tripBadge.text);
    doc.text(tripulante, col.tripulante, tripBadgeTextY, { align: 'center' });
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(finalFontSize);
    doc.setTextColor(COLORS.text);

    // Nome (1 linha máx)
    for (let li = 0; li < nomeLines.length; li++) {
      doc.text(nomeLines[li] || '', col.itens, textTopY + li * LINE_SPACING);
    }

    // Observações (2 linhas máx, fonte ligeiramente menor)
    if (obsLines.length > 0) {
      doc.setFontSize(Math.max(4.5, finalFontSize - 0.5));
      doc.setTextColor(COLORS.textSecondary);
      for (let li = 0; li < obsLines.length; li++) {
        doc.text(obsLines[li] || '', col.obs, textTopY + li * LINE_SPACING);
      }
      doc.setFontSize(finalFontSize);
      doc.setTextColor(COLORS.text);
    }

    // Nota com cor — trata NR, número ou vazio
    const resultadoRaw = m.resultado;
    const isNR = resultadoRaw === 'NR' || resultadoRaw === 'NAO_REALIZADA' || resultadoRaw === -1;
    const notaNum =
      typeof resultadoRaw === 'number'
        ? resultadoRaw
        : typeof resultadoRaw === 'string'
          ? parseFloat(resultadoRaw)
          : NaN;
    const notaValida =
      !isNR &&
      resultadoRaw !== null &&
      resultadoRaw !== undefined &&
      !isNaN(notaNum) &&
      notaNum > 0;

    // Badge SEMPRE com tamanho fixo e centralizado verticalmente na linha
    const badgeX = col.nota - NOTA_BADGE_W / 2;
    const badgeY = currentY + (rowH - NOTA_BADGE_H) / 2;
    const badgeTextY = badgeY + NOTA_BADGE_H - 1.2;

    if (isNR) {
      doc.setFillColor('#64748B');
      doc.roundedRect(badgeX, badgeY, NOTA_BADGE_W, NOTA_BADGE_H, 1, 1, 'F');
      doc.setFontSize(Math.max(4.5, finalFontSize - 0.5));
      doc.setFont('helvetica', 'bold');
      doc.setTextColor(255, 255, 255);
      doc.text('NR', col.nota, badgeTextY, { align: 'center' });
    } else if (notaValida) {
      doc.setFillColor(getNotaColor(notaNum));
      doc.roundedRect(badgeX, badgeY, NOTA_BADGE_W, NOTA_BADGE_H, 1, 1, 'F');
      doc.setFontSize(Math.max(4.5, finalFontSize - 0.5));
      doc.setFont('helvetica', 'bold');
      doc.setTextColor(255, 255, 255);
      doc.text(notaNum.toFixed(1), col.nota, badgeTextY, { align: 'center' });
    } else if (isModoModelo) {
      doc.setDrawColor(COLORS.border);
      doc.setFillColor(COLORS.white);
      doc.roundedRect(badgeX, badgeY, NOTA_BADGE_W, NOTA_BADGE_H, 1, 1, 'FD');
    } else {
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(finalFontSize);
      doc.setTextColor(COLORS.textSecondary);
      doc.text('-', col.nota, currentY + rowH / 2 + 1, { align: 'center' });
    }

    currentY += rowH;
  });

  currentY += 4;
  currentY = drawFichaAvaliacaoScale(doc, margin, currentY, contentWidth) + 4;

  // ========== OBSERVAÇÕES GERAIS — mínimo 3 linhas de texto ==========
  if (dados.observacoes_gerais || isModoModelo) {
    doc.setFont('helvetica', 'italic');
    doc.setFontSize(7.5);
    doc.setTextColor(COLORS.textSecondary);
    const obsTxt =
      dados.observacoes_gerais ||
      (isModoModelo ? 'Observações gerais: _________________________________________________' : '');
    const obsLines = doc.splitTextToSize(obsTxt, contentWidth - 6);
    const obsBoxH = Math.max(18, 5 + obsLines.length * 4.5); // mínimo 3 linhas de texto

    doc.setDrawColor(COLORS.border);
    doc.setFillColor(COLORS.bgLight);
    doc.roundedRect(margin, currentY, contentWidth, obsBoxH, 2, 2, 'FD');
    doc.text(obsLines, margin + 3, currentY + 5);
    currentY += obsBoxH + 5; // gap maior (5mm) antes das assinaturas
  }

  // ========== ASSINATURAS — ancoradas no fundo, proporcionais ==========
  // Rodapé fixo no fundo. Assinaturas calculadas de baixo para cima.
  const FOOTER_Y = pageHeight - FOOTER_H + 1; // rodapé no fundo (fixo)
  const FOOTER_GAP = 4; // espaço entre assinaturas e rodapé

  const hasAnySignatureImg = !!(
    dados.assinatura_aluno_dataUrl || dados.assinatura_instrutor_dataUrl
  );
  const SIG_PAD = 2.5;
  const SIG_TITLE_H = 4; // título TRIPULANTE/INSTRUTOR
  const SIG_TEXT_H = 3; // nome
  const SIG_TS_H = 3; // timestamp/status
  const SIG_IMG_MAX = 14; // imagem max 14mm — proporção mantida, sem achatar
  const sigBoxW = (contentWidth - 4) / 2;

  // Calcular altura proporcional da imagem (nunca distorce)
  const calcImgH = (dataUrl: string | null | undefined): number => {
    if (!dataUrl) return 0;
    try {
      const props = doc.getImageProperties(dataUrl);
      const drawW = sigBoxW - SIG_PAD * 2;
      const ratio = props.height / props.width;
      return Math.min(SIG_IMG_MAX, Math.max(6, drawW * ratio));
    } catch {
      return Math.min(SIG_IMG_MAX, 10);
    }
  };

  const sigImgH_a = calcImgH(dados.assinatura_aluno_dataUrl);
  const sigImgH_i = calcImgH(dados.assinatura_instrutor_dataUrl);
  const sigImgH = Math.max(sigImgH_a, sigImgH_i);

  const sigBoxH = hasAnySignatureImg
    ? SIG_PAD + SIG_TITLE_H + SIG_TEXT_H + SIG_TS_H + 2 + sigImgH + SIG_PAD // com imagem
    : SIG_PAD + SIG_TITLE_H + SIG_TEXT_H + SIG_TS_H + SIG_PAD; // sem imagem

  // Assinaturas começam de baixo para cima: rodapé ← gap ← sig boxes
  const sigStartY = FOOTER_Y - FOOTER_GAP - sigBoxH;

  const drawSigBox = (
    x: number,
    label: string,
    nome: string,
    timestamp: string | null | undefined,
    sigDataUrl: string | null | undefined,
  ) => {
    const hasSig = !!timestamp;
    doc.setDrawColor(COLORS.border);
    doc.setFillColor(hasSig ? '#EBF7EE' : COLORS.bgLight);
    doc.roundedRect(x, sigStartY, sigBoxW, sigBoxH, 2, 2, 'FD');

    let ty = sigStartY + SIG_PAD + SIG_TITLE_H - 0.5;

    // Título (fonte reduzida)
    doc.setFontSize(7);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(hasSig ? COLORS.success : COLORS.text);
    doc.text(label, x + SIG_PAD, ty);

    // Nome
    ty += SIG_TEXT_H;
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(6.5);
    doc.setTextColor(COLORS.textSecondary);
    doc.text(getDisplayValue(nome), x + SIG_PAD, ty, { maxWidth: sigBoxW - SIG_PAD * 2 });

    // Timestamp / status
    ty += SIG_TS_H;
    doc.setFontSize(6);
    if (hasSig) {
      const d = new Date(timestamp!);
      doc.setTextColor(COLORS.success);
      doc.text(
        `\u2713 ${d.toLocaleDateString('pt-BR')}, ${d.toLocaleTimeString('pt-BR')}`,
        x + SIG_PAD,
        ty,
      );
    } else {
      doc.setTextColor(COLORS.textSecondary);
      doc.text(isModoModelo ? 'Campo para assinatura' : 'Aguardando assinatura', x + SIG_PAD, ty);
    }

    // Imagem da assinatura — renderizada com proporção original
    if (sigDataUrl && hasAnySignatureImg && sigImgH > 0) {
      try {
        const props = doc.getImageProperties(sigDataUrl);
        const drawW = sigBoxW - SIG_PAD * 2;
        const ratio = props.height / props.width;
        const drawH = Math.min(sigImgH, drawW * ratio);
        doc.addImage(sigDataUrl, 'PNG', x + SIG_PAD, ty + 2, drawW, drawH);
      } catch {
        /* ignore */
      }
    }
  };

  drawSigBox(
    margin,
    'TRIPULANTE',
    dados.tripulante_nome,
    dados.assinatura_aluno_timestamp,
    dados.assinatura_aluno_dataUrl,
  );
  drawSigBox(
    margin + sigBoxW + 4,
    'INSTRUTOR',
    dados.instrutor_nome,
    dados.assinatura_instrutor_timestamp,
    dados.assinatura_instrutor_dataUrl,
  );

  // ========== RODAPÉ — fixo no fundo, gap real acima ==========
  doc.setFontSize(6.5);
  doc.setTextColor(COLORS.textSecondary);
  doc.text(
    `Gerado em ${new Date().toLocaleString('pt-BR')} | AirTrust - Aviation Management System`,
    pageWidth / 2,
    FOOTER_Y,
    { align: 'center' },
  );

  // Preview do PDF com opcao de download
  const fallbackName = isModoModelo
    ? `SIM-MODELO-${(dados.sessao_titulo || String(dados.fichaId))
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/[^a-zA-Z0-9\s]/g, '')
        .replace(/\s+/g, '_')
        .toUpperCase()}.pdf`
    : buildNomeFichaOficial(dados);
  const fileName = dados.fileName || fallbackName;
  // Título visível na aba do preview: nome sem extensão .pdf
  const previewTitle = fileName.replace(/\.pdf$/i, '');
  const blob = doc.output('blob');

  const mode = opts?.mode ?? 'preview';
  if (mode === 'download' || isSafariBrowser()) {
    downloadBlobDirect(blob, fileName);
    return;
  }

  await previewPdfBeforeDownload({
    fileName,
    title: previewTitle,
    mimeType: 'application/pdf',
    fetcher: async () =>
      new Response(blob, {
        headers: {
          'Content-Type': 'application/pdf',
        },
      }),
    existingWindow: opts?.previewWindow,
  });
}

export default gerarPDFFichaCliente;
