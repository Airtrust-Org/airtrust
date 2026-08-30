import type { MiddlewareHandler } from 'hono';
import type { Env } from '../types';
import { safeServerMessage } from './error-handler';

type JsonRecord = Record<string, unknown>;

function asJsonRecord(value: unknown): JsonRecord | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as JsonRecord)
    : null;
}

function diagnosticValue(value: unknown): string | number | undefined {
  if (typeof value === 'string' && value.trim()) return value;
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  return undefined;
}

export function safeServerErrorPayload(
  payload: unknown,
  status: number,
  responseRequestId?: string | null,
): JsonRecord {
  const source = asJsonRecord(payload);
  const code = diagnosticValue(source?.code);
  const requestId = diagnosticValue(source?.requestId) ?? diagnosticValue(responseRequestId);

  return {
    success: false,
    error: safeServerMessage(status),
    ...(code !== undefined ? { code } : {}),
    ...(requestId !== undefined ? { requestId } : {}),
  };
}

/**
 * Defense-in-depth for routes that catch an exception and build a 5xx response
 * themselves, bypassing Hono's global onError handler. Outside local development,
 * only a safe operational message plus diagnostic identifiers may cross HTTP.
 */
export function safeServerErrorResponseBoundary(): MiddlewareHandler<{ Bindings: Env }> {
  return async (c, next) => {
    await next();

    const status = c.res.status;
    const environment = c.env.ENVIRONMENT || 'unknown';
    if (status < 500 || environment === 'development') return;

    const original = c.res;
    const contentType = original.headers.get('content-type') || '';
    const payload = contentType.includes('application/json')
      ? await original.clone().json().catch(() => undefined)
      : undefined;

    const headers = new Headers(original.headers);
    const requestId = headers.get('X-Request-ID');
    headers.delete('content-length');
    headers.set('content-type', 'application/json; charset=UTF-8');

    c.res = new Response(
      JSON.stringify(safeServerErrorPayload(payload, status, requestId)),
      {
        status,
        statusText: original.statusText,
        headers,
      },
    );
  };
}
