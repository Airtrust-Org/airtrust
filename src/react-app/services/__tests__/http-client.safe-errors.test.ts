import { describe, expect, it } from 'vitest';
import { safeHttpClientErrorMessage } from '../http-client';

describe('safeHttpClientErrorMessage', () => {
  it('preserves useful business feedback', () => {
    expect(
      safeHttpClientErrorMessage('Qualificação já cadastrada para este período.', 400),
    ).toBe('Qualificação já cadastrada para este período.');
  });

  it('replaces technical client errors with a generic safe message', () => {
    expect(
      safeHttpClientErrorMessage(
        'SQLITE_ERROR: no such column: qualificacoes.secret_token',
        400,
      ),
    ).toBe('Não foi possível concluir a operação.');
  });

  it('uses status-specific safe fallbacks for technical server and permission errors', () => {
    expect(
      safeHttpClientErrorMessage('D1_ERROR: database unavailable', 500),
    ).toBe('O servidor não conseguiu concluir a operação.');

    expect(
      safeHttpClientErrorMessage('SQLSTATE permission lookup failed', 403),
    ).toBe('Você não tem permissão para executar esta ação.');
  });

  it('never exposes transport details after retries are exhausted', () => {
    expect(
      safeHttpClientErrorMessage('TypeError: Failed to fetch', 'NETWORK_ERROR'),
    ).toBe('Falha de rede. Verifique sua conexão e tente novamente.');
  });
});
