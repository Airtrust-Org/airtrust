export const CANONICAL_DUPLICATE_ROUTE_TARGETS = {
  '/admin/usuarios': '/configuracoes?tab=usuarios',
  '/home': '/',
  '/dashboard': '/',
  '/configuracoes/cadastros': '/configuracoes?tab=cadastros',
  '/configuracoes/integracoes/edapp': '/configuracoes/integracoes/sigvoos',
  '/importacao': '/configuracoes?tab=importacao',
  '/mro/dashboard': '/mro',
  '/controle-voos/dashboard': '/controle-voos',
  '/escalas/evd': '/escalas/diaria',
} as const;

export type DuplicateRouteAlias = keyof typeof CANONICAL_DUPLICATE_ROUTE_TARGETS;

export function canonicalDuplicateRouteTarget(route: DuplicateRouteAlias): string {
  return CANONICAL_DUPLICATE_ROUTE_TARGETS[route];
}
