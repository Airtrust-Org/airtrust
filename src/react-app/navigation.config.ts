export interface NavigationStructure {
  main_menu: MainMenuItem[];
  settings_menu: SettingsMenuItem[];
}

export interface MainMenuItem {
  id: string;
  label: string;
  icon: string;
  path?: string;
  expandable: boolean;
  children?: SubMenuItem[];
  badge?: string;
}

export interface SubMenuItem {
  id: string;
  label: string;
  path: string;
  badge?: string;
}

export interface SettingsMenuItem {
  category: string;
  items: SettingsItem[];
}

export interface SettingsItem {
  id: string;
  label: string;
  path: string;
  component: string;
  description: string;
  permissions_required?: string[];
}

export const NAVIGATION_CONFIG: NavigationStructure = {
  main_menu: [
    {
      id: 'dashboard',
      label: 'Dashboard',
      icon: 'BarChart3',
      path: '/',
      expandable: false,
    },
    {
      id: 'lms',
      label: 'E-Learning (LMS)',
      icon: 'GraduationCap',
      expandable: true,
      children: [
        {
          id: 'lms-catalogo',
          label: 'Catálogo de Cursos',
          path: '/lms/cursos',
        },
        {
          id: 'lms-dashboard',
          label: 'Dashboard',
          path: '/lms/dashboard',
        },
        {
          id: 'lms-admin',
          label: 'Gerenciar Cursos',
          path: '/lms/admin/cursos',
        },
      ],
    },
    {
      id: 'pessoas',
      label: 'Pessoas',
      icon: 'Users',
      expandable: true,
      children: [
        {
          id: 'funcionarios',
          label: 'Funcionários',
          path: '/funcionarios',
        },
        {
          id: 'pasta-virtual',
          label: 'Pasta Virtual',
          path: '/pasta-virtual',
        },
      ],
    },
    {
      id: 'escalas',
      label: 'Escalas e FRMS',
      icon: 'Calendar',
      expandable: true,
      children: [
        {
          id: 'escalas',
          label: 'Planejamento de Escala',
          path: '/escalas',
        },
        {
          id: 'evd',
          label: 'Escala Diária de Voo',
          path: '/escalas/diaria',
        },
        {
          id: 'frms',
          label: 'FRMS',
          path: '/frms',
        },
        {
          id: 'frms-alertas',
          label: 'Alertas FRMS',
          path: '/frms/alertas',
        },
        {
          id: 'frms-relatorios',
          label: 'Relatórios FRMS',
          path: '/frms/relatorios',
        },
        {
          id: 'frms-configuracoes',
          label: 'Configurações FRMS',
          path: '/frms/configuracoes',
        },
        {
          id: 'frms-fadiga-acumulada',
          label: 'Fadiga Acumulada',
          path: '/frms/fadiga-acumulada',
        },
        {
          id: 'frms-checkin-fadiga',
          label: 'Fadiga Diária',
          path: '/frms/checkin',
        },
        {
          id: 'frms-painel-fadiga',
          label: 'Painel de Fadiga',
          path: '/frms/fadiga-painel',
        },
        {
          id: 'frms-historico-fadiga',
          label: 'Histórico Fadiga',
          path: '/frms/fadiga-historico',
        },
      ],
    },
    {
      id: 'simuladores',
      label: 'Simuladores & Voo',
      icon: 'Calendar',
      expandable: true,
      children: [
        {
          id: 'simuladores-dashboard',
          label: 'Dashboard',
          path: '/simuladores',
        },
        {
          id: 'simuladores-cadastros',
          label: 'Cadastros',
          path: '/simuladores/configuracoes',
        },
        {
          id: 'simuladores-templates',
          label: 'Templates',
          path: '/simuladores/templates',
        },
      ],
    },
    {
      id: 'minhas-assinaturas',
      label: 'Minhas Assinaturas',
      icon: 'CheckCircle',
      path: '/minhas-assinaturas',
      expandable: false,
    },
    {
      id: 'hospedagem',
      label: 'Hospedagem',
      icon: 'Building',
      path: '/hospedagem',
      expandable: false,
    },
  ],
  settings_menu: [
    {
      category: 'Cadastros',
      items: [
        {
          id: 'funcoes',
          label: 'Gestão de Funções',
          path: '/configuracoes/funcoes',
          component: 'FuncoesManagement',
          description: 'Gerenciar cargos e funções da organização',
          permissions_required: ['admin'],
        },
        {
          id: 'empresa',
          label: 'Empresa',
          path: '/configuracoes/empresa',
          component: 'ConfiguracaoEmpresa',
          description: 'Configurações da empresa e logo',
          permissions_required: ['admin'],
        },
        {
          id: 'catalogo-aeronaves',
          label: 'Catálogo de Equipamentos',
          path: '/configuracoes/aeronaves',
          component: 'AeronavesCRUD',
          description: 'Gerenciar equipamentos da frota',
          permissions_required: ['admin'],
        },
      ],
    },
    {
      category: 'Sistema',
      items: [
        {
          id: 'manutencao',
          label: 'Manutenção de Dados',
          path: '/configuracoes/manutencao',
          component: 'ManutencaoDados',
          description: 'Corrigir e otimizar dados após importações',
          permissions_required: ['admin'],
        },
        {
          id: 'certificado',
          label: 'Configuração de Certificados',
          path: '/configuracoes/certificado',
          component: 'ConfiguracaoCertificado',
          description: 'Personalizar templates e logos de certificados',
          permissions_required: ['admin'],
        },
        {
          id: 'limpar-dados',
          label: 'Limpeza de Dados',
          path: '/configuracoes/limpar-dados',
          component: 'LimparDados',
          description: 'Remover dados por módulo (ADMIN)',
          permissions_required: ['admin'],
        },
        {
          id: 'hard-refresh',
          label: 'Hard Refresh',
          path: '/configuracoes/hard-refresh',
          component: 'HardRefresh',
          description: 'Limpar cache do navegador e recarregar a aplicação',
          permissions_required: ['admin'],
        },
        {
          id: 'usuarios',
          label: 'Usuários e Permissões',
          path: '/configuracoes/usuarios',
          component: 'UserManagement',
          description: 'Gerenciar usuários e suas permissões',
          permissions_required: ['admin'],
        },
        {
          id: 'permissoes-perfis',
          label: 'Permissões de Perfis',
          path: '/admin/permissoes',
          component: 'AdminPermissoes',
          description: 'Configurar o que cada perfil (Gestor, Instrutor, Aluno) pode acessar',
          permissions_required: ['admin'],
        },
        {
          id: 'auditoria',
          label: 'Logs de Auditoria',
          path: '/configuracoes/auditoria',
          component: 'AuditLogs',
          description: 'Visualizar logs de auditoria do sistema',
          permissions_required: ['admin'],
        },
      ],
    },
  ],
};
