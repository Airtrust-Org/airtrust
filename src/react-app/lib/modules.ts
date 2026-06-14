export type ModuleStatus = 'pilot' | 'beta' | 'internal' | 'blocked';
export type ModuleMaturityLevel = 'N0' | 'N1' | 'N2' | 'N3' | 'N4';
export type ModuleEvidenceLevel = 'A0' | 'A1' | 'A2' | 'A3';

export interface ProductModule {
  key: string;
  label: string;
  status: ModuleStatus;
  defaultForPilot: boolean;
  description: string;
  maturityLevel: ModuleMaturityLevel;
  evidenceLevel: ModuleEvidenceLevel;
  isPrototype: boolean;
  isRegulated: boolean;
  requiresRecordsCore: boolean;
  officialDataSource: string;
  governanceLabel: string;
  governanceDescription: string;
}

function operationalModuleGovernance(
  officialDataSource: string,
  governanceDescription: string,
): Omit<
  ProductModule,
  'key' | 'label' | 'status' | 'defaultForPilot' | 'description'
> {
  return {
    maturityLevel: 'N1',
    evidenceLevel: 'A1',
    isPrototype: false,
    isRegulated: false,
    requiresRecordsCore: false,
    officialDataSource,
    governanceLabel: 'Operacional interno',
    governanceDescription,
  };
}

function prototypeModuleGovernance(
  officialDataSource: string,
  governanceDescription: string,
): Omit<
  ProductModule,
  'key' | 'label' | 'status' | 'defaultForPilot' | 'description'
> {
  return {
    maturityLevel: 'N0',
    evidenceLevel: 'A0',
    isPrototype: true,
    isRegulated: false,
    requiresRecordsCore: false,
    officialDataSource,
    governanceLabel: 'Protótipo — não regulado',
    governanceDescription,
  };
}

