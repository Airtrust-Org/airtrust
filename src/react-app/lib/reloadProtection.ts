const FRMS_INTERACTIVE_CHECKIN = /^\/frms\/(?:checkin|fadiga-checkin)(?:\/|$)/;

/**
 * Interactive flows that must never be hard-reloaded automatically.
 * A manual reload is still possible, but automatic runtime recovery/version
 * refresh must defer until the operator leaves the flow.
 */
export function isReloadProtectedInteractivePath(pathname: string): boolean {
  return FRMS_INTERACTIVE_CHECKIN.test(String(pathname || ''));
}
