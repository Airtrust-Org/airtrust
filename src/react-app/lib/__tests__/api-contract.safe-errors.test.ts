import { describe, expect, it } from 'vitest';
import {
  FrontendApiError,
  frontendErrorMessage,
  safeFrontendApiErrorMessage,
  safeFrontendApiResponseErrorMessage,
} from '../api-contract';

describe('api-contract visible error safety', () => {
  it('preserves useful business feedback', () => {
    expect(
      safeFrontendApiErrorMessage('Qualificação já cadastrada para este período.'),
    ).toBe('Qualificação já cadastrada para este período.');
    expect(
      safeFrontendApiResponseErrorMessage('Funcionário possui vínculos ativos.', 409),
    ).toBe('Funcionário possui vínculos ativos.');
  });

  it('replaces technical backend detail with a safe fallback', () => {
    const technicalMessages = [
      'SQLITE_ERROR: no such column: qualificacoes.secret_token',
      'D1_ERROR: database unavailable',
      'HTTP 500',
      'TypeError: Cannot read properties of undefined',
      'at Worker.fetch (/srv/src/worker.ts:418:11)',
    ];

    for (const message of technicalMessages) {
      expect(safeFrontendApiErrorMessage(message)).toBe(
        'Não foi possível concluir a operação.',
      );
    }
  });

  it('never exposes arbitrary backend text for privileged or server response failures', () => {
    expect(
      safeFrontendApiResponseErrorMessage('opaque upstream detail for tenant 7', 500),
    ).toBe('O servidor não conseguiu concluir a operação.');
    expect(
      safeFrontendApiResponseErrorMessage('token parser rejected key id abc', 401),
    ).toBe('Sua sessão expirou. Entre novamente.');
    expect(
      safeFrontendApiResponseErrorMessage('internal authorization policy branch 12', 403),
    ).toBe('Você não tem permissão para executar esta ação.');
  });

  it('does not expose a technical client FrontendApiError through frontendErrorMessage', () => {
    const error = new FrontendApiError(
      'SQLITE_ERROR: no such table: qualification_history',
      'client',
      400,
    );

    expect(frontendErrorMessage(error)).toBe('Não foi possível concluir a operação.');
  });

  it('keeps kind-specific safe messages for server and permission failures', () => {
    expect(
      frontendErrorMessage(
        new FrontendApiError('SQLITE_ERROR: database unavailable', 'server', 500),
      ),
    ).toBe('O servidor não conseguiu concluir a operação.');

    expect(
      frontendErrorMessage(
        new FrontendApiError('forbidden internal policy detail', 'permission', 403),
      ),
    ).toBe('Você não tem permissão para executar esta ação.');
  });
});