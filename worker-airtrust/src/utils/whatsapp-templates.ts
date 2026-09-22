export type AlertWhatsAppTemplateKey =
  | 'ead_expiring'
  | 'ead_expired'
  | 'ead_required'
  | 'cma_expiring'
  | 'cma_expired'
  | 'licenca_expiring'
  | 'licenca_expired';

export interface AlertWhatsAppTemplateDefinition {
  key: AlertWhatsAppTemplateKey;
  friendlyName: string;
  templateName: string;
  category: 'UTILITY';
  language: 'pt_BR';
  bodyText: string;
  variables: Array<{
    id: string;
    name: string;
    sample: string;
  }>;
}

const ALERT_WHATSAPP_TEMPLATE_DEFINITIONS: AlertWhatsAppTemplateDefinition[] = [
  {
    key: 'ead_expiring',
    friendlyName: 'AirTrust alerta EAD a vencer',
    templateName: 'airtrust_alerta_ead_a_vencer',
    category: 'UTILITY',
    language: 'pt_BR',
    bodyText:
      '*GERÊNCIA DE TREINAMENTO | COSTA DO SOL*\n\nOlá, {{1}}!\n\nVocê possui um treinamento que requer sua atenção:\n\n*Treinamento:* {{2}}\n*Vencimento:* {{3}}\n*Status:* {{4}}\n\nEste treinamento faz parte dos requisitos obrigatórios de treinamento e conformidade da operação, sendo acompanhado pela *Gerência de Treinamento* e sujeito à verificação em auditorias.\n\nPor favor, acesse o treinamento e realize-o o quanto antes para manter sua situação de treinamento regularizada.\n\nCaso seja solicitado, faça login no *AirTrust*. Após o login, você será direcionado diretamente ao treinamento.\n\n*Esta é uma mensagem automática da Gerência de Treinamento da Costa do Sol.*',
    variables: [
      { id: '1', name: 'funcionario_nome', sample: 'Filipe Daumas' },
      { id: '2', name: 'qualificacao_nome', sample: 'Treinamento EAD' },
      { id: '3', name: 'data_vencimento', sample: '15/04/2026' },
      {
        id: '4',
        name: 'status_vencimento',
        sample:
          'Vence em 7 dias\n\n*Acesse diretamente o treinamento:*\nhttps://app.airtrust.online/treinamentos/123',
      },
    ],
  },
  {
    key: 'ead_required',
    friendlyName: 'AirTrust treinamento EAD obrigatório pendente',
    templateName: 'airtrust_treinamento_ead_obrigatorio_pendente',
    category: 'UTILITY',
    language: 'pt_BR',
    bodyText:
      '*GERÊNCIA DE TREINAMENTO | COSTA DO SOL*\n\nOlá, {{1}}!\n\nExiste um treinamento obrigatório vinculado ao seu cargo/setor que ainda não consta como realizado:\n\n*Treinamento:* {{2}}\n*Status:* {{3}}\n\nEste treinamento faz parte dos requisitos obrigatórios de treinamento e conformidade da operação, sendo acompanhado pela *Gerência de Treinamento* e sujeito à verificação em auditorias.\n\nPor favor, acesse o treinamento e realize-o o quanto antes para regularizar sua situação.\n\n*Esta é uma mensagem automática da Gerência de Treinamento da Costa do Sol.*',
    variables: [
      { id: '1', name: 'funcionario_nome', sample: 'Filipe Daumas' },
      { id: '2', name: 'qualificacao_nome', sample: 'Treinamento EAD' },
      {
        id: '3',
        name: 'status_acesso',
        sample:
          'Obrigatório ainda não realizado\n\n*Acesse diretamente o treinamento:*\nhttps://app.airtrust.online/treinamentos/123',
      },
    ],
  },
  {
    key: 'ead_expired',
    friendlyName: 'AirTrust alerta EAD vencido',
    templateName: 'airtrust_alerta_ead_vencido',
    category: 'UTILITY',
    language: 'pt_BR',
    bodyText:
      '*GERÊNCIA DE TREINAMENTO | COSTA DO SOL*\n\nOlá, {{1}}!\n\nVocê possui um treinamento que requer sua atenção:\n\n*Treinamento:* {{2}}\n*Vencimento:* {{3}}\n*Status:* {{4}}\n\nEste treinamento faz parte dos requisitos obrigatórios de treinamento e conformidade da operação, sendo acompanhado pela *Gerência de Treinamento* e sujeito à verificação em auditorias.\n\nPor favor, acesse o treinamento e realize-o o quanto antes para manter sua situação de treinamento regularizada.\n\nCaso seja solicitado, faça login no *AirTrust*. Após o login, você será direcionado diretamente ao treinamento.\n\n*Esta é uma mensagem automática da Gerência de Treinamento da Costa do Sol.*',
    variables: [
      { id: '1', name: 'funcionario_nome', sample: 'Filipe Daumas' },
      { id: '2', name: 'qualificacao_nome', sample: 'Treinamento EAD' },
      { id: '3', name: 'data_vencimento', sample: '15/04/2026' },
      {
        id: '4',
        name: 'status_vencimento',
        sample:
          'Vencido há 3 dias\n\n*Acesse diretamente o treinamento:*\nhttps://app.airtrust.online/treinamentos/123',
      },
    ],
  },
  {
    key: 'cma_expiring',
    friendlyName: 'AirTrust alerta CMA a vencer',
    templateName: 'airtrust_alerta_cma_a_vencer',
    category: 'UTILITY',
    language: 'pt_BR',
    bodyText:
      'Ola {{1}}, o AirTrust informa que o CMA "{{2}}" vence em {{3}}. Status atual: {{4}}. Regularize o quanto antes.',
    variables: [
      { id: '1', name: 'funcionario_nome', sample: 'Filipe Daumas' },
      { id: '2', name: 'qualificacao_nome', sample: 'Certificado Medico Aeronautico' },
      { id: '3', name: 'data_vencimento', sample: '15/04/2026' },
      { id: '4', name: 'status_vencimento', sample: 'Vence em 7 dias' },
    ],
  },
  {
    key: 'cma_expired',
    friendlyName: 'AirTrust alerta CMA vencido',
    templateName: 'airtrust_alerta_cma_vencido',
    category: 'UTILITY',
    language: 'pt_BR',
    bodyText:
      'Ola {{1}}, o AirTrust informa que o CMA "{{2}}" venceu em {{3}}. Status atual: {{4}}. Regularize o quanto antes.',
    variables: [
      { id: '1', name: 'funcionario_nome', sample: 'Filipe Daumas' },
      { id: '2', name: 'qualificacao_nome', sample: 'Certificado Medico Aeronautico' },
      { id: '3', name: 'data_vencimento', sample: '15/04/2026' },
      { id: '4', name: 'status_vencimento', sample: 'Vencida ha 3 dias' },
    ],
  },
  {
    key: 'licenca_expiring',
    friendlyName: 'AirTrust alerta licenca a vencer',
    templateName: 'airtrust_alerta_licenca_a_vencer',
    category: 'UTILITY',
    language: 'pt_BR',
    bodyText:
      'Ola {{1}}, o AirTrust informa que a licenca "{{2}}" vence em {{3}}. Status atual: {{4}}. Regularize o quanto antes.',
    variables: [
      { id: '1', name: 'funcionario_nome', sample: 'Filipe Daumas' },
      { id: '2', name: 'licenca_nome', sample: 'Licenca PLA 123456' },
      { id: '3', name: 'data_vencimento', sample: '15/04/2026' },
      { id: '4', name: 'status_vencimento', sample: 'Vence em 7 dias' },
    ],
  },
  {
    key: 'licenca_expired',
    friendlyName: 'AirTrust alerta licenca vencida',
    templateName: 'airtrust_alerta_licenca_vencida',
    category: 'UTILITY',
    language: 'pt_BR',
    bodyText:
      'Ola {{1}}, o AirTrust informa que a licenca "{{2}}" venceu em {{3}}. Status atual: {{4}}. Regularize o quanto antes.',
    variables: [
      { id: '1', name: 'funcionario_nome', sample: 'Filipe Daumas' },
      { id: '2', name: 'licenca_nome', sample: 'Licenca PLA 123456' },
      { id: '3', name: 'data_vencimento', sample: '15/04/2026' },
      { id: '4', name: 'status_vencimento', sample: 'Vencida ha 3 dias' },
    ],
  },
];

