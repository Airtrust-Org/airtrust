const TECHNICAL_LMS_ERROR_PATTERNS = [
  /\b(?:SQLITE(?:_ERROR)?|D1_ERROR|SQLSTATE|ECONNRESET|ECONNREFUSED|ETIMEDOUT|ENOTFOUND)\b/i,
  /\bno such (?:table|column)\b/i,
  /\b(?:stack trace|traceback|internal server error)\b/i,
  /\b(?:SyntaxError|TypeError|ReferenceError|RangeError):/i,
  /\bHTTP\s+[45]\d{2}\b/i,
  /\bat\s+(?:async\s+)?[\w.$<>]+\s*\([^)]*\.(?:ts|tsx|js|mjs|cjs):\d+:\d+\)/i,
  /\b(?:worker|node_modules|dist|src)[\\/][^\s)]+\.(?:ts|tsx|js|mjs|cjs):\d+/i,
];

function isLmsRequestUrl(rawUrl: string): boolean {
  try {
    const base = typeof window !== 'undefined' ? window.location.origin : 'https://airtrust.local';
    return new URL(rawUrl, base).pathname.startsWith('/api/lms/');
  } catch {
    return rawUrl.startsWith('/api/lms/');
  }
}

function fallbackForStatus(status: number): string {
  if (status === 401) return 'Sua sessão expirou. Entre novamente.';
  if (status === 403) return 'Você não tem permissão para executar esta ação.';
  if (status >= 500) return 'O servidor não conseguiu concluir a operação.';
  return 'Não foi possível concluir a operação.';
}

export function safeLmsResponseErrorText(
  text: string | undefined,
  status: number,
): string {
  if (status === 401 || status === 403 || status >= 500) {
    return fallbackForStatus(status);
  }

  const normalized = String(text || '').trim();
  if (!normalized) return fallbackForStatus(status);
  return TECHNICAL_LMS_ERROR_PATTERNS.some((pattern) => pattern.test(normalized))
    ? fallbackForStatus(status)
    : normalized;
}

function rebuiltResponse(response: Response, body: BodyInit, contentType?: string): Response {
  const headers = new Headers(response.headers);
  headers.delete('content-length');
  if (contentType) headers.set('content-type', contentType);
  return new Response(body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

/**
 * Sanitizes only failed LMS responses returned to browser consumers.
 * Successful responses and all non-LMS traffic remain byte-for-byte untouched.
 * Diagnostic payload fields other than user-facing `error`/`message` are preserved.
 */
export async function sanitizeLmsAuthenticatedErrorResponse(
  response: Response,
  requestUrl: string,
): Promise<Response> {
  if (response.ok || !isLmsRequestUrl(requestUrl)) return response;

  const clone = response.clone();
  const contentType = clone.headers.get('content-type') || '';

  if (contentType.includes('application/json')) {
    const payload = await clone.json().catch(() => undefined);
    if (payload && typeof payload === 'object' && !Array.isArray(payload)) {
      const record = { ...(payload as Record<string, unknown>) };
      let changed = false;

      for (const field of ['error', 'message'] as const) {
        if (typeof record[field] !== 'string') continue;
        const safe = safeLmsResponseErrorText(record[field] as string, response.status);
        if (safe !== record[field]) {
          record[field] = safe;
          changed = true;
        }
      }

      if (changed) {
        return rebuiltResponse(response, JSON.stringify(record), 'application/json');
      }
    }
    return response;
  }

  const rawText = await clone.text().catch(() => '');
  if (!rawText) return response;
  const safeText = safeLmsResponseErrorText(rawText, response.status);
  return safeText === rawText
    ? response
    : rebuiltResponse(response, safeText, contentType || 'text/plain; charset=utf-8');
}