export const PRODUCT_MODULES: ProductModule[] = [
  {
    key: 'dashboard',
    label: 'Dashboard executivo',
    status: 'pilot',
    defaultForPilot: true,
    description: 'Painel read-only consolidado do tenant.',
    ...operationalModuleGovernance(
      'Dados derivados dos modulos operacionais do AirTrust.',
      'Painel gerencial interno; nao substitui registro regulado.',
    ),
  },
  {
    key: 'funcionarios',
    label: 'Funcionarios',
    status: 'pilot',
    defaultForPilot: true,
    description: 'Base operacional de pessoas do tenant.',
    ...operationalModuleGovernance(
      'AirTrust (dado mestre interno de pessoas).',
      'Base operacional interna com persistencia real; nao substitui registro regulado.',
    ),
  },
  {
    key: 'qualificacoes',
    label: 'Qualificacoes',
    status: 'pilot',
    defaultForPilot: true,
    description: 'Gestao de qualificacoes, certificados e vencimentos.',
    ...operationalModuleGovernance(
      'AirTrust (cadastro e historico de qualificacoes).',
      'Modulo N1/A1 no estado atual; ainda nao possui evidencias tecnicas para A2.',
    ),
  },
  {
    key: 'simuladores',
    label: 'Simuladores',
    status: 'pilot',
    defaultForPilot: true,
    description: 'Sessoes, fichas e cadastros de simulador.',
    ...operationalModuleGovernance(
      'AirTrust (registros internos de simulador).',
      'Uso operacional interno; nao substitui registro regulado.',
    ),
  },
  {
    key: 'escalas',
    label: 'Escalas',
    status: 'pilot',
    defaultForPilot: true,
    description: 'Planejamento e acompanhamento de escala.',
    ...operationalModuleGovernance(
      'AirTrust (planejamento operacional).',
      'Planejamento interno de escala; nao substitui registro regulado.',
    ),
  },
  {
    key: 'evd',
    label: 'EVD',
    status: 'pilot',
    defaultForPilot: true,
    description: 'Escala diaria de voo.',
    ...operationalModuleGovernance(
      'AirTrust (escala diaria operacional).',
      'Controle operacional interno; nao substitui registro regulado.',
    ),
  },
  {
    key: 'frms',
    label: 'FRMS/Fadiga',
    status: 'pilot',
    defaultForPilot: true,
    description: 'Gestao de fadiga e jornada com controles LGPD.',
    ...operationalModuleGovernance(
      'SIGVOOS/FIRA + AirTrust.',
      'Operacional interno no estado atual; sem evidencia tecnica suficiente para A2.',
    ),
  },
  {
    key: 'admin',
    label: 'Admin/manutencao',
    status: 'internal',
    defaultForPilot: false,
    description: 'Ferramentas internas de operacao e suporte.',
    ...operationalModuleGovernance(
      'AirTrust (operacao interna e suporte).',
      'Ferramentas internas; nao substituem registro regulado.',
    ),
  },
  {
    key: 'usuarios_empresas',
    label: 'Usuarios e empresas',
    status: 'internal',
    defaultForPilot: false,
    description: 'Onboarding, usuarios, vinculos e permissoes.',
    ...operationalModuleGovernance(
      'AirTrust (cadastros internos de acesso e tenant).',
      'Cadastros administrativos internos; nao substituem registro regulado.',
    ),
  },
  {
    key: 'treinamentos_planejados',
    label: 'Treinamentos planejados',
    status: 'beta',
    defaultForPilot: false,
    description: 'Planejamento de treinamentos ainda em estabilizacao.',
    ...operationalModuleGovernance(
      'AirTrust (planejamento interno de treinamentos).',
      'Fluxo operacional interno em estabilizacao; nao substitui registro regulado.',
    ),
  },
  {
    key: 'sgso',
    label: 'SGSO',
    status: 'beta',
    defaultForPilot: false,
    description: 'Sistema de gerenciamento de seguranca operacional.',
    ...operationalModuleGovernance(
      'AirTrust (gestao interna de seguranca operacional).',
      'Estado atual N1/A1; ainda sem evidencias tecnicas para A2/A3.',
    ),
  },
  {
    key: 'lms',
    label: 'LMS/EAD',
    status: 'beta',
    defaultForPilot: false,
    description: 'Cursos, matriculas e conteudo EAD.',
    ...operationalModuleGovernance(
      'AirTrust (cursos, matriculas e conteudo interno).',
      'Operacional interno no estado atual; nao substitui certificado regulado.',
    ),
  },
  {
    key: 'hospedagem',
    label: 'Hospedagem',
    status: 'beta',
    defaultForPilot: false,
    description: 'Gestao de acomodacoes de tripulantes.',
    ...operationalModuleGovernance(
      'AirTrust (gestao interna de acomodacoes).',
      'Uso operacional interno; sem funcao de registro regulado.',
    ),
  },
  {
    key: 'sigvoos',
    label: 'SIGVOOS',
    status: 'blocked',
    defaultForPilot: false,
    description: 'Integracao externa bloqueada para piloto.',
    ...operationalModuleGovernance(
      'Sistema externo integrado ao AirTrust; bloqueado no piloto atual.',
      'Integracao operacional externa; nao substitui registro regulado no frontend atual.',
    ),
  },
  {
    key: 'configuracoes_avancadas',
    label: 'Configuracoes avancadas',
    status: 'beta',
    defaultForPilot: false,
    description: 'Configuracoes fora do escopo do piloto inicial.',
    ...operationalModuleGovernance(
      'AirTrust (configuracoes internas do tenant).',
      'Configuracao operacional interna; nao substitui registro regulado.',
    ),
  },
  {
    key: 'mro',
    label: 'MRO / Manutenção',
    status: 'beta',
    defaultForPilot: false,
    description: 'Gestão de manutenção de aeronaves, componentes, OS e estoque.',
    ...prototypeModuleGovernance(
      'Papel / sistema externo (estado atual).',
      'Frontend navegavel com dados demonstrativos; nao utilizar como registro oficial.',
    ),
  },
  {
    key: 'controle_voos',
    label: 'Controle de Voos',
    status: 'beta',
    defaultForPilot: false,
    description: 'Programação de voos, tripulação, RDV, jornada, indisponibilidade e relatórios operacionais.',
    ...prototypeModuleGovernance(
      'Papel / OCC (estado atual).',
      'Frontend navegavel com dados demonstrativos; nao utilizar como registro oficial.',
    ),
  },
];

export const PRODUCT_MODULE_BY_KEY = Object.fromEntries(
  PRODUCT_MODULES.map((module) => [module.key, module]),
) as Record<string, ProductModule>;

export const SECOND_COMPANY_PILOT_MODULES = PRODUCT_MODULES.filter(
  (module) => module.defaultForPilot,
).map((module) => module.key);
