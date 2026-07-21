/**
 * Storage privado (R2) da Biblioteca de Guias do Instrutor de Simulador.
 *
 * Estrutura de chave:
 *   guias-instrutor/{empresa_id}/{aeronave}/{programa}/{codigo_sanitizado}/{versao}/index.html
 *   guias-instrutor/{empresa_id}/{aeronave}/{programa}/{codigo_sanitizado}/{versao}/guia.pdf
 *
 * Nunca gera URL pública — apenas a chave interna é persistida. Toda leitura
 * passa por rota autenticada que resolve a chave a partir do registro no D1.
 */

export function sanitizeCodigoParaChave(codigo: string): string {
  return codigo
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .toUpperCase();
}

export function buildGuiaR2Key(params: {
  empresaId: number;
  aeronaveCodigo: string;
  programa: string;
  codigo: string;
  versao: string;
  arquivo: 'index.html' | 'guia.pdf';
}): string {
  const { empresaId, aeronaveCodigo, programa, codigo, versao, arquivo } = params;
  const aeronave = sanitizeCodigoParaChave(aeronaveCodigo);
  const codigoSanitizado = sanitizeCodigoParaChave(codigo);
  const versaoSanitizada = sanitizeCodigoParaChave(versao).replace(/-/g, '.');

  return `guias-instrutor/${empresaId}/${aeronave}/${programa}/${codigoSanitizado}/${versaoSanitizada}/${arquivo}`;
}

export async function sha256Hex(bytes: ArrayBuffer): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

/**
 * Nome de arquivo legível e seguro para Content-Disposition — nunca expõe a
 * chave interna do R2 nem caracteres que quebrem o header.
 */
export function buildDownloadFilename(params: {
  aeronaveNome: string;
  programa: string;
  ciclo?: number | null;
  sessaoNumero?: number | null;
  codigo: string;
  versao: string;
  extensao: 'pdf';
}): string {
  const { aeronaveNome, programa, ciclo, sessaoNumero, codigo, versao, extensao } = params;

  const parts = [aeronaveNome, programa];
  if (ciclo) parts.push(`Ciclo${ciclo}`);
  if (sessaoNumero) parts.push(`Sessao${sessaoNumero}`);
  parts.push(sanitizeCodigoParaChave(codigo));
  parts.push(`v${versao}`);

  const base = parts
    .join('_')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9_.-]+/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_+|_+$/g, '');

  return `${base}.${extensao}`;
}

export function contentDispositionAttachment(filename: string): string {
  const asciiFallback = filename.replace(/[^\x20-\x7E]/g, '_').replace(/"/g, '');
  return `attachment; filename="${asciiFallback}"; filename*=UTF-8''${encodeURIComponent(filename)}`;
}

const PDF_MAGIC = new Uint8Array([0x25, 0x50, 0x44, 0x46]); // "%PDF"

export function looksLikePdf(bytes: Uint8Array): boolean {
  if (bytes.length < 5) return false;
  return PDF_MAGIC.every((byte, index) => bytes[index] === byte);
}

export function looksLikeHtml(text: string): boolean {
  const head = text.slice(0, 1000).toLowerCase();
  return head.includes('<!doctype html') || head.includes('<html');
}
