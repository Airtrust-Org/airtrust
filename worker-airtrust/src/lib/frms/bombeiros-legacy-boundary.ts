/**
 * BOA/CBMMG: do not let a Bombeiros session fall through to the offshore FRMS
 * API family. Shared application auth/tenant middleware still runs first.
 */
export function isBombeirosLegacyFrmsBlocked(
  empresaCodigo: string | null | undefined,
  path: string,
): boolean {
  return empresaCodigo === 'bombeiros'
    && (path === '/api/frms' || path.startsWith('/api/frms/'));
}
