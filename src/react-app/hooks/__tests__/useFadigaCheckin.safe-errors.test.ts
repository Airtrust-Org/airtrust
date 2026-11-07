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

  it('explica rejeição de PVT após a apresentação sem sugerir reenvio ou alterar horário', () => {
    const message = safeFadigaVisibleErrorMessage(
      'daily-checkin-submit',
      new Error('post_presentation_readiness_not_allowed'),
    );
    expect(message).toMatch(/hora de apresentação.*já passou/i);
    expect(message).toMatch(/check-in não foi registrado/i);
    expect(message).toMatch(/coordenação/i);
    expect(message).not.toMatch(/tente novamente|post_presentation_readiness_not_allowed/i);
  });

  it('diferencia PVT retrospectivo e protocolo incompatível sem expor códigos internos', () => {
    const past = safeFadigaVisibleErrorMessage('daily-checkin-submit',
      new Error('retrospective_readiness_not_allowed'));
    const outdated = safeFadigaVisibleErrorMessage('daily-checkin-submit',
      new Error('invalid_readiness_protocol'));
    expect(past).toMatch(/dia anterior/i);
    expect(outdated).toMatch(/atualize o AirTrust/i);
    expect([past, outdated].join(' ')).not.toMatch(/readiness_not_allowed|invalid_readiness_protocol/);
  });

  it('não orienta a alterar hora de apresentação quando o servidor discorda do relógio', () => {
    const message = safeFadigaVisibleErrorMessage(
      'daily-checkin-submit',
      new Error('late_submission_not_confirmed_by_server'),
    );
    expect(message).toMatch(/relógio operacional do servidor/i);
    expect(message).toMatch(/check-in não foi registrado/i);
    expect(message).toMatch(/não altere o horário de apresentação/i);
    expect(message).not.toContain('late_submission_not_confirmed_by_server');
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

  it('mostra somente o código curto de referência de uma falha sem expor conteúdo de erro', () => {
    const error = Object.assign(new Error('D1_ERROR: clinical detail'), {
      incidentId: '12345678-1234-1234-1234-123456789abc',
    });
    const message = safeFadigaVisibleErrorMessage('daily-checkin-submit', error);
    expect(message).toMatch(/consulte seu Histórico antes de reenviar/i);
    expect(message).toContain('Referência: 12345678');
    expect(message).not.toContain('D1_ERROR');
    expect(message).not.toContain('clinical detail');
  });

  it('mantém um timeout operacional compreensível sem detalhe técnico', () => {
    expect(TEAM_PANEL_TIMEOUT_MESSAGE).toMatch(/demorou além do esperado/i);
    expect(TEAM_PANEL_TIMEOUT_MESSAGE).not.toMatch(/SQLITE|worker\.ts|stack/i);
  });
});
