/**
 * SERVIÇO DE CONVERSÃO HTML → PDF
 * Usa Cloudflare Browser Rendering API para converter template HTML em PDF
 */

import qrcode from 'qrcode-generator';

const RETRYABLE_STATUS_CODES = new Set([429]);
const RETRY_BACKOFF_MS = [5000, 15000, 30000] as const;

export interface HtmlToPdfOptions {
  html: string;
  accountId: string;
  apiToken: string;
  format?: 'A4' | 'Letter' | 'a4' | 'letter';
  printBackground?: boolean;
  margin?: {
    top?: string;
    right?: string;
    bottom?: string;
    left?: string;
  };
}

export interface HtmlToPdfResult {
  success: boolean;
  pdfBytes?: Uint8Array;
  error?: string;
}

type CloudflarePdfFormat = 'a4' | 'letter';

interface ProcessTemplateWithQROptions {
  validationApiBaseUrl?: string;
  validationPageBaseUrl?: string;
}

function toBase64Utf8(value: string): string {
  const bytes = new TextEncoder().encode(value);
  let binary = '';
  const chunkSize = 0x8000;

  for (let index = 0; index < bytes.length; index += chunkSize) {
    const chunk = bytes.subarray(index, index + chunkSize);
    binary += String.fromCharCode(...chunk);
  }

  return btoa(binary);
}

function normalizeCompanyDisplayName(value?: string | number | null): string {
  const raw = String(value || 'AirTrust')
    .replace(/\s+/g, ' ')
    .trim();
  if (!raw) return 'AirTrust';
  if (/^airtrust(?:\s+airtrust)?\s+test$/i.test(raw)) return 'AirTrust';

  const tokens = raw.split(' ');
  const normalized = tokens
    .filter(
      (token, index) => index === 0 || token.toLowerCase() !== tokens[index - 1].toLowerCase(),
    )
    .join(' ');

  if (/^airtrust\s+test$/i.test(normalized)) return 'AirTrust';
  return normalized;
}

function normalizePdfFormat(format?: HtmlToPdfOptions['format']): CloudflarePdfFormat {
  switch (String(format || 'A4').toLowerCase()) {
    case 'letter':
      return 'letter';
    case 'a4':
    default:
      return 'a4';
  }
}

function generateQrCodeDataUrl(validationUrl: string): string {
  const qr = qrcode(0, 'H');
  qr.addData(validationUrl);
  qr.make();
  return qr.createDataURL(4, 1);
}

function parseRetryAfterMs(headerValue: string | null): number | null {
  if (!headerValue) return null;

  const seconds = Number(headerValue);
  if (Number.isFinite(seconds) && seconds >= 0) {
    return seconds * 1000;
  }

  const dateMs = Date.parse(headerValue);
  if (Number.isNaN(dateMs)) return null;

  return Math.max(0, dateMs - Date.now());
}

async function waitMs(ms: number): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, ms));
}
function sanitizeHtmlForPdf(html: string): string {
  const pdfNormalizationStyle = `
<style id="airtrust-pdf-normalization">
  html, body {
    margin: 0 !important;
    padding: 0 !important;
    background: #ffffff !important;
  }

  *, *::before, *::after {
    box-shadow: none !important;
    text-shadow: none !important;
    filter: none !important;
    backdrop-filter: none !important;
    -webkit-filter: none !important;
  }
</style>`;

  if (/<\/head>/i.test(html)) {
    return html.replace(/<\/head>/i, `${pdfNormalizationStyle}\n</head>`);
  }

  if (/<body[^>]*>/i.test(html)) {
    return html.replace(/<body([^>]*)>/i, `<head>${pdfNormalizationStyle}</head><body$1>`);
  }

  return `${pdfNormalizationStyle}${html}`;
}

/**
 * Converte HTML para PDF usando Cloudflare Browser Rendering API
 */
