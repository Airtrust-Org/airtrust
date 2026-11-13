/**
 * Operational isolation rule: the dedicated BOA portal must never fall back to
 * the offshore FRMS screens, including legacy deep links and child paths.
 */
export function resolveBombeirosLegacyFrmsRedirect(
  empresaCodigo: string | null | undefined,
  pathname: string,
  currentRole?: string | null,
): string | null {
  if (empresaCodigo !== 'bombeiros') return null;
  const path = pathname.replace(/\/+$/, '') || '/';
  if (path !== '/frms' && !path.startsWith('/frms/')) return null;
  const role = String(currentRole || '').trim().toLowerCase();
  if (role === 'gestor' || role === 'manager') return '/bombeiros/frms/casos';
  if (role === 'admin' || role === 'administrador') return '/bombeiros/frms';
  return '/bombeiros/frms/checkin';
}
