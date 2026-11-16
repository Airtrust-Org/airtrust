/**
 * Browser-tab session preference, NOT an authorization grant.
 * The Worker validates each requested role against the live tenant/identity.
 * Unlike a domain cookie, sessionStorage is not shared by different tabs.
 */
export const SESSION_ROLE_HEADER = 'X-AirTrust-Session-Role';
export const SESSION_ROLE_TAB_KEY = 'airtrust_selected_role_tab';
const ALLOWED = new Set(['ADMINISTRADOR', 'GESTOR', 'COORDENACAO_VOO', 'INSTRUTOR', 'ALUNO', 'USUARIO']);

export function getTabSessionRole(): string | null {
  if (typeof window === 'undefined') return null;
  try {
    const value = window.sessionStorage.getItem(SESSION_ROLE_TAB_KEY);
    return value && ALLOWED.has(value) ? value : null;
  } catch {
    return null;
  }
}

export function setTabSessionRole(role: string): void {
  if (!ALLOWED.has(role)) throw new Error('Perfil de sessão inválido');
  if (typeof window === 'undefined') return;
  try {
    window.sessionStorage.setItem(SESSION_ROLE_TAB_KEY, role);
  } catch { /* disabled storage: signed role/cookie remain server-validated */ }
}

export function clearTabSessionRole(): void {
  if (typeof window === 'undefined') return;
  try {
    window.sessionStorage.removeItem(SESSION_ROLE_TAB_KEY);
  } catch { /* ignore blocked storage */ }
}
