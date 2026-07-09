import { AppError } from '../utils/errors';
import { Context } from 'hono';
import type { ContentfulStatusCode } from 'hono/utils/http-status';

interface StandardResponse<T = unknown> {
  success: boolean;
  data?: T;
  error?: string;
  message?: string;
  code?: string;
}

export function jsonOk<T>(c: Context, data: T, message?: string) {
  const body: StandardResponse<T> = { success: true, data };
  if (message) body.message = message;
  return c.json(body, 200);
}

export function jsonError(c: Context, error: string, status = 400, code?: string) {
  const body: StandardResponse = { success: false, error, code };
  return c.json(body, status as ContentfulStatusCode);
}

export function jsonInternalError(
  c: Context,
  error = 'Erro interno do servidor',
  code = 'INTERNAL_ERROR',
) {
  return jsonError(c, error, 500, code);
}

