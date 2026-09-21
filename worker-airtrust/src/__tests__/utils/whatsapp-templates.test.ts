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

  it('renderiza aviso EAD a vencer como Setor de Treinamentos da Costa do Sol', () => {
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

    expect(message).toContain('🚁 *Setor de Treinamentos | Costa do Sol*');
    expect(message).toContain('Olá, Filipe Daumas!');
    expect(message).toContain('📚 *Treinamento:* CRM');
    expect(message).toContain('📅 *Vencimento:* 28/09/2026');
    expect(message).toContain('🟠 *Status:* Vence em 7 dias');
    expect(message).toContain(
      '🔗 *Acesse diretamente o treinamento:*' + '\n' + 'https://app.airtrust.online/treinamentos/123',
    );
    expect(message).toContain('Após o login, você será direcionado diretamente ao treinamento.');
    expect(message).not.toContain('✈️');
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

    expect(message).toContain('🔴 *Status:* Vencido há 3 dias');
    expect(message).toContain('https://app.airtrust.online/treinamentos/456');
  });

  it('mantem os templates de CMA fora da identidade do Setor de Treinamentos', () => {
    const template = getAlertWhatsAppTemplateDefinition('cma_expiring');

    expect(template).toBeDefined();
    expect(template!.bodyText).toContain('CMA');
    expect(template!.bodyText).not.toContain('Setor de Treinamentos | Costa do Sol');
    expect(template!.bodyText).not.toContain('🚁');
  });
});
