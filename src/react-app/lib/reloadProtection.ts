const INTERACTIVE_PROTECTED_PATHS = [
  /^\/frms\/(?:checkin|fadiga-checkin)(?:\/|$)/,
  /^\/lms\/(?:provas?|player)(?:\/|$)/,
  /^\/avaliacoes(?:\/|$)/,
  /^\/escalas(?:\/|$)/,
  /^\/simuladores(?:\/|$)/,
  /^\/qualificacoes(?:\/|$)/,
  /^\/pilot(?:\/|$)/,
];

/**
 * Interactive flows that must never be hard-reloaded automatically.
 * A manual reload is still possible, but automatic runtime recovery/version
 * refresh must defer until the operator leaves the flow.
 */
export function isReloadProtectedInteractivePath(pathname: string): boolean {
  const normalized = String(pathname || '');
  return INTERACTIVE_PROTECTED_PATHS.some((pattern) => pattern.test(normalized));
}
