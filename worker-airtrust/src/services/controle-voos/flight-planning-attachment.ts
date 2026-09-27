import { ApiError } from '../../middleware/error-handler';
import type { Env } from '../../types';

const PLANNING_DOCUMENT_ACTION = 'flight_attachment';
const PLANNING_DOCUMENT_TYPE = 'PLANO_VOO';
const PLANNING_DOCUMENT_CONTENT_TYPE = 'application/pdf';
const PLANNING_LINK_TTL_SECONDS = 24 * 60 * 60;
const PUBLIC_TOKEN_SCOPE = 'controle-voos:planejamento-pdf';

export type FlightPlanningPdf = {
  documentId: number;
  empresaId: number;
  vooId: number;
  r2Key: string;
  fileName: string;
  contentType: 'application/pdf';
  size: number;
};

type FlightAttachmentRow = {
  id: number;
  metadata_json: string | null;
};

type PlanningPdfTokenClaims = {
  scope: typeof PUBLIC_TOKEN_SCOPE;
  empresaId: number;
  vooId: number;
  documentId: number;
};

function sanitizeFileName(value: string): string {
  const normalized = String(value || 'planejamento-previo.pdf')
    .replace(/[\r\n"\\/]/g, '_')
    .trim();
  return normalized.slice(0, 180) || 'planejamento-previo.pdf';
}

function assertPlanningPdfKeyScope(key: string, empresaId: number, vooId: number): void {
  const prefix = `controle-voos/${empresaId}/${vooId}/documentos/plano_voo/`;
  if (!key || key.includes('\0') || key.includes('..') || key.includes('//') || !key.startsWith(prefix)) {
    throw new ApiError(
      'Planejamento previo fora do escopo do voo',
      403,
      'CONTROLE_VOOS_PLANNING_PDF_SCOPE_INVALID',
    );
  }
}

function parsePlanningPdfRow(
  row: FlightAttachmentRow | null,
  empresaId: number,
  vooId: number,
): FlightPlanningPdf | null {
  if (!row?.metadata_json) return null;
  try {
    const metadata = JSON.parse(row.metadata_json) as Record<string, unknown>;
    if (String(metadata.action || '') !== PLANNING_DOCUMENT_ACTION) return null;
    if (String(metadata.document_type || '') !== PLANNING_DOCUMENT_TYPE) return null;
    if (String(metadata.content_type || '').toLowerCase() !== PLANNING_DOCUMENT_CONTENT_TYPE) return null;
    const r2Key = String(metadata.r2_key || '');
    assertPlanningPdfKeyScope(r2Key, empresaId, vooId);
    return {
      documentId: Number(row.id),
      empresaId,
      vooId,
      r2Key,
      fileName: sanitizeFileName(String(metadata.file_name || 'planejamento-previo.pdf')),
      contentType: PLANNING_DOCUMENT_CONTENT_TYPE,
      size: Number(metadata.size || 0),
    };
  } catch (error) {
    if (error instanceof ApiError) throw error;
    return null;
  }
}

export async function findLatestFlightPlanningPdf(
  db: D1Database,
  empresaId: number,
  vooId: number,
): Promise<FlightPlanningPdf | null> {
  const row = await db.prepare(
    `SELECT id, metadata_json
       FROM cv_voo_eventos
      WHERE empresa_id = ? AND voo_id = ? AND deleted_at IS NULL
        AND tipo_evento = 'observacao'
        AND json_extract(metadata_json, '$.action') = ?
        AND json_extract(metadata_json, '$.document_type') = ?
      ORDER BY id DESC
      LIMIT 1`,
  ).bind(empresaId, vooId, PLANNING_DOCUMENT_ACTION, PLANNING_DOCUMENT_TYPE)
    .first<FlightAttachmentRow>();
  return parsePlanningPdfRow(row, empresaId, vooId);
}

export async function getFlightPlanningPdfByDocumentId(
  db: D1Database,
  empresaId: number,
  vooId: number,
  documentId: number,
): Promise<FlightPlanningPdf | null> {
  const row = await db.prepare(
    `SELECT id, metadata_json
       FROM cv_voo_eventos
      WHERE id = ? AND empresa_id = ? AND voo_id = ? AND deleted_at IS NULL
        AND tipo_evento = 'observacao'
        AND json_extract(metadata_json, '$.action') = ?
        AND json_extract(metadata_json, '$.document_type') = ?
      LIMIT 1`,
  ).bind(documentId, empresaId, vooId, PLANNING_DOCUMENT_ACTION, PLANNING_DOCUMENT_TYPE)
    .first<FlightAttachmentRow>();
  return parsePlanningPdfRow(row, empresaId, vooId);
}

export async function loadFlightPlanningPdfBytes(
  bucket: R2Bucket,
  attachment: FlightPlanningPdf,
): Promise<ArrayBuffer> {
  const object = await bucket.get(attachment.r2Key);
  if (!object) {
    throw new ApiError(
      'Planejamento previo indisponivel no storage',
      409,
      'CONTROLE_VOOS_PLANNING_PDF_STORAGE_MISSING',
    );
  }
  return object.arrayBuffer();
}

export async function assertFlightPlanningPdfStored(
  bucket: R2Bucket,
  attachment: FlightPlanningPdf,
): Promise<void> {
  const object = await bucket.head(attachment.r2Key);
  if (!object) {
    throw new ApiError(
      'Planejamento previo indisponivel no storage',
      409,
      'CONTROLE_VOOS_PLANNING_PDF_STORAGE_MISSING',
    );
  }
}

export function arrayBufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = '';
  const chunkSize = 8192;
  for (let index = 0; index < bytes.length; index += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(index, index + chunkSize));
  }
  return btoa(binary);
}

