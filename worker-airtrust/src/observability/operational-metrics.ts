const FORBIDDEN_KEY =
  /(cpf|email|nome|token|authorization|cookie|senha|password|certificado|mensagem|payload|conteudo)/i;
const EMAIL_PATTERN = /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/i;
const CPF_PATTERN = /\b\d{3}[.\s-]?\d{3}[.\s-]?\d{3}[.\s-]?\d{2}\b/;
const TOKEN_PATTERN = /\b(?:eyJ[A-Za-z0-9_-]{20,}|Bearer\s+\S+|[A-Fa-f0-9]{64,})\b/;

export type OperationalMetric = {
  event: 'operational_metric';
  operation: string;
  route?: string;
  method?: string;
  status?: number;
  latency_ms?: number;
  tenant_scope?: string | null;
  error_category?: string | null;
  processed_count?: number;
  failed_count?: number;
  retry_count?: number;
  partial?: boolean;
  d1_operations?: number;
  external_calls?: number;
  pending_count?: number;
  cursor?: string | null;
  stop_reason?: string | null;
  [key: string]: unknown;
};

function sanitizeString(value: string): string | null {
  const compact = value.replace(/[\r\n\t]+/g, ' ').slice(0, 180);
  if (
    EMAIL_PATTERN.test(compact) ||
    CPF_PATTERN.test(compact) ||
    TOKEN_PATTERN.test(compact)
  ) {
    return null;
  }
  return compact;
}

export function sanitizeOperationalMetric(
  input: Record<string, unknown>,
): Record<string, unknown> {
  const output: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(input)) {
    if (FORBIDDEN_KEY.test(key)) continue;
    if (
      value == null ||
      typeof value === 'number' ||
      typeof value === 'boolean'
    ) {
      output[key] = value;
      continue;
    }
    if (typeof value === 'string') {
      const sanitized = sanitizeString(value);
      if (sanitized !== null) output[key] = sanitized;
      continue;
    }
    if (Array.isArray(value)) {
      output[key] = value
        .slice(0, 20)
        .map((item) =>
          typeof item === 'object' && item !== null
            ? sanitizeOperationalMetric(item as Record<string, unknown>)
            : typeof item === 'string'
              ? sanitizeString(item)
              : item,
        )
        .filter((item) => item !== null);
      continue;
    }
    if (typeof value === 'object') {
      output[key] = sanitizeOperationalMetric(value as Record<string, unknown>);
    }
  }
  return output;
}

export function normalizeMetricRoute(pathname: string): string {
  return pathname
    .split('?')[0]
    .replace(/\b[0-9a-f]{8}-[0-9a-f-]{27,}\b/gi, ':uuid')
    .replace(/\/[0-9]+(?=\/|$)/g, '/:id')
    .replace(/\/[A-Za-z0-9_-]{24,}(?=\/|$)/g, '/:opaque')
    .slice(0, 180);
}

export function classifyOperationalFlow(pathname: string): string {
  const path = pathname.toLowerCase();
  if (path.includes('/auth/')) return 'auth';
  if (path.includes('upload') || path.includes('/assets')) return 'upload';
  if (path.includes('certificado')) return 'certificate';
  if (
    path.includes('/lms/') &&
    (path.includes('conclus') || path.includes('progresso'))
  ) {
    return 'lms_completion';
  }
  if (path.includes('qualific') && path.includes('renov')) {
    return 'qualification_renewal';
  }
  if (path.includes('/system/operations')) return 'operational_status';
  return 'http_request';
}

export function classifyHttpError(status: number): string | null {
  if (status === 401) return 'authentication';
  if (status === 403) return 'authorization';
  if (status === 429) return 'rate_limit';
  if (status >= 500) return 'server';
  if (status >= 400) return 'client';
  return null;
}

export function emitOperationalMetric(metric: OperationalMetric): void {
  console.log(JSON.stringify(sanitizeOperationalMetric(metric)));
}

export function emitHttpMetric(input: {
  pathname: string;
  method: string;
  status: number;
  latencyMs: number;
}): void {
  emitOperationalMetric({
    event: 'operational_metric',
    operation: classifyOperationalFlow(input.pathname),
    route: normalizeMetricRoute(input.pathname),
    method: input.method.toUpperCase(),
    status: input.status,
    latency_ms: Math.max(0, Math.round(input.latencyMs)),
    tenant_scope: null,
    error_category: classifyHttpError(input.status),
  });
}
