import { useContext, useMemo } from 'react';
import { AuthContext } from '../context/auth-context';

export const SESSION_ROLE_COOKIE = 'airtrust_session_role';

export function readActiveSessionRole(): string | null {
  if (typeof document === 'undefined') return null;
  const match = document.cookie.match(new RegExp(`(?:^|;\\s*)${SESSION_ROLE_COOKIE}=([^;]*)`));
  if (!match?.[1]) return null;
  try {
    return decodeURIComponent(match[1]);
  } catch {
    return match[1];
  }
}

export function clearActiveSessionRole(): void {
  if (typeof document === 'undefined') return;
  document.cookie = `${SESSION_ROLE_COOKIE}=; Max-Age=0; Path=/; SameSite=Lax`;
  document.cookie = `${SESSION_ROLE_COOKIE}=; Max-Age=0; Path=/; Domain=.airtrust.online; SameSite=Lax`;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }

  const activeSessionRole = readActiveSessionRole();

  return useMemo(() => {
    const user =
      context.user && activeSessionRole
        ? { ...context.user, role: activeSessionRole }
        : context.user;

    return {
      ...context,
      user,
      logout: () => {
        clearActiveSessionRole();
        context.logout();
      },
      selectEmpresa: async (empresaId: number) => {
        clearActiveSessionRole();
        await context.selectEmpresa(empresaId);
      },
    };
  }, [activeSessionRole, context]);
}
