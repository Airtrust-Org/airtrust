import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  AuthRefreshError,
  setTokens,
  clearTokens,
  getPersistLogin,
  ensureValidAccessToken,
  getTokenExpiryTimeMs,
  isTerminalAuthRefreshError,
  logout as revokeSessionOnServer,
  readAuthStorageValue,
  removeAuthStorageValue,
  writeAuthStorageValue,
} from '@/react-app/config/api';
import { apiFetch } from '@/react-app/lib/apiFetch';
import { queryClient } from '@/react-app/lib/query-client';
import { AuthContext, type AuthContextType, type User, type UsuarioEmpresa } from './auth-context';
import { getDevLoginCredentials } from '@/react-app/utils/devCredentials';

const TOKEN_KEY = 'airtrust_token';
const REFRESH_TOKEN_KEY = 'airtrust_refresh_token';
const USER_KEY = 'airtrust_user';
const AUTH_REQUEST_TIMEOUT_MS = 10000;
const AUTH_EMPRESAS_TIMEOUT_MS = 5000;

function readAuthStorage(key: string): string | null {
  return readAuthStorageValue(key);
}

function shouldPersistAuth(): boolean {
  try {
    return (
      getPersistLogin() ||
      localStorage.getItem(TOKEN_KEY) !== null ||
      localStorage.getItem(REFRESH_TOKEN_KEY) !== null ||
      localStorage.getItem(USER_KEY) !== null
    );
  } catch {
    return getPersistLogin();
  }
}

function writeAuthStorage(key: string, value: string, persist = shouldPersistAuth()): void {
  writeAuthStorageValue(key, value, persist);
}

function removeAuthStorage(key: string): void {
  removeAuthStorageValue(key);
}

function normalizeRole(role?: string | null): string {
  const normalized = String(role ?? '')
    .trim()
    .toUpperCase();

  switch (normalized) {
    case 'ADMIN':
      return 'ADMINISTRADOR';
    case 'MANAGER':
      return 'GESTOR';
    case 'INSTRUCTOR':
      return 'INSTRUTOR';
    case 'STUDENT':
      return 'ALUNO';
    default:
      return normalized;
  }
}

function mergeUserFromMe(storedUser: User | null, meData: any): User {
  const meId = Number(meData?.id || 0);
  const sameUser = Boolean(storedUser && meId > 0 && Number(storedUser.id) === meId);

  return {
    id: meId > 0 ? meId : Number(storedUser?.id || 0),
    email: String(meData?.email || storedUser?.email || ''),
    nome: String(meData?.nome || storedUser?.nome || ''),
    role: normalizeRole(meData?.role || storedUser?.role),
    permissions: sameUser ? (storedUser?.permissions ?? []) : [],
    funcionario_id:
      sameUser && storedUser?.funcionario_id !== undefined
        ? (storedUser.funcionario_id ?? null)
        : null,
  };
}

async function authFetch(
  path: string,
  init?: RequestInit,
  timeoutMs = AUTH_REQUEST_TIMEOUT_MS,
): Promise<Response> {
  if (init?.signal || typeof AbortController === 'undefined') {
    return apiFetch(`/api/auth${path}`, init);
  }

  const controller = new AbortController();
  const timeoutId = window.setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await apiFetch(`/api/auth${path}`, {
      ...init,
      signal: controller.signal,
    });
  } finally {
    window.clearTimeout(timeoutId);
  }
}