export async function buildFlightPlanningEmailAttachment(
  env: Env,
  attachment: FlightPlanningPdf,
): Promise<{ content: string; name: string }> {
  const bytes = await loadFlightPlanningPdfBytes(env.BUCKET, attachment);
  return { content: arrayBufferToBase64(bytes), name: attachment.fileName };
}

function bytesToBase64Url(bytes: Uint8Array): string {
  let binary = '';
  for (let index = 0; index < bytes.length; index += 8192) {
    binary += String.fromCharCode(...bytes.subarray(index, index + 8192));
  }
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

function base64UrlToBytes(value: string): Uint8Array {
  const base64 = value.replace(/-/g, '+').replace(/_/g, '/');
  const padded = base64 + '='.repeat((4 - (base64.length % 4)) % 4);
  const binary = atob(padded);
  return Uint8Array.from(binary, (char) => char.charCodeAt(0));
}

async function importPlanningTokenKey(secret: string, usages: Array<'sign' | 'verify'>): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    usages,
  );
}

export async function signFlightPlanningPdfToken(
  secret: string,
  attachment: FlightPlanningPdf,
): Promise<string> {
  const expiresAt = Math.floor(Date.now() / 1000) + PLANNING_LINK_TTL_SECONDS;
  const payload = bytesToBase64Url(new TextEncoder().encode(JSON.stringify({
    scope: PUBLIC_TOKEN_SCOPE,
    empresaId: attachment.empresaId,
    vooId: attachment.vooId,
    documentId: attachment.documentId,
    exp: expiresAt,
  })));
  const signedValue = `v1.${payload}`;
  const key = await importPlanningTokenKey(secret, ['sign']);
  const signature = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(signedValue));
  return `${signedValue}.${bytesToBase64Url(new Uint8Array(signature))}`;
}

export async function verifyFlightPlanningPdfToken(
  secret: string,
  token: string,
): Promise<PlanningPdfTokenClaims | null> {
  try {
    const [version, payloadPart, signaturePart, extra] = token.split('.');
    if (version !== 'v1' || !payloadPart || !signaturePart || extra) return null;
    const key = await importPlanningTokenKey(secret, ['verify']);
    const valid = await crypto.subtle.verify(
      'HMAC',
      key,
      base64UrlToBytes(signaturePart),
      new TextEncoder().encode(`${version}.${payloadPart}`),
    );
    if (!valid) return null;
    const payload = JSON.parse(new TextDecoder().decode(base64UrlToBytes(payloadPart))) as Record<string, unknown>;
    if (payload.scope !== PUBLIC_TOKEN_SCOPE) return null;
    const expiresAt = Number(payload.exp);
    if (!Number.isInteger(expiresAt) || expiresAt <= Math.floor(Date.now() / 1000)) return null;
    const empresaId = Number(payload.empresaId);
    const vooId = Number(payload.vooId);
    const documentId = Number(payload.documentId);
    if (![empresaId, vooId, documentId].every((value) => Number.isInteger(value) && value > 0)) {
      return null;
    }
    return { scope: PUBLIC_TOKEN_SCOPE, empresaId, vooId, documentId };
  } catch {
    return null;
  }
}

export async function buildFlightPlanningPublicUrl(
  requestUrl: string,
  env: Env,
  attachment: FlightPlanningPdf,
): Promise<string> {
  const token = await signFlightPlanningPdfToken(env.JWT_SECRET, attachment);
  const origin = new URL(requestUrl).origin;
  return `${origin}/api/public/controle-voos/planejamento-previo/${encodeURIComponent(token)}`;
}
