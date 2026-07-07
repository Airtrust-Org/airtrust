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

import {
  NOTECHS_ORDEM_BASE,
  NOTECHS_GRUPOS,
  NOTECHS_PROVENIENCIA_AVISO,
  getNotechsItensPorGrupo,
  getNotechsDescritores,
  splitManobrasNotechs,
} from '../pages/simuladores/fichas/notechs';

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
import { FICHA_AVALIACAO_FAIXAS } from '@/react-app/pages/simuladores/fichas/avaliacaoScale';

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
  // Cinza claro e discreto para a barra de seção NOTECHS — dá continuidade ao
  // cabeçalho azul da tabela técnica sem repetir a cor nem parecer um segundo
  // título de coluna (por isso claro/discreto, com texto escuro em vez de
  // branco em negrito).
  sectionBar: '#DDE3EA',
};

export function getFichaPdfTableLayout(margin: number): FichaPdfTableLayout {
  // Column layout (all positions are absolute mm from left edge of page):
  //   #      : margin+3   — 5mm wide
  //   CÓDIGO : margin+10  — 20mm wide  → ends at margin+30
  //   TRIP.  : margin+35  — 12mm wide (badge 8mm centered) → badge spans margin+31–margin+39
  //             gap from CÓDIGO end (+30) to badge start (+31) = 1mm clear
  //   ITENS  : margin+44  — 48mm wide  → ends at margin+92 (larga o bastante p/
  //             nomes de manobra/NOTECHS longos sem truncar)
  //   OBS    : margin+94  — 68mm wide  → ends at margin+162 (mais larga — a
  //             observação frequentemente ocupa 2 linhas)
  //   NOTA   : margin+172 — centred badge, 10mm wide
  return {
    positions: {
      num: margin + 3,
      codigo: margin + 10,
      tripulante: margin + 35,
      itens: margin + 44,
      obs: margin + 94,
      nota: margin + 172,
    },
    codigoWidth: 20,
    tripulanteWidth: 12,
    itensWidth: 48,
    obsWidth: 68,
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
  const headerHeight = 19; // apertado mais um pouco (era 22) p/ sobrar espaço à tabela
  const headerBottom = headerTop + headerHeight; // = 23
  const headerCenterX = pageWidth / 2;
  const headerGap = 1;
  // Col1: logo — box mais justo para liberar largura útil à coluna central
  const logoBox = {
    x: margin,
    y: headerTop + 1,
    width: 34,
    height: 14,
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
  doc.text('FICHA DE TREINAMENTO DE VOO', tituloX, headerTop + 5.5, { align: 'center' });

  doc.setFontSize(6);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(COLORS.primary);
  doc.text('SESSÃO', tituloX, headerTop + 9.5, { align: 'center' });

  doc.setFontSize(sessaoFontSize);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(COLORS.textSecondary);
  doc.text(sessaoLine, tituloX, headerTop + 13.5, { align: 'center' });

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

  // ========== DADOS DA SESSÃO — 3 linhas ==========
  // Linha 1: Data | Horário | Simulador | Carga Horária
  // Linha 2: Tripulante | ANAC | Função | PF / PM
  // Linha 3: Instrutor | ANAC
  // "Tripulação" foi removida do cabeçalho (linha 4 antiga) para liberar
  // espaço vertical em favor da tabela NOTECHS de linha única (ver pedido do
  // owner de 2026-07-02).
  //
  // Grade de colunas COMPARTILHADA entre as 3 linhas (mesmo X em todas as
  // linhas que têm aquele campo), para eliminar o desalinhamento visual:
  //   COL1 (Data / Tripulante / Instrutor)  — margin+3
  //   COL2 (Horário / ANAC / ANAC)          — margin+65 (espaço suficiente à
  //     esquerda para nomes longos de tripulante/instrutor na COL1)
  //   COL3 (Simulador / Função)             — margin+99
  //   COL4 (Carga Horária / PF-PM)          — margin+136
  // Larguras calibradas via jsPDF.getTextWidth() com os piores casos reais
  // (nomes/valores mais longos das fixtures) para não haver overlap.
  const COL1 = margin + 3;
  const COL2 = margin + 65;
  const COL3 = margin + 99;
  const COL4 = margin + 136;
  const SESSION_BOX_H = 20;
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

  // Linha 1: Data | Horário | Simulador | Carga Horária
  let lineY = currentY + 4.5;
  drawInfoField('Data:', getDisplayValue(dataFormatada), COL1, 9, lineY);
  drawInfoField(
    'Horário:',
    getDisplayValue(
      [dados.horario_inicio, dados.horario_fim].filter(Boolean).join(' – '),
      '__:__ – __:__',
    ),
    COL2,
    14,
    lineY,
  );
  drawInfoField('Simulador:', getDisplayValue(dados.simulador), COL3, 16, lineY);
  drawInfoField('Carga Horária:', getDisplayValue(cargaShort), COL4, 19, lineY);

  // Linha 2: Tripulante | ANAC | Função | PF / PM
  lineY += SESSION_LINE_H;
  drawInfoField('Tripulante:', getDisplayValue(dados.tripulante_nome), COL1, 18, lineY);
  drawInfoField(
    'ANAC:',
    getDisplayValue(dados.tripulante_codigo_anac, '____________'),
    COL2,
    9,
    lineY,
  );
  drawInfoField('Função:', getDisplayValue(dados.tripulante_funcao, '______'), COL3, 12, lineY);
  if (dados.carga_horaria_pf || dados.carga_horaria_pm) {
    drawInfoField(
      'PF / PM:',
      `${getDisplayValue(dados.carga_horaria_pf, '0')}h / ${getDisplayValue(dados.carga_horaria_pm, '0')}h`,
      COL4,
      15,
      lineY,
    );
  }

  // Linha 3: Instrutor | ANAC
  lineY += SESSION_LINE_H;
  drawInfoField('Instrutor:', getDisplayValue(dados.instrutor_nome), COL1, 16, lineY);
  drawInfoField(
    'ANAC:',
    getDisplayValue(dados.instrutor_codigo_anac, '____________'),
    COL2,
    9,
    lineY,
  );

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
  // Regra: ITENS máx 1 linha (trunca com …), OBS máx 3 linhas (trunca com …)
  const TABLE_FONT = 7;
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(TABLE_FONT);

  // Técnicas e NOTECHS formam UMA ÚNICA tabela vertical contínua — mesmo
  // padrão de colunas, mesma fonte, mesmo orçamento de altura. NOTECHS entra
  // logo abaixo das técnicas, separado só por uma barra de seção (ver pedido
  // do owner de 2026-07-02: nada de bloco em duas colunas ou reservado à parte).
  const { tecnicas: manobras, notechs: manobrasNotechs } = splitManobrasNotechs(
    dados.manobras || [],
  );

  const computeRowHeight = (m: FichaPDFData['manobras'][number]): number => {
    const nomeTxt = (m.nome || '').trim();
    const nomeLines = limitTextLines(doc.splitTextToSize(nomeTxt, ITENS_WIDTH), 1);
    const obsTxt = (m.observacoes || '').trim();
    const obsLines =
      obsTxt.length > 0 ? limitTextLines(doc.splitTextToSize(obsTxt, OBS_WIDTH), 3) : [];
    const maxLines = Math.max(1, nomeLines.length, obsLines.length);
    return Math.max(6, 2 + maxLines * 3.5); // altura variável: 1 linha=5.5, 2=9, 3=12.5
  };

  // NOTECHS exibe numeração própria (1–15) na coluna #, independente da ordem
  // interna (>= NOTECHS_ORDEM_BASE) usada só para separar do bloco técnico.
  const tecnicasNatural = manobras.map((m) => ({
    m,
    rowH: computeRowHeight(m),
    displayNum: m.ordem,
  }));
  const notechsNatural = manobrasNotechs.map((m) => ({
    m,
    rowH: computeRowHeight(m),
    displayNum: m.ordem - NOTECHS_ORDEM_BASE + 1,
  }));
  const NOTECHS_DIVIDER_H = manobrasNotechs.length > 0 ? 6 : 0;

  const totalNatural =
    tecnicasNatural.reduce((s, r) => s + r.rowH, 0) +
    notechsNatural.reduce((s, r) => s + r.rowH, 0) +
    NOTECHS_DIVIDER_H;

  // Layout de baixo para cima:
  //   rodapé: 6mm no fundo (pageHeight - 6)
  //   assinaturas: SIG_RESERVED mm antes do rodapé
  //   obs gerais: OBS_RESERVED mm antes das assinaturas
  const FOOTER_H = 6; // espaço do rodapé no fundo
  const SIG_RESERVED = 40; // altura máxima reservada para as caixas de assinatura
  const OBS_RESERVED = 23; // caixa mínima (~18mm) + gap antes das assinaturas
  const tableBodyBudget = pageHeight - currentY - 4 - OBS_RESERVED - 3 - SIG_RESERVED - FOOTER_H;

  // Factor de escala — só encolhe, nunca cresce
  const scaleFactor = totalNatural > tableBodyBudget ? tableBodyBudget / totalNatural : 1;
  const finalFontSize = scaleFactor < 0.95 ? Math.max(5.5, TABLE_FONT * scaleFactor) : TABLE_FONT;
  const LINE_SPACING = 3.4 * Math.min(1, scaleFactor);

  // Passagem dedicada de quebra de linha, na fonte final, ANTES de qualquer
  // desenho. jsPDF é stateful (splitTextToSize/getTextWidth usam a fonte
  // setada no momento da chamada) — calcular nomeLines/obsLines aqui, de uma
  // vez só, evita que o resto do desenho da linha anterior (badge em negrito,
  // ou a barra do divisor NOTECHS) contamine a largura usada para quebrar o
  // título da linha seguinte.
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(finalFontSize);
  const buildScaledRow = (
    m: FichaPDFData['manobras'][number],
    naturalRowH: number,
    displayNum: number,
  ) => {
    const nomeTxt = (m.nome || '').trim();
    const nomeLines = limitTextLines(doc.splitTextToSize(nomeTxt, ITENS_WIDTH), 1);
    const obsTxt = (m.observacoes || '').trim();
    const obsLines =
      obsTxt.length > 0 ? limitTextLines(doc.splitTextToSize(obsTxt, OBS_WIDTH), 3) : [];
    return { m, nomeLines, obsLines, rowH: Math.max(5.5, naturalRowH * scaleFactor), displayNum };
  };

  const tecnicasScaled = tecnicasNatural.map(({ m, rowH, displayNum }) =>
    buildScaledRow(m, rowH, displayNum),
  );
  const notechsScaled = notechsNatural.map(({ m, rowH, displayNum }) =>
    buildScaledRow(m, rowH, displayNum),
  );

  // Desenha uma linha da tabela (já com nomeLines/obsLines/rowH resolvidos) —
  // usada tanto para as 18 manobras técnicas quanto para os 15 itens NOTECHS
  // logo abaixo: mesmas colunas (#, CÓDIGO, TRIP., ITENS, OBSERVAÇÕES, NOTA),
  // mesma fonte, mesmo zebrado.
  const drawTableRow = (
    { m, nomeLines, obsLines, rowH, displayNum }: (typeof tecnicasScaled)[number],
    isEven: boolean,
  ) => {
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
    doc.text(String(displayNum).padStart(2, '0'), col.num, textTopY, { align: 'center' });

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

    // Observações (até 3 linhas, fonte ligeiramente menor)
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
  };

  tecnicasScaled.forEach((row, index) => drawTableRow(row, index % 2 === 0));

  if (notechsScaled.length > 0) {
    // Barra de seção NOTECHS — mesma altura do header da tabela, em cinza
    // CLARO e discreto (era roxo, depois azul, depois cinza escuro) com texto
    // escuro em vez de branco/negrito, para não parecer um segundo título de
    // coluna competindo com o cabeçalho azul das colunas logo acima. As
    // linhas abaixo dela usam a MESMA drawTableRow das técnicas: uma
    // manobra/item por linha, coluna OBSERVAÇÕES incluída, sem colunas duplas.
    doc.setFillColor(COLORS.sectionBar);
    doc.rect(margin, currentY, contentWidth, NOTECHS_DIVIDER_H, 'F');
    doc.setTextColor(COLORS.text);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(7.5);
    doc.text(
      'NOTECHS — Habilidades Não Técnicas (CRM)',
      margin + 2,
      currentY + NOTECHS_DIVIDER_H / 2 + 1.3,
    );
    currentY += NOTECHS_DIVIDER_H;

    notechsScaled.forEach((row, index) => drawTableRow(row, index % 2 === 0));
  }

  currentY += 4;

  // ========== OBSERVAÇÕES GERAIS — mínimo 3 linhas de texto ==========
  if (dados.observacoes_gerais || isModoModelo) {
    doc.setFont('helvetica', 'italic');
    doc.setFontSize(7.5);
    doc.setTextColor(COLORS.textSecondary);
    const obsTxt =
      dados.observacoes_gerais ||
      (isModoModelo ? 'Observações gerais: _________________________________________________' : '');
    // Limitada a 4 linhas (trunca com "…") para o box nunca crescer além do
    // espaço reservado (OBS_RESERVED) e invadir as caixas de assinatura, que
    // são posicionadas de baixo para cima de forma independente do texto aqui.
    const obsLines = limitTextLines(doc.splitTextToSize(obsTxt, contentWidth - 6), 4);
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

  // ========== PÁGINA 2 (opcional) — Régua NOTECHS, descritores completos ==========
  // Só é adicionada quando a ficha tem itens NOTECHS. Mantém a página 1 (A4
  // principal) legível e compacta — os 60 descritores completos ficam aqui,
  // fora do orçamento de altura da página principal.
  if (manobrasNotechs.length > 0) {
    doc.addPage();
    let refY = margin;
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(11);
    doc.setTextColor(COLORS.text);
    doc.text('Régua NOTECHS — Descritores Completos', margin, refY);
    refY += 5;
    doc.setFont('helvetica', 'italic');
    doc.setFontSize(6.5);
    doc.setTextColor(COLORS.textSecondary);
    const avisoLines = doc.splitTextToSize(NOTECHS_PROVENIENCIA_AVISO, contentWidth);
    doc.text(avisoLines, margin, refY);
    refY += avisoLines.length * 3 + 3;

    NOTECHS_GRUPOS.forEach((grupo) => {
      const itensGrupo = getNotechsItensPorGrupo(grupo.codigo);
      if (itensGrupo.length === 0) return;

      if (refY > pageHeight - 30) {
        doc.addPage();
        refY = margin;
      }

      doc.setFont('helvetica', 'bold');
      doc.setFontSize(8.5);
      doc.setTextColor('#7c3aed');
      doc.text(`${grupo.tituloPt} / ${grupo.tituloEn}`, margin, refY);
      refY += 4.5;

      itensGrupo.forEach((item) => {
        if (refY > pageHeight - 25) {
          doc.addPage();
          refY = margin;
        }

        doc.setFont('helvetica', 'bold');
        doc.setFontSize(7);
        doc.setTextColor(COLORS.text);
        doc.text(`${item.tituloPt} / ${item.tituloEn}`, margin, refY);
        refY += 3.5;

        getNotechsDescritores(item.codigo).forEach((descritor) => {
          const faixa = FICHA_AVALIACAO_FAIXAS.find((f) => f.rangeLabel === descritor.rangeLabel);
          doc.setFont('helvetica', 'bold');
          doc.setFontSize(6);
          doc.setTextColor(faixa?.color || COLORS.textSecondary);
          doc.text(descritor.rangeLabel, margin + 2, refY);

          doc.setFont('helvetica', 'normal');
          doc.setFontSize(6);
          doc.setTextColor(COLORS.textSecondary);
          const descLines = doc.splitTextToSize(descritor.texto, contentWidth - 16);
          doc.text(descLines, margin + 14, refY);
          refY += Math.max(3, descLines.length * 3);
        });
        refY += 1.5;
      });
      refY += 2;
    });
  }

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
  // Fonte única de bytes: arraybuffer (em vez de Blob) evita a dependência do
  // construtor Blob do documento/realm em que o jsPDF roda, e serve tanto o
  // download direto quanto o preview a partir do mesmo buffer.
  const pdfBytes = doc.output('arraybuffer');

  const mode = opts?.mode ?? 'preview';
  if (mode === 'download' || isSafariBrowser()) {
    downloadBlobDirect(new Blob([pdfBytes], { type: 'application/pdf' }), fileName);
    return;
  }

  await previewPdfBeforeDownload({
    fileName,
    title: previewTitle,
    mimeType: 'application/pdf',
    fetcher: async () =>
      new Response(pdfBytes, {
        headers: {
          'Content-Type': 'application/pdf',
        },
      }),
    existingWindow: opts?.previewWindow,
  });
}

export default gerarPDFFichaCliente;
