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
  title?: string;
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
          label: 'Pasta 360',
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
          label: 'FRMS — Operação',
          path: '/frms',
        },
        {
          id: 'frms-alertas',
          label: 'FRMS — Casos',
          path: '/frms/alertas',
        },
        {
          id: 'frms-configuracoes',
          label: 'FRMS — Administração',
          path: '/frms/configuracoes',
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
        {
          id: 'simuladores-guias-instrutor',
          label: 'Guias do Instrutor',
          path: '/instrutor/guias',
        },
      ],
    },
    {
      id: 'qualificacoes',
      label: 'Qualificações',
      icon: 'GraduationCap',
      expandable: true,
      children: [
        {
          id: 'qualificacoes-historico',
          label: 'Histórico',
          path: '/qualificacoes',
        },
        {
          id: 'qualificacoes-turmas',
          label: 'Turmas',
          path: '/qualificacoes?tab=turmas',
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
    {
      id: 'mro',
      label: 'Manutenção',
      icon: 'Wrench',
      expandable: true,
      badge: 'Prévia',
      children: [
        { id: 'mro-dashboard', label: 'Dashboard', path: '/mro' },
        { id: 'mro-aeronaves', label: 'Aeronaves', path: '/mro/aeronaves' },
        { id: 'mro-componentes', label: 'Componentes', path: '/mro/componentes' },
        { id: 'mro-os', label: 'Ordens de Serviço', path: '/mro/os' },
        { id: 'mro-vencimentos', label: 'Vencimentos', path: '/mro/vencimentos' },
        { id: 'mro-estoque', label: 'Estoque', path: '/mro/estoque' },
        { id: 'mro-registros', label: 'Registros Técnicos', path: '/mro/registros-tecnicos' },
      ],
    },
    {
      id: 'controle_voos',
      label: 'Controle de Voos',
      icon: 'Plane',
      expandable: true,
      children: [
        { id: 'controle_voos-dashboard', label: 'Dashboard OCC', path: '/controle-voos' },
        { id: 'controle_voos-voos', label: 'Voos', path: '/controle-voos/voos' },
        { id: 'controle_voos-rdv', label: 'RDV', path: '/controle-voos/rdv' },
        {
          id: 'controle_voos-jornadas',
          label: 'Jornadas',
          path: '/controle-voos/jornadas',
          badge: 'Preview',
          title: 'Tela em preview - aguardando contrato canônico do Controle de Voos',
        },
        {
          id: 'controle_voos-indisponibilidades',
          label: 'Indisponibilidades',
          path: '/controle-voos/indisponibilidades',
          badge: 'Preview',
          title: 'Tela em preview - nao usar como fonte operacional',
        },
        {
          id: 'controle_voos-hangaragem',
          label: 'Hangaragem',
          path: '/controle-voos/hangaragem',
          badge: 'Preview',
          title: 'Tela em preview - nao usar como fonte operacional',
        },
        { id: 'controle_voos-relatorios', label: 'Relatórios', path: '/controle-voos/relatorios' },
        { id: 'controle_voos-tabelas', label: 'Tabelas', path: '/controle-voos/tabelas' },
      ],
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
          id: 'rbac-operacional-gestor',
          label: 'RBAC Operacional do Gestor',
          path: '/admin/operational-domain-rbac',
          component: 'AdminOperationalDomainRbac',
          description: 'Classificar setores/categorias/cursos por domínio e ativar a autonomia operacional do gestor',
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
