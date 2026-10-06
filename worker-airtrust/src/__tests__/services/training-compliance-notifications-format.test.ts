import { describe, expect, it } from 'vitest';

import {
  DEFAULT_COMPLIANCE_NOTIFICATION_POLICY,
  normalizeNotificationMessageTemplate,
  renderComplianceEmailHtml,
} from '../../services/training-compliance-notifications';

describe('training compliance notification formatting', () => {
  it('keeps the default employee email structurally separated', () => {
    expect(DEFAULT_COMPLIANCE_NOTIFICATION_POLICY.email_message_template).toContain(
      'requer sua atenção:\n\nTreinamento:',
    );
    expect(DEFAULT_COMPLIANCE_NOTIFICATION_POLICY.email_message_template).toContain(
      'Esta é uma mensagem automática da Gerência de Treinamento da Costa do Sol.',
    );
  });

  it('restores the canonical layout when a stored default template was flattened', () => {
    const flattened = DEFAULT_COMPLIANCE_NOTIFICATION_POLICY.email_message_template
      .replace(/\s+/g, ' ')
      .trim();

    expect(
      normalizeNotificationMessageTemplate(
        flattened,
        DEFAULT_COMPLIANCE_NOTIFICATION_POLICY.email_message_template,
      ),
    ).toBe(DEFAULT_COMPLIANCE_NOTIFICATION_POLICY.email_message_template);
  });

  it('renders explicit email blocks instead of relying on white-space CSS', () => {
    const html = renderComplianceEmailHtml(
      [
        'GERÊNCIA DE TREINAMENTO | COSTA DO SOL',
        '',
        'Olá, Filipe Passaroni Daumas!',
        '',
        'Você possui um treinamento obrigatório que requer sua atenção:',
        '',
        'Treinamento: Doutrinamento Básico',
        'Vencimento: Não realizado',
        'Status: Treinamento obrigatório ainda não realizado',
        '',
        'Acesse diretamente o treinamento: https://airtrust.online/lms/player/890',
        '',
        'Esta é uma mensagem automática da Gerência de Treinamento da Costa do Sol.',
      ].join('\n'),
    );

    expect(html).toContain('<strong>Treinamento:</strong> Doutrinamento Básico');
    expect(html).toContain('<strong>Vencimento:</strong> Não realizado');
    expect(html).toContain(
      '<strong>Status:</strong> Treinamento obrigatório ainda não realizado',
    );
    expect(html).toContain(
      '<strong>Acesse diretamente o treinamento:</strong><br><a href="https://airtrust.online/lms/player/890"',
    );
    expect(html).toContain('height:12px');
    expect(html).not.toContain('white-space:pre-wrap');
  });

  it('escapes arbitrary template content while keeping http links clickable', () => {
    const html = renderComplianceEmailHtml(
      'GERÊNCIA DE TREINAMENTO | COSTA DO SOL\n\nTreinamento: NR-6 <EPI>\nhttps://airtrust.online/login',
    );

    expect(html).toContain('NR-6 &lt;EPI&gt;');
    expect(html).toContain('<a href="https://airtrust.online/login"');
    expect(html).not.toContain('NR-6 <EPI>');
  });
});
