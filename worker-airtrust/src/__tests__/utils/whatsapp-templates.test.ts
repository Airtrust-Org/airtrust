import { describe, expect, it } from 'vitest';

import {
  buildQualificacaoTemplateVariables,
  buildTrainingStatusVencimento,
  getAlertWhatsAppTemplateDefinition,
  renderTemplateBody,
  resolveQualificacaoAlertTemplateKey,
} from '../../utils/whatsapp-templates';

describe('whatsapp-templates', () => {
  it('resolve o template correto para CMA vencido', () => {
    expect(resolveQualificacaoAlertTemplateKey({ isCma: true, expired: true })).toBe('cma_expired');
  });

  it('renderiza aviso EAD a vencer sem emojis e com contexto de obrigatoriedade', () => {
    const template = getAlertWhatsAppTemplateDefinition('ead_expiring');
    const variables = buildQualificacaoTemplateVariables({
      funcionarioNome: 'Filipe Daumas',
      qualificacaoNome: 'CRM',
      dataVencimento: '28/09/2026',
      statusVencimento: buildTrainingStatusVencimento(7),
      trainingUrl: 'https://app.airtrust.online/treinamentos/123',
    });

    expect(template).toBeDefined();
    expect(template!.templateName).toBe('airtrust_alerta_ead_a_vencer_v2');
    const message = renderTemplateBody(template!.bodyText, variables);

    expect(message).toContain('*GERÊNCIA DE TREINAMENTOS | COSTA DO SOL*');
    expect(message).toContain('Olá, Filipe Daumas!');
    expect(message).toContain('*Treinamento:* CRM');
    expect(message).toContain('*Vencimento:* 28/09/2026');
    expect(message).toContain('*Status:* Vence em 7 dias');
    expect(message).toContain(
      'Este treinamento faz parte dos requisitos obrigatórios de treinamento e conformidade da operação, sendo acompanhado pela Gerência de Treinamentos e sujeito à verificação em auditorias.',
    );
    expect(message).toContain(
      'Por favor, acesse o treinamento pelo link abaixo e realize-o o quanto antes para manter sua situação de treinamento regularizada.',
    );
    expect(message).toContain(
      '*Acesse diretamente o treinamento:*' +
        '\n' +
        'https://app.airtrust.online/treinamentos/123',
    );
    expect(message).toContain(
      'Caso seja solicitado, faça login no *AirTrust*. Após o login, você será direcionado diretamente ao treinamento.',
    );
    expect(message).not.toContain('�');
    expect(message).not.toMatch(/[🚁📚📅🟠🔴🔗✈️]/u);
  });

  it('renderiza aviso EAD vencido sem emojis e preserva o link direto', () => {
    const template = getAlertWhatsAppTemplateDefinition('ead_expired');
    const variables = buildQualificacaoTemplateVariables({
      funcionarioNome: 'Ingrid',
      qualificacaoNome: 'SOP AW139',
      dataVencimento: '18/09/2026',
      statusVencimento: buildTrainingStatusVencimento(-3),
      trainingUrl: 'https://app.airtrust.online/treinamentos/456',
    });

    expect(template).toBeDefined();
    expect(template!.templateName).toBe('airtrust_alerta_ead_vencido_v2');
    const message = renderTemplateBody(template!.bodyText, variables);

    expect(message).toContain('*Status:* Vencido há 3 dias');
    expect(message).toContain('https://app.airtrust.online/treinamentos/456');
    expect(message).toContain('sujeito à verificação em auditorias');
    expect(message).not.toContain('�');
    expect(message).not.toMatch(/[🚁📚📅🟠🔴🔗✈️]/u);
  });

  it('mantem os templates de CMA fora da identidade da Gerência de Treinamentos', () => {
    const template = getAlertWhatsAppTemplateDefinition('cma_expiring');

    expect(template).toBeDefined();
    expect(template!.bodyText).toContain('CMA');
    expect(template!.bodyText).not.toContain('Gerência de Treinamentos | Costa do Sol');
    expect(template!.bodyText).not.toContain('🚁');
  });
});