export function getAlertWhatsAppTemplateCatalog(): AlertWhatsAppTemplateDefinition[] {
  return ALERT_WHATSAPP_TEMPLATE_DEFINITIONS;
}

export function getAlertWhatsAppTemplateDefinition(
  key: AlertWhatsAppTemplateKey,
): AlertWhatsAppTemplateDefinition | undefined {
  return ALERT_WHATSAPP_TEMPLATE_DEFINITIONS.find((template) => template.key === key);
}

export function resolveQualificacaoAlertTemplateKey(params: {
  isCma: boolean;
  expired: boolean;
}): AlertWhatsAppTemplateKey {
  if (params.isCma) {
    return params.expired ? 'cma_expired' : 'cma_expiring';
  }

  return params.expired ? 'ead_expired' : 'ead_expiring';
}

export function resolveLicencaAlertTemplateKey(expired: boolean): AlertWhatsAppTemplateKey {
  return expired ? 'licenca_expired' : 'licenca_expiring';
}

export function buildQualificacaoTemplateVariables(params: {
  funcionarioNome: string;
  qualificacaoNome: string;
  dataVencimento: string;
  statusVencimento: string;
}): Record<string, string> {
  return {
    '1': params.funcionarioNome,
    '2': params.qualificacaoNome,
    '3': params.dataVencimento,
    '4': params.statusVencimento,
  };
}

export function buildLicencaTemplateVariables(params: {
  funcionarioNome: string;
  licencaNome: string;
  dataVencimento: string;
  statusVencimento: string;
}): Record<string, string> {
  return {
    '1': params.funcionarioNome,
    '2': params.licencaNome,
    '3': params.dataVencimento,
    '4': params.statusVencimento,
  };
}

export function buildTrainingStatusVencimento(diasAteVencimento: number): string {
  if (diasAteVencimento < 0) {
    const diasVencido = Math.abs(diasAteVencimento);
    return `Vencido há ${diasVencido} ${diasVencido === 1 ? 'dia' : 'dias'}`;
  }

  if (diasAteVencimento === 0) {
    return 'Vence hoje';
  }

  if (diasAteVencimento === 1) {
    return 'Vence em 1 dia';
  }

  return `Vence em ${diasAteVencimento} dias`;
}

export function buildTrainingTemplateStatusVariable(
  diasAteVencimento: number,
  trainingUrl?: string | null,
): string {
  const status = buildTrainingStatusVencimento(diasAteVencimento);

  return trainingUrl
    ? `${status}\n\n*Acesse diretamente o treinamento:*\n${trainingUrl}`
    : status;
}

export function renderTemplateBody(bodyText: string, variables: Record<string, string>): string {
  return bodyText.replace(/\{\{(\d+)\}\}/g, (_, key: string) => variables[key] || '');
}
