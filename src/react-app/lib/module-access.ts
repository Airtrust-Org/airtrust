import { PRODUCT_MODULE_BY_KEY } from './modules';
import {
  canSeeAdministrativeDashboard,
  shouldShowRestrictedDevelopmentNavItems,
} from './development-module-nav';

export type EmpresaModuleState = string[] | null | undefined;

interface ModuleAccessOptions {
  preserveLegacyAccess?: boolean;
  preserveInternalAccess?: boolean;
  allowBlocked?: boolean;
}

export interface ModuleRouteMatch {
  moduleKey: string;
  pathPrefix: string;
}

interface VisibleNavigationOptions {
  user?: {
    email?: string | null;
    role?: string | null;
  } | null;
}

const LEGACY_PRESET_KEYS = new Set(['treinamento', 'compliance']);

const LEGACY_PRESET_MODULES = [
  'dashboard',
  'funcionarios',
  'qualificacoes',
  'simuladores',
  'escalas',
  'evd',
  'frms',
  'admin',
  'usuarios_empresas',
  'treinamentos_planejados',
  'sgso',
  'lms',
  'hospedagem',
  'mro',
  'controle_voos',
  'configuracoes_avancadas',
];

const MODULE_ALIASES: Record<string, string[]> = {
  escala: ['escalas'],
  escalas_evd: ['escalas', 'evd'],
  fadiga: ['frms'],
  treinamento: LEGACY_PRESET_MODULES,
  compliance: LEGACY_PRESET_MODULES,
};

const MODULE_ID_ALIASES: Record<string, string> = {
  lms_catalogo: 'lms',
  lms_dashboard: 'lms',
  lms_admin: 'lms',
  pessoas: 'funcionarios',
  pasta_virtual: 'funcionarios',
  funcionarios_dashboard: 'funcionarios',
  treinamentos: 'qualificacoes',
  dashboard_treinamentos: 'qualificacoes',
  matriz_compliance: 'qualificacoes',
  solicitacoes_treinamento: 'treinamentos_planejados',
  horas_voo: 'funcionarios',
  lms_cursos: 'lms',
  simuladores_dashboard: 'simuladores',
  simuladores_home: 'simuladores',
  simuladores_cadastros: 'simuladores',
  simuladores_templates: 'simuladores',
  aeronaves: 'configuracoes_avancadas',
  sistema: 'configuracoes_avancadas',
  backup: 'admin',
  frms_alertas: 'frms',
  frms_relatorios: 'frms',
  frms_configuracoes: 'frms',
  frms_fadiga_acumulada: 'frms',
  frms_checkin_fadiga: 'frms',
  frms_painel_fadiga: 'frms',
  frms_historico_fadiga: 'frms',
  minhas_assinaturas: 'qualificacoes',
  usuarios: 'usuarios_empresas',
  permissoes_perfis: 'usuarios_empresas',
  empresa: 'usuarios_empresas',
  funcoes: 'configuracoes_avancadas',
  catalogo_aeronaves: 'configuracoes_avancadas',
  manutencao: 'admin',
  certificado: 'configuracoes_avancadas',
  limpar_dados: 'admin',
  hard_refresh: 'admin',
  mro_dashboard: 'mro',
  mro_aeronaves: 'mro',
  mro_componentes: 'mro',
  mro_os: 'mro',
  mro_vencimentos: 'mro',
  mro_estoque: 'mro',
  mro_registros: 'mro',
  controle_voos: 'controle_voos',
  controle_voos_dashboard: 'controle_voos',
  controle_voos_voos: 'controle_voos',
  controle_voos_rdv: 'controle_voos',
  controle_voos_jornadas: 'controle_voos',
  controle_voos_indisponibilidades: 'controle_voos',
  controle_voos_hangaragem: 'controle_voos',
  controle_voos_relatorios: 'controle_voos',
  controle_voos_tabelas: 'controle_voos',
};

const RESTRICTED_DEVELOPMENT_NAV_MODULES = new Set(['mro', 'controle_voos']);
const RESTRICTED_ADMIN_DASHBOARD_NAV_MODULES = new Set(['dashboard']);

