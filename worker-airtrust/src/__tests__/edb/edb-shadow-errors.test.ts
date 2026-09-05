import { describe, expect, it } from 'vitest';
import { ApiError } from '../../middleware/error-handler';
import { mapEdbShadowError } from '../../lib/edb/edb-shadow-errors';

describe('eDB shadow error mapping', () => {
  it('preserves a supported ApiError status and source code', () => {
    expect(
      mapEdbShadowError(
        new ApiError('Voo nao encontrado', 404, 'CONTROLE_VOOS_NOT_FOUND'),
      ),
    ).toEqual({ code: 'CONTROLE_VOOS_NOT_FOUND', status: 404 });
  });

  it('retains existing EDB not-found and conflict classification', () => {
    expect(mapEdbShadowError(new Error('EDB_REVISION_NOT_FOUND'))).toEqual({
      code: 'EDB_REVISION_NOT_FOUND',
      status: 404,
    });
    expect(mapEdbShadowError(new Error('EDB_STATE_CONFLICT'))).toEqual({
      code: 'EDB_STATE_CONFLICT',
      status: 409,
    });
  });

  it('fails closed for unsupported ApiError statuses or missing safe codes', () => {
    expect(
      mapEdbShadowError(new ApiError('Do not expose this', 418, 'TEAPOT')),
    ).toEqual({ code: 'EDB_SHADOW_INTERNAL_ERROR', status: 500 });
    expect(mapEdbShadowError(new ApiError('Do not expose this', 404))).toEqual({
      code: 'EDB_SHADOW_INTERNAL_ERROR',
      status: 500,
    });
  });

  it('does not expose arbitrary technical messages', () => {
    expect(mapEdbShadowError(new Error('database connection detail'))).toEqual({
      code: 'EDB_SHADOW_INTERNAL_ERROR',
      status: 500,
    });
  });
});
