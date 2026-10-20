/**
 * Operational isolation rule: the dedicated BOA portal must never fall back to
 * the offshore FRMS screens, including legacy deep links and child paths.
 */
export function resolveBombeirosLegacyFrmsRedirect(
  empresaCodigo: string | null | undefined,
  pathname: string,
): string | null {
  if (empresaCodigo !== 'bombeiros') return null;
  const path = pathname.replace(/\/+$/, '') || '/';
  return path === '/frms' || path.startsWith('/frms/')
    ? '/bombeiros/frms'
    : null;
}