export const MODULE_ROUTE_MATCHES: ModuleRouteMatch[] = [
  { pathPrefix: '/configuracoes/integracoes/sigvoos', moduleKey: 'sigvoos' },
  { pathPrefix: '/configuracoes/integracoes/edapp', moduleKey: 'sigvoos' },
  { pathPrefix: '/lms', moduleKey: 'lms' },
  { pathPrefix: '/sgso', moduleKey: 'sgso' },
  { pathPrefix: '/hospedagem', moduleKey: 'hospedagem' },
  { pathPrefix: '/treinamentos/planejados', moduleKey: 'treinamentos_planejados' },
  { pathPrefix: '/treinamentos/solicitacoes', moduleKey: 'treinamentos_planejados' },
  { pathPrefix: '/funcionarios', moduleKey: 'funcionarios' },
  { pathPrefix: '/pasta-virtual', moduleKey: 'funcionarios' },
  { pathPrefix: '/qualificacoes', moduleKey: 'qualificacoes' },
  { pathPrefix: '/licencas', moduleKey: 'qualificacoes' },
  { pathPrefix: '/simuladores', moduleKey: 'simuladores' },
  { pathPrefix: '/escalas/diaria', moduleKey: 'evd' },
  { pathPrefix: '/escalas/evd', moduleKey: 'evd' },
  { pathPrefix: '/escalas', moduleKey: 'escalas' },
  { pathPrefix: '/frms', moduleKey: 'frms' },
  { pathPrefix: '/horas-voo', moduleKey: 'funcionarios' },
  { pathPrefix: '/relatorios', moduleKey: 'dashboard' },
  { pathPrefix: '/importacao', moduleKey: 'configuracoes_avancadas' },
  { pathPrefix: '/sistema', moduleKey: 'configuracoes_avancadas' },
  { pathPrefix: '/admin', moduleKey: 'usuarios_empresas' },
  { pathPrefix: '/mro', moduleKey: 'mro' },
  { pathPrefix: '/controle-voos', moduleKey: 'controle_voos' },
];

export function hasExplicitModuleConfig(modulosAtivos: EmpresaModuleState): boolean {
  return Array.isArray(modulosAtivos);
}

export function normalizeModuleKey(moduleKey: string): string {
  return String(moduleKey || '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '_')
    .replace(/-/g, '_');
}

function resolveModuleKey(moduleKey: string): string {
  const normalized = normalizeModuleKey(moduleKey);
  return MODULE_ID_ALIASES[normalized] ?? normalized;
}

export function expandActiveModuleKeys(modulosAtivos: EmpresaModuleState): Set<string> {
  const expanded = new Set<string>();

  if (!Array.isArray(modulosAtivos)) {
    return expanded;
  }

  for (const rawKey of modulosAtivos) {
    const key = normalizeModuleKey(rawKey);
    if (!key) continue;

    expanded.add(key);
    for (const aliasTarget of MODULE_ALIASES[key] ?? []) {
      expanded.add(aliasTarget);
    }
  }

  return expanded;
}

export function isLegacyPresetConfig(modulosAtivos: EmpresaModuleState): boolean {
  if (!Array.isArray(modulosAtivos)) return false;
  return modulosAtivos.some((key) => LEGACY_PRESET_KEYS.has(normalizeModuleKey(key)));
}

export function canAccessModule(
  moduleKey: string,
  modulosAtivos: EmpresaModuleState,
  options: ModuleAccessOptions = {},
): boolean {
  const preserveLegacyAccess = options.preserveLegacyAccess ?? true;
  const preserveInternalAccess = options.preserveInternalAccess ?? true;
  const key = resolveModuleKey(moduleKey);
  const moduleDefinition = PRODUCT_MODULE_BY_KEY[key];

  if (moduleDefinition?.status === 'blocked' && !options.allowBlocked) {
    return false;
  }

  if (!Array.isArray(modulosAtivos)) {
    return preserveLegacyAccess;
  }

  if (moduleDefinition?.status === 'internal' && preserveInternalAccess) {
    return true;
  }

  const activeKeys = expandActiveModuleKeys(modulosAtivos);
  return activeKeys.has(key);
}

export function getModuleKeyForPath(pathname: string): string | null {
  const normalizedPath = pathname === '/' ? '/' : pathname.replace(/\/+$/, '');
  const match = MODULE_ROUTE_MATCHES.find((route) => {
    return normalizedPath === route.pathPrefix || normalizedPath.startsWith(`${route.pathPrefix}/`);
  });

  return match?.moduleKey ?? null;
}

export function getVisibleNavigationItems<
  T extends { id: string; children?: Array<{ id: string }> },
>(items: T[], modulosAtivos: EmpresaModuleState, options: VisibleNavigationOptions = {}): T[] {
  const canSeeRestrictedDevelopmentNavItems = shouldShowRestrictedDevelopmentNavItems(
    options.user,
  );

  const shouldKeepNavigationItem = (itemId: string): boolean => {
    if (!canAccessModule(itemId, modulosAtivos)) {
      return false;
    }

    const resolvedModuleKey = resolveModuleKey(itemId);
    if (
      RESTRICTED_ADMIN_DASHBOARD_NAV_MODULES.has(resolvedModuleKey) &&
      options.user &&
      !canSeeAdministrativeDashboard(options.user)
    ) {
      return false;
    }

    if (
      RESTRICTED_DEVELOPMENT_NAV_MODULES.has(resolvedModuleKey) &&
      !canSeeRestrictedDevelopmentNavItems
    ) {
      return false;
    }

    return true;
  };

  return items
    .filter((item) => shouldKeepNavigationItem(item.id))
    .map((item) => {
      if (!item.children) return item;

      return {
        ...item,
        children: item.children.filter((child) => shouldKeepNavigationItem(child.id)),
      };
    })
    .filter((item) => !item.children || item.children.length > 0);
}
