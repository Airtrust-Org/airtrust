import type { MiddlewareHandler } from 'hono';
import { recordAuditEventV2 } from '../lib/audit/audit-events-v2';

const REQUEST_ID_PATTERN = /^[A-Za-z0-9._:-]{1,128}$/;
const SAFE_ERROR_CODE_PATTERN = /^[A-Z][A-Z0-9_:-]{0,127}$/;
const SAFE_NOTIFICATION_ERRORS = new Set([
  'E-mail não cadastrado para o destinatário.',
  'Telefone não cadastrado para o destinatário.',
  'Envio de e-mail não configurado (BREVO_API_KEY ausente).',
  'Envio de WhatsApp não configurado (TWILIO/WHATSAPP API ausente).',
]);

/**
 * Preserva IDs externos opacos, curtos e seguros para correlação. Valores
 * ausentes, vazios, longos demais ou com caracteres inadequados são
 * substituídos para impedir propagação de conteúdo não confiável.
 */
export function normalizeRequestId(value: string | undefined): string {
  if (value !== undefined && REQUEST_ID_PATTERN.test(value)) return value;
  return crypto.randomUUID();
}

function getSafeErrorCode(payload: unknown): string | undefined {
  if (typeof payload !== 'object' || payload === null || !('code' in payload)) {
    return undefined;
  }

  const code = (payload as { code?: unknown }).code;
  return typeof code === 'string' && SAFE_ERROR_CODE_PATTERN.test(code) ? code : undefined;
}

function positiveContextId(value: unknown): number | null {
  const parsed = typeof value === 'number' ? value : Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
}

async function recordServerFailureAudit(
  c: {
    env?: Record<string, unknown>;
    get: (key: string) => unknown;
    req: { path: string; method: string };
  },
  response: Response,
  requestId: string,
): Promise<void> {
  if (response.status < 500 || response.status > 599) return;

  const db = c.env?.DB as D1Database | undefined;
  if (!db || typeof db.prepare !== 'function') return;

  let failureReasonCode =
    response.status === 503 ? 'SERVICE_UNAVAILABLE' : 'INTERNAL_ERROR';
  try {
    const payload = await response.clone().json();
    failureReasonCode = getSafeErrorCode(payload) ?? failureReasonCode;
  } catch {
    // Non-JSON 5xx responses are still correlated with the generic safe code.
  }

  const empresaId = positiveContextId(c.get('empresaId'));
  const actorUserId = positiveContextId(c.get('userId'));
  const actorRoleRaw = c.get('userRole');
  const actorRole = typeof actorRoleRaw === 'string' ? actorRoleRaw : null;
  const sourceShaRaw = c.env?.AIRTRUST_SOURCE_SHA;
  const sourceSha = typeof sourceShaRaw === 'string' ? sourceShaRaw : null;

  await recordAuditEventV2(db, {
    empresaId,
    actorUserId,
    actorEmpresaId: empresaId,
    actorRole,
    actorType: actorUserId ? 'user' : 'system',
    requestId,
    eventCategory: 'SYSTEM_ERROR',
    eventAction: 'HTTP_5XX',
    riskLevel: 'medium',
    success: false,
    failureReasonCode,
    retentionClass: 'OPS_SHORT',
    metadata: {
      module: 'http',
      source: sourceSha,
      request_path: c.req.path,
      http_method: c.req.method,
      result: response.status,
      reason_code: failureReasonCode,
    },
  });
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function sanitizeNotificationAlert(value: unknown): unknown {
  const alert = asRecord(value);
  if (!alert || typeof alert.erro !== 'string') return value;

  const tipo = typeof alert.tipo === 'string' ? alert.tipo.toLowerCase() : '';
  const erro = SAFE_NOTIFICATION_ERRORS.has(alert.erro)
    ? alert.erro
    : tipo === 'email'
      ? 'Falha ao enviar e-mail'
      : tipo === 'whatsapp'
        ? 'Falha ao enviar WhatsApp'
        : 'Falha ao enviar notificação';

  return { ...alert, erro };
}

function buildNotificationFailurePayload(
  payload: unknown,
  requestId: string,
): Record<string, unknown> {
  const root = asRecord(payload) ?? {};
  const originalData = asRecord(root.data) ?? {};
  const alertas = Array.isArray(originalData.alertas)
    ? originalData.alertas.map(sanitizeNotificationAlert)
    : [];
  const detalhes = alertas
    .map(asRecord)
    .filter((alerta): alerta is Record<string, unknown> => alerta !== null)
    .filter((alerta) => alerta.status === 'erro')
    .map((alerta) => {
      const tipo = typeof alerta.tipo === 'string' ? alerta.tipo.toUpperCase() : 'CANAL';
      const nome =
        typeof alerta.funcionarioNome === 'string' ? alerta.funcionarioNome : 'Destinatário';
      const erro = typeof alerta.erro === 'string' ? alerta.erro : 'Falha no envio';
      return `${tipo} - ${nome}: ${erro}`;
    });

  return {
    ...root,
    success: false,
    error: 'Nenhum envio foi concluído.',
    code: 'NO_CHANNEL_SENT',
    requestId,
    detalhes,
    data: {
      ...originalData,
      alertas,
    },
  };
}

/**
 * Barreira final para rotas legadas que ainda montam JSON com mensagens internas.
 * O nome exportado é preservado por compatibilidade, mas a proteção de JSON 5xx
 * vale em todos os ambientes. O erro agregado de notificações também é tratado,
 * pois retorna 400 e antes podia carregar mensagens brutas de provedores.
 */
export async function sanitizeProductionServerErrorResponse(
  response: Response,
  _environment: string | undefined,
  requestId: string,
): Promise<Response> {
  const isServerError = response.status >= 500 && response.status <= 599;

  const contentType = response.headers.get('content-type')?.toLowerCase() ?? '';
  if (!contentType.includes('application/json') && !contentType.includes('+json')) {
    return response;
  }

  let payload: unknown;
  try {
    payload = await response.clone().json();
  } catch {
    return response;
  }

  const publicCode = getSafeErrorCode(payload);
  const isNotificationFailure = response.status === 400 && publicCode === 'NO_CHANNEL_SENT';
  if (!isServerError && !isNotificationFailure) return response;

  const headers = new Headers(response.headers);
  headers.delete('content-length');
  headers.set('content-type', 'application/json; charset=UTF-8');
  headers.set('x-request-id', requestId);

  if (isNotificationFailure) {
    return new Response(JSON.stringify(buildNotificationFailurePayload(payload, requestId)), {
      status: response.status,
      statusText: response.statusText,
      headers,
    });
  }

  const code = publicCode ?? (response.status === 503 ? 'SERVICE_UNAVAILABLE' : 'INTERNAL_ERROR');
  const error =
    response.status === 503 ? 'Serviço temporariamente indisponível' : 'Erro interno do servidor';

  return new Response(
    JSON.stringify({
      success: false,
      error,
      code,
      requestId,
    }),
    {
      status: response.status,
      statusText: response.statusText,
      headers,
    },
  );
}

export const requestIdMiddleware = (): MiddlewareHandler => {
  return async (c, next) => {
    const requestId = normalizeRequestId(c.req.header('X-Request-ID'));
    c.set('requestId', requestId);
    c.header('X-Request-ID', requestId);

    await next();

    const environment = typeof c.env?.ENVIRONMENT === 'string' ? c.env.ENVIRONMENT : undefined;
    c.res = await sanitizeProductionServerErrorResponse(c.res, environment, requestId);
    await recordServerFailureAudit(c, c.res, requestId);
    c.header('X-Request-ID', requestId);
  };
};
