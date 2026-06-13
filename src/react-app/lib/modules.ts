export type ModuleStatus = 'pilot' | 'beta' | 'internal' | 'blocked';

export interface ProductModule {
  key: string;
  label: string;
  status: ModuleStatus;
  defaultForPilot: boolean;
  description: string;
}

export const PRODUCT_MODULES: ProductModule[] = [
  {
    key: 'dashboard',
    label: 'Dashboard executivo',
    status: 'pilot',
    defaultForPilot: true,
    description: 'Painel read-only consolidado do tenant.',
  },
  {
    key: 'funcionarios',
    label: 'Funcionarios',
    status: 'pilot',
    defaultForPilot: true,
    description: 'Base operacional de pessoas do tenant.',
  },
  {
    key: 'qualificacoes',
    label: 'Qualificacoes',
    status: 'pilot',
    defaultForPilot: true,
    description: 'Gestao de qualificacoes, certificados e vencimentos.',
  },
  {
    key: 'simuladores',
    label: 'Simuladores',
    status: 'pilot',
    defaultForPilot: true,
    description: 'Sessoes, fichas e cadastros de simulador.',
  },
  {
    key: 'escalas',
    label: 'Escalas',
    status: 'pilot',
    defaultForPilot: true,
    description: 'Planejamento e acompanhamento de escala.',
  },
  {
    key: 'evd',
    label: 'EVD',
    status: 'pilot',
    defaultForPilot: true,
    description: 'Escala diaria de voo.',
  },
  {
    key: 'frms',
    label: 'FRMS/Fadiga',
    status: 'pilot',
    defaultForPilot: true,
    description: 'Gestao de fadiga e jornada com controles LGPD.',
  },
  {
    key: 'admin',
    label: 'Admin/manutencao',
    status: 'internal',
    defaultForPilot: false,
    description: 'Ferramentas internas de operacao e suporte.',
  },
  {
    key: 'usuarios_empresas',
    label: 'Usuarios e empresas',
    status: 'internal',
    defaultForPilot: false,
    description: 'Onboarding, usuarios, vinculos e permissoes.',
  },
  {
    key: 'treinamentos_planejados',
    label: 'Treinamentos planejados',
    status: 'beta',
    defaultForPilot: false,
    description: 'Planejamento de treinamentos ainda em estabilizacao.',
  },
  {
    key: 'sgso',
    label: 'SGSO',
    status: 'beta',
    defaultForPilot: false,
    description: 'Sistema de gerenciamento de seguranca operacional.',
  },
  {
    key: 'lms',
    label: 'LMS/EAD',
    status: 'beta',
    defaultForPilot: false,
    description: 'Cursos, matriculas e conteudo EAD.',
  },
  {
    key: 'hospedagem',
    label: 'Hospedagem',
    status: 'beta',
    defaultForPilot: false,
    description: 'Gestao de acomodacoes de tripulantes.',
  },
  {
    key: 'sigvoos',
    label: 'SIGVOOS',
    status: 'blocked',
    defaultForPilot: false,
    description: 'Integracao externa bloqueada para piloto.',
  },
  {
    key: 'configuracoes_avancadas',
    label: 'Configuracoes avancadas',
    status: 'beta',
    defaultForPilot: false,
    description: 'Configuracoes fora do escopo do piloto inicial.',
  },
  {
    key: 'mro',
    label: 'MRO / Manutenção',
    status: 'beta',
    defaultForPilot: false,
    description: 'Gestão de manutenção de aeronaves, componentes, OS e estoque.',
  },
];

export const PRODUCT_MODULE_BY_KEY = Object.fromEntries(
  PRODUCT_MODULES.map((module) => [module.key, module]),
) as Record<string, ProductModule>;

export const SECOND_COMPANY_PILOT_MODULES = PRODUCT_MODULES.filter(
  (module) => module.defaultForPilot,
).map((module) => module.key);

