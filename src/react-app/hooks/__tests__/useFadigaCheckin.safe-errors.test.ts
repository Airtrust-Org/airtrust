import { describe, expect, it } from 'vitest';
import { safeFadigaVisibleErrorMessage, TEAM_PANEL_TIMEOUT_MESSAGE } from '../useFadigaCheckin';

describe('flight fatigue visible errors', () => {
  it('never exposes technical backend details to the visible error message', () => {
    const technical = 'SQLITE_ERROR: no such column\n at worker.ts:418';

    const messages = [
      safeFadigaVisibleErrorMessage('team-checkins-load', technical),
      safeFadigaVisibleErrorMessage('daily-checkin-submit', technical),
    ];

    for (const message of messages) {
      expect(message).not.toContain('SQLITE');
      expect(message).not.toContain('worker.ts');
      expect(message).not.toContain('no such column');
      expect(message).toMatch(/^Não foi possível/);
    }
  });

  it('informa que a gravação ocorreu quando somente o pós-processamento falhou', () => {
    const message = safeFadigaVisibleErrorMessage(
      'daily-checkin-submit',
      new Error('FRMS_CHECKIN_COMMITTED_POST_PROCESSING_FAILED'),
    );
    expect(message).toMatch(/check-in foi gravado/i);
    expect(message).toMatch(/não envie novamente/i);
    expect(message).toMatch(/coordenação/i);
    expect(message).not.toContain('POST_PROCESSING_FAILED');
  });

  it('mantém um timeout operacional compreensível sem detalhe técnico', () => {
    expect(TEAM_PANEL_TIMEOUT_MESSAGE).toMatch(/demorou além do esperado/i);
    expect(TEAM_PANEL_TIMEOUT_MESSAGE).not.toMatch(/SQLITE|worker\.ts|stack/i);
  });
});
