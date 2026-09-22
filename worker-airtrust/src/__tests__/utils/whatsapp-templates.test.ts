import { describe, expect, it } from 'vitest';

import {
  buildQualificacaoTemplateVariables,
  buildTrainingTemplateStatusVariable,
  getAlertWhatsAppTemplateDefinition,
  renderTemplateBody,
  resolveQualificacaoAlertTemplateKey,
} from '../../utils/whatsapp-templates';

describe('whatsapp-templates', () => {
  it('resolve o template correto para CMA vencido', () => {
    expect(resolveQualificacaoAlertTemplateKey({ isCma: true, expired: true })).toBe('cma_expired');
  });

  it('renderiza aviso EAD a vencer como Gerência de Treinamento da Costa do Sol sem emojis', () => {
    const template = getAlertWhatsAppTemplateDefinition('ead_expiring');
    const variables = buildQualificacaoTemplateVariables({
      funcionarioNome: 'Filipe Daumas',
      qualificacaoNome: 'CRM',
      dataVencimento: '28/09/2026',
      statusVencimento: buildTrainingTemplateStatusVariable(
        7,
        'https://app.airtrust.online/treinamentos/123',
      ),
    });

    expect(template).toBeDefined();
    const message = renderTemplateBody(template!.bodyText, variables);

    expect(message).toContain('*GERÊNCIA DE TREINAMENTO | COSTA DO SOL*');
    expect(message).toContain('Olá, Filipe Daumas!');
    expect(message).toContain('*Treinamento:* CRM');
    expect(message).toContain('*Vencimento:* 28/09/2026');
    expect(message).toContain('*Status:* Vence em 7 dias');
    expect(message).toContain(
      '*Acesse diretamente o treinamento:*' + '\n' + 'https://app.airtrust.online/treinamentos/123',
    );
    expect(message).toContain('requisitos obrigatórios de treinamento e conformidade da operação');
    expect(message).toContain('sujeito à verificação em auditorias');
    expect(message).toContain('Após o login, você será direcionado diretamente ao treinamento.');
    expect(message).not.toMatch(/[🚁📚📅🟠🔴🔗✈️]/u);
  });

  it('renderiza aviso EAD vencido com status vermelho e concordancia de treinamento', () => {
    const template = getAlertWhatsAppTemplateDefinition('ead_expired');
    const variables = buildQualificacaoTemplateVariables({
      funcionarioNome: 'Ingrid',
      qualificacaoNome: 'SOP AW139',
      dataVencimento: '18/09/2026',
      statusVencimento: buildTrainingTemplateStatusVariable(
        -3,
        'https://app.airtrust.online/treinamentos/456',
      ),
    });

    expect(template).toBeDefined();
    const message = renderTemplateBody(template!.bodyText, variables);

    expect(message).toContain('*Status:* Vencido há 3 dias');
    expect(message).toContain('https://app.airtrust.online/treinamentos/456');
  });

  it('mantem os templates de CMA fora da identidade da Gerência de Treinamento', () => {
    const template = getAlertWhatsAppTemplateDefinition('cma_expiring');

    expect(template).toBeDefined();
    expect(template!.bodyText).toContain('CMA');
    expect(template!.bodyText).not.toContain('GERÊNCIA DE TREINAMENTO | COSTA DO SOL');
    expect(template!.bodyText).not.toContain('Gerência de Treinamento');
  });

  it('usa template próprio para treinamento obrigatório nunca realizado', () => {
    const template = getAlertWhatsAppTemplateDefinition('ead_required');
    expect(template).toBeDefined();
    const message = renderTemplateBody(template!.bodyText, {
      '1': 'Viviane',
      '2': 'CRM',
      '3': 'Obrigatório ainda não realizado\n\n*Acesse diretamente o treinamento:*\nhttps://app.airtrust.online/treinamentos/999',
    });
    expect(message).toContain('ainda não consta como realizado');
    expect(message).toContain('*Treinamento:* CRM');
    expect(message).toContain('sujeito à verificação em auditorias');
    expect(message).toContain('https://app.airtrust.online/treinamentos/999');
  });

});