function isAbortError(error: unknown): boolean {
  return error instanceof DOMException && error.name === 'AbortError';
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [empresas, setEmpresas] = useState<UsuarioEmpresa[]>([]);
  const [empresaAtualId, setEmpresaAtualId] = useState<number | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const refreshTimeoutRef = useRef<number | null>(null);

  const clearPersistedAuth = useCallback(() => {
    clearTokens();
    removeAuthStorage(TOKEN_KEY);
    removeAuthStorage(USER_KEY);
    removeAuthStorage(REFRESH_TOKEN_KEY);
  }, []);

  const clearRefreshSchedule = useCallback(() => {
    if (refreshTimeoutRef.current !== null) {
      window.clearTimeout(refreshTimeoutRef.current);
      refreshTimeoutRef.current = null;
    }
  }, []);

  const loadEmpresas = useCallback(async (accessToken: string) => {
    try {
      const response = await authFetch('/empresas', {
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      }, AUTH_EMPRESAS_TIMEOUT_MS);

      if (!response.ok) return;

      const json = await response.json();
      const payload = json?.data;

      setEmpresas(Array.isArray(payload?.empresas) ? payload.empresas : []);
      setEmpresaAtualId(
        typeof payload?.empresaAtualId === 'number' ? payload.empresaAtualId : null,
      );
    } catch (error) {
      console.warn('[Auth] Empresas indisponíveis durante login:', error);
      setEmpresas([]);
      setEmpresaAtualId(null);
    }
  }, []);

  const maybeRunDevAutoLogin = useCallback(async () => {
    if (!(import.meta.env.MODE === 'development' || import.meta.env.DEV)) {
      return;
    }

    if (window.location.pathname === '/login') {
      return;
    }

    if (sessionStorage.getItem('airtrust_dev_autologin_attempted') === '1') {
      return;
    }

    const { email: devEmail, password: devPassword } = getDevLoginCredentials();
    const autoLoginEnabled = import.meta.env.VITE_ENABLE_DEV_AUTO_LOGIN === 'true';

    if (!autoLoginEnabled || !devEmail || !devPassword) {
      return;
    }

    sessionStorage.setItem('airtrust_dev_autologin_attempted', '1');

    const devController = new AbortController();
    const devTimeout = window.setTimeout(() => devController.abort(), 5000);

    try {
      const response = await authFetch('/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: devEmail,
          senha: devPassword,
        }),
        signal: devController.signal,
      });

      if (!response.ok) {
        return;
      }

      const data = await response.json();
      if (!data.success || !data.data?.accessToken) {
        return;
      }

      const newToken = data.data.accessToken;
      const newRefreshToken = data.data.refreshToken;
      const newUser = data.data.user;

      writeAuthStorage(TOKEN_KEY, newToken);
      writeAuthStorage(REFRESH_TOKEN_KEY, newRefreshToken);
      writeAuthStorage(USER_KEY, JSON.stringify(newUser));

      setToken(newToken);
      setUser(newUser);
      setTokens(newToken, newRefreshToken);
      await loadEmpresas(newToken);
    } catch (devLoginError) {
      console.warn('[Auth] Auto-login DEV falhou:', devLoginError);
    } finally {
      window.clearTimeout(devTimeout);
    }
  }, [loadEmpresas]);

  const renewSession = useCallback(
    async (storedRefreshToken: string, nextUser?: User | null) => {
      const response = await authFetch('/refresh', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ refreshToken: storedRefreshToken }),
      });

      if (!response.ok) {
        const errorData = (await response.json().catch(() => ({}))) as {
          error?: string;
          code?: string;
        };
        const terminal =
          response.status === 400 ||
          response.status === 401 ||
          response.status === 403 ||
          errorData.code === 'INVALID_REFRESH_TOKEN' ||
          errorData.code === 'REFRESH_TOKEN_REVOKED' ||
          errorData.code === 'REFRESH_TOKEN_EXPIRED' ||
          errorData.code === 'USER_INACTIVE';

        throw new AuthRefreshError(errorData.error || 'Falha ao renovar token', {
          terminal,
          status: response.status,
          code: errorData.code,
        });
      }

      const data = await response.json();

      if (!data.success || !data.data?.accessToken) {
        throw new AuthRefreshError('Resposta inválida do servidor');
      }

      const accessToken = String(data.data.accessToken);
      const newRefreshToken =
        typeof data.data.refreshToken === 'string' ? data.data.refreshToken : storedRefreshToken;
      const isPersistent =
        localStorage.getItem(TOKEN_KEY) !== null ||
        localStorage.getItem(REFRESH_TOKEN_KEY) !== null ||
        getPersistLogin();

      setToken(accessToken);
      if (nextUser) {
        setUser(nextUser);
        writeAuthStorage(USER_KEY, JSON.stringify(nextUser), isPersistent);
      }

      setTokens(accessToken, newRefreshToken);
      writeAuthStorage(TOKEN_KEY, accessToken, isPersistent);
      writeAuthStorage(REFRESH_TOKEN_KEY, newRefreshToken, isPersistent);
      await loadEmpresas(accessToken);
    },
    [loadEmpresas],
  );

  const logout = useCallback(() => {
    queryClient.clear();
    clearRefreshSchedule();
    setToken(null);
    setUser(null);
    setEmpresas([]);
    setEmpresaAtualId(null);

    void revokeSessionOnServer()
      .catch((error) => {
        console.warn('[Auth] Falha ao revogar sessão no servidor durante logout:', error);
      })
      .finally(() => {
        clearPersistedAuth();
      });
  }, [clearPersistedAuth, clearRefreshSchedule]);

  const refreshToken = useCallback(async () => {
    const storedRefreshToken = readAuthStorage(REFRESH_TOKEN_KEY);

    if (!storedRefreshToken) {
      logout();
      throw new Error('Refresh token não encontrado');
    }

    try {
      await renewSession(storedRefreshToken, user);
    } catch (error) {
      console.error('[Auth] Erro ao renovar token:', error);
      if (isTerminalAuthRefreshError(error)) {
        logout();
      }
      throw error;
    }
  }, [logout, renewSession, user]);

  const scheduleRefresh = useCallback(
    (accessToken: string | null) => {
      clearRefreshSchedule();

      const expiresAtMs = getTokenExpiryTimeMs(accessToken);
      if (!expiresAtMs) return;

      const leadTimeMs = 5 * 60 * 1000;
      const minDelayMs = 30 * 1000;
      const delayMs = Math.max(expiresAtMs - Date.now() - leadTimeMs, minDelayMs);

      refreshTimeoutRef.current = window.setTimeout(() => {
        refreshToken().catch((error) => {
          if (!isTerminalAuthRefreshError(error)) {
            scheduleRefresh(token);
          }
        });
      }, delayMs);
    },
    [clearRefreshSchedule, refreshToken, token],
  );

  // Carregar dados persistidos ao montar
  useEffect(() => {
    const loadStoredAuth = async () => {
      try {
        const storedToken = readAuthStorage(TOKEN_KEY);
        const storedUser = readAuthStorage(USER_KEY);

        if (storedToken && storedUser) {
          // Validar token antes de confiar (evita dashboard em branco com token expirado)
          const storedRefreshToken = readAuthStorage(REFRESH_TOKEN_KEY);
          const parsedUser = JSON.parse(storedUser) as User;
          let timeoutId: number | undefined;
          try {
            const accessToken = (await ensureValidAccessToken()) || storedToken;
            const controller = new AbortController();
            timeoutId = window.setTimeout(() => controller.abort(), 5000);
            const meRes = await authFetch('/me', {
              headers: { Authorization: `Bearer ${accessToken}` },
              signal: controller.signal,
            });
            if (meRes.ok) {
              const meJson = await meRes.json().catch(() => null);
              const resolvedUser = mergeUserFromMe(parsedUser, meJson?.data);
              setToken(accessToken);
              setUser(resolvedUser);
              setTokens(accessToken, storedRefreshToken || undefined);
              writeAuthStorage(USER_KEY, JSON.stringify(resolvedUser));
              await loadEmpresas(accessToken);
            } else if (meRes.status === 401 || meRes.status === 403) {
              if (storedRefreshToken) {
                try {
                  await renewSession(storedRefreshToken, parsedUser);
                } catch (error) {
                  if (isTerminalAuthRefreshError(error)) {
                    clearPersistedAuth();
                  } else {
                    setToken(storedToken);
                    setUser(parsedUser);
                    setTokens(storedToken, storedRefreshToken || undefined);
                  }
                }
              } else {
                clearPersistedAuth();
              }
            } else {
              // Erro de servidor (5xx) — tentar renovar via refresh token antes de manter sessão
              console.warn(`[Auth] /auth/me retornou ${meRes.status} — tentando renovar sessão`);
              if (storedRefreshToken) {
                try {
                  await renewSession(storedRefreshToken, parsedUser);
                } catch (error) {
                  // Renovação falhou mas pode ser instabilidade do servidor — manter sessão
                  console.warn(
                    '[Auth] Renovação falhou em 5xx — mantendo sessão local como fallback',
                  );
                  if (isTerminalAuthRefreshError(error)) {
                    clearPersistedAuth();
                    return;
                  }
                  setToken(storedToken);
                  setUser(parsedUser);
                  setTokens(storedToken, storedRefreshToken || undefined);
                }
              } else {
                setToken(storedToken);
                setUser(parsedUser);
                setTokens(storedToken, undefined);
              }
            }
          } catch (error) {
            if (isTerminalAuthRefreshError(error)) {
              clearPersistedAuth();
            } else {
              // Sem rede/timeout — confiar no armazenamento local como fallback
              setToken(storedToken);
              setUser(parsedUser);
              setTokens(storedToken, storedRefreshToken || undefined);
              await loadEmpresas(storedToken);
            }
          } finally {
            if (timeoutId) {
              window.clearTimeout(timeoutId);
            }
          }
        } else {
          await maybeRunDevAutoLogin();
        }
      } catch (error) {
        console.error('[Auth] Erro ao carregar dados:', error);
        // Limpar dados corrompidos
        clearPersistedAuth();
      } finally {
        setIsLoading(false);
      }
    };

    loadStoredAuth();
  }, [clearPersistedAuth, loadEmpresas, maybeRunDevAutoLogin, renewSession]);

  useEffect(() => {
    if (!token) {
      clearRefreshSchedule();
      return;
    }

    scheduleRefresh(token);
    return clearRefreshSchedule;
  }, [clearRefreshSchedule, scheduleRefresh, token]);

  useEffect(() => {
    const resumeSession = async () => {
      const storedToken = readAuthStorage(TOKEN_KEY);
      const storedRefreshToken = readAuthStorage(REFRESH_TOKEN_KEY);

      if (!storedToken || !storedRefreshToken) {
        return;
      }

      try {
        const validToken = await ensureValidAccessToken();
        if (validToken) {
          setToken(validToken);
          setTokens(validToken, storedRefreshToken);
        }
      } catch (error) {
        if (isTerminalAuthRefreshError(error)) {
          logout();
        }
      }
    };

    const handleVisibility = () => {
      if (document.visibilityState === 'visible') {
        void resumeSession();
      }
    };
    const handleFocus = () => {
      void resumeSession();
    };

    window.addEventListener('focus', handleFocus);
    document.addEventListener('visibilitychange', handleVisibility);

    return () => {
      document.removeEventListener('visibilitychange', handleVisibility);
      window.removeEventListener('focus', handleFocus);
    };
  }, [logout]);

  const login = useCallback(
    async (credentials: { email: string; password: string }) => {
      setIsLoading(true);
      try {
        const response = await authFetch('/login', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            email: credentials.email,
            senha: credentials.password, // Backend espera 'senha'
          }),
        });

        if (!response.ok) {
          const errorData = await response.json().catch(() => ({ error: 'Erro ao fazer login' }));
          throw new Error(errorData.error || 'Credenciais inválidas');
        }

        const data = await response.json();

        if (!data.success || !data.data) {
          throw new Error(data.error || 'Resposta inválida do servidor');
        }

        const { accessToken, refreshToken: newRefreshToken, user: userData } = data.data;

        // Salvar no estado
        setToken(accessToken);
        setUser(userData);

        // Sincronizar com api.ts (setTokens usa _persistLogin internamente)
        setTokens(accessToken, newRefreshToken);
        await loadEmpresas(accessToken);

        // Persistir: localStorage se "lembrar de mim", sessionStorage caso contrário
        const persist = getPersistLogin();
        writeAuthStorage(TOKEN_KEY, accessToken, persist);
        writeAuthStorage(USER_KEY, JSON.stringify(userData), persist);
        if (newRefreshToken) {
          writeAuthStorage(REFRESH_TOKEN_KEY, newRefreshToken, persist);
        }
      } catch (error) {
        console.error('[Auth] Erro no login:', error);
        // Limpar estado em caso de erro
        setToken(null);
        setUser(null);
        setEmpresas([]);
        setEmpresaAtualId(null);
        clearPersistedAuth();
        if (isAbortError(error)) {
          throw new Error('Tempo limite ao entrar. Verifique a conexão e tente novamente.');
        }
        throw error;
      } finally {
        setIsLoading(false);
      }
    },
    [clearPersistedAuth, loadEmpresas],
  );

  const selectEmpresa = useCallback(
    async (novaEmpresaId: number) => {
      if (!token) throw new Error('Usuário não autenticado');

      const response = await authFetch('/select-empresa', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ empresaId: novaEmpresaId }),
      });

      const json = await response.json().catch(() => ({}));
      if (!response.ok || !json?.success || !json?.data?.accessToken) {
        throw new Error(json?.error || 'Falha ao trocar empresa');
      }

      const novoToken = String(json.data.accessToken);
      queryClient.clear();
      setToken(novoToken);
      setTokens(novoToken, readAuthStorage(REFRESH_TOKEN_KEY) || undefined);
      writeAuthStorage(TOKEN_KEY, novoToken);

      await loadEmpresas(novoToken);
    },
    [token, loadEmpresas],
  );

  const value: AuthContextType = {
    user,
    token,
    empresas,
    empresaAtualId,
    isAuthenticated: !!user && !!token,
    isLoading,
    login,
    logout,
    refreshToken,
    selectEmpresa,
    refreshEmpresas: () => (token ? loadEmpresas(token) : Promise.resolve()),
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
