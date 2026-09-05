import { ApiError } from '../../middleware/error-handler';

export type EdbShadowErrorStatus = 400 | 404 | 409 | 500;

const SUPPORTED_API_ERROR_STATUSES = new Set<number>([400, 404, 409, 500]);

export function mapEdbShadowError(
  error: unknown,
): { code: string; status: EdbShadowErrorStatus } {
  if (
    error instanceof ApiError &&
    typeof error.code === 'string' &&
    error.code.trim().length > 0 &&
    SUPPORTED_API_ERROR_STATUSES.has(error.statusCode)
  ) {
    return {
      code: error.code.trim(),
      status: error.statusCode as EdbShadowErrorStatus,
    };
  }

  const message = error instanceof Error ? error.message : '';
  const match = /EDB_[A-Z0-9_]+/.exec(message);
  if (!match) return { code: 'EDB_SHADOW_INTERNAL_ERROR', status: 500 };

  const code = match[0];
  if (code.includes('NOT_FOUND') || code.includes('DISAPPEARED')) {
    return { code, status: 404 };
  }
  if (
    code.includes('CONFLICT') ||
    code.includes('ALREADY') ||
    code.includes('STATE_') ||
    code.includes('_REQUIRES_') ||
    code.includes('_REQUIRED_FOR_STATE')
  ) {
    return { code, status: 409 };
  }
  return { code, status: 400 };
}
