import { describe, expect, it } from 'vitest';
import { safeQualificacoesServiceError } from '../qualificacoesService';

describe('safeQualificacoesServiceError', () => {
  it('preserves useful business feedback', () => {
    expect(
      safeQualificacoesServiceError(
        'Qualificação já cadastrada para este período.',
        'Não foi possível salvar a qualificação. Tente novamente.',
      ),
    ).toBe('Qualificação já cadastrada para este período.');
  });

  it('replaces technical backend detail with the requested fallback', () => {
    const fallback = 'Não foi possível salvar a qualificação. Tente novamente.';
    const technicalMessages = [
      'SQLITE_ERROR: no such column: qualificacoes.secret_token',
      'D1_ERROR: database unavailable',
      'HTTP 500',
      'TypeError: Cannot read properties of undefined',
      'at Worker.fetch (/srv/src/worker.ts:418:11)',
    ];

    for (const message of technicalMessages) {
      expect(safeQualificacoesServiceError(message, fallback)).toBe(fallback);
    }
  });
});
