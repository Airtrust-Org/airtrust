/**
 * Configuração de Módulos para Backup/Restore
 * Define estrutura, dependências e ordem de processamento
 */

export const BACKUP_MODULES = {
  PESSOAS: {
    nome: 'Pessoas e Funcionários',
    prioridade: 1,
    tabelas_principais: ['funcionarios', 'usuarios'],
    tabelas_relacionadas: [
      'credenciais',
      'pessoas_papeis',
      'user_profiles',
      'user_permissions',
      'funcionarios_aeronaves',
    ],
    estimativa_registros: 5000,
    dependencias: [],
    descricao: 'Dados de pessoas, funcionários e usuários do sistema',
  },

  QUALIFICACOES: {
    nome: 'Qualificações e Licenças',
    prioridade: 2,
    tabelas_principais: ['qualificacoes_tipos', 'qualificacoes_historico', 'licencas'],
    tabelas_relacionadas: [
      'qualificacoes_categorias',
      'alertas_reforco',
      'certificados',
      'certificado_anexos',
    ],
    estimativa_registros: 15000,
    dependencias: ['PESSOAS'],
    descricao: 'Certificações, qualificações e licenças aeronáuticas',
  },

  SIMULADORES: {
    nome: 'Simuladores e Sessões',
    prioridade: 3,
    tabelas_principais: ['fichas_sessao', 'fichas_sessao_manobras', 'manobras', 'simuladores'],
    tabelas_relacionadas: [
      'historico_notas_manobras',
      'instrutores_simulador',
      'tipos_sessao',
      'modelos_sessao',
      'modelos_sessao_manobras',
    ],
    estimativa_registros: 8000,
    dependencias: ['PESSOAS', 'QUALIFICACOES'],
    descricao: 'Treinamentos em simulador e avaliações de manobras',
  },

  DOCUMENTOS: {
    nome: 'Pasta Virtual e Documentos',
    prioridade: 4,
    tabelas_principais: ['documentos', 'pasta_virtual', 'arquivos'],
    tabelas_relacionadas: ['funcionario_documentos', 'certificados_templates'],
    estimativa_registros: 25000,
    dependencias: ['PESSOAS', 'QUALIFICACOES'],
    requer_r2: true,
    descricao: 'Sistema de gestão documental e pasta virtual',
  },

  COMPLIANCE: {
    nome: 'Compliance e Auditoria',
    prioridade: 5,
    tabelas_principais: ['auditoria_avancada_v2', 'auditoria'],
    tabelas_relacionadas: [
      'audit_cascade',
      'pessoas_auditoria_acessos',
      'notificacoes',
      'compliance_status',
      'historico_compliance',
    ],
    estimativa_registros: 100000,
    dependencias: ['PESSOAS', 'QUALIFICACOES'],
    descricao: 'Logs de auditoria e status de compliance regulatório',
  },

  CONFIGURACOES: {
    nome: 'Configurações do Sistema',
    prioridade: 99,
    tabelas_principais: ['system_config', 'funcoes', 'setores'],
    tabelas_relacionadas: ['aeronaves', 'modelos_aeronave', 'empresas', 'papeis'],
    estimativa_registros: 500,
    dependencias: [],
    descricao: 'Configurações globais, roles e estrutura organizacional',
  },
} as const;

export type ModuloBackup = keyof typeof BACKUP_MODULES;

export const TODOS_MODULOS = Object.keys(BACKUP_MODULES) as ModuloBackup[];

/**
 * Retorna módulos ordenados por prioridade de dependência
 */
export function ordenarModulosPorPrioridade(modulos: ModuloBackup[]): ModuloBackup[] {
  return modulos.sort((a, b) => BACKUP_MODULES[a].prioridade - BACKUP_MODULES[b].prioridade);
}

/**
 * Retorna módulos em ordem reversa para restore
 */
export function ordenarModulosParaRestore(modulos: ModuloBackup[]): ModuloBackup[] {
  return modulos.sort((a, b) => BACKUP_MODULES[b].prioridade - BACKUP_MODULES[a].prioridade);
}

/**
 * Valida se todos os módulos especificados existem
 */
export function validarModulos(modulos: string[]): {
  validos: ModuloBackup[];
  invalidos: string[];
} {
  const validos: ModuloBackup[] = [];
  const invalidos: string[] = [];

  for (const modulo of modulos) {
    if (modulo in BACKUP_MODULES) {
      validos.push(modulo as ModuloBackup);
    } else {
      invalidos.push(modulo);
    }
  }

  return { validos, invalidos };
}

/**
 * Calcula estimativa de tempo baseado nos módulos
 */
export function estimarDuracaoBackup(modulos: ModuloBackup[]): number {
  // Aproximadamente 1 segundo por 1000 registros + overhead
  const totalRegistros = modulos.reduce(
    (sum, mod) => sum + BACKUP_MODULES[mod].estimativa_registros,
    0,
  );
  return Math.ceil(totalRegistros / 1000) + modulos.length * 2;
}
