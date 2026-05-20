import { describe, expect, it } from 'vitest';

import {
  buildQualificacaoTemplateVariables,
  getAlertWhatsAppTemplateDefinition,
  renderTemplateBody,
  resolveQualificacaoAlertTemplateKey,
} from '../../utils/whatsapp-templates';

describe('whatsapp-templates', () => {
  it('resolve o template correto para CMA vencido', () => {
    expect(resolveQualificacaoAlertTemplateKey({ isCma: true, expired: true })).toBe('cma_expired');
  });

  it('renderiza o corpo do template com variaveis numericas', () => {
    const template = getAlertWhatsAppTemplateDefinition('ead_expiring');
    const variables = buildQualificacaoTemplateVariables({
      funcionarioNome: 'Filipe Daumas',
      qualificacaoNome: 'Treinamento EAD',
      dataVencimento: '15/04/2026',
      statusVencimento: 'Vence em 7 dias',
    });

    expect(template).toBeDefined();
    expect(renderTemplateBody(template!.bodyText, variables)).toContain('Treinamento EAD');
    expect(renderTemplateBody(template!.bodyText, variables)).toContain('Vence em 7 dias');
  });
});
