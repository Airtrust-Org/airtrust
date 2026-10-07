import { describe, expect, it } from 'vitest';

import {
  DEFAULT_COMPLIANCE_NOTIFICATION_POLICY,
  normalizeNotificationMessageTemplate,
  renderComplianceEmailHtml,
  complianceTemplateVariables,
} from '../../services/training-compliance-notifications';

describe('training compliance notification formatting', () => {

  it.each([
    ['NAO_REALIZADO', null, 'Situação: Pendente de realização', 'pendente'],
    ['VENCENDO', '2026-10-15', 'Situação: Sua qualificação vencerá em 15/10/2026', 'próxima do vencimento'],
    ['VENCIDO', '2026-10-01', 'Situação: Sua qualificação está vencida desde 01/10/2026', 'vencida'],
  ] as const)('renders status-specific employee copy for %s', (status, date, label, subject) => {
    const variables = complianceTemplateVariables({
      empresa_id: 1, funcionario_id: 2, funcionario_nome: 'Pessoa Teste', funcionario_cpf: null,
      email: null, telefone: null, setor_id: null, setor_nome: null, qualificacao_tipo_id: 3,
      qualificacao_nome: 'CFIT', status_compliance: status, data_validade: date, dias_para_vencer: null,
    }, 'https://airtrust.online/lms/player/842');
    expect(variables.situacao_bloco).toBe(label);
    expect(variables.assunto_situacao).toBe(subject);
    expect(variables.link_bloco).toContain('https://airtrust.online/lms/player/842');
    expect(variables.orientacao).toContain('Solicitamos');
  });

  it('formats new course and situation fields with a direct link', () => {
    const html = renderComplianceEmailHtml(
      'GERÊNCIA DE TREINAMENTO | COSTA DO SOL\n\nCurso: CFIT\nSituação: Pendente de realização\n\nAcesse o curso diretamente pelo AirTrust:\nhttps://airtrust.online/lms/player/842',
    );
    expect(html).toContain('<strong>Curso:</strong> CFIT');
    expect(html).toContain('<strong>Situação:</strong> Pendente de realização');
    expect(html).toContain('<strong>Acesse o curso diretamente pelo AirTrust:</strong>');
    expect(html).toContain('<a href="https://airtrust.online/lms/player/842"');
  });

  it('keeps the default employee email structurally separated', () => {
    expect(DEFAULT_COMPLIANCE_NOTIFICATION_POLICY.email_message_template).toContain(
      'Curso: {{treinamento}}\n{{situacao_bloco}}',
    );
    expect(DEFAULT_COMPLIANCE_NOTIFICATION_POLICY.email_message_template).toContain(
      'Esta é uma comunicação automática. Não é necessário responder a este e-mail.',
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
