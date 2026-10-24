import { describe, expect, it } from 'vitest';

import {
  buildTrainingStatusVencimento,
  buildTrainingTemplateVariables,
  buildTrainingTemplateVariablesForDelivery,
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
    const variables = buildTrainingTemplateVariables({
      funcionarioNome: 'Filipe Daumas',
      qualificacaoNome: 'CRM',
      dataVencimento: '28/09/2026',
      statusVencimento: buildTrainingStatusVencimento(7),
      trainingUrl: 'https://airtrust.online/lms/player/123',
    });

    expect(template).toBeDefined();
    const message = renderTemplateBody(template!.bodyText, variables);

    expect(message).toContain('*GERÊNCIA DE TREINAMENTO | COSTA DO SOL*');
    expect(message).toContain('Olá, Filipe Daumas!');
    expect(message).toContain('*Treinamento:* CRM');
    expect(message).toContain('*Vencimento:* 28/09/2026');
    expect(message).toContain('*Status:* Vence em 7 dias');
    expect(variables['4']).toBe('Vence em 7 dias');
    expect(variables['5']).toBe('https://airtrust.online/lms/player/123');
    expect(message).toContain(
      '*Acesse diretamente o treinamento:*' + '\n' + 'https://airtrust.online/lms/player/123',
    );
    expect(message).toContain('requisitos obrigatórios de treinamento e conformidade da operação');
    expect(message).toContain('sujeito à verificação em auditorias');
    expect(message).toContain('Após o login, você será direcionado diretamente ao treinamento.');
    expect(message).not.toMatch(/[🚁📚📅🟠🔴🔗✈️]/u);
  });

  it('renderiza aviso EAD vencido com status vermelho e concordancia de treinamento', () => {
    const template = getAlertWhatsAppTemplateDefinition('ead_expired');
    const variables = buildTrainingTemplateVariables({
      funcionarioNome: 'Ingrid',
      qualificacaoNome: 'SOP AW139',
      dataVencimento: '18/09/2026',
      statusVencimento: buildTrainingStatusVencimento(-3),
      trainingUrl: 'https://airtrust.online/lms/player/456',
    });

    expect(template).toBeDefined();
    const message = renderTemplateBody(template!.bodyText, variables);

    expect(message).toContain('*Status:* Vencido há 3 dias');
    expect(message).toContain('https://airtrust.online/lms/player/456');
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
    const variables = buildTrainingTemplateVariables({
      funcionarioNome: 'Viviane',
      qualificacaoNome: 'CRM',
      dataVencimento: 'Não realizado',
      statusVencimento: 'Treinamento obrigatório ainda não realizado',
      trainingUrl: 'https://airtrust.online/lms/player/999',
    });
    const message = renderTemplateBody(template!.bodyText, variables);
    expect(message).toContain('Você possui um treinamento obrigatório que requer sua atenção');
    expect(message).toContain('*Treinamento:* CRM');
    expect(message).toContain('*Vencimento:* Não realizado');
    expect(message).toContain('*Status:* Treinamento obrigatório ainda não realizado');
    expect(message).toContain('*Acesse diretamente o treinamento:*\nhttps://airtrust.online/lms/player/999');
    expect(message).toContain('sujeito à verificação em auditorias');
    expect(variables['4']).not.toContain('\n');
    expect(variables['5']).toBe('https://airtrust.online/lms/player/999');
  });

  it('usa template neutro para lembrete de matrícula LMS sem transformar matrícula em obrigação', () => {
    const template = getAlertWhatsAppTemplateDefinition('ead_enrollment_reminder');
    expect(template).toBeDefined();
    const variables = buildTrainingTemplateVariables({
      funcionarioNome: 'Viviane',
      qualificacaoNome: 'Integração Corporativa',
      dataVencimento: '15/10/2026',
      statusVencimento: 'Treinamento em andamento',
      trainingUrl: 'https://airtrust.online/lms/player/321',
    });
    const message = renderTemplateBody(template!.bodyText, variables);

    expect(message).toContain('treinamento matriculado no AirTrust');
    expect(message).toContain('*Treinamento:* Integração Corporativa');
    expect(message).toContain('*Prazo:* 15/10/2026');
    expect(message).toContain('*Status:* Treinamento em andamento');
    expect(message).toContain('https://airtrust.online/lms/player/321');
    expect(message).not.toContain('treinamento obrigatório');
    expect(message).not.toContain('auditoria');
  });

  it('mantem compatibilidade com template EAD antigo enquanto a nova versao nao foi sincronizada', () => {
    const oldBody =
      '*GERÊNCIA DE TREINAMENTO | COSTA DO SOL*\n\nOlá, {{1}}!\n\n*Treinamento:* {{2}}\n*Vencimento:* {{3}}\n*Status:* {{4}}';
    const variables = buildTrainingTemplateVariablesForDelivery({
      templateKey: 'ead_expiring',
      templateBodyText: oldBody,
      funcionarioNome: 'Filipe Daumas',
      qualificacaoNome: 'CRM',
      dataVencimento: '28/09/2026',
      statusVencimento: 'Vence em 7 dias',
      trainingUrl: 'https://airtrust.online/lms/player/123',
    });

    expect(variables).toEqual({
      '1': 'Filipe Daumas',
      '2': 'CRM',
      '3': '28/09/2026',
      '4':
        'Vence em 7 dias\n\n*Acesse diretamente o treinamento:*\nhttps://airtrust.online/lms/player/123',
    });
    expect(renderTemplateBody(oldBody, variables)).toContain('*Status:* Vence em 7 dias');
  });

  it('mantem compatibilidade com o template antigo de obrigatorio nunca realizado', () => {
    const oldBody =
      '*GERÊNCIA DE TREINAMENTO | COSTA DO SOL*\n\nOlá, {{1}}!\n\n*Treinamento:* {{2}}\n*Status:* {{3}}';
    const variables = buildTrainingTemplateVariablesForDelivery({
      templateKey: 'ead_required',
      templateBodyText: oldBody,
      funcionarioNome: 'Viviane',
      qualificacaoNome: 'CRM',
      dataVencimento: 'Não realizado',
      statusVencimento: 'Treinamento obrigatório ainda não realizado',
      trainingUrl: 'https://airtrust.online/lms/player/999',
    });

    expect(variables['3']).toContain('Treinamento obrigatório ainda não realizado');
    expect(variables['3']).toContain('https://airtrust.online/lms/player/999');
    expect(variables['4']).toBeUndefined();
    expect(variables['5']).toBeUndefined();
  });


});
