import { beforeEach, describe, expect, it, vi } from 'vitest';

const toastErrorMock = vi.fn();

vi.mock('sonner', () => ({
  toast: {
    success: vi.fn(),
    error: toastErrorMock,
    warning: vi.fn(),
    info: vi.fn(),
    loading: vi.fn(),
    promise: vi.fn(),
    dismiss: vi.fn(),
  },
}));

import { safeVisibleToastText, showToast } from '../toast';

describe('safeVisibleToastText', () => {
  beforeEach(() => {
    toastErrorMock.mockReset();
  });

  it('preserves operational business messages', () => {
    expect(safeVisibleToastText('Participante sem e-mail válido.')).toBe(
      'Participante sem e-mail válido.',
    );
    expect(safeVisibleToastText('Treinamento já concluído.')).toBe('Treinamento já concluído.');
  });

  it('replaces unmistakably technical details', () => {
    const fallback = 'Não foi possível concluir a operação.';
    const technicalMessages = [
      'SQLITE_ERROR: no such table: treinamentos',
      'D1_ERROR: database unavailable',
      'HTTP 500',
      'Internal Server Error',
      'TypeError: Cannot read properties of undefined',
      'at Worker.fetch (/srv/src/worker.ts:418:11)',
    ];

    for (const message of technicalMessages) {
      expect(safeVisibleToastText(message, fallback)).toBe(fallback);
    }
  });

  it('can suppress a technical description without inventing more detail', () => {
    expect(safeVisibleToastText('SQLSTATE 42S02 at src/db.ts:12')).toBeUndefined();
    expect(safeVisibleToastText(undefined)).toBeUndefined();
  });
});

describe('showToast.error', () => {
  beforeEach(() => {
    toastErrorMock.mockReset();
  });

  it('hides technical message and description before rendering', () => {
    showToast.error('SQLITE_ERROR: no such column', {
      description: 'at Worker.fetch (/srv/src/worker.ts:418:11)',
    });

    expect(toastErrorMock).toHaveBeenCalledWith('Não foi possível concluir a operação.', {
      description: undefined,
      duration: 5000,
    });
  });

  it('keeps normal operational feedback unchanged', () => {
    showToast.error('Falha ao enviar convocação.', 'Revise os destinatários e tente novamente.');

    expect(toastErrorMock).toHaveBeenCalledWith('Falha ao enviar convocação.', {
      description: 'Revise os destinatários e tente novamente.',
      duration: 5000,
    });
  });
});
