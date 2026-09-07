import { describe, expect, it } from 'vitest';
import { resolveSgsoRelatoLoadError } from '../SgsoRelato';

describe('SGSO relato detail error contract', () => {
  it('shows not-found only for an actual 404 contract', () => {
    expect(
      resolveSgsoRelatoLoadError({
        success: false,
        code: 'SGSO_RELATO_NOT_FOUND',
        error: 'Relato não encontrado',
        http_status: 404,
      }),
    ).toBe('Relato não encontrado');
  });

  it('does not mask an internal API failure as not-found', () => {
    expect(
      resolveSgsoRelatoLoadError({
        success: false,
        code: 'SGSO_RELATO_GET_ERROR',
        error: 'Erro ao buscar relato',
        http_status: 500,
      }),
    ).toBe('Erro ao buscar relato');
  });

  it('preserves the HTTP status when the backend returns no useful message', () => {
    expect(resolveSgsoRelatoLoadError({ success: false, http_status: 503 })).toBe(
      'Erro ao carregar relato (HTTP 503)',
    );
  });
});