export async function htmlToPdf(options: HtmlToPdfOptions): Promise<HtmlToPdfResult> {
  const { html, accountId, apiToken, format = 'A4', printBackground = true, margin } = options;
  const normalizedFormat = normalizePdfFormat(format);
  const sanitizedHtml = sanitizeHtmlForPdf(html);

  const url = `https://api.cloudflare.com/client/v4/accounts/${accountId}/browser-rendering/pdf`;

  try {
    console.log(`📄 [HTML→PDF] Iniciando conversão, HTML length: ${sanitizedHtml.length}`);

    const body = JSON.stringify({
      html: sanitizedHtml,
      gotoOptions: {
        waitUntil: 'networkidle2',
        timeout: 45000,
      },
      pdfOptions: {
        format: normalizedFormat,
        printBackground,
        preferCSSPageSize: true,
        margin: {
          top: margin?.top || '20mm',
          right: margin?.right || '20mm',
          bottom: margin?.bottom || '20mm',
          left: margin?.left || '20mm',
        },
      },
    });

    for (let attempt = 0; attempt <= RETRY_BACKOFF_MS.length; attempt += 1) {
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${apiToken}`,
          Accept: 'application/pdf',
          'Content-Type': 'application/json',
        },
        body,
      });

      if (response.ok) {
        const pdfBytes = new Uint8Array(await response.arrayBuffer());
        console.log(`✅ [HTML→PDF] PDF gerado com sucesso: ${pdfBytes.length} bytes`);

        return {
          success: true,
          pdfBytes,
        };
      }

      const errorText = await response.text();
      const isRetryable = RETRYABLE_STATUS_CODES.has(response.status);
      const hasRemainingRetry = attempt < RETRY_BACKOFF_MS.length;

      console.error(`❌ [HTML→PDF] Erro API: ${response.status} - ${errorText}`, {
        attempt: attempt + 1,
        maxAttempts: RETRY_BACKOFF_MS.length + 1,
      });

      if (!isRetryable || !hasRemainingRetry) {
        return {
          success: false,
          error: `Cloudflare API error: ${response.status} - ${errorText}`,
        };
      }

      const retryAfterMs = parseRetryAfterMs(response.headers.get('retry-after'));
      const backoffMs = retryAfterMs ?? RETRY_BACKOFF_MS[attempt];
      console.warn(`⏳ [HTML→PDF] Retry apos rate limit`, {
        attempt: attempt + 1,
        nextDelayMs: backoffMs,
      });
      await waitMs(backoffMs);
    }

    return {
      success: false,
      error: 'Cloudflare API error: retries exhausted',
    };
  } catch (error) {
    console.error('❌ [HTML→PDF] Erro na conversão:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

/**
 * Substitui variáveis no template HTML com os dados reais + gera QR code
 */
export async function processTemplateWithQR(
  template: string,
  data: Record<string, string | number | undefined | null>,
  options: ProcessTemplateWithQROptions = {},
): Promise<string> {
  let result = template;

  // Gerar HASH de validação para QR code
  let qrCodeDataUrl = '';
  let hash = '';
  if (
    data.numero_certificado &&
    data.funcionario_cpf &&
    data.qualificacao_codigo &&
    data.data_conclusao
  ) {
    try {
      // Limpar CPF
      const cpfLimpo = String(data.funcionario_cpf).replace(/[.\-\s]/g, '');
      const hashString = `${cpfLimpo}${data.qualificacao_codigo}${data.data_conclusao}${data.numero_certificado}`;

      // Gerar hash SHA-256
      const encoder = new TextEncoder();
      const dataBytes = encoder.encode(hashString);
      const hashBuffer = await crypto.subtle.digest('SHA-256', dataBytes);
      const hashArray = Array.from(new Uint8Array(hashBuffer));
      hash = hashArray
        .map((b) => b.toString(16).padStart(2, '0'))
        .join('')
        .substring(0, 16)
        .toUpperCase();

      // QR code com URL de validação
      const validationPageBase = (
        options.validationPageBaseUrl || 'https://airtrust.online'
      ).replace(/\/$/, '');
      const validationUrl = `${validationPageBase}/validar/${hash}`;
      qrCodeDataUrl = generateQrCodeDataUrl(validationUrl);
    } catch (error) {
      console.error('❌ [QR CODE] Erro ao gerar QR code:', error);
      qrCodeDataUrl = '';
    }
  }

  const variables: Record<string, string> = {
    '{{nome_funcionario}}': String(data.funcionario_nome || ''),
    '{{cpf}}': String(data.funcionario_cpf || ''),
    '{{codigo_anac}}': String(data.funcionario_codigo_anac || ''),
    '{{matricula}}': String(data.funcionario_matricula || ''),
    '{{nome_qualificacao}}': String(data.qualificacao_nome || ''),
    '{{codigo_qualificacao}}': String(data.qualificacao_codigo || ''),
    '{{categoria}}': String(data.qualificacao_categoria || ''),
    '{{data_conclusao}}': formatDate(data.data_conclusao),
    '{{data_vencimento}}': formatDate(data.data_vencimento),
    '{{carga_horaria}}': data.carga_horaria ? String(data.carga_horaria) : '',
    '{{conteudo}}': String(data.conteudo || ''),
    '{{descricao_section}}': String(data.descricao_section || ''),
    '{{qual_meta_line}}': String(data.qual_meta_line || ''),
    '{{instrutor_nome}}': String(data.instrutor_nome || ''),
    '{{instrutor_codigo_anac}}': String(data.instrutor_codigo_anac || ''),
    '{{instrutor_matricula}}': String(data.instrutor_matricula || ''),
    '{{instrutor_section}}': String(data.instrutor_section || ''),
    '{{nome_empresa}}': normalizeCompanyDisplayName(data.nome_empresa),
    '{{logo_url}}': String(data.logo_url || ''),
    '{{numero_certificado}}': String(data.numero_certificado || ''),
    // hash_id: primeiros 12 chars do hash SHA-256 gerado acima (ou fallback)
    '{{hash_id}}':
      hash ||
      String(data.numero_certificado || '')
        .slice(-12)
        .toUpperCase(),
    // {{qr_code}} renderiza um <img> pronto para usar em qualquer posição
    '{{qr_code}}': qrCodeDataUrl
      ? `<img src="${qrCodeDataUrl}" alt="QR Code" style="max-width: 150px; height: auto;" />`
      : '',
    // {{qr_code_data_url}} é apenas o src base64 — útil quando o template já tem o <img>
    '{{qr_code_data_url}}': qrCodeDataUrl,
  };

  for (const [variable, value] of Object.entries(variables)) {
    result = result.replace(new RegExp(variable.replace(/[{}]/g, '\\$&'), 'g'), value);
  }

  return result;
}

/**
 * Substitui variáveis no template HTML com os dados reais (versão síncrona, sem QR code)
 */
export function processTemplate(
  template: string,
  data: Record<string, string | number | undefined | null>,
): string {
  let result = template;

  const variables: Record<string, string> = {
    '{{nome_funcionario}}': String(data.funcionario_nome || ''),
    '{{cpf}}': String(data.funcionario_cpf || ''),
    '{{codigo_anac}}': String(data.funcionario_codigo_anac || ''),
    '{{matricula}}': String(data.funcionario_matricula || ''),
    '{{nome_qualificacao}}': String(data.qualificacao_nome || ''),
    '{{codigo_qualificacao}}': String(data.qualificacao_codigo || ''),
    '{{categoria}}': String(data.qualificacao_categoria || ''),
    '{{data_conclusao}}': formatDate(data.data_conclusao),
    '{{data_vencimento}}': formatDate(data.data_vencimento),
    '{{carga_horaria}}': data.carga_horaria ? String(data.carga_horaria) : '',
    '{{conteudo}}': String(data.conteudo || ''),
    '{{descricao_section}}': String(data.descricao_section || ''),
    '{{qual_meta_line}}': String(data.qual_meta_line || ''),
    '{{instrutor_nome}}': String(data.instrutor_nome || ''),
    '{{instrutor_codigo_anac}}': String(data.instrutor_codigo_anac || ''),
    '{{instrutor_matricula}}': String(data.instrutor_matricula || ''),
    '{{instrutor_section}}': String(data.instrutor_section || ''),
    '{{nome_empresa}}': normalizeCompanyDisplayName(data.nome_empresa),
    '{{logo_url}}': String(data.logo_url || ''),
    '{{numero_certificado}}': String(data.numero_certificado || ''),
    '{{qr_code}}': '', // Placeholder vazio - use processTemplateWithQR para gerar QR code
  };

  for (const [variable, value] of Object.entries(variables)) {
    result = result.replace(new RegExp(variable.replace(/[{}]/g, '\\$&'), 'g'), value);
  }

  return result;
}

/**
 * Formata data para exibição
 */
function formatDate(dateStr: string | number | undefined | null): string {
  if (!dateStr) return '';
  try {
    const raw = String(dateStr).trim();
    const match = raw.match(/^(\d{4})-(\d{2})-(\d{2})/);
    const date = match
      ? new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]))
      : new Date(raw);
    return date.toLocaleDateString('pt-BR', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
    });
  } catch {
    return String(dateStr);
  }
}
