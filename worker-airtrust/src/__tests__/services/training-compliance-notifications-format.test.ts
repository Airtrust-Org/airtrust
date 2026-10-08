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
    ['VENCENDO', '2026-10-15', 'Situação: Vence em 15/10/2026', 'a vencer'],
    ['VENCIDO', '2026-10-01', 'Situação: Vencido desde 01/10/2026', 'vencido'],
  ] as const)('renders status-specific employee copy for %s', (status, date, label, subject) => {
    const variables = complianceTemplateVariables({
      empresa_id: 1, funcionario_id: 2, funcionario_nome: 'Pessoa Teste', funcionario_cpf: null,
      email: null, telefone: null, setor_id: null, setor_nome: null, qualificacao_tipo_id: 3,
      qualificacao_nome: 'CFIT', status_compliance: status, data_validade: date, dias_para_vencer: null,
    }, 'https://airtrust.online/lms/player/842');
    expect(variables.situacao_bloco).toBe(label);
    expect(variables.assunto_situacao).toBe(subject);
    expect(variables.link_bloco).toContain('https://airtrust.online/lms/player/842');
    expect(variables.orientacao).toMatch(/Pedimos|Renove|Regularize/);
  });


  it('shows one short, personalized message with only the closing signature', () => {
    const template = DEFAULT_COMPLIANCE_NOTIFICATION_POLICY.email_message_template;
    expect(template.startsWith('Olá, {{funcionario}}!')).toBe(true);
    expect(template).not.toContain('GERÊNCIA DE TREINAMENTO | COSTA DO SOL');
    expect(template).not.toContain('Agradecemos sua colaboração');
    expect(template).not.toContain('mensagem automática');
    expect(template).toContain('Gerência de Treinamento\\nCosta do Sol');
    expect(DEFAULT_COMPLIANCE_NOTIFICATION_POLICY.email_subject_template).toBe(
      'Treinamento obrigatório {{assunto_situacao}} — {{treinamento}}',
    );
  });

  it('retains custom tenant copy and the previous long default as a normalizable legacy template', () => {
    const custom = 'Olá, {{funcionario}}! Mensagem específica da empresa.';
    expect(normalizeNotificationMessageTemplate(custom, DEFAULT_COMPLIANCE_NOTIFICATION_POLICY.email_message_template))
      .toBe(custom);
    const formerLongDefault = [
      'GERÊNCIA DE TREINAMENTO | COSTA DO SOL', '',
      'Olá, {{funcionario}}!', '', '{{introducao}}', '',
      'Curso: {{treinamento}}', '{{situacao_bloco}}', '',
      'Esta capacitação é um requisito para o exercício de suas atividades e integra o programa de qualificação e segurança operacional da Costa do Sol, sendo também objeto de verificação em auditorias internas e externas.',
      '', '{{orientacao}}', '', '{{link_bloco}}', '',
      'Agradecemos sua colaboração e seu compromisso com a segurança operacional.', '',
      'Gerência de Treinamento', 'Costa do Sol', '',
      'Esta é uma comunicação automática. Não é necessário responder a este e-mail.',
    ].join('\\n');
    // These are the legacy defaults resolved by policy normalization.
    expect(formerLongDefault).toContain('GERÊNCIA DE TREINAMENTO | COSTA DO SOL');
    expect(DEFAULT_COMPLIANCE_NOTIFICATION_POLICY.email_message_template).not.toBe(formerLongDefault);
  });

  it('keeps recipient name and course values dynamic and highlights the required action', () => {
    const variables = complianceTemplateVariables({
      empresa_id: 1, funcionario_id: 11, funcionario_nome: 'Pessoa Exemplo', funcionario_cpf: null,
      email: 'exemplo@invalid.test', telefone: null, setor_id: null, setor_nome: null,
      qualificacao_tipo_id: 12, qualificacao_nome: 'CFIT', status_compliance: 'NAO_REALIZADO',
      data_validade: null, dias_para_vencer: null,
    }, 'https://airtrust.online/lms/player/842');
    expect(variables.funcionario).toBe('Pessoa Exemplo');
    expect(variables.treinamento).toBe('CFIT');
    expect(variables.introducao).toBe('Você tem um treinamento obrigatório pendente:');
    expect(variables.orientacao).toBe('Pedimos que realize o treinamento o quanto antes para manter suas qualificações em dia.');
    const html = renderComplianceEmailHtml(
      'Olá, Pessoa Exemplo!\\n\\nCurso: CFIT\\nSituação: Pendente de realização\\n\\nImportante: Treinamento obrigatório.',
    );
    expect(html).toContain('<strong>Importante:</strong> Treinamento obrigatório.');
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
      'Importante: Este treinamento é obrigatório para sua função e seu cumprimento é verificado em auditorias.',
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
