# Auth, Tenancy & Users


---
## FILE: src/react-app/context/AuthContext.tsx
~~~tsx
import React, { useState, useEffect, useCallback } from 'react';
import {
  setTokens,
  clearTokens,
  getPersistLogin,
  ensureValidAccessToken,
} from '@/react-app/config/api';
import { apiFetch } from '@/react-app/lib/apiFetch';
import { AuthContext, type AuthContextType, type User, type UsuarioEmpresa } from './auth-context';
import { getDevLoginCredentials } from '@/react-app/utils/devCredentials';

const TOKEN_KEY = 'airtrust_token';
const REFRESH_TOKEN_KEY = 'airtrust_refresh_token';
const USER_KEY = 'airtrust_user';

function readAuthStorage(key: string): string | null {
  const sessionValue = sessionStorage.getItem(key);
  if (sessionValue) return sessionValue;
  // Persistent login: token stored in localStorage — read without migrating
  return localStorage.getItem(key);
}

function writeAuthStorage(key: string, value: string): void {
  sessionStorage.setItem(key, value);
  localStorage.removeItem(key);
}

function removeAuthStorage(key: string): void {
  sessionStorage.removeItem(key);
  localStorage.removeItem(key);
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

async function authFetch(path: string, init?: RequestInit): Promise<Response> {
  return apiFetch(`/api/auth${path}`, init);
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [empresas, setEmpresas] = useState<UsuarioEmpresa[]>([]);
  const [empresaAtualId, setEmpresaAtualId] = useState<number | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const clearPersistedAuth = useCallback(() => {
    clearTokens();
    removeAuthStorage(TOKEN_KEY);
    removeAuthStorage(USER_KEY);
    removeAuthStorage(REFRESH_TOKEN_KEY);
  }, []);

  const loadEmpresas = useCallback(async (accessToken: string) => {
    try {
      const response = await authFetch('/empresas', {
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      });

      if (!response.ok) return;

      const json = await response.json();
      const payload = json?.data;

      setEmpresas(Array.isArray(payload?.empresas) ? payload.empresas : []);
      setEmpresaAtualId(
        typeof payload?.empresaAtualId === 'number' ? payload.empresaAtualId : null,
      );
    } catch {
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
        throw new Error('Falha ao renovar token');
      }

      const data = await response.json();

      if (!data.success || !data.data?.accessToken) {
        throw new Error('Resposta inválida do servidor');
      }

      const accessToken = String(data.data.accessToken);
      const newRefreshToken =
        typeof data.data.refreshToken === 'string' ? data.data.refreshToken : storedRefreshToken;

      // Preserve storage type: if original was in localStorage (persist mode), keep it there
      const isPersistent = localStorage.getItem(TOKEN_KEY) !== null;

      setToken(accessToken);
      if (nextUser) {
        setUser(nextUser);
        writeAuthStorage(USER_KEY, JSON.stringify(nextUser));
      }

      setTokens(accessToken, newRefreshToken);
      if (isPersistent) {
        localStorage.setItem(TOKEN_KEY, accessToken);
        localStorage.setItem(REFRESH_TOKEN_KEY, newRefreshToken);
        sessionStorage.removeItem(TOKEN_KEY);
        sessionStorage.removeItem(REFRESH_TOKEN_KEY);
      } else {
        writeAuthStorage(TOKEN_KEY, accessToken);
        writeAuthStorage(REFRESH_TOKEN_KEY, newRefreshToken);
      }
      await loadEmpresas(accessToken);
    },
    [loadEmpresas],
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
                } catch {
                  clearPersistedAuth();
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
                } catch {
                  // Renovação falhou mas pode ser instabilidade do servidor — manter sessão
                  console.warn(
                    '[Auth] Renovação falhou em 5xx — mantendo sessão local como fallback',
                  );
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
          } catch {
            // Sem rede/timeout — confiar no localStorage como fallback
            setToken(storedToken);
            setUser(parsedUser);
            setTokens(storedToken, storedRefreshToken || undefined);
            await loadEmpresas(storedToken);
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
        const writeStorage = persist
          ? (k: string, v: string) => {
              localStorage.setItem(k, v);
              sessionStorage.removeItem(k);
            }
          : writeAuthStorage;
        writeStorage(TOKEN_KEY, accessToken);
        writeStorage(USER_KEY, JSON.stringify(userData));
        if (newRefreshToken) {
          writeStorage(REFRESH_TOKEN_KEY, newRefreshToken);
        }
      } catch (error) {
        console.error('[Auth] Erro no login:', error);
        // Limpar estado em caso de erro
        setToken(null);
        setUser(null);
        setEmpresas([]);
        setEmpresaAtualId(null);
        clearPersistedAuth();
        throw error;
      } finally {
        setIsLoading(false);
      }
    },
    [clearPersistedAuth, loadEmpresas],
  );

  const logout = useCallback(() => {
    setToken(null);
    setUser(null);
    setEmpresas([]);
    setEmpresaAtualId(null);

    clearPersistedAuth();
  }, [clearPersistedAuth]);

  const refreshToken = useCallback(async () => {
    try {
      const storedRefreshToken = readAuthStorage(REFRESH_TOKEN_KEY);

      if (!storedRefreshToken) {
        throw new Error('Refresh token não encontrado');
      }

      await renewSession(storedRefreshToken, user);
    } catch (error) {
      console.error('[Auth] Erro ao renovar token:', error);
      // Em caso de falha, fazer logout
      logout();
      throw error;
    }
  }, [logout, renewSession, user]);

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

~~~

---
## FILE: src/react-app/context/auth-context.ts
~~~typescript
import { createContext } from 'react';

export interface User {
  id: number;
  email: string;
  nome: string;
  role: string; // ADMINISTRADOR | GESTOR | INSTRUTOR | ALUNO
  permissions: string[]; // Overrides individuais: 'GRANT:permissao' | 'DENY:permissao'
  funcionario_id: number | null;
}

export interface UsuarioEmpresa {
  id: number;
  nome: string;
  codigo: string;
  logo_url?: string | null;
  role: string;
  is_primary: number;
  is_current: number;
}

export interface AuthContextType {
  user: User | null;
  token: string | null;
  empresas: UsuarioEmpresa[];
  empresaAtualId: number | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  login: (credentials: { email: string; password: string }) => Promise<void>;
  logout: () => void;
  refreshToken: () => Promise<void>;
  selectEmpresa: (empresaId: number) => Promise<void>;
  refreshEmpresas: () => Promise<void>;
}

export const AuthContext = createContext<AuthContextType | undefined>(undefined);

~~~

---
## FILE: src/services/funcionarios.service.ts
~~~typescript
import api from './api';
import {
  Funcionario,
  FuncionarioCreate,
  FuncionarioUpdate,
  ImportResult,
  FiltrosFuncionarios,
  PaginacaoParams,
} from '@/types';

export const funcionariosService = {
  listar: async (
    filtros?: FiltrosFuncionarios,
    paginacao?: PaginacaoParams,
  ): Promise<{ data: Funcionario[]; total: number; page: number }> => {
    const params = new URLSearchParams();

    if (filtros?.search) params.append('search', filtros.search);
    if (filtros?.cargo) params.append('cargo', filtros.cargo);
    if (filtros?.setor) params.append('setor', filtros.setor);
    if (filtros?.ativo !== undefined) params.append('ativo', filtros.ativo.toString());
    if (paginacao?.page) params.append('page', paginacao.page.toString());
    if (paginacao?.limit) {
      params.append('limit', paginacao.limit.toString());
    } else {
      // Sem paginação explícita → buscar "todos" para preencher páginas
      params.append('limit', '10000');
      params.append('page', '1');
    }

    const response = await api.get(`/funcionarios?${params}`);
    console.log('[funcionariosService.listar] Response:', response);

    // API returns { success: true, data: [...] }
    // axios interceptor returns response.data, so we get the actual { success, data } object
    let data: Funcionario[] = [];

    if (Array.isArray(response)) {
      data = response;
    } else if (response && typeof response === 'object' && 'data' in response) {
      data = Array.isArray(response.data) ? response.data : [];
    }

    return { data, total: data.length, page: 1 };
  },

  buscarPorId: async (id: string | number): Promise<Funcionario> => {
    const response = await api.get(`/funcionarios/${id}`);
    // API returns { success: true, data: {...} }
    if (response && typeof response === 'object' && 'data' in response) {
      return response.data || {};
    }
    return response || {};
  },

  criar: async (data: FuncionarioCreate): Promise<Funcionario> => {
    const response = await api.post('/funcionarios', data);
    if (response && typeof response === 'object' && 'data' in response) {
      return response.data || {};
    }
    return response || {};
  },

  atualizar: async (id: string | number, data: FuncionarioUpdate): Promise<Funcionario> => {
    const response = await api.put(`/funcionarios/${id}`, data);
    if (response && typeof response === 'object' && 'data' in response) {
      return response.data || {};
    }
    return response || {};
  },

  excluir: async (id: string | number): Promise<void> => {
    return api.delete(`/funcionarios/${id}`);
  },

  importar: async (file: File): Promise<ImportResult> => {
    const formData = new FormData();
    formData.append('file', file);
    return api.post('/funcionarios/import', formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    });
  },

  exportar: async (): Promise<Blob> => {
    return api.get('/funcionarios/export', { responseType: 'blob' });
  },
};

~~~

---
## FILE: worker-airtrust/src/config/allowed-origins.ts
~~~typescript
const DEFAULT_ALLOWED_ORIGINS = [
  'http://localhost:3000',
  'http://127.0.0.1:3000',
  'http://localhost:5173',
  'http://127.0.0.1:5173',
  'http://localhost:4173',
  'http://127.0.0.1:4173',
  'https://airtrust.online',
  'https://www.airtrust.online',
  'https://api.airtrust.online',
  'https://airtrust.pages.dev',
  'https://production.airtrust.pages.dev',
] as const;

export const ALLOWED_ORIGINS = [...DEFAULT_ALLOWED_ORIGINS];
export const DEFAULT_ALLOWED_ORIGIN = DEFAULT_ALLOWED_ORIGINS[0];

function parseEnvAllowedOrigins(corsOrigins?: string | null): string[] {
  if (!corsOrigins) return [];

  return corsOrigins
    .split(',')
    .map((item) => item.trim())
    .filter((item) => item.length > 0 && item !== '*');
}

export function resolveAllowedOrigin(origin?: string | null, corsOrigins?: string | null): string {
  if (!origin) return DEFAULT_ALLOWED_ORIGIN;

  const runtimeAllowedOrigins = parseEnvAllowedOrigins(corsOrigins);

  if ((ALLOWED_ORIGINS as string[]).includes(origin)) return origin;

  if (runtimeAllowedOrigins.includes(origin)) return origin;

  if (/^https:\/\/[a-z0-9-]+\.airtrust\.pages\.dev$/i.test(origin)) return origin;

  return DEFAULT_ALLOWED_ORIGIN;
}

~~~

---
## FILE: worker-airtrust/src/middleware/auth.ts
~~~typescript
/**
 * AUTH MIDDLEWARE - JWT Authentication
 *
 * Middleware de autenticação via JWT
 * PREPARADO MAS DESABILITADO por padrão
 *
 * Para habilitar:
 * - Descomentar uso no index.ts ou em rotas específicas
 * - Garantir que JWT_SECRET está configurado
 * - Implementar endpoint de login que gera tokens
 */

import type { MiddlewareHandler } from 'hono';
import type { Env, Variables, JwtPayload } from '../types';
import { extractBearerToken, verifyJWT } from '../utils/security';
import { getUsuariosSchema, hasUsuariosEmpresasTable } from '../utils/db-schema';
import { unauthorized } from './error-handler';

const USUARIOS_TABLE_SQL =
  "SELECT 1 as found FROM sqlite_master WHERE type = 'table' AND name = 'usuarios' LIMIT 1";

function isDevAuthBypassEnabled(env: Env): boolean {
  return env.ENVIRONMENT === 'development' && env.ENABLE_DEV_AUTH_BYPASS === 'true';
}

async function hasTable(db: D1Database, sql: string): Promise<boolean> {
  const result = await db.prepare(sql).first<{ found: number }>();
  return Boolean(result?.found);
}

async function resolveDevEmpresaId(db: D1Database, userId: number): Promise<number | null> {
  const usuariosEmpresasExists = await hasUsuariosEmpresasTable(db);

  if (usuariosEmpresasExists) {
    const primaryEmpresa = await db
      .prepare(
        `
        SELECT ue.empresa_id
        FROM usuarios_empresas ue
        INNER JOIN empresas e ON e.id = ue.empresa_id
        WHERE ue.usuario_id = ?
          AND e.deleted_at IS NULL
          AND e.ativo = 1
        ORDER BY
          CASE WHEN ue.is_primary = 1 THEN 0 ELSE 1 END,
          ue.empresa_id ASC
        LIMIT 1
      `,
      )
      .bind(userId)
      .first<{ empresa_id: number }>();

    if (primaryEmpresa?.empresa_id) {
      return primaryEmpresa.empresa_id;
    }
  }

  const usuariosExists = await hasTable(db, USUARIOS_TABLE_SQL);

  if (usuariosExists) {
    const fallbackEmpresa = await db
      .prepare(
        `
        SELECT COALESCE(f.empresa_id, e.id) AS empresa_id
        FROM usuarios u
        LEFT JOIN funcionarios f ON f.id = u.funcionario_id AND f.deleted_at IS NULL
        LEFT JOIN empresas e ON e.deleted_at IS NULL AND e.ativo = 1
        WHERE u.id = ?
          AND u.deleted_at IS NULL
        ORDER BY
          CASE
            WHEN e.codigo = 'airtrust' THEN 0
            ELSE 1
          END,
          COALESCE(f.empresa_id, e.id) ASC
        LIMIT 1
      `,
      )
      .bind(userId)
      .first<{ empresa_id: number }>();

    if (fallbackEmpresa?.empresa_id) {
      return fallbackEmpresa.empresa_id;
    }
  }

  const empresaAtiva = await db
    .prepare(
      `
      SELECT e.id AS empresa_id
      FROM empresas e
      WHERE e.deleted_at IS NULL
        AND e.ativo = 1
      ORDER BY
        CASE
          WHEN e.codigo = 'airtrust' THEN 0
          ELSE 1
        END,
        e.id ASC
      LIMIT 1
    `,
    )
    .first<{ empresa_id: number }>();

  return empresaAtiva?.empresa_id ?? null;
}

type DevBypassIdentity = {
  userId: number;
  email: string;
  role: string;
  empresaId: number;
  funcionarioId: number | null;
};

async function resolveDevBypassIdentity(db: D1Database): Promise<DevBypassIdentity | null> {
  const usuariosEmpresasExists = await hasUsuariosEmpresasTable(db);
  const { activeWhere } = await getUsuariosSchema(db);

  if (usuariosEmpresasExists) {
    const linkedUser = await db
      .prepare(
        `
        SELECT
          u.id AS user_id,
          u.email AS email,
          u.perfil AS role,
          u.funcionario_id AS funcionario_id,
          ue.empresa_id AS empresa_id
        FROM usuarios u
        INNER JOIN usuarios_empresas ue ON ue.usuario_id = u.id
        INNER JOIN empresas e ON e.id = ue.empresa_id
        WHERE u.deleted_at IS NULL
          ${activeWhere}
          AND e.deleted_at IS NULL
          AND e.ativo = 1
        ORDER BY
          CASE
            WHEN LOWER(u.perfil) IN ('admin', 'administrador') THEN 0
            WHEN LOWER(u.perfil) IN ('gestor', 'manager') THEN 1
            ELSE 2
          END,
          CASE WHEN ue.is_primary = 1 THEN 0 ELSE 1 END,
          u.id ASC
        LIMIT 1
      `,
      )
      .first<{
        user_id: number;
        email: string;
        role: string;
        funcionario_id: number | null;
        empresa_id: number;
      }>();

    if (linkedUser?.user_id && linkedUser.empresa_id) {
      return {
        userId: linkedUser.user_id,
        email: linkedUser.email,
        role: linkedUser.role,
        empresaId: linkedUser.empresa_id,
        funcionarioId: linkedUser.funcionario_id ?? null,
      };
    }
  }

  const fallbackEmpresaId = await resolveDevEmpresaId(db, 1);
  if (!fallbackEmpresaId) {
    return null;
  }

  return {
    userId: 1,
    email: 'dev@airtrust.local',
    role: 'ADMIN',
    empresaId: fallbackEmpresaId,
    funcionarioId: 1,
  };
}

/**
 * Middleware de autenticação JWT
 * Verifica token no header Authorization
 * Adiciona userId ao contexto se válido
 *
 * @example
 * ```typescript
 * // Proteger uma rota específica:
 * app.get('/api/protected', auth(), async (c) => {
 *   const userId = c.get('userId');
 *   return c.json({ userId });
 * });
 * ```
 */
export function auth(): MiddlewareHandler<{ Bindings: Env }> {
  const handler: MiddlewareHandler<{ Bindings: Env; Variables: Variables }> = async (c, next) => {
    if (c.env.ENVIRONMENT !== 'development' && c.env.ENABLE_DEV_AUTH_BYPASS === 'true') {
      throw new Error('ENABLE_DEV_AUTH_BYPASS nao pode ser usado fora de development');
    }

    const devBypass = isDevAuthBypassEnabled(c.env);

    if (devBypass) {
      console.log('[AUTH] 🔓 DEV_AUTH_BYPASS ativo — autenticação desabilitada (apenas dev)');
      const db = c.env.DB;
      const identity = await resolveDevBypassIdentity(db);

      if (!identity) {
        return unauthorized(
          'DEV_AUTH_BYPASS ativo, mas nenhum usuário de desenvolvimento com empresa ativa foi encontrado',
          'DEV_BYPASS_USER_NOT_FOUND',
        );
      }

      c.set('userId', identity.userId);
      c.set('empresaId', identity.empresaId);
      c.set('userEmail', identity.email);
      c.set('userRole', identity.role);
      c.set('funcionarioId', identity.funcionarioId);
      return next();
    }

    // ===================== AUTENTICAÇÃO JWT REAL =====================
    const authHeader = c.req.header('Authorization');

    if (!authHeader) {
      return unauthorized('Token de autenticação não fornecido', 'MISSING_TOKEN');
    }

    const token = extractBearerToken(authHeader);

    if (!token) {
      return unauthorized('Formato de token inválido. Use: Bearer <token>', 'INVALID_FORMAT');
    }

    const jwtSecret = c.env.JWT_SECRET;

    if (!jwtSecret) {
      console.error('[AUTH] JWT_SECRET não configurado!');
      throw new Error('Configuração de autenticação inválida');
    }

    let payload: JwtPayload | null = null;
    try {
      payload = await verifyJWT(token, jwtSecret);
    } catch (e) {
      console.warn('[AUTH VERIFY ERROR]', (e as Error).message);
      return unauthorized('Token inválido ou expirado', 'INVALID_TOKEN');
    }

    if (!payload) {
      return unauthorized('Token inválido ou expirado', 'INVALID_TOKEN');
    }

    if (payload.token_type && payload.token_type !== 'access') {
      return unauthorized('Tipo de token inválido para esta rota', 'INVALID_TOKEN_TYPE');
    }

    // Verificar se o JTI está na blocklist (token invalidado via logout)
    if (payload.jti) {
      try {
        const blocked = await c.env.DB.prepare(
          `SELECT 1 FROM token_blocklist WHERE jti = ? AND expires_at > datetime('now') LIMIT 1`,
        )
          .bind(payload.jti)
          .first();
        if (blocked) {
          return unauthorized('Token revogado. Faça login novamente.', 'TOKEN_REVOKED');
        }
      } catch {
        // Se a tabela não existir ainda (migration pendente), não bloquear
      }
    }

    c.set('userId', payload.sub);
    c.set('empresaId', payload.empresa_id ?? 0);
    c.set('userEmail', payload.email);
    c.set('userRole', payload.role ?? '');
    c.set('funcionarioId', payload.funcionario_id ?? null);

    await next();
  };
  return handler as unknown as MiddlewareHandler<{ Bindings: Env }>;
}

/**
 * Middleware de autenticação opcional
 * Não bloqueia se token não estiver presente
 * Mas se estiver, valida e adiciona userId ao contexto
 */
export function optionalAuth(): MiddlewareHandler<{ Bindings: Env }> {
  const handler: MiddlewareHandler<{ Bindings: Env; Variables: Variables }> = async (c, next) => {
    if (c.env.ENVIRONMENT !== 'development' && c.env.ENABLE_DEV_AUTH_BYPASS === 'true') {
      throw new Error('ENABLE_DEV_AUTH_BYPASS nao pode ser usado fora de development');
    }

    const devBypass = isDevAuthBypassEnabled(c.env);

    if (devBypass) {
      const db = c.env.DB;
      const identity = await resolveDevBypassIdentity(db);

      if (identity) {
        c.set('userId', identity.userId);
        c.set('empresaId', identity.empresaId);
        c.set('userEmail', identity.email);
        c.set('userRole', identity.role);
        c.set('funcionarioId', identity.funcionarioId);
      }
      return next();
    }

    // Token opcional: não bloqueia, mas valida se presente
    const authHeader = c.req.header('Authorization');
    if (authHeader) {
      const token = extractBearerToken(authHeader);
      if (token && c.env.JWT_SECRET) {
        try {
          const payload = await verifyJWT(token, c.env.JWT_SECRET);
          if (payload) {
            // Token opcional também deve respeitar blocklist para evitar sessão "fantasma"
            // após logout/revogação em rotas que aceitam autenticação opcional.
            if (payload.jti) {
              try {
                const blocked = await c.env.DB.prepare(
                  `SELECT 1 FROM token_blocklist WHERE jti = ? AND expires_at > datetime('now') LIMIT 1`,
                )
                  .bind(payload.jti)
                  .first();
                if (blocked) {
                  await next();
                  return;
                }
              } catch {
                // Se a tabela não existir ainda (migration pendente), mantém comportamento tolerante.
              }
            }

            c.set('userId', payload.sub);
            c.set('empresaId', payload.empresa_id ?? 0);
            c.set('userEmail', payload.email);
            c.set('userRole', payload.role ?? '');
            c.set('funcionarioId', payload.funcionario_id ?? null);
          }
        } catch (e) {
          console.warn('[OPTIONAL_AUTH] Token inválido:', (e as Error).message);
        }
      }
    }
    await next();
  };
  return handler as unknown as MiddlewareHandler<{ Bindings: Env }>;
}

/**
 * Role-based middleware - verifica se usuário tem role específico
 * @example
 * app.post('/admin', auth(), requireRole('admin'), handler);
 */
export function requireRole(requiredRole: string): MiddlewareHandler<{ Bindings: Env }> {
  const handler: MiddlewareHandler<{ Bindings: Env; Variables: Variables }> = async (c, next) => {
    if (c.env.ENVIRONMENT !== 'development' && c.env.ENABLE_DEV_AUTH_BYPASS === 'true') {
      throw new Error('ENABLE_DEV_AUTH_BYPASS nao pode ser usado fora de development');
    }

    const devBypass = isDevAuthBypassEnabled(c.env);

    if (devBypass) {
      return next();
    }

    const userRole = c.get('userRole');

    if (!userRole) {
      return unauthorized('Usuário não autenticado');
    }

    if (userRole !== requiredRole && userRole !== 'ADMIN') {
      return unauthorized(`Acesso negado. Requer role: ${requiredRole}`);
    }

    await next();
  };
  return handler as unknown as MiddlewareHandler<{ Bindings: Env }>;
}

~~~

---
## FILE: worker-airtrust/src/middleware/cache.ts
~~~typescript
/**
 * CACHE CONTROL MIDDLEWARE
 *
 * Configura headers de cache apropriados para cada tipo de conteúdo
 * Evita cache agressivo em HTML e permite cache otimizado em assets
 */

import type { MiddlewareHandler } from 'hono';
import type { Env } from '../types';

/**
 * Middleware de controle de cache
 *
 * Estratégias:
 * - HTML: no-cache (sempre buscar versão mais recente)
 * - JSON/API: cache de 5 minutos (performance)
 * - Assets estáticos: cache de 1 ano com immutable (fingerprinted)
 */
export function cacheControl(): MiddlewareHandler<{ Bindings: Env }> {
  return async (c, next) => {
    await next();

    const contentType = c.res.headers.get('Content-Type') || '';
    const path = c.req.path;

    const isAuthenticatedLmsAsset =
      path.startsWith('/api/lms/scorm/assets/') ||
      path.startsWith('/api/lms/scorm/assets-by-curso/') ||
      path.startsWith('/api/lms/h5p/assets/');

    if (isAuthenticatedLmsAsset) {
      c.header('Cache-Control', 'no-store, no-cache, must-revalidate, max-age=0, s-maxage=0');
      c.header('Pragma', 'no-cache');
      c.header('Expires', '0');
      return;
    }

    // 1. HTML (SPA) - NUNCA cachear
    // Garante que usuários sempre vejam a versão mais recente
    if (contentType.includes('text/html')) {
      c.header('Cache-Control', 'no-cache, no-store, must-revalidate');
      c.header('Pragma', 'no-cache');
      c.header('Expires', '0');
      return;
    }

    // 2. JSON/API - Cache curto (5 minutos)
    // Balance entre performance e atualização de dados
    if (contentType.includes('application/json')) {
      // 🚫 Respeitar Cache-Control já definido no endpoint
      const existingCache = c.res.headers.get('Cache-Control');
      if (!existingCache || existingCache === '') {
        c.header('Cache-Control', 'public, max-age=300, s-maxage=300');
        c.header('Vary', 'Authorization'); // Cache separado por usuário
      }
      return;
    }

    // 3. Assets estáticos com hash - Cache longo (1 ano)
    // Vite gera hashes nos filenames, podem ser cacheados indefinidamente
    if (path.match(/\.(js|css|png|jpg|jpeg|gif|svg|woff|woff2|ttf|eot|ico)$/)) {
      // Se tiver hash no nome do arquivo (ex: index-abc123.js)
      if (path.match(/-[a-f0-9]{8,}\./)) {
        c.header('Cache-Control', 'public, max-age=31536000, immutable');
      } else {
        // Sem hash, cache mais curto (1 dia)
        c.header('Cache-Control', 'public, max-age=86400');
      }
      return;
    }

    // 4. Padrão - Cache moderado (1 hora)
    c.header('Cache-Control', 'public, max-age=3600');
  };
}

~~~

---
## FILE: worker-airtrust/src/middleware/cors.ts
~~~typescript
/**
 * CORS MIDDLEWARE - Cross-Origin Resource Sharing
 *
 * Configura CORS para permitir requisições do frontend
 * Origens permitidas são parametrizadas via ENV
 */

import type { MiddlewareHandler } from 'hono';
import type { Env } from '../types';
import { resolveAllowedOrigin } from '../config/allowed-origins';

/**
 * Middleware CORS simples - apenas adiciona headers CORS sem validação
 * Resolve problemas com wildcards e configurações complexas
 */
export function cors(): MiddlewareHandler<{ Bindings: Env }> {
  return async (c, next) => {
    // Pegar a origem da requisição
    const origin = c.req.header('Origin');

    const resolvedOrigin = resolveAllowedOrigin(origin, c.env.CORS_ORIGINS);

    // Adicionar headers CORS
    c.header('Access-Control-Allow-Origin', resolvedOrigin);
    c.header('Vary', 'Origin');
    c.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, PATCH, OPTIONS');
    c.header(
      'Access-Control-Allow-Headers',
      'Content-Type, Authorization, X-Requested-With, Accept, Origin, Cache-Control, Pragma, Expires, X-Dev-Auth-Bypass, X-AirTrust-Bypass-Cache, X-EdApp-Secret',
    );
    c.header('Access-Control-Max-Age', '86400');
    c.header('Access-Control-Allow-Credentials', 'true');

    // Se for preflight (OPTIONS), responder imediatamente
    if (c.req.method === 'OPTIONS') {
      c.status(204);
      return c.body(null);
    }

    // Continuar com outras rotas
    return next();
  };
}

~~~

---
## FILE: worker-airtrust/src/middleware/domainEventProcessor.ts
~~~typescript
import type { Context, Next } from 'hono';
import { processarEventosParaModulo } from '../shared/handlers';

const ROTA_MODULO: Record<string, string> = {
  '/api/escalas': 'escalas',
  '/api/qualificacoes': 'qualificacoes',
  '/api/simuladores': 'simuladores',
  '/api/frms': 'frms',
  '/api/hospedagem': 'hospedagem',
  '/api/pasta-virtual': 'pasta_virtual',
  '/api/funcionarios': 'funcionarios',
  '/api/compliance': 'compliance',
};

function getEmpresaIdSafe(c: Context<any>): string | undefined {
  const direct = c.get('empresaId' as never);
  if (direct !== undefined && direct !== null && direct !== '') return String(direct);

  const user = c.get('user' as never) as { empresa_id?: string | number } | undefined;
  if (user?.empresa_id !== undefined && user?.empresa_id !== null) return String(user.empresa_id);

  const queryEmpresaId = c.req.query('empresa_id');
  return queryEmpresaId || undefined;
}

export function domainEventProcessorMiddleware() {
  return async (c: Context<any>, next: Next) => {
    const path = c.req.path;
    const modulo = Object.entries(ROTA_MODULO).find(([rota]) => path.startsWith(rota))?.[1];

    await next();

    if (!modulo || c.req.method === 'GET' || path.includes('/health')) {
      return;
    }

    try {
      const empresaId = getEmpresaIdSafe(c);
      if (empresaId) {
        c.executionCtx?.waitUntil(
          processarEventosParaModulo(c.env.DB, empresaId, modulo).then((resultado) => {
            if (resultado.processados > 0 || resultado.erros > 0) {
              console.log(
                `[EventProcessor] ${modulo}: ${resultado.processados} OK, ${resultado.erros} ERR`,
              );
            }
          }),
        );
      }
    } catch {
      // Nunca bloquear a resposta principal.
    }
  };
}

~~~

---
## FILE: worker-airtrust/src/middleware/error-handler.ts
~~~typescript
/**
 * ERROR HANDLER MIDDLEWARE - Global Error Handling
 *
 * Captura erros não tratados e retorna resposta JSON padronizada
 * Previne vazamento de informações sensíveis em produção
 */

import type { ErrorHandler } from 'hono';

/**
 * Classe de erro customizada para API
 * Permite definir status code e mensagem específica
 */
export class ApiError extends Error {
  constructor(
    public message: string,
    public statusCode: number = 500,
    public code?: string,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

/**
 * Error handler global para o Worker
 * Captura todos os erros não tratados e retorna JSON
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const errorHandler: ErrorHandler<any> = (err, c) => {
  console.error('[ERROR]', {
    error: err.message,
    stack: err.stack,
    path: c.req.path,
    method: c.req.method,
  });

  // Se for ApiError, usar statusCode definido
  if (err instanceof ApiError) {
    return c.json(
      {
        success: false,
        error: err.message,
        code: err.code,
      },
      err.statusCode as 400 | 401 | 403 | 404 | 500,
    );
  }

  // Se for AppError (de utils/errors), usar status definido
  // Verificar por propriedades (o nome pode variar após transpile/minify)
  if ('status' in err && typeof (err as any).status === 'number') {
    const appErr = err as { message: string; status: number; code?: string };
    return c.json(
      {
        success: false,
        error: appErr.message,
        code: appErr.code,
      },
      appErr.status as 400 | 401 | 403 | 404 | 500,
    );
  }

  // Detectar ambiente via binding (NUNCA via header — isso exporia stack traces a qualquer request)
  const isDevelopment = c.env?.ENVIRONMENT === 'development' || c.env?.ENVIRONMENT === 'staging';

  // Em produção: nunca expor stack traces
  if (isDevelopment) {
    return c.json(
      {
        success: false,
        error: err.message,
        errorName: err.name,
        stack: err.stack,
        path: c.req.path,
        method: c.req.method,
      },
      500,
    );
  }

  // Produção: resposta segura sem detalhes internos
  return c.json(
    {
      success: false,
      error: 'Erro interno do servidor',
      code: 'INTERNAL_ERROR',
      requestId: crypto.randomUUID(),
    },
    500,
  );
};

/**
 * Helper para lançar erro 400 (Bad Request)
 */
export function badRequest(message: string, code?: string): never {
  throw new ApiError(message, 400, code);
}

/**
 * Helper para lançar erro 401 (Unauthorized)
 */
export function unauthorized(message: string = 'Não autorizado', code?: string): never {
  throw new ApiError(message, 401, code);
}

/**
 * Helper para lançar erro 403 (Forbidden)
 */
export function forbidden(message: string = 'Acesso negado', code?: string): never {
  throw new ApiError(message, 403, code);
}

/**
 * Helper para lançar erro 404 (Not Found)
 */
export function notFound(message: string = 'Recurso não encontrado', code?: string): never {
  throw new ApiError(message, 404, code);
}

/**
 * Helper para lançar erro 500 (Internal Server Error)
 */
export function internalError(message: string = 'Erro interno', code?: string): never {
  throw new ApiError(message, 500, code);
}

~~~

---
## FILE: worker-airtrust/src/middleware/no-cache.ts
~~~typescript
/**
 * NO-CACHE MIDDLEWARE
 *
 * Desabilita COMPLETAMENTE o cache do Cloudflare para garantir
 * que mudanças no código apareçam IMEDIATAMENTE em staging.
 *
 * Usado apenas em ambiente staging/development.
 * Produção usa cache normal do Cloudflare para performance.
 */

import { MiddlewareHandler } from 'hono';

export function noCacheMiddleware(): MiddlewareHandler {
  return async (c, next) => {
    // Headers agressivos de no-cache (CF ignora cache completamente)
    c.header('Cache-Control', 'no-store, no-cache, must-revalidate, max-age=0, s-maxage=0');
    c.header('Pragma', 'no-cache');
    c.header('Expires', '0');
    c.header('Surrogate-Control', 'no-store');
    c.header('CDN-Cache-Control', 'no-store');
    c.header('Cloudflare-CDN-Cache-Control', 'no-store');

    // CORS headers delegados ao cors middleware — não adicionar wildcard aqui

    return next();
  };
}

~~~

---
## FILE: worker-airtrust/src/middleware/processarEventos.ts
~~~typescript
import type { Context, Next } from 'hono';
import type { Env } from '../types';
import { processarEventosParaModulo } from '../shared/handlers';
import { getEmpresaIdOptional } from '../routes/escalas-shared';

export function processarEventosMiddleware() {
  return async (c: Context<{ Bindings: Env }>, next: Next) => {
    if (
      c.req.path.startsWith('/api/escalas') &&
      !c.req.path.endsWith('/health') &&
      c.req.method !== 'OPTIONS'
    ) {
      try {
        const empresaId = getEmpresaIdOptional(c);
        if (empresaId) {
          c.executionCtx.waitUntil(
            processarEventosParaModulo(c.env.DB, String(empresaId), 'escalas'),
          );
        }
      } catch {
        // Nunca bloquear a request principal por falha de processamento assíncrono.
      }
    }

    await next();
  };
}

~~~

---
## FILE: worker-airtrust/src/middleware/rate-limit.ts
~~~typescript
/**
 * RATE LIMITING MIDDLEWARE — Distributed via D1
 *
 * Usa Cloudflare D1 para estado compartilhado entre todas as instâncias
 * do worker, garantindo que os limites sejam respeitados globalmente.
 *
 * Tabela: rate_limit_store (criada na migration 0289)
 *   key TEXT PRIMARY KEY, count INTEGER, reset_at TEXT
 *
 * Fallback in-memory para ambientes sem DB disponível.
 */

import type { MiddlewareHandler } from 'hono';
import type { Env } from '../types';

export interface RateLimitConfig {
  maxRequests: number;
  windowSeconds: number;
  keyPrefix: string;
  keyExtractor?: (c: Parameters<MiddlewareHandler<{ Bindings: Env }>>[0]) => string;
}

// ===== IN-MEMORY FALLBACK (usado apenas em testes/dev sem DB) =====
interface RateLimitEntry {
  count: number;
  resetAt: number;
}
const inMemoryStore = new Map<string, RateLimitEntry>();

function maybeCleanupInMemory() {
  if (Math.random() < 0.01) {
    const now = Date.now();
    for (const [key, entry] of inMemoryStore.entries()) {
      if (now > entry.resetAt) inMemoryStore.delete(key);
    }
  }
}

// ===== D1-BACKED RATE LIMITER =====

async function getRateLimitCountD1(
  db: D1Database,
  key: string,
  windowSeconds: number,
): Promise<number> {
  const now = new Date().toISOString();

  // Limpeza probabilística: 2% das requisições purga entradas expiradas
  if (Math.random() < 0.02) {
    db.prepare(`DELETE FROM rate_limit_store WHERE reset_at < ?`).bind(now).run().catch(() => {});
  }

  const result = await db
    .prepare(
      `INSERT INTO rate_limit_store (key, count, reset_at)
       VALUES (?, 1, datetime('now', '+' || ? || ' seconds'))
       ON CONFLICT(key) DO UPDATE SET
         count = CASE
           WHEN reset_at < datetime('now') THEN 1
           ELSE count + 1
         END,
         reset_at = CASE
           WHEN reset_at < datetime('now') THEN datetime('now', '+' || ? || ' seconds')
           ELSE reset_at
         END
       RETURNING count, reset_at`,
    )
    .bind(key, String(windowSeconds), String(windowSeconds))
    .first<{ count: number; reset_at: string }>();

  return result?.count ?? 1;
}

/**
 * Middleware de Rate Limiting (distribuído via D1)
 *
 * @example
 * app.post('/api/auth/login', rateLimiter({ maxRequests: 10, windowSeconds: 60, keyPrefix: 'login' }));
 */
export function rateLimiter(config: RateLimitConfig): MiddlewareHandler<{ Bindings: Env }> {
  const { maxRequests, windowSeconds, keyPrefix, keyExtractor } = config;

  return async (c, next) => {
    if (c.req.method === 'OPTIONS') return next();

    const identifier = keyExtractor
      ? keyExtractor(c)
      : c.req.header('CF-Connecting-IP') ||
        c.req.header('X-Forwarded-For')?.split(',')[0]?.trim() ||
        'unknown';

    const key = `${keyPrefix}:${identifier}`;
    let count = 1;

    try {
      const db = c.env?.DB;
      if (db) {
        count = await getRateLimitCountD1(db, key, windowSeconds);
      } else {
        // Fallback in-memory
        maybeCleanupInMemory();
        const now = Date.now();
        let entry = inMemoryStore.get(key);
        if (!entry || now > entry.resetAt) {
          entry = { count: 1, resetAt: now + windowSeconds * 1000 };
          inMemoryStore.set(key, entry);
        } else {
          entry.count++;
        }
        count = entry.count;
      }
    } catch {
      // Se D1 falhar, não bloquear a requisição — rate limit best-effort
      count = 0;
    }

    const remaining = Math.max(0, maxRequests - count);
    c.header('X-RateLimit-Limit', String(maxRequests));
    c.header('X-RateLimit-Remaining', String(remaining));

    if (count > maxRequests) {
      c.header('Retry-After', String(windowSeconds));
      return c.json(
        {
          success: false,
          error: 'Muitas requisições. Tente novamente em alguns segundos.',
          code: 'RATE_LIMIT_EXCEEDED',
          retryAfter: windowSeconds,
        },
        429,
      );
    }

    return next();
  };
}

export const rateLimitPresets = {
  login:   { maxRequests: 10,  windowSeconds: 60,  keyPrefix: 'login' },
  api:     { maxRequests: 100, windowSeconds: 60,  keyPrefix: 'api' },
  webhook: { maxRequests: 30,  windowSeconds: 60,  keyPrefix: 'webhook' },
  upload:  { maxRequests: 10,  windowSeconds: 60,  keyPrefix: 'upload' },
  export:  { maxRequests: 5,   windowSeconds: 60,  keyPrefix: 'export' },
} as const;

~~~

---
## FILE: worker-airtrust/src/middleware/rbac.ts
~~~typescript
/**
 * RBAC MIDDLEWARE - Role-Based Access Control
 * Controla acesso às rotas por papel (role)
 */

import type { Context, MiddlewareHandler } from 'hono';
import type { Env } from '../types';
import { forbidden } from './error-handler';

function isDevAuthBypassEnabled(env: Env): boolean {
  return env.ENVIRONMENT === 'development' && env.ENABLE_DEV_AUTH_BYPASS === 'true';
}

export type UserRole = 'admin' | 'manager' | 'user';

/**
 * Normaliza role do banco (PT-BR) para o padrão RBAC:
 *   ADMIN/admin → admin
 *   GESTOR/gestor/manager → manager
 *   USUARIO/usuario/user  → user
 */
function normalizeRole(raw: string | undefined): UserRole | undefined {
  if (!raw) return undefined;
  const r = raw.toLowerCase().trim();
  if (r === 'admin' || r === 'administrador') return 'admin';
  if (r === 'gestor' || r === 'manager') return 'manager';
  if (r === 'instrutor' || r === 'instructor') return 'manager'; // instrutor has manager-level access for routes
  if (r === 'usuario' || r === 'user' || r === 'aluno' || r === 'student') return 'user';
  return r as UserRole;
}

/**
 * Middleware para exigir role específica
 *
 * @param roles Lista de roles permitidas
 * @returns Middleware handler
 *
 * @example
 * ```typescript
 * // Apenas admin pode deletar funcionários
 * app.delete('/api/funcionarios/:id', auth(), requireRole('admin'), handlerDelete);
 *
 * // Admin e manager podem criar funcionários
 * app.post('/api/funcionarios', auth(), requireRole('admin', 'manager'), handlerCreate);
 * ```
 */
export function requireRole(...roles: UserRole[]): MiddlewareHandler<{ Bindings: Env }> {
  return async (c, next) => {
    const devBypassEnabled = isDevAuthBypassEnabled(c.env);

    if (devBypassEnabled) {
      console.log('[RBAC] 🔓 DEV_AUTH_BYPASS enabled - skipping role check');
      await next();
      return;
    }

    const userRole = normalizeRole((c.get as (key: string) => string | undefined)('userRole'));

    if (!userRole) {
      throw forbidden('Usuário não autenticado', 'NOT_AUTHENTICATED');
    }

    if (!roles.includes(userRole)) {
      console.warn(
        `[RBAC] Access denied: user role "${userRole}" not in allowed roles [${roles.join(', ')}]`,
      );

      throw forbidden(`Permissão negada. Acesso restrito a: ${roles.join(', ')}`, 'RBAC_FORBIDDEN');
    }

    await next();
  };
}

/**
 * Helper: verificar se usuário tem role específica
 *
 * @param c Context do Hono
 * @param roles Roles permitidas
 * @returns true se usuário tem uma das roles
 */
export function hasRole(c: Context<{ Bindings: Env }>, ...roles: UserRole[]): boolean {
  const userRole = normalizeRole((c.get as (key: string) => string | undefined)('userRole'));
  return !!userRole && roles.includes(userRole);
}

~~~

---
## FILE: worker-airtrust/src/middleware/requestId.ts
~~~typescript
import { MiddlewareHandler } from 'hono';

export const requestIdMiddleware = (): MiddlewareHandler => {
  return async (c, next) => {
    const requestId = c.req.header('X-Request-ID') || crypto.randomUUID();
    c.set('requestId', requestId);
    c.header('X-Request-ID', requestId);
    return next();
  };
};

~~~

---
## FILE: worker-airtrust/src/middleware/response.ts
~~~typescript
import { AppError } from '../utils/errors';
import { Context } from 'hono';
import type { ContentfulStatusCode } from 'hono/utils/http-status';

interface StandardResponse<T = unknown> {
  success: boolean;
  data?: T;
  error?: string;
  message?: string;
  code?: string;
}

export function jsonOk<T>(c: Context, data: T, message?: string) {
  const body: StandardResponse<T> = { success: true, data };
  if (message) body.message = message;
  return c.json(body, 200);
}

export function jsonError(c: Context, error: string, status = 400, code?: string) {
  const body: StandardResponse = { success: false, error, code };
  return c.json(body, status as ContentfulStatusCode);
}

export function wrap<T>(handler: (c: Context) => Promise<T> | T) {
  return async (c: Context) => {
    try {
      return await handler(c);
    } catch (e) {
      const err = e as Error;
      if (err instanceof AppError) {
        return jsonError(c, err.message, err.status, err.code);
      }
      console.error('[UNCAUGHT]', err.stack || err.message);
      return jsonError(c, 'Erro interno inesperado', 500, 'INTERNAL_ERROR');
    }
  };
}

~~~

---
## FILE: worker-airtrust/src/middleware/tenant.ts
~~~typescript
/**
 * TENANT MIDDLEWARE - Multi-Tenant Isolation
 *
 * Middleware obrigatório para isolamento de dados por empresa.
 * Injeta empresa_id em todas as queries automaticamente.
 *
 * @module middleware/tenant
 */

import type { Context, MiddlewareHandler } from 'hono';
import type { Env, Variables } from '../types';
import { AppError } from '../utils/errors';
import { hasUsuariosEmpresasTable } from '../utils/db-schema';

function isDevAuthBypassEnabled(env: Env): boolean {
  return env.ENVIRONMENT === 'development' && env.ENABLE_DEV_AUTH_BYPASS === 'true';
}

// ============================================
// TIPOS E INTERFACES
// ============================================

export interface TenantContext {
  empresaId: number;
  empresaCodigo: string;
  empresaNome: string;
  role: 'admin' | 'manager' | 'editor' | 'viewer' | 'instructor' | 'student';
  plano: string;
  permissions: string[];
}

// Roles hierarchy para verificação de permissões
const ROLE_HIERARCHY = {
  admin: 100,
  manager: 80,
  instructor: 60,
  editor: 50,
  student: 20,
  viewer: 10,
} as const;

function normalizeTenantRole(role: unknown): TenantContext['role'] {
  switch (
    String(role || '')
      .trim()
      .toLowerCase()
  ) {
    case 'admin':
    case 'administrador':
      return 'admin';
    case 'manager':
    case 'gestor':
    case 'compliance':
      return 'manager';
    case 'editor':
      return 'editor';
    case 'instructor':
      return 'instructor';
    case 'student':
    case 'usuario':
      return 'student';
    case 'viewer':
      return 'viewer';
    default:
      return 'viewer';
  }
}

// ============================================
// MIDDLEWARE PRINCIPAL
// ============================================

/**
 * Middleware de tenant - extrai empresa_id do JWT e injeta no contexto
 *
 * @example
 * ```typescript
 * app.use('/api/*', tenantMiddleware());
 *
 * // Nas rotas:
 * const { empresaId } = getTenantContext(c);
 * db.prepare('SELECT * FROM funcionarios WHERE empresa_id = ?').bind(empresaId);
 * ```
 */
export function tenantMiddleware(): MiddlewareHandler<{ Bindings: Env }> {
  const handler: MiddlewareHandler<{ Bindings: Env; Variables: Variables }> = async (c, next) => {
    const devBypass = isDevAuthBypassEnabled(c.env);

    if (devBypass) {
      const userIdRaw = c.get('userId');
      const userId = typeof userIdRaw === 'string' ? Number(userIdRaw) : (userIdRaw as number);

      const db = c.env.DB;
      const useUsuariosEmpresas = await hasUsuariosEmpresasTable(db);
      const fallbackTenant = useUsuariosEmpresas
        ? await db
            .prepare(
              `
              SELECT
                e.id as empresa_id,
                e.codigo,
                e.nome,
                e.plano,
                ue.role
              FROM empresas e
              JOIN usuarios_empresas ue ON ue.empresa_id = e.id
              WHERE ue.usuario_id = ?
                AND e.ativo = 1
                AND e.deleted_at IS NULL
              ORDER BY
                CASE WHEN ue.is_primary = 1 THEN 0 ELSE 1 END,
                ue.empresa_id ASC
              LIMIT 1
            `,
            )
            .bind(Number.isFinite(userId) ? userId : 1)
            .first<{
              empresa_id: number;
              codigo: string;
              nome: string;
              plano: string;
              role: string;
            }>()
        : await db
            .prepare(
              `
              SELECT
                e.id as empresa_id,
                e.codigo,
                e.nome,
                e.plano,
                'admin' as role
              FROM empresas e
              WHERE e.ativo = 1
                AND e.deleted_at IS NULL
              ORDER BY
                CASE
                  WHEN e.codigo = 'airtrust' THEN 0
                  ELSE 1
                END,
                e.id ASC
              LIMIT 1
            `,
            )
            .first<{
              empresa_id: number;
              codigo: string;
              nome: string;
              plano: string;
              role: string;
            }>();

      if (!fallbackTenant) {
        throw new AppError(
          'DEV_AUTH_BYPASS ativo, mas usuário sem vínculo ativo com empresa',
          403,
          'TENANT_ACCESS_DENIED',
        );
      }

      console.log(
        `[TENANT] 🔓 BYPASS: empresa_id=${fallbackTenant.empresa_id} (${fallbackTenant.codigo})`,
      );

      c.set('tenantContext', {
        empresaId: fallbackTenant.empresa_id,
        empresaCodigo: fallbackTenant.codigo,
        empresaNome: fallbackTenant.nome,
        role: normalizeTenantRole(fallbackTenant.role),
        plano: fallbackTenant.plano,
        permissions: buildPermissions(normalizeTenantRole(fallbackTenant.role)),
      } as TenantContext);

      return next();
    }

    // ========================================================================
    // PRODUÇÃO: Extrair empresa do JWT
    // ========================================================================

    const userId = c.get('userId');
    const empresaIdFromJwt = c.get('empresaId');
    const userRoleFromJwt = c.get('userRole');

    if (!empresaIdFromJwt) {
      throw new AppError('Empresa não identificada no token', 401, 'TENANT_REQUIRED');
    }

    // Buscar dados da empresa e permissões do usuário
    const db = c.env.DB;
    const useUsuariosEmpresas = await hasUsuariosEmpresasTable(db);

    const result = useUsuariosEmpresas
      ? await db
          .prepare(
            `
          SELECT 
            e.id as empresa_id,
            e.codigo,
            e.nome,
            e.plano,
            e.ativo,
            ue.role
          FROM empresas e
          JOIN usuarios_empresas ue ON ue.empresa_id = e.id
          WHERE e.id = ? AND ue.usuario_id = ? AND e.ativo = 1 AND e.deleted_at IS NULL
        `,
          )
          .bind(empresaIdFromJwt, userId)
          .first<{
            empresa_id: number;
            codigo: string;
            nome: string;
            plano: string;
            ativo: number;
            role: string;
          }>()
      : await db
          .prepare(
            `
          SELECT
            e.id as empresa_id,
            e.codigo,
            e.nome,
            e.plano,
            e.ativo,
            ? as role
          FROM empresas e
          WHERE e.id = ? AND e.ativo = 1 AND e.deleted_at IS NULL
        `,
          )
          .bind(normalizeTenantRole(userRoleFromJwt), empresaIdFromJwt)
          .first<{
            empresa_id: number;
            codigo: string;
            nome: string;
            plano: string;
            ativo: number;
            role: string;
          }>();

    if (!result) {
      const userIdNumber = typeof userId === 'string' ? Number(userId) : Number(userId || 0);

      if (userIdNumber === 1) {
        const platformFallbackAtivo = await db
          .prepare(
            `
              SELECT
                e.id as empresa_id,
                e.codigo,
                e.nome,
                e.plano,
                e.ativo,
                'admin' as role
              FROM empresas e
              WHERE e.deleted_at IS NULL
                AND e.ativo = 1
              ORDER BY
                CASE
                  WHEN e.codigo = 'airtrust' THEN 0
                  ELSE 1
                END,
                e.id ASC
              LIMIT 1
            `,
          )
          .first<{
            empresa_id: number;
            codigo: string;
            nome: string;
            plano: string;
            ativo: number;
            role: string;
          }>();

        const platformFallback =
          platformFallbackAtivo ||
          (await db
            .prepare(
              `
                SELECT
                  e.id as empresa_id,
                  e.codigo,
                  e.nome,
                  e.plano,
                  e.ativo,
                  'admin' as role
                FROM empresas e
                WHERE e.deleted_at IS NULL
                ORDER BY
                  CASE
                    WHEN e.codigo = 'airtrust' THEN 0
                    ELSE 1
                  END,
                  e.id ASC
                LIMIT 1
              `,
            )
            .first<{
              empresa_id: number;
              codigo: string;
              nome: string;
              plano: string;
              ativo: number;
              role: string;
            }>());

        if (platformFallback) {
          const tenantContext: TenantContext = {
            empresaId: platformFallback.empresa_id,
            empresaCodigo: platformFallback.codigo,
            empresaNome: platformFallback.nome,
            role: 'admin',
            plano: platformFallback.plano,
            permissions: buildPermissions('admin'),
          };

          c.set('tenantContext', tenantContext);
          console.log(
            `[TENANT] platform fallback empresa=${platformFallback.codigo} user=${userIdNumber}`,
          );

          return next();
        }
      }

      throw new AppError(
        'Acesso negado: usuário não pertence a esta empresa ou empresa inativa',
        403,
        'TENANT_ACCESS_DENIED',
      );
    }

    // Construir contexto do tenant
    const tenantContext: TenantContext = {
      empresaId: result.empresa_id,
      empresaCodigo: result.codigo,
      empresaNome: result.nome,
      role: normalizeTenantRole(result.role),
      plano: result.plano,
      permissions: buildPermissions(normalizeTenantRole(result.role)),
    };

    c.set('tenantContext', tenantContext);

    // Log para auditoria (resumido)
    console.log(`[TENANT] empresa=${result.codigo} user=${userId} role=${result.role}`);

    return next();
  };
  return handler as unknown as MiddlewareHandler<{ Bindings: Env }>;
}

// ============================================
// HELPERS
// ============================================

/**
 * Extrai contexto do tenant do contexto da requisição
 * @throws AppError se tenant não estiver configurado
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function getTenantContext(c: Context<any>): TenantContext {
  const ctx = c.get('tenantContext') as TenantContext | undefined;

  if (!ctx) {
    throw new AppError('Contexto de tenant não encontrado', 500, 'TENANT_NOT_CONFIGURED');
  }

  return ctx;
}

/**
 * Extrai apenas o empresa_id (atalho comum)
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function getEmpresaId(c: Context<any>): number {
  return getTenantContext(c).empresaId;
}

/**
 * Verifica se usuário tem permissão mínima
 * @example checkPermission(c, 'editor') // true se editor, manager ou admin
 */
export function checkPermission(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  c: Context<any>,
  minimumRole: keyof typeof ROLE_HIERARCHY,
): boolean {
  const ctx = getTenantContext(c);
  return ROLE_HIERARCHY[ctx.role] >= ROLE_HIERARCHY[minimumRole];
}

/**
 * Middleware que exige role mínimo
 * @example app.delete('/item/:id', requireTenantRole('manager'), handler);
 */
export function requireTenantRole(
  minimumRole: keyof typeof ROLE_HIERARCHY,
): MiddlewareHandler<{ Bindings: Env }> {
  const handler: MiddlewareHandler<{ Bindings: Env; Variables: Variables }> = async (c, next) => {
    if (!checkPermission(c, minimumRole)) {
      throw new AppError(
        `Permissão insuficiente. Requer: ${minimumRole}`,
        403,
        'INSUFFICIENT_PERMISSIONS',
      );
    }
    return next();
  };
  return handler as unknown as MiddlewareHandler<{ Bindings: Env }>;
}

/**
 * Constrói lista de permissões baseado no role
 */
function buildPermissions(role: string): string[] {
  const basePermissions = ['read'];

  switch (role) {
    case 'admin':
      return ['*']; // Todas as permissões
    case 'manager':
      return [...basePermissions, 'write', 'delete', 'export', 'reports', 'manage_users'];
    case 'instructor':
      return [...basePermissions, 'simulator_write', 'sign_sheets', 'view_students'];
    case 'editor':
      return [...basePermissions, 'write'];
    case 'student':
      return [...basePermissions, 'sign_self_sheets', 'view_self'];
    case 'viewer':
    default:
      return basePermissions;
  }
}

// ============================================
// SQL HELPERS - Para usar nos services
// ============================================

/**
 * Adiciona filtro de empresa a uma query SQL
 * @example
 * const sql = withTenantFilter('SELECT * FROM funcionarios', empresaId);
 * // "SELECT * FROM funcionarios WHERE empresa_id = 1"
 */
export function withTenantFilter(baseSql: string, empresaId: number, alias?: string): string {
  const col = alias ? `${alias}.empresa_id` : 'empresa_id';

  // Usa placeholder ? — o caller DEVE adicionar empresaId como bind parameter
  // Verifica se já tem WHERE
  if (baseSql.toUpperCase().includes('WHERE')) {
    return `${baseSql} AND ${col} = ?`;
  }

  return `${baseSql} WHERE ${col} = ?`;
}

/**
 * Cria objeto com empresa_id para INSERT
 * @example
 * const data = withEmpresaId({ nome: 'João' }, empresaId);
 * // { nome: 'João', empresa_id: 1 }
 */
export function withEmpresaId<T extends Record<string, unknown>>(
  data: T,
  empresaId: number,
): T & { empresa_id: number } {
  return { ...data, empresa_id: empresaId };
}

/**
 * Verifica se registro pertence à empresa (para updates/deletes)
 * @returns true se pertence, false se não
 */
export async function verifyRecordOwnership(
  db: D1Database,
  table: string,
  recordId: number,
  empresaId: number,
): Promise<boolean> {
  // Whitelist de tabelas permitidas para prevenir SQL injection
  const ALLOWED_TABLES = [
    'funcionarios',
    'qualificacoes_historico',
    'qualificacoes_tipos',
    'simulador_sessoes',
    'fichas_sessao',
    'simulador_agendamentos',
    'documentos',
    'pasta_virtual',
    'licencas',
    'habilitacoes',
    'aeronaves',
    'modelos_aeronave',
    'categorias',
    'funcoes',
    'setores',
    'frms_jornada',
    'frms_escala',
    'frms_alerta',
    'empresas',
    'certificados',
    'arquivos',
    'manobras',
    'modelos_sessao',
  ];
  if (!ALLOWED_TABLES.includes(table)) {
    throw new AppError(
      `Tabela '${table}' não é permitida para verificação de ownership`,
      400,
      'INVALID_TABLE',
    );
  }
  const result = await db
    .prepare(`SELECT 1 FROM ${table} WHERE id = ? AND empresa_id = ?`)
    .bind(recordId, empresaId)
    .first();

  return !!result;
}

~~~

---
## FILE: worker-airtrust/src/routes/admin-perfis.ts
~~~typescript
/**
 * ADMIN PERFIS PERMISSÕES ROUTES
 *
 * Gerenciamento de permissões por perfil (GESTOR, INSTRUTOR, ALUNO) por módulo.
 * Apenas ADMINISTRADOR pode alterar configurações de permissão.
 *
 * Endpoints:
 *   GET  /api/admin/perfis/permissoes  - Listar permissões configuradas
 *   POST /api/admin/perfis/permissoes  - Salvar permissões (batch upsert)
 */

import { Hono } from 'hono';
import type { Env } from '../types';
import { auth } from '../middleware/auth';
import { getTenantContext } from '../middleware/tenant';
import { badRequest, forbidden } from '../middleware/error-handler';
import { createLogger } from '../utils/logger';

type PerfisVars = {
  userId: number | string;
  userEmail: string;
  userRole: string;
  empresaId?: number | string;
};

const adminPerfisRoutes = new Hono<{ Bindings: Env; Variables: PerfisVars }>();

adminPerfisRoutes.use('/*', auth());
adminPerfisRoutes.use('/*', async (c, next) => {
  await next();
  c.header('Cache-Control', 'no-store, no-cache, must-revalidate, private');
});

function requireAdmin(role: string, action?: string): void {
  const normalized = role?.toUpperCase();
  if (normalized !== 'ADMINISTRADOR' && normalized !== 'ADMIN') {
    throw forbidden(
      action ? `Apenas ADMINISTRADOR pode ${action}` : 'Acesso restrito a ADMINISTRADOR',
      'INSUFFICIENT_ROLE',
    );
  }
}

// Módulos válidos para controle de acesso
const MODULOS_VALIDOS = [
  'qualificacoes',
  'escalas',
  'lms',
  'certificados',
  'frms',
  'simuladores',
  'funcionarios',
  'relatorios',
  'agendamentos',
] as const;

const ACOES_VALIDAS = ['visualizar', 'editar', 'criar', 'deletar'] as const;
const PERFIS_VALIDOS = ['GESTOR', 'INSTRUTOR', 'ALUNO'] as const;

type PermissaoRow = {
  perfil: string;
  modulo: string;
  acao: string;
  permitido: number;
};

async function savePerfisPermissoes(
  c: Parameters<typeof adminPerfisRoutes.get>[1] extends (ctx: infer T) => unknown ? T : never,
) {
  const { empresaId, role, userId: callerId } = getTenantContext(c);
  requireAdmin(role, 'atualizar permissões de perfis');

  const logger = createLogger(c, 'AdminPerfis.salvar');

  const body = await c.req.json<unknown>().catch(() => null);

  if (!Array.isArray(body)) {
    throw badRequest('O corpo da requisição deve ser um array de permissões', 'INVALID_PAYLOAD');
  }

  if (body.length > 500) {
    throw badRequest('Máximo de 500 permissões por requisição', 'TOO_MANY_ITEMS');
  }

  type PermBody = { perfil: string; modulo: string; acao: string; permitido: boolean };
  const items: PermBody[] = [];

  for (const item of body) {
    if (!item || typeof item !== 'object') {
      throw badRequest('Item inválido no array', 'INVALID_ITEM');
    }
    const { perfil, modulo, acao, permitido } = item as Record<string, unknown>;

    if (typeof perfil !== 'string' || !(PERFIS_VALIDOS as readonly string[]).includes(perfil)) {
      throw badRequest(`Perfil inválido: ${perfil}`, 'INVALID_PERFIL');
    }
    if (typeof modulo !== 'string' || !(MODULOS_VALIDOS as readonly string[]).includes(modulo)) {
      throw badRequest(`Módulo inválido: ${modulo}`, 'INVALID_MODULO');
    }
    if (typeof acao !== 'string' || !(ACOES_VALIDAS as readonly string[]).includes(acao)) {
      throw badRequest(`Ação inválida: ${acao}`, 'INVALID_ACAO');
    }
    if (typeof permitido !== 'boolean') {
      throw badRequest(`Campo 'permitido' deve ser boolean`, 'INVALID_PERMITIDO');
    }

    items.push({ perfil, modulo, acao, permitido });
  }

  const db = c.env.DB;

  for (const item of items) {
    await db
      .prepare(
        `INSERT INTO perfis_permissoes (empresa_id, perfil, modulo, acao, permitido, updated_at)
         VALUES (?, ?, ?, ?, ?, datetime('now'))
         ON CONFLICT(empresa_id, perfil, modulo, acao) DO UPDATE SET
           permitido = excluded.permitido,
           updated_at = excluded.updated_at`,
      )
      .bind(empresaId, item.perfil, item.modulo, item.acao, item.permitido ? 1 : 0)
      .run();
  }

  logger.info(
    `Admin id=${callerId} atualizou ${items.length} permissões de perfis empresa_id=${empresaId}`,
  );

  return c.json({ success: true, message: `${items.length} permissões atualizadas` });
}

// ---------------------------------------------------------------------------
// GET /api/admin/perfis/permissoes
// ---------------------------------------------------------------------------
adminPerfisRoutes.get('/permissoes', async (c) => {
  const { empresaId, role } = getTenantContext(c);
  requireAdmin(role, 'listar permissões de perfis');

  const logger = createLogger(c, 'AdminPerfis.listar');

  const { results } = await c.env.DB.prepare(
    `SELECT perfil, modulo, acao, permitido
     FROM perfis_permissoes
     WHERE empresa_id = ?
     ORDER BY perfil, modulo, acao`,
  )
    .bind(empresaId)
    .all<PermissaoRow>();

  logger.info(`Permissões de perfis listadas empresa_id=${empresaId}`);

  return c.json({ success: true, data: results ?? [] });
});

// ---------------------------------------------------------------------------
// POST|PUT /api/admin/perfis/permissoes
// ---------------------------------------------------------------------------
adminPerfisRoutes.post('/permissoes', savePerfisPermissoes);
adminPerfisRoutes.put('/permissoes', savePerfisPermissoes);

export { adminPerfisRoutes };

~~~

---
## FILE: worker-airtrust/src/routes/admin-usuarios.ts
~~~typescript
/**
 * ADMIN USUARIOS ROUTES
 *
 * Gerenciamento completo de usuários: CRUD, convites, permissões individuais.
 * Requer perfil ADMINISTRADOR ou GESTOR (apenas admin pode alterar outros admins).
 *
 * Endpoints:
 *   GET    /api/admin/usuarios              - Listar usuários da empresa
 *   POST   /api/admin/usuarios              - Criar usuário (envia convite)
 *   GET    /api/admin/usuarios/:id          - Detalhar usuário
 *   PUT    /api/admin/usuarios/:id          - Atualizar usuário
 *   DELETE /api/admin/usuarios/:id          - Desativar usuário (soft delete)
 *   POST   /api/admin/usuarios/:id/invite   - Reenviar convite
 *   GET    /api/admin/usuarios/:id/permissoes - Permissões individuais
 *   PUT    /api/admin/usuarios/:id/permissoes - Atualizar permissões individuais
 *   GET    /api/admin/usuarios/funcionarios-sem-usuario - Funcionários sem usuário
 */

import { Hono } from 'hono';
import type { Env } from '../types';
import { auth } from '../middleware/auth';
import { getTenantContext } from '../middleware/tenant';
import { badRequest, forbidden, notFound } from '../middleware/error-handler';
import { createLogger } from '../utils/logger';
import { hashPassword } from '../utils/security';
// crypto.randomBytes está disponível via Node.js compat ou podemos usar crypto.getRandomValues

type AdminVars = {
  userId: number | string;
  userEmail: string;
  userRole: string;
  empresaId?: number | string;
};

const adminUsuariosRoutes = new Hono<{ Bindings: Env; Variables: AdminVars }>();

// Todos os endpoints requerem autenticação
adminUsuariosRoutes.use('/*', auth());
adminUsuariosRoutes.use('/*', async (c, next) => {
  await next();
  c.header('Cache-Control', 'no-store, no-cache, must-revalidate, private');
  c.header('Pragma', 'no-cache');
  c.header('Expires', '0');
  c.header('Vary', 'Authorization');
});

// ---------------------------------------------------------------------------
// Helper: garante que o caller é ADMINISTRADOR ou GESTOR
// ---------------------------------------------------------------------------
function requireAdminOrGestor(role: string, action?: string): void {
  const normalized = role?.toUpperCase();
  if (normalized !== 'ADMINISTRADOR' && normalized !== 'ADMIN' && normalized !== 'GESTOR') {
    throw forbidden(
      action
        ? `Apenas ADMINISTRADOR ou GESTOR podem ${action}`
        : 'Acesso restrito a ADMINISTRADOR e GESTOR',
      'INSUFFICIENT_ROLE',
    );
  }
}

function requireAdmin(role: string, action?: string): void {
  const normalized = role?.toUpperCase();
  if (normalized !== 'ADMINISTRADOR' && normalized !== 'ADMIN') {
    throw forbidden(
      action ? `Apenas ADMINISTRADOR pode ${action}` : 'Acesso restrito a ADMINISTRADOR',
      'INSUFFICIENT_ROLE',
    );
  }
}

function getCallerId(c: { get: (k: string) => unknown }): number {
  const raw = c.get('userId');
  return typeof raw === 'string' ? Number(raw) : (raw as number);
}

function getCallerRole(c: { get: (k: string) => unknown }): string {
  return String(c.get('userRole') || '').toUpperCase();
}

// Gerar token de convite seguro (usar Web Crypto disponível no Workers)
function generateInviteToken(): string {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

// Data de expiração do convite (48 horas)
function inviteExpiresAt(): string {
  const d = new Date(Date.now() + 48 * 60 * 60 * 1000);
  return d.toISOString().replace('T', ' ').substring(0, 19);
}

function escapeInviteHtml(value: string): string {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function buildInviteLink(frontendUrl: string | undefined, inviteToken: string): string {
  const baseUrl = (frontendUrl || 'https://airtrust.online').replace(/\/$/, '');
  return `${baseUrl}/aceitar-convite?token=${encodeURIComponent(inviteToken)}`;
}

async function sendInviteEmail(
  env: Env,
  logger: ReturnType<typeof createLogger>,
  payload: { email: string; nome: string; perfil: string; inviteLink: string },
): Promise<boolean> {
  if (!env.BREVO_API_KEY) {
    return false;
  }

  try {
    const fromEmail = env.BREVO_FROM_EMAIL || 'treinamento@airtrust.online';
    const fromName = env.BREVO_FROM_NAME || 'Treinamento';

    if (env.BREVO_API_KEY) {
      const brevoResponse = await fetch('https://api.brevo.com/v3/smtp/email', {
        method: 'POST',
        headers: {
          'api-key': env.BREVO_API_KEY,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          sender: { email: fromEmail, name: fromName },
          to: [{ email: payload.email, name: payload.nome }],
          subject: 'Bem-vindo ao AirTrust — Defina sua senha',
          htmlContent: `
            <p>Olá, <strong>${escapeInviteHtml(payload.nome)}</strong>!</p>
            <p>Você foi convidado para acessar o AirTrust com o perfil <strong>${escapeInviteHtml(payload.perfil)}</strong>.</p>
            <p>Clique no botão abaixo para definir sua senha e ativar seu acesso:</p>
            <p><a href="${payload.inviteLink}" style="background:#1d4ed8;color:#fff;padding:12px 24px;border-radius:6px;text-decoration:none;display:inline-block;">Ativar minha conta</a></p>
            <p>Este link expira em 48 horas.</p>
            <p>Se você não esperava este convite, ignore este e-mail.</p>
          `,
        }),
      });

      const emailSent = brevoResponse.status === 201;
      if (!emailSent) {
        logger.warn(
          `Brevo retornou status ${brevoResponse.status} para convite de ${payload.email}`,
        );
      }

      return emailSent;
    }

    return false;
  } catch (emailError) {
    logger.warn(`Falha ao enviar e-mail de convite para ${payload.email}:`, emailError);
    return false;
  }
}

// ---------------------------------------------------------------------------
// GET /api/admin/usuarios/funcionarios-sem-usuario
// Lista funcionários da empresa sem vínculo com usuário do sistema
// ---------------------------------------------------------------------------
adminUsuariosRoutes.get('/funcionarios-sem-usuario', async (c) => {
  requireAdminOrGestor(getCallerRole(c), 'listar funcionários');
  const { empresaId } = getTenantContext(c);
  const db = c.env.DB;

  const rows = await db
    .prepare(
      `
      SELECT f.id, f.nome, f.email, f.matricula, f.cargo
      FROM funcionarios f
      WHERE f.empresa_id = ?
        AND f.deleted_at IS NULL
        AND f.ativo = 1
        AND NOT EXISTS (
          SELECT 1 FROM usuarios u
          WHERE u.funcionario_id = f.id
            AND u.deleted_at IS NULL
            AND u.active = 1
        )
      ORDER BY f.nome ASC
      LIMIT 200
    `,
    )
    .bind(empresaId)
    .all<{
      id: number;
      nome: string;
      email: string | null;
      matricula: string | null;
      cargo: string | null;
    }>();

  return c.json({ success: true, data: rows.results || [] });
});

// ---------------------------------------------------------------------------
// GET /api/admin/usuarios
// Lista usuários da empresa (admin vê todas, gestor vê sua empresa)
// ---------------------------------------------------------------------------
adminUsuariosRoutes.get('/', async (c) => {
  requireAdminOrGestor(getCallerRole(c), 'listar usuários');
  const { empresaId } = getTenantContext(c);
  const db = c.env.DB;

  // Admins globais podem ver todos; outros ficam restritos à empresa
  const callerRole = getCallerRole(c);
  const isGlobalAdmin = callerRole === 'ADMINISTRADOR' || callerRole === 'ADMIN';

  type UserRow = {
    id: number;
    email: string;
    nome: string;
    perfil: string;
    active: number;
    funcionario_id: number | null;
    funcionario_nome: string | null;
    empresa_id: number;
    empresa_nome: string;
    is_primary: number;
    created_at: string;
    last_login: string | null;
    convite_pendente: number;
  };

  let rows: UserRow[] = [];

  if (isGlobalAdmin) {
    const result = await db
      .prepare(
        `
        SELECT
          u.id,
          u.email,
          u.nome,
          COALESCE(ue.role, u.perfil) AS perfil,
          u.active,
          u.funcionario_id,
          f.nome AS funcionario_nome,
          ue.empresa_id,
          e.nome AS empresa_nome,
          ue.is_primary,
          u.created_at,
          u.last_login,
          (SELECT COUNT(*) FROM convites_usuarios cu
           WHERE cu.usuario_id = u.id AND cu.empresa_id = ue.empresa_id
           AND cu.used_at IS NULL AND datetime(cu.expires_at) > datetime('now')) AS convite_pendente
        FROM usuarios u
        INNER JOIN usuarios_empresas ue ON ue.usuario_id = u.id
        INNER JOIN empresas e ON e.id = ue.empresa_id AND e.deleted_at IS NULL
        LEFT JOIN funcionarios f ON f.id = u.funcionario_id AND f.deleted_at IS NULL
        WHERE u.deleted_at IS NULL
        ORDER BY u.nome ASC
      `,
      )
      .all<UserRow>();
    rows = result.results || [];
  } else {
    const result = await db
      .prepare(
        `
        SELECT
          u.id,
          u.email,
          u.nome,
          COALESCE(ue.role, u.perfil) AS perfil,
          u.active,
          u.funcionario_id,
          f.nome AS funcionario_nome,
          ue.empresa_id,
          e.nome AS empresa_nome,
          ue.is_primary,
          u.created_at,
          u.last_login,
          (SELECT COUNT(*) FROM convites_usuarios cu
           WHERE cu.usuario_id = u.id AND cu.empresa_id = ?
           AND cu.used_at IS NULL AND datetime(cu.expires_at) > datetime('now')) AS convite_pendente
        FROM usuarios u
        INNER JOIN usuarios_empresas ue ON ue.usuario_id = u.id AND ue.empresa_id = ?
        INNER JOIN empresas e ON e.id = ue.empresa_id AND e.deleted_at IS NULL
        LEFT JOIN funcionarios f ON f.id = u.funcionario_id AND f.deleted_at IS NULL
        WHERE u.deleted_at IS NULL
        ORDER BY u.nome ASC
      `,
      )
      .bind(empresaId, empresaId)
      .all<UserRow>();
    rows = result.results || [];
  }

  return c.json({ success: true, data: rows });
});

// ---------------------------------------------------------------------------
// GET /api/admin/usuarios/:id
// ---------------------------------------------------------------------------
adminUsuariosRoutes.get('/:id', async (c) => {
  requireAdminOrGestor(getCallerRole(c), 'ver usuário');
  const { empresaId } = getTenantContext(c);
  const id = Number(c.req.param('id'));
  const db = c.env.DB;

  type UserDetail = {
    id: number;
    email: string;
    nome: string;
    perfil: string;
    active: number;
    funcionario_id: number | null;
    funcionario_nome: string | null;
    empresa_id: number;
    created_at: string;
    last_login: string | null;
  };

  const user = await db
    .prepare(
      `
      SELECT
        u.id, u.email, u.nome, u.perfil, u.active,
        u.funcionario_id, f.nome AS funcionario_nome,
        ue.empresa_id, u.created_at, u.last_login
      FROM usuarios u
      INNER JOIN usuarios_empresas ue ON ue.usuario_id = u.id AND ue.empresa_id = ?
      LEFT JOIN funcionarios f ON f.id = u.funcionario_id AND f.deleted_at IS NULL
      WHERE u.id = ? AND u.deleted_at IS NULL
      LIMIT 1
    `,
    )
    .bind(empresaId, id)
    .first<UserDetail>();

  if (!user) throw notFound('Usuário não encontrado');

  // Carregar permissões individuais
  const permissoes = await db
    .prepare(
      `SELECT permissao, tipo FROM usuario_permissoes WHERE usuario_id = ? ORDER BY permissao`,
    )
    .bind(id)
    .all<{ permissao: string; tipo: string }>();

  return c.json({
    success: true,
    data: {
      ...user,
      permissoes: permissoes.results || [],
    },
  });
});

// ---------------------------------------------------------------------------
// POST /api/admin/usuarios
// Criar novo usuário e disparar convite
// ---------------------------------------------------------------------------
adminUsuariosRoutes.post('/', async (c) => {
  requireAdminOrGestor(getCallerRole(c), 'criar usuário');
  const callerId = getCallerId(c);
  const callerRole = getCallerRole(c);
  const { empresaId } = getTenantContext(c);
  const db = c.env.DB;
  const logger = createLogger(c, 'AdminUsuarios.create');

  const body = await c.req.json<{
    email?: string;
    nome?: string;
    perfil?: string;
    funcionario_id?: number | null;
    empresa_id?: number;
  }>();

  const email = String(body?.email || '')
    .trim()
    .toLowerCase();
  const nome = String(body?.nome || '').trim();
  const perfil = String(body?.perfil || 'ALUNO').toUpperCase();
  const funcionarioId = body?.funcionario_id ?? null;
  const targetEmpresaId = body?.empresa_id ?? empresaId;

  if (!email || !nome) {
    throw badRequest('email e nome são obrigatórios', 'MISSING_FIELDS');
  }

  // Gestor não pode criar ADMINISTRADOR
  if (perfil === 'ADMINISTRADOR' || perfil === 'ADMIN') {
    requireAdmin(callerRole, 'criar usuário ADMINISTRADOR');
  }

  // Validar e-mail básico
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw badRequest('E-mail inválido', 'INVALID_EMAIL');
  }

  // Verificar se email já existe
  const existing = await db
    .prepare(`SELECT id FROM usuarios WHERE email = ? AND deleted_at IS NULL LIMIT 1`)
    .bind(email)
    .first<{ id: number }>();

  if (existing) {
    throw badRequest('E-mail já cadastrado no sistema', 'EMAIL_ALREADY_EXISTS');
  }

  // Criar usuário (sem senha — será definida via convite)
  const placeholderHash = `INVITE_PENDING_${Date.now()}`;

  const insertResult = await db
    .prepare(
      `INSERT INTO usuarios (email, password_hash, nome, perfil, funcionario_id, active)
       VALUES (?, ?, ?, ?, ?, 0)`,
    )
    .bind(email, placeholderHash, nome, perfil, funcionarioId)
    .run();

  const novoUsuarioId = insertResult.meta?.last_row_id as number;

  if (!novoUsuarioId) {
    throw new Error('Falha ao criar usuário');
  }

  // Vincular à empresa
  await db
    .prepare(
      `INSERT OR IGNORE INTO usuarios_empresas (usuario_id, empresa_id, is_primary, role)
       VALUES (?, ?, 1, ?)`,
    )
    .bind(novoUsuarioId, targetEmpresaId, perfil)
    .run();

  // Gerar token de convite (48h)
  const inviteToken = generateInviteToken();
  const expiresAt = inviteExpiresAt();

  await db
    .prepare(
      `INSERT INTO convites_usuarios (token, usuario_id, empresa_id, email, role, created_by, expires_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
    )
    .bind(inviteToken, novoUsuarioId, targetEmpresaId, email, perfil, callerId, expiresAt)
    .run();

  logger.info(`Usuário criado: id=${novoUsuarioId} email=${email} perfil=${perfil}`);

  const inviteLink = buildInviteLink(c.env.FRONTEND_URL, inviteToken);
  const emailSent = await sendInviteEmail(c.env, logger, {
    email,
    nome,
    perfil,
    inviteLink,
  });

  return c.json(
    {
      success: true,
      data: {
        id: novoUsuarioId,
        email,
        nome,
        perfil,
        inviteToken,
        inviteLink,
        inviteExpiresAt: expiresAt,
        emailSent,
      },
      message: emailSent
        ? 'Usuário criado. E-mail de convite enviado.'
        : 'Usuário criado. Compartilhe o link de convite para que o usuário defina sua senha.',
    },
    201,
  );
});

// ---------------------------------------------------------------------------
// PUT /api/admin/usuarios/:id
// Atualizar dados do usuário
// ---------------------------------------------------------------------------
adminUsuariosRoutes.put('/:id', async (c) => {
  requireAdminOrGestor(getCallerRole(c), 'editar usuário');
  const callerRole = getCallerRole(c);
  const { empresaId } = getTenantContext(c);
  const id = Number(c.req.param('id'));
  const db = c.env.DB;

  const body = await c.req.json<{
    nome?: string;
    perfil?: string;
    funcionario_id?: number | null;
    active?: boolean;
  }>();

  // Verificar que usuário pertence à empresa
  const existente = await db
    .prepare(
      `SELECT u.id, u.perfil FROM usuarios u
       INNER JOIN usuarios_empresas ue ON ue.usuario_id = u.id AND ue.empresa_id = ?
       WHERE u.id = ? AND u.deleted_at IS NULL LIMIT 1`,
    )
    .bind(empresaId, id)
    .first<{ id: number; perfil: string }>();

  if (!existente) throw notFound('Usuário não encontrado');

  // Gestor não pode editar ADMINISTRADOR
  const targetPerfil = body?.perfil?.toUpperCase() || existente.perfil.toUpperCase();
  if (
    (existente.perfil.toUpperCase() === 'ADMINISTRADOR' ||
      existente.perfil.toUpperCase() === 'ADMIN' ||
      targetPerfil === 'ADMINISTRADOR' ||
      targetPerfil === 'ADMIN') &&
    callerRole !== 'ADMINISTRADOR' &&
    callerRole !== 'ADMIN'
  ) {
    throw forbidden('Apenas ADMINISTRADOR pode editar outros administradores', 'INSUFFICIENT_ROLE');
  }

  const updates: string[] = [];
  const binds: (string | number | null)[] = [];

  if (body?.nome) {
    updates.push('nome = ?');
    binds.push(body.nome.trim());
  }
  if (body?.perfil) {
    updates.push('perfil = ?');
    binds.push(body.perfil.toUpperCase());
    // Sincronizar role em usuarios_empresas
    await db
      .prepare(`UPDATE usuarios_empresas SET role = ? WHERE usuario_id = ? AND empresa_id = ?`)
      .bind(body.perfil.toUpperCase(), id, empresaId)
      .run();
  }
  if (body?.funcionario_id !== undefined) {
    updates.push('funcionario_id = ?');
    binds.push(body.funcionario_id);
  }
  if (body?.active !== undefined) {
    updates.push('active = ?');
    binds.push(body.active ? 1 : 0);
  }

  if (updates.length === 0) {
    throw badRequest('Nenhum campo para atualizar', 'NO_FIELDS');
  }

  updates.push("updated_at = datetime('now')");
  binds.push(id);

  await db
    .prepare(`UPDATE usuarios SET ${updates.join(', ')} WHERE id = ?`)
    .bind(...binds)
    .run();

  const atualizado = await db
    .prepare(
      `SELECT u.id, u.email, u.nome, u.perfil, u.active, u.funcionario_id, f.nome AS funcionario_nome,
              ue.empresa_id, e.nome AS empresa_nome, ue.is_primary, u.created_at, u.last_login
       FROM usuarios u
       INNER JOIN usuarios_empresas ue ON ue.usuario_id = u.id AND ue.empresa_id = ?
       INNER JOIN empresas e ON e.id = ue.empresa_id AND e.deleted_at IS NULL
       LEFT JOIN funcionarios f ON f.id = u.funcionario_id AND f.deleted_at IS NULL
       WHERE u.id = ? AND u.deleted_at IS NULL
       LIMIT 1`,
    )
    .bind(empresaId, id)
    .first();

  return c.json({ success: true, message: 'Usuário atualizado', data: atualizado });
});

// ---------------------------------------------------------------------------
// DELETE /api/admin/usuarios/:id  (soft delete / desativação)
// ---------------------------------------------------------------------------
adminUsuariosRoutes.delete('/:id', async (c) => {
  requireAdminOrGestor(getCallerRole(c), 'desativar usuário');
  const callerId = getCallerId(c);
  const callerRole = getCallerRole(c);
  const { empresaId } = getTenantContext(c);
  const id = Number(c.req.param('id'));

  if (id === callerId) {
    throw badRequest('Você não pode desativar sua própria conta', 'SELF_DEACTIVATION');
  }

  const db = c.env.DB;

  const existente = await db
    .prepare(
      `SELECT u.id, u.perfil FROM usuarios u
       INNER JOIN usuarios_empresas ue ON ue.usuario_id = u.id AND ue.empresa_id = ?
       WHERE u.id = ? AND u.deleted_at IS NULL LIMIT 1`,
    )
    .bind(empresaId, id)
    .first<{ id: number; perfil: string }>();

  if (!existente) throw notFound('Usuário não encontrado');

  // Gestor não pode deletar ADMINISTRADOR
  if (
    (existente.perfil.toUpperCase() === 'ADMINISTRADOR' ||
      existente.perfil.toUpperCase() === 'ADMIN') &&
    callerRole !== 'ADMINISTRADOR' &&
    callerRole !== 'ADMIN'
  ) {
    throw forbidden(
      'Apenas ADMINISTRADOR pode desativar outros administradores',
      'INSUFFICIENT_ROLE',
    );
  }

  await db
    .prepare(`UPDATE usuarios SET active = 0, deleted_at = datetime('now') WHERE id = ?`)
    .bind(id)
    .run();

  return c.json({ success: true, message: 'Usuário desativado' });
});

// ---------------------------------------------------------------------------
// POST /api/admin/usuarios/:id/invite
// Reenviar convite (gera novo token, invalida anteriores)
// ---------------------------------------------------------------------------
adminUsuariosRoutes.post('/:id/invite', async (c) => {
  requireAdminOrGestor(getCallerRole(c), 'reenviar convite');
  const callerId = getCallerId(c);
  const { empresaId } = getTenantContext(c);
  const id = Number(c.req.param('id'));
  const db = c.env.DB;
  const logger = createLogger(c, 'AdminUsuarios.resendInvite');

  const user = await db
    .prepare(
      `SELECT u.id, u.email, u.nome, u.perfil FROM usuarios u
       INNER JOIN usuarios_empresas ue ON ue.usuario_id = u.id AND ue.empresa_id = ?
       WHERE u.id = ? AND u.deleted_at IS NULL LIMIT 1`,
    )
    .bind(empresaId, id)
    .first<{ id: number; email: string; nome: string; perfil: string }>();

  if (!user) throw notFound('Usuário não encontrado');

  // Invalidar convites anteriores
  await db
    .prepare(
      `UPDATE convites_usuarios SET used_at = datetime('now') WHERE usuario_id = ? AND empresa_id = ? AND used_at IS NULL`,
    )
    .bind(id, empresaId)
    .run();

  // Gerar novo convite
  const inviteToken = generateInviteToken();
  const expiresAt = inviteExpiresAt();

  await db
    .prepare(
      `INSERT INTO convites_usuarios (token, usuario_id, empresa_id, email, role, created_by, expires_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
    )
    .bind(inviteToken, id, empresaId, user.email, user.perfil, callerId, expiresAt)
    .run();

  const inviteLink = buildInviteLink(c.env.FRONTEND_URL, inviteToken);
  const emailSent = await sendInviteEmail(c.env, logger, {
    email: user.email,
    nome: user.nome,
    perfil: user.perfil,
    inviteLink,
  });

  return c.json({
    success: true,
    data: {
      inviteToken,
      inviteLink,
      inviteExpiresAt: expiresAt,
      emailSent,
    },
    message: emailSent
      ? 'Novo convite gerado e enviado por e-mail.'
      : 'Novo convite gerado. Compartilhe o link para que o usuário defina sua senha.',
  });
});

// ---------------------------------------------------------------------------
// GET /api/admin/usuarios/:id/permissoes
// Retorna permissões individuais do usuário
// ---------------------------------------------------------------------------
adminUsuariosRoutes.get('/:id/permissoes', async (c) => {
  requireAdminOrGestor(getCallerRole(c), 'ver permissões');
  const { empresaId } = getTenantContext(c);
  const id = Number(c.req.param('id'));
  const db = c.env.DB;

  // Verificar acesso
  const exists = await db
    .prepare(
      `SELECT u.id FROM usuarios u
       INNER JOIN usuarios_empresas ue ON ue.usuario_id = u.id AND ue.empresa_id = ?
       WHERE u.id = ? AND u.deleted_at IS NULL LIMIT 1`,
    )
    .bind(empresaId, id)
    .first();

  if (!exists) throw notFound('Usuário não encontrado');

  const permissoes = await db
    .prepare(
      `SELECT permissao, tipo, created_at FROM usuario_permissoes WHERE usuario_id = ? ORDER BY permissao`,
    )
    .bind(id)
    .all<{ permissao: string; tipo: string; created_at: string }>();

  return c.json({ success: true, data: permissoes.results || [] });
});

// ---------------------------------------------------------------------------
// PUT /api/admin/usuarios/:id/permissoes
// Atualizar permissões individuais (substituição completa)
// ---------------------------------------------------------------------------
adminUsuariosRoutes.put('/:id/permissoes', async (c) => {
  requireAdminOrGestor(getCallerRole(c), 'atualizar permissões');
  const callerId = getCallerId(c);
  const callerRole = getCallerRole(c);
  const { empresaId } = getTenantContext(c);
  const id = Number(c.req.param('id'));
  const db = c.env.DB;

  const body = await c.req.json<{
    permissoes?: Array<{ permissao: string; tipo: 'GRANT' | 'DENY' }>;
  }>();
  const permissoes = body?.permissoes || [];

  // Verificar acesso e role do target
  const targetUser = await db
    .prepare(
      `SELECT u.id, u.perfil FROM usuarios u
       INNER JOIN usuarios_empresas ue ON ue.usuario_id = u.id AND ue.empresa_id = ?
       WHERE u.id = ? AND u.deleted_at IS NULL LIMIT 1`,
    )
    .bind(empresaId, id)
    .first<{ id: number; perfil: string }>();

  if (!targetUser) throw notFound('Usuário não encontrado');

  // Gestor não pode alterar permissões de ADMINISTRADOR
  if (
    (targetUser.perfil.toUpperCase() === 'ADMINISTRADOR' ||
      targetUser.perfil.toUpperCase() === 'ADMIN') &&
    callerRole !== 'ADMINISTRADOR' &&
    callerRole !== 'ADMIN'
  ) {
    throw forbidden('Não é permitido alterar permissões de administrador', 'INSUFFICIENT_ROLE');
  }

  // Substituição completa: deletar todas e reinserir
  await db.prepare(`DELETE FROM usuario_permissoes WHERE usuario_id = ?`).bind(id).run();

  if (permissoes.length > 0) {
    for (const p of permissoes) {
      if (!p.permissao || !['GRANT', 'DENY'].includes(p.tipo)) continue;
      await db
        .prepare(
          `INSERT OR REPLACE INTO usuario_permissoes (usuario_id, permissao, tipo, created_by)
           VALUES (?, ?, ?, ?)`,
        )
        .bind(id, p.permissao, p.tipo, callerId)
        .run();
    }
  }

  return c.json({ success: true, message: 'Permissões atualizadas' });
});

// ---------------------------------------------------------------------------
// PATCH /api/admin/usuarios/:id/reset-senha
// Admin redefine a senha de qualquer usuário sem precisar da senha atual
// ---------------------------------------------------------------------------
adminUsuariosRoutes.patch('/:id/reset-senha', async (c) => {
  requireAdmin(getCallerRole(c), 'redefinir senha de usuário');
  const callerId = getCallerId(c);
  const { empresaId } = getTenantContext(c);
  const id = Number(c.req.param('id'));
  const db = c.env.DB;
  const logger = createLogger(c, 'AdminUsuarios.resetSenha');

  const body = await c.req.json<{ nova_senha?: string }>();
  const novaSenha = String(body?.nova_senha || '').trim();

  if (!novaSenha || novaSenha.length < 8) {
    throw badRequest('A nova senha deve ter no mínimo 8 caracteres', 'PASSWORD_TOO_SHORT');
  }

  // Verificar que o usuário pertence à empresa (segurança multi-tenant)
  const user = await db
    .prepare(
      `SELECT u.id, u.email, u.nome FROM usuarios u
       INNER JOIN usuarios_empresas ue ON ue.usuario_id = u.id AND ue.empresa_id = ?
       WHERE u.id = ? AND u.deleted_at IS NULL LIMIT 1`,
    )
    .bind(empresaId, id)
    .first<{ id: number; email: string; nome: string }>();

  if (!user) throw notFound('Usuário não encontrado');

  const novoHash = await hashPassword(novaSenha);

  await db
    .prepare(
      `UPDATE usuarios
       SET password_hash = ?,
           failed_login_attempts = 0,
           locked_until = NULL,
           updated_at = datetime('now')
       WHERE id = ?`,
    )
    .bind(novoHash, id)
    .run();

  // Audit log
  try {
    await db
      .prepare(
        `INSERT INTO audit_logs (empresa_id, usuario_id, acao, tabela, registro_id, detalhes, created_at)
         VALUES (?, ?, 'ADMIN_RESET_SENHA', 'usuarios', ?, ?, datetime('now'))`,
      )
      .bind(
        empresaId,
        callerId,
        id,
        JSON.stringify({ target_email: user.email, target_nome: user.nome }),
      )
      .run();
  } catch {
    // Audit log é best-effort
    logger.warn(`Falha ao registrar audit log para reset de senha user_id=${id}`);
  }

  logger.info(`Admin id=${callerId} redefiniu senha do usuário id=${id} (${user.email})`);

  return c.json({ success: true, message: 'Senha redefinida com sucesso' });
});

export { adminUsuariosRoutes };

~~~

---
## FILE: worker-airtrust/src/routes/auth.ts
~~~typescript
/**
 * AUTH ROUTES - Login, Refresh, Logout
 * Atualizado para usar tabela usuarios + refresh tokens
 */

import { Hono } from 'hono';
import type { Env } from '../types';
import {
  generateJWT,
  verifyPassword,
  hashPassword,
  generateRefreshToken,
  getRefreshTokenExpiry,
} from '../utils/security';
import { badRequest, internalError, unauthorized } from '../middleware/error-handler';
import { auth } from '../middleware/auth';
import { rateLimiter } from '../middleware/rate-limit';
import { resolveAllowedOrigin } from '../config/allowed-origins';
import { createLogger, toError } from '../utils/logger';
import { hasUsuariosEmpresasTable, getUsuariosSchema } from '../utils/db-schema';
import { logAudit } from '../utils/db'; // SECURITY: Import audit logging
import { enviarEmailAlert } from '../cron/notificacoes';

// Tipar variáveis adicionadas ao contexto pelo middleware auth()
type AuthVars = {
  userId: number | string;
  userEmail: string;
  userRole: string;
  empresaId?: number | string;
  empresas?: number[];
};

const authRoutes = new Hono<{ Bindings: Env; Variables: AuthVars }>();

// Tabela convites_usuarios criada via migration 0290 — não mais DDL em runtime.

async function resolveUserEmpresaId(db: D1Database, userId: number): Promise<number> {
  if (!(await hasUsuariosEmpresasTable(db))) {
    const funcionarioEmpresa = await db
      .prepare(
        `
          SELECT f.empresa_id
          FROM usuarios u
          INNER JOIN funcionarios f ON f.id = u.funcionario_id
          WHERE u.id = ?
            AND u.deleted_at IS NULL
            AND f.deleted_at IS NULL
            AND f.empresa_id IS NOT NULL
          LIMIT 1
        `,
      )
      .bind(userId)
      .first<{ empresa_id: number }>();

    if (funcionarioEmpresa?.empresa_id) {
      return funcionarioEmpresa.empresa_id;
    }

    const activeEmpresas = await db
      .prepare(
        `
          SELECT e.id
          FROM empresas e
          WHERE e.deleted_at IS NULL
            AND e.ativo = 1
          ORDER BY
            CASE
              WHEN e.codigo = 'airtrust' THEN 0
              ELSE 1
            END,
            e.id ASC
          LIMIT 2
        `,
      )
      .all<{ id: number }>();

    if ((activeEmpresas.results || []).length === 1) {
      return activeEmpresas.results[0].id;
    }

    throw unauthorized('Usuário sem vínculo ativo com empresa', 'USER_WITHOUT_EMPRESA');
  }

  const empresa = await db
    .prepare(
      `
        SELECT ue.empresa_id
        FROM usuarios_empresas ue
        INNER JOIN empresas e ON e.id = ue.empresa_id
        WHERE ue.usuario_id = ?
          AND e.deleted_at IS NULL
          AND e.ativo = 1
        ORDER BY
          CASE
            WHEN ue.is_primary = 1 THEN 0
            WHEN e.codigo = 'airtrust' THEN 1
            ELSE 2
          END,
          ue.empresa_id ASC
        LIMIT 1
      `,
    )
    .bind(userId)
    .first<{ empresa_id: number }>();

  if (!empresa?.empresa_id) {
    if (userId === 1) {
      const fallbackEmpresaAtiva = await db
        .prepare(
          `
            SELECT e.id AS empresa_id
            FROM empresas e
            WHERE e.deleted_at IS NULL
              AND e.ativo = 1
            ORDER BY
              CASE
                WHEN e.codigo = 'airtrust' THEN 0
                ELSE 1
              END,
              e.id ASC
            LIMIT 1
          `,
        )
        .first<{ empresa_id: number }>();

      const fallbackEmpresa =
        fallbackEmpresaAtiva ||
        (await db
          .prepare(
            `
              SELECT e.id AS empresa_id
              FROM empresas e
              WHERE e.deleted_at IS NULL
              ORDER BY
                CASE
                  WHEN e.codigo = 'airtrust' THEN 0
                  ELSE 1
                END,
                e.id ASC
              LIMIT 1
            `,
          )
          .first<{ empresa_id: number }>());

      if (fallbackEmpresa?.empresa_id) {
        await db
          .prepare(
            `INSERT OR IGNORE INTO usuarios_empresas (usuario_id, empresa_id, role, is_primary, created_at)
             VALUES (?, ?, 'admin', 1, datetime('now'))`,
          )
          .bind(userId, fallbackEmpresa.empresa_id)
          .run()
          .catch(() => null);

        return fallbackEmpresa.empresa_id;
      }
    }

    // FALLBACK: tentar resolver pelo domínio do e-mail
    const emailDomainResolved = await resolveEmpresaByEmailDomain(db, userId);
    if (emailDomainResolved) return emailDomainResolved;

    throw unauthorized('Usuário sem vínculo ativo com empresa', 'USER_WITHOUT_EMPRESA');
  }

  return empresa.empresa_id;
}

/**
 * Resolve a empresa pelo domínio do e-mail do usuário.
 * Extrai o domínio após '@' e procura em empresas.dominio.
 * Se encontrar, cria automaticamente o vínculo em usuarios_empresas.
 */
async function resolveEmpresaByEmailDomain(db: D1Database, userId: number): Promise<number | null> {
  const usuario = await db
    .prepare(`SELECT id, email FROM usuarios WHERE id = ? AND deleted_at IS NULL LIMIT 1`)
    .bind(userId)
    .first<{ id: number; email: string }>();

  if (!usuario?.email) return null;

  const atIndex = usuario.email.indexOf('@');
  if (atIndex === -1) return null;
  const domain = usuario.email.slice(atIndex + 1).toLowerCase();

  const empresa = await db
    .prepare(
      `SELECT id FROM empresas
       WHERE LOWER(dominio) = ?
         AND ativo = 1
         AND deleted_at IS NULL
       LIMIT 1`,
    )
    .bind(domain)
    .first<{ id: number }>();

  if (!empresa?.id) return null;

  // Auto-criar vínculo para que próximos logins sejam resolvidos diretamente
  await db
    .prepare(
      `INSERT OR IGNORE INTO usuarios_empresas (usuario_id, empresa_id, role, is_primary, created_at)
       VALUES (?, ?, 'member', 1, datetime('now'))`,
    )
    .bind(userId, empresa.id)
    .run();

  return empresa.id;
}

async function issueAccessTokenForEmpresa(
  c: { env: Env },
  payload: { userId: number; email: string; role: string; nome: string; empresaId: number },
): Promise<{ token: string; jti: string }> {
  const jwtSecret = c.env.JWT_SECRET;
  if (!jwtSecret) throw new Error('JWT_SECRET não configurado no ambiente');
  return generateJWT(
    {
      sub: payload.userId,
      empresa_id: payload.empresaId,
      email: payload.email,
      role: payload.role.toLowerCase(),
      nome: payload.nome,
    },
    jwtSecret,
    3600,
  );
}

// Handler OPTIONS para todas as rotas de auth (preflight CORS)
authRoutes.options('/*', (c) => {
  const origin = c.req.header('Origin');
  c.header('Access-Control-Allow-Origin', resolveAllowedOrigin(origin, c.env.CORS_ORIGINS));
  c.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, PATCH, OPTIONS');
  c.header(
    'Access-Control-Allow-Headers',
    'Content-Type, Authorization, X-Requested-With, Accept, Origin',
  );
  c.header('Access-Control-Allow-Credentials', 'true');
  c.header('Access-Control-Max-Age', '86400');
  c.status(204);
  return c.body(null);
});

/**
 * GET /api/auth/invite/validate?token=...
 * Valida token de convite para criação de senha
 */
authRoutes.get('/invite/validate', async (c) => {
  const token = String(c.req.query('token') || '').trim();
  if (!token) {
    throw badRequest('token é obrigatório', 'MISSING_TOKEN');
  }

  const db = c.env.DB;

  const convite = await db
    .prepare(
      `
      SELECT
        cu.id,
        cu.email,
        cu.expires_at,
        cu.used_at,
        u.nome,
        e.nome AS empresa_nome
      FROM convites_usuarios cu
      INNER JOIN usuarios u ON u.id = cu.usuario_id
      INNER JOIN empresas e ON e.id = cu.empresa_id
      WHERE cu.token = ?
      LIMIT 1
    `,
    )
    .bind(token)
    .first<{
      id: number;
      email: string;
      expires_at: string;
      used_at: string | null;
      nome: string;
      empresa_nome: string;
    }>();

  if (!convite) {
    throw unauthorized('Convite inválido', 'INVALID_INVITE_TOKEN');
  }

  if (convite.used_at) {
    throw unauthorized('Convite já utilizado', 'INVITE_ALREADY_USED');
  }

  const expired = await db
    .prepare(`SELECT CASE WHEN datetime(?) <= datetime('now') THEN 1 ELSE 0 END AS expired`)
    .bind(convite.expires_at)
    .first<{ expired: number }>();

  if (expired?.expired) {
    throw unauthorized('Convite expirado', 'INVITE_EXPIRED');
  }

  return c.json({
    success: true,
    data: {
      email: convite.email,
      nome: convite.nome,
      empresaNome: convite.empresa_nome,
      expiresAt: convite.expires_at,
    },
  });
});

/** Valida força mínima da senha — reutilizar em todo endpoint que define senha */
function validatePassword(senha: string): void {
  if (!senha || senha.length < 8) {
    throw badRequest('Senha deve ter no mínimo 8 caracteres', 'INVALID_PASSWORD');
  }
}

function normalizeEmail(value: string | undefined | null): string {
  return String(value || '')
    .trim()
    .toLowerCase();
}

async function sha256Hex(value: string): Promise<string> {
  const data = new TextEncoder().encode(value);
  const digest = await crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

function buildResetPasswordUrl(frontendUrl: string | undefined, token: string): string {
  const base = (frontendUrl || 'https://airtrust.online').replace(/\/+$/, '');
  return `${base}/reset-password?token=${encodeURIComponent(token)}`;
}

async function issuePasswordResetToken(
  db: D1Database,
  userId: number,
  email: string,
): Promise<string> {
  const rawToken = `${crypto.randomUUID()}${crypto.randomUUID()}`;
  const tokenHash = await sha256Hex(rawToken);

  await db
    .prepare(
      `UPDATE password_reset_tokens
       SET consumed_at = COALESCE(consumed_at, datetime('now')),
           updated_at = datetime('now')
       WHERE user_id = ?
         AND consumed_at IS NULL
         AND expires_at > datetime('now')`,
    )
    .bind(userId)
    .run();

  await db
    .prepare(
      `INSERT INTO password_reset_tokens
        (id, user_id, email, token_hash, expires_at, created_at, updated_at)
       VALUES (?, ?, ?, ?, datetime('now', '+60 minutes'), datetime('now'), datetime('now'))`,
    )
    .bind(crypto.randomUUID(), userId, email, tokenHash)
    .run();

  return rawToken;
}

/**
 * POST /api/auth/invite/accept
 * Define senha inicial a partir de token de convite
 */
authRoutes.post('/invite/accept', async (c) => {
  const body = await c.req.json<{ token?: string; senha?: string; password?: string }>();
  const token = String(body?.token || '').trim();
  const senha = String(body?.senha || body?.password || '');

  if (!token) {
    throw badRequest('token é obrigatório', 'MISSING_TOKEN');
  }

  validatePassword(senha);

  const db = c.env.DB;

  const convite = await db
    .prepare(
      `
      SELECT id, usuario_id, expires_at, used_at
      FROM convites_usuarios
      WHERE token = ?
      LIMIT 1
    `,
    )
    .bind(token)
    .first<{ id: number; usuario_id: number; expires_at: string; used_at: string | null }>();

  if (!convite) {
    throw unauthorized('Convite inválido', 'INVALID_INVITE_TOKEN');
  }

  if (convite.used_at) {
    throw unauthorized('Convite já utilizado', 'INVITE_ALREADY_USED');
  }

  const expired = await db
    .prepare(`SELECT CASE WHEN datetime(?) <= datetime('now') THEN 1 ELSE 0 END AS expired`)
    .bind(convite.expires_at)
    .first<{ expired: number }>();

  if (expired?.expired) {
    throw unauthorized('Convite expirado', 'INVITE_EXPIRED');
  }

  const passwordHash = await hashPassword(senha);

  const { hasActive, hasAtivo } = await getUsuariosSchema(db);

  const updateUserSql = hasActive
    ? `UPDATE usuarios SET password_hash = ?, active = 1, updated_at = datetime('now') WHERE id = ?`
    : hasAtivo
      ? `UPDATE usuarios SET password_hash = ?, ativo = 1, updated_at = datetime('now') WHERE id = ?`
      : `UPDATE usuarios SET password_hash = ?, updated_at = datetime('now') WHERE id = ?`;

  await db.prepare(updateUserSql).bind(passwordHash, convite.usuario_id).run();

  await db
    .prepare(`UPDATE convites_usuarios SET used_at = datetime('now') WHERE id = ?`)
    .bind(convite.id)
    .run();

  return c.json({
    success: true,
    message: 'Senha criada com sucesso. Faça login para continuar.',
  });
});

/**
 * POST /api/auth/forgot-password
 * Sempre retorna sucesso para evitar enumeração de usuários.
 */
authRoutes.post(
  '/forgot-password',
  rateLimiter({ maxRequests: 5, windowSeconds: 60, keyPrefix: 'auth-forgot-password' }),
  async (c) => {
    const logger = createLogger(c, 'AuthRoutes.forgotPassword');

    const body = await c.req
      .json<{
        email?: string;
      }>()
      .catch(() => ({}));

    const email = normalizeEmail(body?.email);

    if (!email || !email.includes('@')) {
      return c.json({ success: true });
    }

    try {
      const db = c.env.DB;
      const { activeWhere } = await getUsuariosSchema(db);

      const user = await db
        .prepare(
          `SELECT id, email
           FROM usuarios
           WHERE email = ?
             AND deleted_at IS NULL
             ${activeWhere}
           LIMIT 1`,
        )
        .bind(email)
        .first<{ id: number; email: string }>();

      if (user && c.env.BREVO_API_KEY) {
        const token = await issuePasswordResetToken(db, user.id, user.email);
        const resetUrl = buildResetPasswordUrl(c.env.FRONTEND_URL, token);
        const assunto = '[AirTrust] Recuperação de senha';
        const corpo = `Recebemos uma solicitação para redefinir sua senha no AirTrust.\n\nUse o link abaixo para criar uma nova senha (válido por 60 minutos):\n${resetUrl}\n\nSe você não solicitou esta alteração, ignore este e-mail.`;
        await enviarEmailAlert(c.env, [user.email], assunto, corpo);
      }
    } catch (error) {
      logger.warn('[AUTH] forgot-password: falha controlada', toError(error));
    }

    return c.json({ success: true });
  },
);

/**
 * POST /api/auth/reset-password
 */
authRoutes.post(
  '/reset-password',
  rateLimiter({ maxRequests: 5, windowSeconds: 60, keyPrefix: 'auth-reset-password' }),
  async (c) => {
    const body = await c.req.json<{
      token?: string;
      senha?: string;
      password?: string;
      confirmarSenha?: string;
      confirmPassword?: string;
    }>();

    const token = String(body?.token || '').trim();
    const senha = String(body?.senha || body?.password || '');
    const confirmacao = String(body?.confirmarSenha || body?.confirmPassword || '');

    if (!token) {
      throw badRequest('Token é obrigatório', 'MISSING_RESET_TOKEN');
    }

    validatePassword(senha);
    if (confirmacao && confirmacao !== senha) {
      throw badRequest('A confirmação da nova senha não confere', 'PASSWORD_CONFIRMATION_MISMATCH');
    }

    const db = c.env.DB;
    const tokenHash = await sha256Hex(token);

    const tokenRow = await db
      .prepare(
        `SELECT id, user_id
         FROM password_reset_tokens
         WHERE token_hash = ?
           AND consumed_at IS NULL
           AND expires_at > datetime('now')
           AND deleted_at IS NULL
         LIMIT 1`,
      )
      .bind(tokenHash)
      .first<{ id: string; user_id: number }>();

    if (!tokenRow?.id) {
      throw unauthorized('Token inválido ou expirado', 'INVALID_RESET_TOKEN');
    }

    const { activeWhere } = await getUsuariosSchema(db);
    const user = await db
      .prepare(
        `SELECT id, password_hash
         FROM usuarios
         WHERE id = ?
           AND deleted_at IS NULL
           ${activeWhere}
         LIMIT 1`,
      )
      .bind(tokenRow.user_id)
      .first<{ id: number; password_hash: string }>();

    if (!user?.id) {
      throw unauthorized('Usuário não encontrado', 'USER_NOT_FOUND');
    }

    const passwordHash = await hashPassword(senha);

    await db
      .prepare(`UPDATE usuarios SET password_hash = ?, updated_at = datetime('now') WHERE id = ?`)
      .bind(passwordHash, user.id)
      .run();

    await db
      .prepare(
        `UPDATE password_reset_tokens
         SET consumed_at = datetime('now'),
             updated_at = datetime('now')
         WHERE id = ?`,
      )
      .bind(tokenRow.id)
      .run();

    // Revoga refresh tokens para forçar novo login em todos os dispositivos.
    await db
      .prepare(
        `UPDATE refresh_tokens
         SET revoked_at = datetime('now')
         WHERE user_id = ?
           AND revoked_at IS NULL`,
      )
      .bind(user.id)
      .run();

    return c.json({
      success: true,
      message: 'Senha redefinida com sucesso.',
    });
  },
);

/**
 * POST /api/auth/login
 *
 * Autentica usuário com email/senha e retorna access + refresh tokens
 *
 * Body:
 * {
 *   "email": "admin@airtrust.com",
 *   "senha": "<senha-do-usuario>"
 * }
 *
 * Response:
 * {
 *   "success": true,
 *   "data": {
 *     "accessToken": "eyJhbGc...",
 *     "refreshToken": "a1b2c3d4...",
 *     "user": {
 *       "id": 1,
 *       "email": "admin@airtrust.com",
 *       "role": "admin",
 *       "nome": "Administrador AirTrust"
 *     }
 *   }
 * }
 */
authRoutes.post(
  '/login',
  rateLimiter({ maxRequests: 10, windowSeconds: 60, keyPrefix: 'auth-login' }),
  async (c) => {
    const logger = createLogger(c, 'AuthRoutes.login');
    try {
      const body = await c.req.json();
      // Aceita tanto 'password' quanto 'senha' para compatibilidade
      const { email, senha, password } = body;
      const passwordToUse = senha || password;

      // Validação básica
      if (!email || !passwordToUse) {
        throw badRequest('Email e senha são obrigatórios', 'MISSING_CREDENTIALS');
      }

      const devEnv = c.env.ENVIRONMENT ?? 'production';
      const devBypassEnabled = devEnv === 'development' && c.env.ENABLE_DEV_AUTH_BYPASS === 'true';

      // Buscar usuário no D1
      const db = c.env.DB;
      const { hasActive, hasAtivo, activeWhere } = await getUsuariosSchema(db);

      type DbUser = {
        id: number;
        email: string;
        perfil: string;
        password_hash: string;
        nome: string;
      } | null;

      let user = await db
        .prepare(
          `
        SELECT id, email, nome, perfil, password_hash
        FROM usuarios
        WHERE email = ?
          AND deleted_at IS NULL
          ${activeWhere}
      `,
        )
        .bind(email.toLowerCase())
        .first<DbUser>();

      if (!user) {
        if (devBypassEnabled) {
          // Dev bypass: auto-provisionar qualquer email que não exista no banco local
          const nomeDev = email.toLowerCase().split('@')[0];
          await db
            .prepare(
              `INSERT OR IGNORE INTO usuarios (email, password_hash, nome, perfil, ${
                hasActive ? 'active' : hasAtivo ? 'ativo' : 'created_at'
              })
             VALUES (?, ?, ?, ?, ${hasActive || hasAtivo ? '1' : "datetime('now')"})`,
            )
            .bind(email.toLowerCase(), 'dev-local-bypass', nomeDev, 'ADMIN')
            .run();

          const created = await db
            .prepare(
              `SELECT id, email, nome, perfil, password_hash FROM usuarios WHERE email = ? AND deleted_at IS NULL ${activeWhere}`,
            )
            .bind(email.toLowerCase())
            .first<DbUser>();
          if (created) {
            user = created;
            // Vincular à primeira empresa ativa se ainda não tiver vínculo
            const primeiraEmpresa = await db
              .prepare(
                `SELECT id FROM empresas WHERE deleted_at IS NULL AND ativo = 1 ORDER BY id ASC LIMIT 1`,
              )
              .first<{ id: number }>();
            if (primeiraEmpresa?.id) {
              await db
                .prepare(
                  `INSERT OR IGNORE INTO usuarios_empresas (usuario_id, empresa_id, is_primary, role) VALUES (?, ?, 1, 'admin')`,
                )
                .bind((created as NonNullable<DbUser>).id, primeiraEmpresa.id)
                .run();
            }
          } else {
            throw unauthorized('Credenciais inválidas', 'INVALID_CREDENTIALS');
          }
        } else {
          throw unauthorized('Credenciais inválidas', 'INVALID_CREDENTIALS');
        }
      }

      // Verificar senha — em dev com bypass, aceitar qualquer senha para utilizadores auto-provisionados
      let isValidPassword = false;
      try {
        if (devBypassEnabled) {
          isValidPassword = true;
        } else {
          isValidPassword = await verifyPassword(
            passwordToUse,
            (user as NonNullable<DbUser>).password_hash,
          );
        }
      } catch (e) {
        logger.error('[AUTH] Erro ao verificar senha (bcrypt)', toError(e));
      }

      if (!isValidPassword) {
        throw unauthorized('Credenciais inválidas', 'INVALID_CREDENTIALS');
      }

      // Gerar JWT access token (1 hora)
      const jwtSecret = c.env.JWT_SECRET;
      if (!jwtSecret) throw new Error('JWT_SECRET não configurado no ambiente');
      const empresaId = await resolveUserEmpresaId(db, (user as NonNullable<DbUser>).id);

      // Carregar permissões individuais do usuário
      const permissoesRows = await db
        .prepare(
          `SELECT permissao, tipo FROM usuario_permissoes WHERE usuario_id = ? ORDER BY permissao`,
        )
        .bind((user as NonNullable<DbUser>).id)
        .all<{ permissao: string; tipo: string }>()
        .catch(() => ({ results: [] as Array<{ permissao: string; tipo: string }> }));

      const permissions = (permissoesRows.results || []).map((p) => `${p.tipo}:${p.permissao}`);

      // Carregar funcionario_id se existir
      const userFull = await db
        .prepare(`SELECT funcionario_id FROM usuarios WHERE id = ? LIMIT 1`)
        .bind((user as NonNullable<DbUser>).id)
        .first<{ funcionario_id: number | null }>()
        .catch(() => null);

      const { token: accessToken, jti } = await generateJWT(
        {
          sub: (user as NonNullable<DbUser>).id,
          empresa_id: empresaId,
          email: (user as NonNullable<DbUser>).email,
          role: (user as NonNullable<DbUser>).perfil.toUpperCase(),
          nome: (user as NonNullable<DbUser>).nome,
          permissions: permissions.length > 0 ? permissions : undefined,
          funcionario_id: userFull?.funcionario_id ?? null,
        },
        jwtSecret,
        3600,
      );

      // Gerar refresh token (7 dias)
      const refreshToken = generateRefreshToken();
      const expiresAt = getRefreshTokenExpiry(7);

      // Salvar refresh token com jti associado para blocklist no logout
      await db
        .prepare(
          'INSERT INTO refresh_tokens (user_id, token, expires_at, access_token_jti) VALUES (?, ?, ?, ?)',
        )
        .bind((user as NonNullable<DbUser>).id, refreshToken, expiresAt, jti)
        .run()
        .catch(() =>
          // fallback: tabela pode não ter a coluna jti ainda (migration pendente)
          db
            .prepare('INSERT INTO refresh_tokens (user_id, token, expires_at) VALUES (?, ?, ?)')
            .bind((user as NonNullable<DbUser>).id, refreshToken, expiresAt)
            .run(),
        );

      // Retornar tokens e dados do usuário
      return c.json({
        success: true,
        data: {
          accessToken,
          refreshToken,
          user: {
            id: user.id,
            email: user.email,
            role: (user as NonNullable<DbUser>).perfil.toUpperCase(),
            nome: user.nome,
            permissions,
            funcionario_id: userFull?.funcionario_id ?? null,
          },
        },
      });
    } catch (error) {
      // Preserve ApiError to allow specific codes/messages from helpers
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      if ((error as any)?.name === 'ApiError') throw error as never;
      logger.error('[AUTH] Login error', toError(error));
      throw internalError('Erro ao processar login', 'LOGIN_ERROR');
    }
  },
);

/**
 * POST /api/auth/refresh
 *
 * Renova access token usando refresh token válido
 *
 * Body:
 * {
 *   "refreshToken": "a1b2c3d4..."
 * }
 *
 * Response:
 * {
 *   "success": true,
 *   "data": {
 *     "accessToken": "eyJhbGc...",
 *     "refreshToken": "e5f6g7h8..." (opcional: novo refresh token)
 *   }
 * }
 */
authRoutes.post(
  '/refresh',
  rateLimiter({ maxRequests: 20, windowSeconds: 60, keyPrefix: 'auth-refresh' }),
  async (c) => {
    const logger = createLogger(c, 'AuthRoutes.refresh');
    try {
      const body = await c.req.json();
      const { refreshToken } = body;

      if (!refreshToken) {
        throw badRequest('Refresh token é obrigatório', 'MISSING_REFRESH_TOKEN');
      }

      // Buscar refresh token no D1
      const db = c.env.DB;
      const { activeWhere: activeWhereU } = await getUsuariosSchema(db);
      const activeWhere = activeWhereU.replace('AND ', 'AND u.'); // prefix coluna com alias

      type TokenRecord = {
        user_id: number;
        email: string;
        perfil: string;
        nome: string;
        funcionario_id: number | null;
      } | null;
      const tokenRecord = await db
        .prepare(
          `
        SELECT rt.user_id, u.email, u.perfil, u.nome, u.funcionario_id
        FROM refresh_tokens rt
        INNER JOIN usuarios u ON rt.user_id = u.id
        WHERE rt.token = ?
          AND rt.revoked_at IS NULL
          AND rt.expires_at > datetime('now')
          AND u.deleted_at IS NULL
          ${activeWhere}
      `,
        )
        .bind(refreshToken)
        .first<TokenRecord>();

      if (!tokenRecord) {
        throw unauthorized('Refresh token inválido ou expirado', 'INVALID_REFRESH_TOKEN');
      }

      // Gerar novo access token
      const jwtSecret = c.env.JWT_SECRET;
      if (!jwtSecret) throw new Error('JWT_SECRET não configurado no ambiente');
      const empresaId = await resolveUserEmpresaId(
        db,
        (tokenRecord as NonNullable<TokenRecord>).user_id,
      );

      // Recarregar permissões individuais (overrides GRANT/DENY)
      const userId = (tokenRecord as NonNullable<TokenRecord>).user_id;
      const permissoesRefresh = await db
        .prepare(
          `SELECT permissao, tipo FROM usuario_permissoes WHERE usuario_id = ? ORDER BY permissao`,
        )
        .bind(userId)
        .all<{ permissao: string; tipo: string }>()
        .catch(() => ({ results: [] as Array<{ permissao: string; tipo: string }> }));
      const permissionsRefresh = (permissoesRefresh.results || []).map(
        (p) => `${p.tipo}:${p.permissao}`,
      );

      const { token: newAccessToken, jti: newJti } = await generateJWT(
        {
          sub: userId,
          empresa_id: empresaId,
          email: tokenRecord.email,
          role: tokenRecord.perfil.toUpperCase(),
          nome: tokenRecord.nome,
          permissions: permissionsRefresh,
          funcionario_id: (tokenRecord as NonNullable<TokenRecord>).funcionario_id ?? null,
        },
        jwtSecret,
        3600,
      );

      // Rotação de refresh token
      const newRefreshToken = generateRefreshToken();
      const newExpiresAt = getRefreshTokenExpiry(7);

      await db
        .prepare('UPDATE refresh_tokens SET revoked_at = datetime("now") WHERE token = ?')
        .bind(refreshToken)
        .run();

      await db
        .prepare(
          'INSERT INTO refresh_tokens (user_id, token, expires_at, access_token_jti) VALUES (?, ?, ?, ?)',
        )
        .bind(
          (tokenRecord as NonNullable<TokenRecord>).user_id,
          newRefreshToken,
          newExpiresAt,
          newJti,
        )
        .run()
        .catch(() =>
          db
            .prepare('INSERT INTO refresh_tokens (user_id, token, expires_at) VALUES (?, ?, ?)')
            .bind((tokenRecord as NonNullable<TokenRecord>).user_id, newRefreshToken, newExpiresAt)
            .run(),
        );

      return c.json({
        success: true,
        data: {
          accessToken: newAccessToken,
          refreshToken: newRefreshToken,
        },
      });
    } catch (error) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      if ((error as any)?.name === 'ApiError') throw error as never;
      logger.error('[AUTH] Refresh error', toError(error));
      throw internalError('Erro ao renovar token', 'REFRESH_ERROR');
    }
  },
);

/**
 * POST /api/auth/logout
 *
 * Invalida refresh token (revoga)
 *
 * Body:
 * {
 *   "refreshToken": "a1b2c3d4..."
 * }
 *
 * Response:
 * {
 *   "success": true,
 *   "message": "Logout realizado com sucesso"
 * }
 */
authRoutes.post('/logout', async (c) => {
  const logger = createLogger(c, 'AuthRoutes.logout');
  try {
    const body = await c.req.json();
    const { refreshToken } = body;

    if (!refreshToken) {
      throw badRequest('Refresh token é obrigatório', 'MISSING_REFRESH_TOKEN');
    }

    const db = c.env.DB;

    // Buscar jti associado ao refresh token para invalidar o access token
    const tokenRow = await db
      .prepare('SELECT access_token_jti FROM refresh_tokens WHERE token = ? AND revoked_at IS NULL')
      .bind(refreshToken)
      .first<{ access_token_jti: string | null }>()
      .catch(() => null);

    // Revogar refresh token
    await db
      .prepare('UPDATE refresh_tokens SET revoked_at = datetime("now") WHERE token = ?')
      .bind(refreshToken)
      .run();

    // Adicionar jti à blocklist (access token passa a ser rejeitado até expirar)
    if (tokenRow?.access_token_jti) {
      await db
        .prepare(
          `INSERT OR IGNORE INTO token_blocklist (jti, expires_at)
           VALUES (?, datetime('now', '+1 hour'))`,
        )
        .bind(tokenRow.access_token_jti)
        .run()
        .catch(() => {}); // best-effort — não falhar logout por causa disso
    }

    return c.json({
      success: true,
      message: 'Logout realizado com sucesso',
    });
  } catch (error) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    if ((error as any)?.name === 'ApiError') throw error as never;
    logger.error('[AUTH] Logout error', toError(error));
    throw internalError('Erro ao fazer logout', 'LOGOUT_ERROR');
  }
});

/**
 * GET /api/auth/me
 *
 * Retorna dados do usuário autenticado
 * Requer: Authorization: Bearer <accessToken>
 */
authRoutes.get('/me', auth(), async (c) => {
  const logger = createLogger(c, 'AuthRoutes.me');
  try {
    // c.get is tipado via Variables, mas pode retornar string
    const userIdRaw = c.get('userId');
    const userId = typeof userIdRaw === 'string' ? Number(userIdRaw) : (userIdRaw as number);

    // Buscar dados do usuário no D1
    const db = c.env.DB;

    const { activeWhere } = await getUsuariosSchema(db);

    type MeRow = { id: number; email: string; perfil: string; nome: string } | null;
    const user = await db
      .prepare(
        `
        SELECT id, email, nome, perfil
        FROM usuarios
        WHERE id = ?
          AND deleted_at IS NULL
          ${activeWhere}
      `,
      )
      .bind(userId)
      .first<MeRow>();

    if (!user) {
      throw unauthorized('Usuário não encontrado', 'USER_NOT_FOUND');
    }

    return c.json({
      success: true,
      data: {
        id: (user as NonNullable<MeRow>).id,
        email: (user as NonNullable<MeRow>).email,
        role: (user as NonNullable<MeRow>).perfil.toUpperCase(),
        nome: (user as NonNullable<MeRow>).nome,
      },
    });
  } catch (error) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    if ((error as any)?.name === 'ApiError') throw error as never;
    logger.error('[AUTH] /me error', toError(error));
    throw internalError('Erro ao buscar dados do usuário', 'ME_ERROR');
  }
});

authRoutes.post('/change-password', auth(), async (c) => {
  const body = await c.req.json<{
    senhaAtual?: string;
    currentPassword?: string;
    novaSenha?: string;
    newPassword?: string;
    confirmarSenha?: string;
    confirmPassword?: string;
  }>();

  const senhaAtual = String(body?.senhaAtual || body?.currentPassword || '');
  const novaSenha = String(body?.novaSenha || body?.newPassword || '');
  const confirmarSenha = String(body?.confirmarSenha || body?.confirmPassword || '');

  if (!senhaAtual) {
    throw badRequest('Senha atual é obrigatória', 'MISSING_CURRENT_PASSWORD');
  }

  validatePassword(novaSenha);

  if (confirmarSenha && confirmarSenha !== novaSenha) {
    throw badRequest('A confirmação da nova senha não confere', 'PASSWORD_CONFIRMATION_MISMATCH');
  }

  const userIdRaw = c.get('userId');
  const userId = typeof userIdRaw === 'string' ? Number(userIdRaw) : (userIdRaw as number);
  const db = c.env.DB;
  const { activeWhere } = await getUsuariosSchema(db);

  const user = await db
    .prepare(
      `SELECT id, password_hash
       FROM usuarios
       WHERE id = ?
         AND deleted_at IS NULL
         ${activeWhere}
       LIMIT 1`,
    )
    .bind(userId)
    .first<{ id: number; password_hash: string } | null>();

  if (!user?.password_hash) {
    throw unauthorized('Usuário não encontrado', 'USER_NOT_FOUND');
  }

  const devEnv = c.env.ENVIRONMENT ?? 'production';
  const devBypassEnabled = devEnv === 'development' && c.env.ENABLE_DEV_AUTH_BYPASS === 'true';
  const senhaAtualValida =
    devBypassEnabled && user.password_hash === 'dev-local-bypass'
      ? true
      : await verifyPassword(senhaAtual, user.password_hash);

  if (!senhaAtualValida) {
    throw unauthorized('Senha atual inválida', 'INVALID_CURRENT_PASSWORD');
  }

  if (!(devBypassEnabled && user.password_hash === 'dev-local-bypass')) {
    const isSamePassword = await verifyPassword(novaSenha, user.password_hash);
    if (isSamePassword) {
      throw badRequest('A nova senha deve ser diferente da atual', 'PASSWORD_UNCHANGED');
    }
  }

  const passwordHash = await hashPassword(novaSenha);
  await db
    .prepare(`UPDATE usuarios SET password_hash = ?, updated_at = datetime('now') WHERE id = ?`)
    .bind(passwordHash, userId)
    .run();

  return c.json({
    success: true,
    message: 'Senha alterada com sucesso.',
  });
});

/**
 * GET /api/auth/empresas
 * Lista empresas vinculadas ao usuário autenticado
 */
authRoutes.get('/empresas', auth(), async (c) => {
  const userIdRaw = c.get('userId');
  const userId = typeof userIdRaw === 'string' ? Number(userIdRaw) : (userIdRaw as number);

  const db = c.env.DB;
  const empresaIdAtual = await resolveUserEmpresaId(db, userId);
  const isPlatformAdmin = userId === 1;

  const empresas = await db
    .prepare(
      isPlatformAdmin
        ? `
      SELECT
        e.id,
        e.nome,
        e.codigo,
        e.logo_url,
        'admin' AS role,
        CASE WHEN e.id = ? THEN 1 ELSE 0 END AS is_primary,
        CASE WHEN e.id = ? THEN 1 ELSE 0 END AS is_current
      FROM empresas e
      WHERE e.deleted_at IS NULL
        AND e.ativo = 1
      ORDER BY
        CASE WHEN e.id = ? THEN 0 ELSE 1 END,
        CASE WHEN e.codigo = 'airtrust' THEN 0 ELSE 1 END,
        e.nome ASC
    `
        : `
      SELECT
        e.id,
        e.nome,
        e.codigo,
        e.logo_url,
        ue.role,
        ue.is_primary,
        CASE WHEN e.id = ? THEN 1 ELSE 0 END AS is_current
      FROM usuarios_empresas ue
      INNER JOIN empresas e ON e.id = ue.empresa_id
      WHERE ue.usuario_id = ?
        AND e.deleted_at IS NULL
        AND e.ativo = 1
      ORDER BY
        CASE WHEN e.id = ? THEN 0 ELSE 1 END,
        CASE WHEN ue.is_primary = 1 THEN 0 ELSE 1 END,
        e.nome ASC
    `,
    )
    .bind(
      ...(isPlatformAdmin
        ? [empresaIdAtual, empresaIdAtual, empresaIdAtual]
        : [empresaIdAtual, userId, empresaIdAtual]),
    )
    .all<{
      id: number;
      nome: string;
      codigo: string;
      logo_url: string | null;
      role: string;
      is_primary: number;
      is_current: number;
    }>();

  return c.json({
    success: true,
    data: {
      empresaAtualId: empresaIdAtual,
      empresas: empresas.results || [],
    },
  });
});

/**
 * POST /api/auth/select-empresa
 * Alterna empresa ativa do usuário e retorna novo access token
 */
authRoutes.post('/select-empresa', auth(), async (c) => {
  const body = await c.req.json<{ empresaId?: number }>();
  const targetEmpresaId = Number(body?.empresaId || 0);

  if (!targetEmpresaId || !Number.isFinite(targetEmpresaId)) {
    throw badRequest('empresaId é obrigatório', 'MISSING_EMPRESA_ID');
  }

  const userIdRaw = c.get('userId');
  const userId = typeof userIdRaw === 'string' ? Number(userIdRaw) : (userIdRaw as number);
  const db = c.env.DB;
  const isPlatformAdmin = userId === 1;

  const vinculo = await db
    .prepare(
      isPlatformAdmin
        ? `
      SELECT 'admin' AS role, e.id as empresa_id, e.nome as empresa_nome, e.codigo as empresa_codigo
      FROM empresas e
      WHERE e.id = ?
        AND e.deleted_at IS NULL
        AND e.ativo = 1
      LIMIT 1
    `
        : `
      SELECT ue.role, e.id as empresa_id, e.nome as empresa_nome, e.codigo as empresa_codigo
      FROM usuarios_empresas ue
      INNER JOIN empresas e ON e.id = ue.empresa_id
      WHERE ue.usuario_id = ?
        AND ue.empresa_id = ?
        AND e.deleted_at IS NULL
        AND e.ativo = 1
      LIMIT 1
    `,
    )
    .bind(...(isPlatformAdmin ? [targetEmpresaId] : [userId, targetEmpresaId]))
    .first<{ role: string; empresa_id: number; empresa_nome: string; empresa_codigo: string }>();

  if (!vinculo) {
    throw unauthorized('Usuário não possui acesso à empresa selecionada', 'TENANT_ACCESS_DENIED');
  }

  if (isPlatformAdmin) {
    await db
      .prepare(
        `INSERT OR IGNORE INTO usuarios_empresas (usuario_id, empresa_id, role, is_primary, created_at)
         VALUES (?, ?, 'admin', 1, datetime('now'))`,
      )
      .bind(userId, targetEmpresaId)
      .run()
      .catch(() => null);
  }

  await db
    .prepare(
      `
      UPDATE usuarios_empresas
      SET is_primary = CASE WHEN empresa_id = ? THEN 1 ELSE 0 END
      WHERE usuario_id = ?
    `,
    )
    .bind(targetEmpresaId, userId)
    .run();

  type UserRow = { id: number; email: string; perfil: string; nome: string } | null;
  const user = await db
    .prepare(
      `
      SELECT id, email, perfil, nome
      FROM usuarios
      WHERE id = ? AND deleted_at IS NULL
      LIMIT 1
    `,
    )
    .bind(userId)
    .first<UserRow>();

  if (!user) {
    throw unauthorized('Usuário não encontrado', 'USER_NOT_FOUND');
  }

  const { token: accessToken } = await issueAccessTokenForEmpresa(c, {
    userId,
    email: user.email,
    role: user.perfil,
    nome: user.nome,
    empresaId: targetEmpresaId,
  });

  return c.json({
    success: true,
    data: {
      accessToken,
      empresa: {
        id: vinculo.empresa_id,
        nome: vinculo.empresa_nome,
        codigo: vinculo.empresa_codigo,
      },
    },
  });
});

/**
 * POST /api/auth/impersonate
 *
 * Permite que um ADMIN faça login como outro usuário para fins de teste.
 *
 * Body: { "userId": 42 }
 *
 * Response:
 * {
 *   "success": true,
 *   "data": {
 *     "accessToken": "eyJhbGc...",
 *     "user": { "id": 42, "email": "...", "nome": "...", "role": "..." }
 *   }
 * }
 */
authRoutes.post('/impersonate', auth(), async (c) => {
  const logger = createLogger(c, 'AuthRoutes.impersonate');
  try {
    // SECURITY: Normalize role to uppercase to prevent case-sensitivity bypass
    const callerRole = (c.get('userRole') as string | undefined)?.toUpperCase() ?? '';
    if (callerRole !== 'ADMIN') {
      throw unauthorized('Apenas administradores podem usar impersonação', 'FORBIDDEN');
    }

    const callerId = c.get('userId') as number | string;
    const body = await c.req.json<{ userId: number }>();
    const targetUserId = Number(body?.userId);
    if (!targetUserId || isNaN(targetUserId)) {
      throw badRequest('userId inválido', 'INVALID_USER_ID');
    }

    if (Number(callerId) === targetUserId) {
      throw badRequest('Não é possível impersonar a si mesmo', 'SELF_IMPERSONATE');
    }

    const db = c.env.DB;
    type TargetUser = { id: number; email: string; perfil: string; nome: string };
    const target = await db
      .prepare(
        `SELECT id, email, perfil, nome FROM usuarios WHERE id = ? AND deleted_at IS NULL LIMIT 1`,
      )
      .bind(targetUserId)
      .first<TargetUser>();

    if (!target) {
      throw unauthorized('Usuário alvo não encontrado', 'USER_NOT_FOUND');
    }

    const empresaId = await resolveUserEmpresaId(db, target.id);

    const permissoesRows = await db
      .prepare(
        `SELECT permissao, tipo FROM usuario_permissoes WHERE usuario_id = ? ORDER BY permissao`,
      )
      .bind(target.id)
      .all<{ permissao: string; tipo: string }>()
      .catch(() => ({ results: [] as Array<{ permissao: string; tipo: string }> }));
    const permissions = (permissoesRows.results || []).map((p) => `${p.tipo}:${p.permissao}`);

    const userFull = await db
      .prepare(`SELECT funcionario_id FROM usuarios WHERE id = ? LIMIT 1`)
      .bind(target.id)
      .first<{ funcionario_id: number | null }>()
      .catch(() => null);

    const jwtSecret = c.env.JWT_SECRET;
    if (!jwtSecret) throw new Error('JWT_SECRET não configurado');

    const { token: accessToken } = await generateJWT(
      {
        sub: target.id,
        empresa_id: empresaId,
        email: target.email,
        role: target.perfil.toUpperCase(),
        nome: target.nome,
        permissions: permissions.length > 0 ? permissions : undefined,
        funcionario_id: userFull?.funcionario_id ?? null,
        impersonated_by: Number(callerId),
      },
      jwtSecret,
      3600,
    );

    logger.info(
      `[IMPERSONATE] Admin ${callerId} impersonando usuário ${target.id} (${target.email})`,
    );

    // SECURITY: Log impersonation action for compliance/audit trail
    await logAudit(db, {
      userId: Number(callerId),
      action: 'IMPERSONATE',
      entityType: 'usuario',
      entityId: targetUserId,
      newValues: {
        target_id: targetUserId,
        target_email: target.email,
        target_nome: target.nome,
        impersonation_duration: '3600 segundos',
      },
    }).catch((err) => {
      logger.warn('[IMPERSONATE] Falha ao registrar auditoria', toError(err));
      // Don't throw - audit failure shouldn't block login
    });

    return c.json({
      success: true,
      data: {
        accessToken,
        user: {
          id: target.id,
          email: target.email,
          nome: target.nome,
          role: target.perfil.toUpperCase(),
          permissions,
          funcionario_id: userFull?.funcionario_id ?? null,
        },
      },
    });
  } catch (error) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    if ((error as any)?.name === 'ApiError') throw error as never;
    logger.error('[IMPERSONATE] Erro', toError(error));
    throw internalError('Erro ao processar impersonação', 'IMPERSONATE_ERROR');
  }
});

export { authRoutes };

~~~

---
## FILE: worker-airtrust/src/routes/empresas-usuarios.ts
~~~typescript
/**
 * EMPRESAS — Usuários e Logo
 * Sub-router mounted at /api/empresas via empresasRoutes.route('/', ...)
 *
 *   POST   /:id/usuarios/invite
 *   GET    /:id/usuarios
 *   GET    /usuarios/:usuarioId/acessos
 *   PUT    /usuarios/:usuarioId/acessos
 *   POST   /:id/usuarios
 *   DELETE /:id/usuarios/:usuarioId
 *   GET    /minha/logo-base64
 */

import { Hono } from 'hono';
import type { Env } from '../types';
import { AppError } from '../utils/errors';
import { getTenantContext, requireTenantRole } from '../middleware/tenant';
import { generateRefreshToken } from '../utils/security';

const app = new Hono<{ Bindings: Env }>();

// ─────────────────────────────────────────────────────────────
// Helpers (local to this module)
// ─────────────────────────────────────────────────────────────

async function enviarEmailConvite(
  env: Env,
  destinatario: string,
  nome: string,
  empresaNome: string,
  conviteUrl: string,
): Promise<boolean> {
  const fromEmail =
    env.BREVO_FROM_EMAIL || env.SENDGRID_FROM_EMAIL || 'treinamento@airtrust.online';
  const fromName = env.BREVO_FROM_NAME || 'Treinamento';
  const assunto = `Convite para acessar ${empresaNome} no AirTrust`;
  const corpo = `
    Olá ${nome || 'usuário'},

    Você foi convidado(a) para acessar a empresa ${empresaNome} no AirTrust.

    Para criar sua senha e concluir o acesso, clique no link abaixo:
    ${conviteUrl}

    Este link expira em 72 horas.

    Se você não esperava este convite, ignore este e-mail.
  `;

  if (env.BREVO_API_KEY) {
    const response = await fetch('https://api.brevo.com/v3/smtp/email', {
      method: 'POST',
      headers: {
        'api-key': env.BREVO_API_KEY,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        sender: { email: fromEmail, name: fromName },
        to: [{ email: destinatario }],
        subject: assunto,
        textContent: corpo,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('[INVITE] Erro Brevo:', errorText);
      throw new AppError('Falha ao enviar email de convite', 500);
    }

    return true;
  }

  if (env.SENDGRID_API_KEY) {
    const response = await fetch('https://api.sendgrid.com/v3/mail/send', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${env.SENDGRID_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        personalizations: [
          {
            to: [{ email: destinatario }],
            subject: assunto,
          },
        ],
        from: { email: fromEmail, name: fromName },
        content: [{ type: 'text/plain', value: corpo }],
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('[INVITE] Erro SendGrid:', errorText);
      throw new AppError('Falha ao enviar email de convite', 500);
    }

    return true;
  }

  console.warn(
    '[INVITE] Configuração de email ausente (BREVO_API_KEY ou SENDGRID_API_KEY). Email não enviado.',
  );
  return false;
}

async function getUsuariosEmpresasFeatures(db: Env['DB']): Promise<{ hasModulosAtivos: boolean }> {
  const cols =
    (await db.prepare("PRAGMA table_info('usuarios_empresas')").all<{ name: string }>()).results ||
    [];
  return {
    hasModulosAtivos: cols.some((c) => c.name === 'modulos_ativos'),
  };
}

function normalizeEmpresaUserRole(value: unknown): string {
  const role = String(value || 'viewer')
    .trim()
    .toLowerCase();

  if (role === 'admin' || role === 'administrador') return 'admin';
  if (role === 'manager' || role === 'gestor' || role === 'compliance') return 'manager';
  if (role === 'instructor' || role === 'instrutor') return 'instructor';
  if (role === 'student' || role === 'aluno') return 'student';
  if (role === 'viewer' || role === 'visualizador' || role === 'user' || role === 'usuario') {
    return 'viewer';
  }

  throw new AppError('Perfil de usuário inválido', 400);
}

function perfilFromEmpresaRole(role: string): string {
  switch (role) {
    case 'admin':
      return 'ADMINISTRADOR';
    case 'manager':
      return 'GESTOR';
    case 'instructor':
      return 'INSTRUTOR';
    case 'student':
    case 'viewer':
    default:
      return 'ALUNO';
  }
}

function getRoleRank(role: string): number {
  switch (normalizeEmpresaUserRole(role)) {
    case 'admin':
      return 5;
    case 'manager':
      return 4;
    case 'instructor':
      return 3;
    case 'student':
      return 2;
    case 'viewer':
    default:
      return 1;
  }
}

function pickHighestRole(...roles: Array<string | null | undefined>): string {
  return (
    roles
      .map((role) => normalizeEmpresaUserRole(role))
      .sort((a, b) => getRoleRank(b) - getRoleRank(a))[0] || 'viewer'
  );
}

// ============================================
// POST /api/empresas/:id/usuarios/invite - Convidar/Adicionar usuário por Email
// ============================================
app.post('/:id/usuarios/invite', requireTenantRole('manager'), async (c) => {
  const db = c.env.DB;
  const id = parseInt(c.req.param('id'), 10);
  const tenantCtx = getTenantContext(c);

  if (tenantCtx.empresaCodigo !== 'airtrust' && tenantCtx.empresaId !== id) {
    throw new AppError('Sem permissão para adicionar usuários a esta empresa', 403);
  }

  const {
    email,
    role = 'viewer',
    nome,
    empresaIds,
    modulosAtivos,
  } = (await c.req.json()) as {
    email: string;
    role?: string;
    nome?: string;
    empresaIds?: number[];
    modulosAtivos?: string[];
  };

  if (!email) {
    throw new AppError('Email é obrigatório', 400);
  }

  const normalizedRole = normalizeEmpresaUserRole(role);
  const targetEmpresaIds = Array.from(
    new Set(
      (Array.isArray(empresaIds) && empresaIds.length > 0 ? empresaIds : [id])
        .map((value) => Number(value))
        .filter((value) => Number.isFinite(value) && value > 0),
    ),
  );

  if (targetEmpresaIds.length === 0) {
    throw new AppError('Selecione ao menos uma empresa', 400);
  }

  if (tenantCtx.empresaCodigo !== 'airtrust') {
    const invalidEmpresa = targetEmpresaIds.find((empresaId) => empresaId !== tenantCtx.empresaId);
    if (invalidEmpresa) {
      throw new AppError('Sem permissão para adicionar usuários em múltiplas empresas', 403);
    }
  }

  for (const empresaId of targetEmpresaIds) {
    const empresaAtiva = await db
      .prepare(
        'SELECT id, max_funcionarios FROM empresas WHERE id = ? AND deleted_at IS NULL AND ativo = 1',
      )
      .bind(empresaId)
      .first<{ id: number; max_funcionarios: number }>();

    if (!empresaAtiva) {
      throw new AppError(`Empresa ${empresaId} não encontrada ou inativa`, 404);
    }

    if (tenantCtx.empresaCodigo !== 'airtrust') {
      const count = await db
        .prepare('SELECT COUNT(*) as total FROM usuarios_empresas WHERE empresa_id = ?')
        .bind(empresaId)
        .first<{ total: number }>();

      if ((count?.total || 0) >= (empresaAtiva.max_funcionarios || 0)) {
        throw new AppError('Limite de usuários atingido', 400);
      }
    }
  }

  const normalizedEmail = String(email).toLowerCase().trim();

  // 1. Verificar se usuário existe
  let user = await db
    .prepare('SELECT id FROM usuarios WHERE email = ? AND deleted_at IS NULL')
    .bind(normalizedEmail)
    .first<{ id: number }>();
  let isNewUser = false;

  if (!user) {
    // 2. Criar usuário se não existir
    const tempPassword = Math.random().toString(36).slice(-8) + 'A1!';
    const { hashPassword } = await import('../utils/security');
    const hash = await hashPassword(tempPassword);

    const userColumns =
      (await db.prepare("PRAGMA table_info('usuarios')").all<{ name: string }>()).results || [];
    const hasActive = userColumns.some((col) => col.name === 'active');
    const hasAtivo = userColumns.some((col) => col.name === 'ativo');

    const activeColumn = hasActive ? 'active' : hasAtivo ? 'ativo' : null;
    const perfil = perfilFromEmpresaRole(normalizedRole);

    const insertSql = activeColumn
      ? `INSERT INTO usuarios (email, nome, password_hash, perfil, ${activeColumn}, created_at) VALUES (?, ?, ?, ?, 1, datetime('now'))`
      : "INSERT INTO usuarios (email, nome, password_hash, perfil, created_at) VALUES (?, ?, ?, ?, datetime('now'))";

    const result = await db
      .prepare(insertSql)
      .bind(normalizedEmail, nome || normalizedEmail.split('@')[0], hash, perfil)
      .run();

    user = { id: result.meta.last_row_id };
    isNewUser = true;
    console.log(`[INVITE] Novo usuário criado: ${normalizedEmail} (ID: ${user.id}).`);
  }

  const { hasModulosAtivos } = await getUsuariosEmpresasFeatures(db);
  const modulosAtivosJson = Array.isArray(modulosAtivos) ? JSON.stringify(modulosAtivos) : null;

  let vinculosCriados = 0;
  for (const empresaId of targetEmpresaIds) {
    const link = await db
      .prepare('SELECT id FROM usuarios_empresas WHERE usuario_id = ? AND empresa_id = ?')
      .bind(user.id, empresaId)
      .first();

    if (link) continue;

    if (hasModulosAtivos) {
      await db
        .prepare(
          'INSERT INTO usuarios_empresas (usuario_id, empresa_id, role, is_primary, modulos_ativos) VALUES (?, ?, ?, 0, ?)',
        )
        .bind(user.id, empresaId, normalizedRole, modulosAtivosJson)
        .run();
    } else {
      await db
        .prepare(
          'INSERT INTO usuarios_empresas (usuario_id, empresa_id, role, is_primary) VALUES (?, ?, ?, 0)',
        )
        .bind(user.id, empresaId, normalizedRole)
        .run();
    }

    vinculosCriados += 1;
  }

  if (vinculosCriados === 0) {
    return c.json({ success: false, error: 'Usuário já pertence às empresas selecionadas' }, 400);
  }

  // convites_usuarios existe via migration 0290
  const conviteToken = generateRefreshToken();
  const createdBy = null;

  await db
    .prepare(
      `
      UPDATE convites_usuarios
      SET used_at = datetime('now')
      WHERE usuario_id = ?
        AND empresa_id = ?
        AND used_at IS NULL
    `,
    )
    .bind(user.id, targetEmpresaIds[0])
    .run();

  await db
    .prepare(
      `
      INSERT INTO convites_usuarios (
        token,
        usuario_id,
        empresa_id,
        email,
        role,
        created_by,
        expires_at,
        created_at
      ) VALUES (?, ?, ?, ?, ?, ?, datetime('now', '+72 hours'), datetime('now'))
    `,
    )
    .bind(conviteToken, user.id, targetEmpresaIds[0], normalizedEmail, normalizedRole, createdBy)
    .run();

  const empresa = await db
    .prepare('SELECT nome FROM empresas WHERE id = ?')
    .bind(targetEmpresaIds[0])
    .first<{ nome: string }>();

  const frontendBase = (c.env.FRONTEND_URL || new URL(c.req.url).origin).replace(/\/$/, '');
  const conviteUrl = `${frontendBase}/aceitar-convite?token=${encodeURIComponent(conviteToken)}`;
  const emailSent = await enviarEmailConvite(
    c.env,
    normalizedEmail,
    String(nome || normalizedEmail.split('@')[0]),
    empresa?.nome || 'AirTrust',
    conviteUrl,
  );

  return c.json({
    success: true,
    message: emailSent
      ? 'Convite enviado por email com link para criação de senha'
      : 'Usuário vinculado. Email não enviado (configuração de envio ausente)',
    data: {
      userId: user.id,
      isNewUser,
      empresasVinculadas: vinculosCriados,
      emailSent,
      conviteUrl,
    },
  });
});

// ============================================
// GET /api/empresas/:id/usuarios - Usuários da empresa
// ============================================
app.get('/:id/usuarios', requireTenantRole('admin'), async (c) => {
  const db = c.env.DB;
  const id = parseInt(c.req.param('id'), 10);
  const tenantCtx = getTenantContext(c);
  const { hasModulosAtivos } = await getUsuariosEmpresasFeatures(db);

  if (tenantCtx.empresaCodigo !== 'airtrust' && tenantCtx.empresaId !== id) {
    throw new AppError('Sem permissão para ver usuários desta empresa', 403);
  }

  const usuarios = await db
    .prepare(
      `
      SELECT u.id, u.nome, u.email, u.perfil, ue.role, ue.is_primary,
             ${hasModulosAtivos ? "COALESCE(ue.modulos_ativos, '[]')" : "'[]'"} as modulos_ativos
      FROM usuarios u
      INNER JOIN usuarios_empresas ue ON ue.usuario_id = u.id AND ue.empresa_id = ?
      WHERE u.deleted_at IS NULL
      ORDER BY u.nome ASC
    `,
    )
    .bind(id)
    .all<{
      id: number;
      nome: string;
      email: string;
      perfil: string;
      role: string;
      is_primary: number;
      modulos_ativos: string;
    }>();

  return c.json({
    success: true,
    data: (usuarios.results || []).map((u) => {
      let modulosAtivos: string[] = [];
      try {
        modulosAtivos = JSON.parse(u.modulos_ativos || '[]') as string[];
      } catch {
        modulosAtivos = [];
      }
      return { ...u, role: pickHighestRole(u.role, u.perfil), modulos_ativos: modulosAtivos };
    }),
  });
});

// ============================================
// GET /api/empresas/usuarios/:usuarioId/acessos - acessos por empresa
// ============================================
app.get('/usuarios/:usuarioId/acessos', requireTenantRole('admin'), async (c) => {
  const db = c.env.DB;
  const usuarioId = parseInt(c.req.param('usuarioId'), 10);
  const tenantCtx = getTenantContext(c);
  const { hasModulosAtivos } = await getUsuariosEmpresasFeatures(db);

  const usuario = await db
    .prepare('SELECT id, nome, email FROM usuarios WHERE id = ? AND deleted_at IS NULL')
    .bind(usuarioId)
    .first<{ id: number; nome: string; email: string }>();

  if (!usuario) {
    throw new AppError('Usuário não encontrado', 404);
  }

  const acessos = await db
    .prepare(
      `
      SELECT ue.empresa_id, ue.role, ue.is_primary,
              ${hasModulosAtivos ? "COALESCE(ue.modulos_ativos, '[]')" : "'[]'"} as modulos_ativos,
             e.nome as empresa_nome
      FROM usuarios_empresas ue
      INNER JOIN empresas e ON e.id = ue.empresa_id
      WHERE ue.usuario_id = ?
        AND e.deleted_at IS NULL
        AND e.ativo = 1
      ORDER BY e.nome ASC
    `,
    )
    .bind(usuarioId)
    .all<{
      empresa_id: number;
      role: string;
      is_primary: number;
      modulos_ativos: string;
      empresa_nome: string;
    }>();

  const resultados = (acessos.results || []).filter((item) => {
    if (tenantCtx.empresaCodigo === 'airtrust') return true;
    return item.empresa_id === tenantCtx.empresaId;
  });

  return c.json({
    success: true,
    data: {
      usuario,
      acessos: resultados.map((item) => {
        let modulosAtivos: string[] = [];
        try {
          modulosAtivos = JSON.parse(item.modulos_ativos || '[]') as string[];
        } catch {
          modulosAtivos = [];
        }
        return {
          empresa_id: item.empresa_id,
          empresa_nome: item.empresa_nome,
          role: normalizeEmpresaUserRole(item.role),
          is_primary: item.is_primary,
          modulos_ativos: modulosAtivos,
        };
      }),
    },
  });
});

// ============================================
// PUT /api/empresas/usuarios/:usuarioId/acessos - atualizar acessos
// ============================================
app.put('/usuarios/:usuarioId/acessos', requireTenantRole('admin'), async (c) => {
  const db = c.env.DB;
  const usuarioId = parseInt(c.req.param('usuarioId'), 10);
  const tenantCtx = getTenantContext(c);

  const body = (await c.req.json()) as {
    acessos?: Array<{ empresaId: number; role: string; modulosAtivos?: string[] }>;
  };

  const acessos = Array.isArray(body.acessos)
    ? body.acessos
        .map((item) => ({
          empresaId: Number(item.empresaId),
          role: normalizeEmpresaUserRole(item.role),
          modulosAtivos: Array.isArray(item.modulosAtivos) ? item.modulosAtivos : [],
        }))
        .filter((item) => Number.isFinite(item.empresaId) && item.empresaId > 0)
    : [];

  if (acessos.length === 0) {
    throw new AppError('Informe ao menos um acesso de empresa', 400);
  }

  if (tenantCtx.empresaCodigo !== 'airtrust') {
    const invalid = acessos.find((item) => item.empresaId !== tenantCtx.empresaId);
    if (invalid) {
      throw new AppError('Sem permissão para editar acessos de outras empresas', 403);
    }
  }

  const usuario = await db
    .prepare('SELECT id FROM usuarios WHERE id = ? AND deleted_at IS NULL')
    .bind(usuarioId)
    .first();

  if (!usuario) {
    throw new AppError('Usuário não encontrado', 404);
  }

  const { hasModulosAtivos } = await getUsuariosEmpresasFeatures(db);

  await db
    .prepare(
      tenantCtx.empresaCodigo === 'airtrust'
        ? 'DELETE FROM usuarios_empresas WHERE usuario_id = ?'
        : 'DELETE FROM usuarios_empresas WHERE usuario_id = ? AND empresa_id = ?',
    )
    .bind(
      ...(tenantCtx.empresaCodigo === 'airtrust' ? [usuarioId] : [usuarioId, tenantCtx.empresaId]),
    )
    .run();

  let isPrimarySet = false;
  for (const acesso of acessos) {
    const isPrimary = !isPrimarySet ? 1 : 0;
    isPrimarySet = true;

    if (hasModulosAtivos) {
      await db
        .prepare(
          `
          INSERT INTO usuarios_empresas (usuario_id, empresa_id, role, is_primary, modulos_ativos)
          VALUES (?, ?, ?, ?, ?)
        `,
        )
        .bind(
          usuarioId,
          acesso.empresaId,
          acesso.role,
          isPrimary,
          JSON.stringify(acesso.modulosAtivos),
        )
        .run();
    } else {
      await db
        .prepare(
          `
          INSERT INTO usuarios_empresas (usuario_id, empresa_id, role, is_primary)
          VALUES (?, ?, ?, ?)
        `,
        )
        .bind(usuarioId, acesso.empresaId, acesso.role, isPrimary)
        .run();
    }
  }

  return c.json({
    success: true,
    message: 'Acessos do usuário atualizados com sucesso',
  });
});

// ============================================
// POST /api/empresas/:id/usuarios - Adicionar usuário à empresa
// ============================================
app.post('/:id/usuarios', requireTenantRole('admin'), async (c) => {
  const db = c.env.DB;
  const id = parseInt(c.req.param('id'), 10);
  const tenantCtx = getTenantContext(c);

  if (tenantCtx.empresaCodigo !== 'airtrust' && tenantCtx.empresaId !== id) {
    throw new AppError('Sem permissão para adicionar usuários a esta empresa', 403);
  }

  const body = await c.req.json();
  const { usuario_id, role = 'viewer' } = body;
  const normalizedRole = normalizeEmpresaUserRole(role);

  if (!usuario_id) {
    throw new AppError('usuario_id é obrigatório', 400);
  }

  // Verificar se usuário existe
  const usuario = await db
    .prepare('SELECT id FROM usuarios WHERE id = ? AND deleted_at IS NULL')
    .bind(usuario_id)
    .first();

  if (!usuario) {
    throw new AppError('Usuário não encontrado', 404);
  }

  // Verificar limite de funcionários (se não for super-admin)
  if (tenantCtx.empresaCodigo !== 'airtrust') {
    const empresa = await db
      .prepare('SELECT max_funcionarios FROM empresas WHERE id = ? AND deleted_at IS NULL')
      .bind(id)
      .first<{ max_funcionarios: number }>();

    const count = await db
      .prepare('SELECT COUNT(*) as total FROM usuarios_empresas WHERE empresa_id = ?')
      .bind(id)
      .first<{ total: number }>();

    if ((count?.total || 0) >= (empresa?.max_funcionarios || 0)) {
      throw new AppError('Limite de usuários da empresa atingido', 400);
    }
  }

  await db
    .prepare(
      `
    INSERT INTO usuarios_empresas (usuario_id, empresa_id, role)
    VALUES (?, ?, ?)
  `,
    )
    .bind(usuario_id, id, normalizedRole)
    .run();

  return c.json(
    {
      success: true,
      message: 'Usuário adicionado à empresa com sucesso',
    },
    201,
  );
});

// ============================================
// DELETE /api/empresas/:id/usuarios/:usuarioId
// ============================================
app.delete('/:id/usuarios/:usuarioId', requireTenantRole('admin'), async (c) => {
  const db = c.env.DB;
  const id = parseInt(c.req.param('id'), 10);
  const usuarioId = parseInt(c.req.param('usuarioId'), 10);
  const tenantCtx = getTenantContext(c);

  if (tenantCtx.empresaCodigo !== 'airtrust' && tenantCtx.empresaId !== id) {
    throw new AppError('Sem permissão para remover usuários desta empresa', 403);
  }

  await db
    .prepare(
      `
    DELETE FROM usuarios_empresas WHERE empresa_id = ? AND usuario_id = ?
  `,
    )
    .bind(id, usuarioId)
    .run();

  return c.json({
    success: true,
    message: 'Usuário removido da empresa',
  });
});

// ============================================
// GET /api/empresas/minha/logo-base64 - Retorna logo em base64
// ============================================
app.get('/minha/logo-base64', async (c) => {
  const db = c.env.DB;
  const bucket = c.env.BUCKET;
  const tenantCtx = getTenantContext(c);

  if (!tenantCtx.empresaId) {
    return c.json({ success: false, error: 'Contexto de empresa não identificado' }, 400);
  }

  try {
    const empresa = await db
      .prepare(
        `SELECT e.logo_url as logo_principal, ec.certificado_logo_url
         FROM empresas e
         LEFT JOIN empresas_config ec ON ec.empresa_id = e.id
         WHERE e.id = ? AND e.deleted_at IS NULL`,
      )
      .bind(tenantCtx.empresaId)
      .first<{ logo_principal: string | null; certificado_logo_url: string | null }>();

    console.log('[LOGO-B64] Empresa encontrada:', empresa);

    const logoUrl = empresa?.certificado_logo_url || empresa?.logo_principal;

    if (!logoUrl) {
      return c.json({ success: true, data: null });
    }

    let logoBase64: string | null = null;

    // Converte ArrayBuffer para base64 de forma segura (sem spread que estoura stack em imagens > 64KB)
    const toBase64Safe = (buffer: ArrayBuffer): string => {
      const bytes = new Uint8Array(buffer);
      let binary = '';
      const CHUNK = 8192;
      for (let i = 0; i < bytes.length; i += CHUNK) {
        binary += String.fromCharCode(...bytes.subarray(i, i + CHUNK));
      }
      return btoa(binary);
    };

    // Se for asset interno (/api/assets/...)
    if (logoUrl.startsWith('/api/assets/')) {
      try {
        const key = logoUrl.replace('/api/assets/', '');
        console.log('[LOGO-B64] Buscando no R2:', key);
        const obj = await bucket.get(key);
        if (obj) {
          const arrayBuffer = await obj.arrayBuffer();
          // Detectar MIME do metadata R2 ou inferir pela extensão
          const mimeType =
            obj.httpMetadata?.contentType ||
            (key.match(/\.(jpe?g)$/i)
              ? 'image/jpeg'
              : key.match(/\.gif$/i)
                ? 'image/gif'
                : key.match(/\.webp$/i)
                  ? 'image/webp'
                  : 'image/png');
          logoBase64 = `data:${mimeType};base64,${toBase64Safe(arrayBuffer)}`;
          console.log('[LOGO-B64] Logo R2 ok:', arrayBuffer.byteLength, 'bytes, mime:', mimeType);
        } else {
          console.warn('[LOGO-B64] Objeto não encontrado no R2:', key);
        }
      } catch (err) {
        console.warn('[LOGO-B64] Erro ao buscar logo no R2:', err);
      }
    } else if (logoUrl.startsWith('http')) {
      // URL externa
      try {
        console.log('[LOGO-B64] Buscando URL externa:', logoUrl);
        const res = await fetch(logoUrl);
        if (res.ok) {
          const arrayBuffer = await res.arrayBuffer();
          const contentType = res.headers.get('content-type') || 'image/png';
          logoBase64 = `data:${contentType};base64,${toBase64Safe(arrayBuffer)}`;
          console.log('[LOGO-B64] Logo externo ok:', arrayBuffer.byteLength, 'bytes');
        } else {
          console.warn('[LOGO-B64] URL externa retornou', res.status);
        }
      } catch (err) {
        console.warn('[LOGO-B64] Erro ao buscar logo externo:', err);
      }
    }

    return c.json({ success: true, data: logoBase64 });
  } catch (error) {
    console.error('[LOGO-B64] Erro:', error);
    return c.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Erro ao processar logo',
      },
      500,
    );
  }
});

export default app;

~~~

---
## FILE: worker-airtrust/src/routes/empresas.ts
~~~typescript
/**
 * EMPRESAS ROUTES - Multi-Tenant Management
 *
 * Endpoints para gerenciamento de empresas (multi-tenant)
 * Apenas super-admins podem criar/editar empresas
 *
 * @module routes/empresas
 */

import { Hono } from 'hono';
import { z } from 'zod';
import type { Env } from '../types';
import { auth } from '../middleware/auth';
import { AppError } from '../utils/errors';
import { getTenantContext, requireTenantRole, tenantMiddleware } from '../middleware/tenant';
import { generateRefreshToken } from '../utils/security';
import { registrarAuditoria, extrairUsuarioAuditoria } from '../utils/auditoria';
import { createLogger, toError } from '../utils/logger';
import empresasUsuariosRoutes from './empresas-usuarios';

const empresasRoutes = new Hono<{ Bindings: Env }>();

// Aplicar auth + tenantMiddleware em TODAS as rotas deste router
empresasRoutes.use('*', auth());
empresasRoutes.use('*', tenantMiddleware());

// ============================================
// SCHEMAS DE VALIDAÇÃO
// ============================================

const CreateEmpresaSchema = z.object({
  nome: z.string().min(2, 'Nome deve ter pelo menos 2 caracteres'),
  cnpj: z.string().optional(),
  codigo: z
    .string()
    .min(2)
    .max(20)
    .regex(/^[a-z0-9_-]+$/, 'Código deve ser alfanumérico (lowercase)'),
  logo_url: z.string().optional(), // ✅ Aceita caminhos relativos como /api/assets/logos/...
  plano: z.enum(['basic', 'pro', 'enterprise']).default('basic'),
  max_funcionarios: z.number().int().positive().default(100),
  max_storage_mb: z.number().int().positive().default(1000),
});

const UpdateEmpresaSchema = CreateEmpresaSchema.partial().omit({ codigo: true });

const EmpresaConfigSchema = z.object({
  // Certificados
  certificado_template_html: z.string().optional().nullable(),
  certificado_logo_url: z.string().url().optional().nullable(),
  certificado_assinatura_digital: z.string().optional().nullable(),
  // Config geral
  timezone: z.string().optional(),
  idioma: z.string().optional(),
  // EdApp (não editável pelo form, mas aceito)
  edapp_api_token: z.string().optional().nullable(),
  edapp_webhook_secret: z.string().optional().nullable(),
  edapp_webhook_id: z.string().optional().nullable(),
  edapp_ativo: z.number().optional(),
  // SMTP
  smtp_host: z.string().optional().nullable(),
  smtp_port: z.number().optional().nullable(),
  smtp_user: z.string().optional().nullable(),
  smtp_password: z.string().optional().nullable(),
  smtp_from: z.string().optional().nullable(),
  // Legacy fields (ignored but accepted for backwards compat)
  dias_alerta_vencimento: z.any().optional(),
  email_notificacoes: z.any().optional(),
  webhook_url: z.any().optional(),
  logo_relatorio: z.any().optional(),
  cores_tema: z.any().optional(),
  modulos_ativos: z.any().optional(),
});

const SistemaConfigSchema = z.object({
  appName: z.string().min(1).max(60).optional(),
  logoUrl: z.string().optional().nullable(),
  faviconUrl: z.string().optional().nullable(),
  compactHeader: z.boolean().optional(),
  defaultPageSize: z.union([z.literal(20), z.literal(50), z.literal(100)]).optional(),
  enableAnimations: z.boolean().optional(),
});

function inferImageExtension(fileName: string, contentType: string): string {
  const normalizedType = String(contentType || '')
    .trim()
    .toLowerCase();
  const fromMime: Record<string, string> = {
    'image/png': 'png',
    'image/jpeg': 'jpg',
    'image/jpg': 'jpg',
    'image/webp': 'webp',
    'image/gif': 'gif',
    'image/svg+xml': 'svg',
  };

  const byMime = fromMime[normalizedType];
  if (byMime) return byMime;

  const byName = (fileName.split('.').pop() || '').trim().toLowerCase();
  if (['png', 'jpg', 'jpeg', 'webp', 'gif', 'svg'].includes(byName)) {
    return byName === 'jpeg' ? 'jpg' : byName;
  }

  return 'png';
}

async function getEmpresaCoresTema(
  db: Env['DB'],
  empresaId: number,
): Promise<Record<string, unknown>> {
  const config = await db
    .prepare('SELECT cores_tema FROM empresas_config WHERE empresa_id = ?')
    .bind(empresaId)
    .first<{ cores_tema: string | null }>();

  if (!config?.cores_tema) return {};

  try {
    const parsed = JSON.parse(config.cores_tema);
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

async function saveEmpresaSystemSettings(
  db: Env['DB'],
  empresaId: number,
  settings: Record<string, unknown>,
): Promise<void> {
  const coresTema = await getEmpresaCoresTema(db, empresaId);
  const merged = {
    ...coresTema,
    system_settings: {
      ...(typeof coresTema.system_settings === 'object' && coresTema.system_settings
        ? (coresTema.system_settings as Record<string, unknown>)
        : {}),
      ...settings,
    },
  };

  await db
    .prepare(
      `
      INSERT INTO empresas_config (empresa_id, cores_tema, updated_at)
      VALUES (?, ?, datetime('now'))
      ON CONFLICT(empresa_id) DO UPDATE SET
        cores_tema = excluded.cores_tema,
        updated_at = datetime('now')
    `,
    )
    .bind(empresaId, JSON.stringify(merged))
    .run();
}

function isPlatformSuperAdmin(c: any): boolean {
  const tenantCtx = getTenantContext(c);
  const userIdRaw = c.get('userId');
  const userId = typeof userIdRaw === 'string' ? Number(userIdRaw) : Number(userIdRaw || 0);

  return tenantCtx.empresaCodigo === 'airtrust' || userId === 1;
}

// Tabela convites_usuarios criada via migration 0290 — não mais DDL em runtime.

async function enviarEmailConvite(
  env: Env,
  destinatario: string,
  nome: string,
  empresaNome: string,
  conviteUrl: string,
): Promise<boolean> {
  if (!env.BREVO_API_KEY) {
    console.warn('[INVITE] BREVO_API_KEY ausente. Email não enviado.');
    return false;
  }

  const fromEmail = env.BREVO_FROM_EMAIL || 'treinamento@airtrust.online';
  const fromName = env.BREVO_FROM_NAME || 'Treinamento';
  const assunto = `Convite para acessar ${empresaNome} no AirTrust`;
  const corpo = `
    Olá ${nome || 'usuário'},

    Você foi convidado(a) para acessar a empresa ${empresaNome} no AirTrust.

    Para criar sua senha e concluir o acesso, clique no link abaixo:
    ${conviteUrl}

    Este link expira em 72 horas.

    Se você não esperava este convite, ignore este e-mail.
  `;

  if (env.BREVO_API_KEY) {
    const response = await fetch('https://api.brevo.com/v3/smtp/email', {
      method: 'POST',
      headers: {
        'api-key': env.BREVO_API_KEY,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        sender: { email: fromEmail, name: fromName },
        to: [{ email: destinatario }],
        subject: assunto,
        textContent: corpo,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('[INVITE] Erro Brevo:', errorText);
      throw new AppError('Falha ao enviar email de convite', 500);
    }

    return true;
  }

  throw new AppError('Falha ao enviar email de convite: BREVO_API_KEY não configurado', 500);
}

async function getUsuariosEmpresasFeatures(db: Env['DB']): Promise<{ hasModulosAtivos: boolean }> {
  const cols =
    (await db.prepare("PRAGMA table_info('usuarios_empresas')").all<{ name: string }>()).results ||
    [];
  return {
    hasModulosAtivos: cols.some((c) => c.name === 'modulos_ativos'),
  };
}

// ============================================
// GET /api/empresas/minha - Dados da minha empresa
// ============================================
empresasRoutes.get('/minha', async (c) => {
  const db = c.env.DB;
  const tenantCtx = getTenantContext(c);

  if (!tenantCtx.empresaId) {
    throw new AppError('Contexto de empresa não identificado', 400);
  }

  const empresa = await db
    .prepare(
      `
    SELECT e.*, 
           ec.dias_alerta_vencimento, ec.email_notificacoes, ec.webhook_url, 
           ec.timezone, ec.modulos_ativos, ec.logo_relatorio,
           ec.certificado_logo_url, ec.certificado_template_html, ec.cores_tema
    FROM empresas e
    LEFT JOIN empresas_config ec ON ec.empresa_id = e.id
    WHERE e.id = ? AND e.deleted_at IS NULL
  `,
    )
    .bind(tenantCtx.empresaId)
    .first();

  if (!empresa) {
    // AUTO-RECOVERY: Se for a empresa principal (ID 1) e não existir, criar automaticamente
    // Isso evita travamento em dev/staging se o seed não foi rodado
    if (tenantCtx.empresaId === 1) {
      console.log('[AUTO-RECOVERY] Checando existência da empresa AirTrust (ID 1)...');

      try {
        // 1. Verificar se registro existe (mesmo deletado, para evitar erro de PK no INSERT)
        const existing = await db.prepare('SELECT id FROM empresas WHERE id = 1').first();

        if (existing) {
          console.log('[AUTO-RECOVERY] Restaurando empresa ID 1 (Soft Delete)...');
          await db
            .prepare(
              `
            UPDATE empresas 
            SET deleted_at = NULL, ativo = 1, nome = 'AirTrust System', updated_at = datetime('now')
            WHERE id = 1
          `,
            )
            .run();
        } else {
          console.log('[AUTO-RECOVERY] Inserindo nova empresa ID 1...');
          await db
            .prepare(
              `
            INSERT INTO empresas (id, nome, codigo, plano, max_funcionarios, max_storage_mb, ativo, created_at, updated_at) 
            VALUES (1, 'AirTrust System', 'airtrust', 'enterprise', 1000, 10240, 1, datetime('now'), datetime('now'))
          `,
            )
            .run();
        }

        // 2. Garantir configuração
        await db
          .prepare(
            `
          INSERT INTO empresas_config (empresa_id, modulos_ativos, updated_at)
          VALUES (1, '["treinamento","compliance","admin"]', datetime('now'))
          ON CONFLICT(empresa_id) DO UPDATE SET
            modulos_ativos = excluded.modulos_ativos,
            updated_at = datetime('now')
        `,
          )
          .run();

        // 3. Buscar e retornar
        const novaEmpresa = await db
          .prepare(
            `
          SELECT e.*, 
                 ec.dias_alerta_vencimento, ec.email_notificacoes, ec.webhook_url, 
                 ec.timezone, ec.modulos_ativos, ec.logo_relatorio,
                 ec.certificado_logo_url, ec.certificado_template_html, ec.cores_tema
          FROM empresas e
          LEFT JOIN empresas_config ec ON ec.empresa_id = e.id
          WHERE e.id = 1
        `,
          )
          .first();

        if (novaEmpresa) {
          if (novaEmpresa.modulos_ativos && typeof novaEmpresa.modulos_ativos === 'string') {
            try {
              novaEmpresa.modulos_ativos = JSON.parse(novaEmpresa.modulos_ativos);
            } catch (_) {}
          }
          if (novaEmpresa.cores_tema && typeof novaEmpresa.cores_tema === 'string') {
            try {
              novaEmpresa.cores_tema = JSON.parse(novaEmpresa.cores_tema);
            } catch (_) {}
          }
          return c.json({ success: true, data: novaEmpresa });
        }
      } catch (err) {
        createLogger(c, 'Empresas').error('AUTO-RECOVERY: Falha crítica ID 1', toError(err));
        // Deixar cair no 404 original se falhar
      }
    }

    throw new AppError('Empresa não encontrada', 404);
  }

  // Parse JSON fields
  if (empresa.cores_tema && typeof empresa.cores_tema === 'string') {
    try {
      empresa.cores_tema = JSON.parse(empresa.cores_tema);
    } catch (e) {
      // ignore
    }
  }

  if (empresa.modulos_ativos && typeof empresa.modulos_ativos === 'string') {
    try {
      empresa.modulos_ativos = JSON.parse(empresa.modulos_ativos);
    } catch (e) {
      // fallback
      empresa.modulos_ativos = ['treinamento', 'compliance'];
    }
  }

  return c.json({
    success: true,
    data: empresa,
  });
});

// ============================================
// GET /api/empresas/minha/sistema - Config do sistema por empresa
// ============================================
empresasRoutes.get('/minha/sistema', async (c) => {
  const db = c.env.DB;
  const tenantCtx = getTenantContext(c);

  if (!tenantCtx.empresaId) {
    throw new AppError('Contexto de empresa não identificado', 400);
  }

  const empresa = await db
    .prepare(
      `
      SELECT e.id, e.nome, e.logo_url, ec.cores_tema
      FROM empresas e
      LEFT JOIN empresas_config ec ON ec.empresa_id = e.id
      WHERE e.id = ? AND e.deleted_at IS NULL
    `,
    )
    .bind(tenantCtx.empresaId)
    .first<{ id: number; nome: string; logo_url: string | null; cores_tema: string | null }>();

  if (!empresa) {
    throw new AppError('Empresa não encontrada', 404);
  }

  let coresTema: Record<string, unknown> = {};
  if (empresa.cores_tema) {
    try {
      coresTema = JSON.parse(empresa.cores_tema) as Record<string, unknown>;
    } catch {
      coresTema = {};
    }
  }

  const systemSettings =
    coresTema.system_settings && typeof coresTema.system_settings === 'object'
      ? (coresTema.system_settings as Record<string, unknown>)
      : {};

  return c.json({
    success: true,
    data: {
      empresaId: empresa.id,
      appName:
        typeof systemSettings.appName === 'string' && systemSettings.appName.trim().length > 0
          ? systemSettings.appName
          : 'AirTrust',
      logoUrl:
        typeof systemSettings.logoUrl === 'string' && systemSettings.logoUrl.trim().length > 0
          ? systemSettings.logoUrl
          : null,
      faviconUrl:
        typeof systemSettings.faviconUrl === 'string' && systemSettings.faviconUrl.trim().length > 0
          ? systemSettings.faviconUrl
          : null,
      compactHeader: Boolean(systemSettings.compactHeader),
      defaultPageSize:
        systemSettings.defaultPageSize === 50 || systemSettings.defaultPageSize === 100
          ? systemSettings.defaultPageSize
          : 20,
      enableAnimations: systemSettings.enableAnimations !== false,
    },
  });
});

// ============================================
// PUT /api/empresas/minha/sistema - Salvar config do sistema por empresa
// ============================================
empresasRoutes.put('/minha/sistema', requireTenantRole('admin'), async (c) => {
  const db = c.env.DB;
  const tenantCtx = getTenantContext(c);

  if (!tenantCtx.empresaId) {
    throw new AppError('Contexto de empresa não identificado', 400);
  }

  const payload = SistemaConfigSchema.parse(await c.req.json());

  await saveEmpresaSystemSettings(db, tenantCtx.empresaId, {
    appName: payload.appName ?? 'AirTrust',
    logoUrl: payload.logoUrl ?? null,
    faviconUrl: payload.faviconUrl ?? null,
    compactHeader: payload.compactHeader ?? false,
    defaultPageSize:
      payload.defaultPageSize === 50 || payload.defaultPageSize === 100
        ? payload.defaultPageSize
        : 20,
    enableAnimations: payload.enableAnimations ?? true,
  });

  return c.json({
    success: true,
    message: 'Configurações do sistema atualizadas com sucesso',
  });
});

// ============================================
// GET /api/empresas - Listar empresas (super-admin)
// ============================================
empresasRoutes.get('/', requireTenantRole('admin'), async (c) => {
  const db = c.env.DB;

  // Apenas admins da empresa principal (AirTrust) podem ver todas
  // Outros admins veem apenas sua própria empresa
  const tenantCtx = getTenantContext(c);

  let query: string;
  let params: unknown[] = [];

  if (isPlatformSuperAdmin(c)) {
    // Super-admin: ver todas
    query = `
      SELECT id, nome, cnpj, codigo, logo_url, plano,
             max_funcionarios, max_storage_mb, ativo, dominio, created_at
      FROM empresas
      WHERE deleted_at IS NULL
      ORDER BY nome
    `;
  } else {
    // Admin normal: ver apenas sua empresa
    query = `
      SELECT id, nome, cnpj, codigo, logo_url, plano,
             max_funcionarios, max_storage_mb, ativo, dominio, created_at
      FROM empresas
      WHERE id = ? AND deleted_at IS NULL
    `;
    params = [tenantCtx.empresaId];
  }

  const result = await db
    .prepare(query)
    .bind(...params)
    .all();

  return c.json({
    success: true,
    data: result.results,
  });
});

// ============================================
// GET /api/empresas/:id - Detalhes de uma empresa
// ============================================
empresasRoutes.get('/:id', requireTenantRole('admin'), async (c) => {
  const db = c.env.DB;
  const id = parseInt(c.req.param('id'), 10);
  const tenantCtx = getTenantContext(c);

  // Verificar permissão
  if (!isPlatformSuperAdmin(c) && tenantCtx.empresaId !== id) {
    throw new AppError('Sem permissão para acessar esta empresa', 403);
  }

  try {
    const empresa = await db
      .prepare(
        `
      SELECT e.*, 
             ec.dias_alerta_vencimento, ec.email_notificacoes, ec.webhook_url, 
             ec.timezone, ec.modulos_ativos, ec.logo_relatorio,
             ec.certificado_logo_url, ec.certificado_template_html, ec.cores_tema
      FROM empresas e
      LEFT JOIN empresas_config ec ON ec.empresa_id = e.id
      WHERE e.id = ? AND e.deleted_at IS NULL
    `,
      )
      .bind(id)
      .first<any>();

    if (!empresa) {
      throw new AppError('Empresa não encontrada', 404);
    }

    // Contar funcionários e uso de storage
    const stats = await db
      .prepare(
        `
      SELECT 
        (SELECT COUNT(*) FROM funcionarios WHERE empresa_id = ? AND deleted_at IS NULL) as funcionarios,
        (SELECT COALESCE(SUM(a.tamanho), 0) 
         FROM arquivos a 
         INNER JOIN funcionarios f ON a.funcionario_id = f.id 
         WHERE f.empresa_id = ? AND a.deleted_at IS NULL) as storage_bytes
    `,
      )
      .bind(id, id)
      .first<{ funcionarios: number; storage_bytes: number }>();

    // Parse JSON fields
    if (empresa.cores_tema && typeof empresa.cores_tema === 'string') {
      try {
        empresa.cores_tema = JSON.parse(empresa.cores_tema);
      } catch (_) {
        // ignore
      }
    }

    if (empresa.modulos_ativos && typeof empresa.modulos_ativos === 'string') {
      try {
        empresa.modulos_ativos = JSON.parse(empresa.modulos_ativos);
      } catch (_) {
        // fallback
        empresa.modulos_ativos = ['treinamento', 'compliance'];
      }
    }

    return c.json({
      success: true,
      data: {
        ...empresa,
        stats: {
          funcionarios: stats?.funcionarios || 0,
          storage_mb: Math.round((stats?.storage_bytes || 0) / 1024 / 1024),
        },
      },
    });
  } catch (error: any) {
    createLogger(c, 'Empresas').error('GET /:id erro', toError(error));
    // Se for AppError, relançar
    if (error instanceof AppError) throw error; // Fix instanceof check just in case, or keep property check
    if (error.status) throw error;

    return c.json(
      {
        success: false,
        error: 'Erro interno do servidor',
      },
      500,
    );
  }
});

// ============================================
// POST /api/empresas - Criar nova empresa (super-admin only)
// ============================================
empresasRoutes.post('/', requireTenantRole('admin'), async (c) => {
  console.log('[EMPRESAS POST] Iniciando criação de empresa...');
  const db = c.env.DB;

  try {
    const tenantCtx = getTenantContext(c);
    console.log('[EMPRESAS POST] Tenant context:', tenantCtx);

    // Apenas super-admin pode criar empresas
    if (!isPlatformSuperAdmin(c)) {
      console.log('[EMPRESAS POST] Acesso negado - não é airtrust:', tenantCtx.empresaCodigo);
      throw new AppError('Apenas administradores do sistema podem criar empresas', 403);
    }

    const body = await c.req.json();
    console.log('[EMPRESAS POST] Body recebido:', body);

    const data = CreateEmpresaSchema.parse(body);
    console.log('[EMPRESAS POST] Dados validados:', data);

    // Verificar se código já existe (mesmo deletado)
    const existingEmpresa = await db
      .prepare('SELECT id, deleted_at FROM empresas WHERE codigo = ?')
      .bind(data.codigo)
      .first<{ id: number; deleted_at: string | null }>();

    if (existingEmpresa) {
      // Se existe e está ativo, erro
      if (!existingEmpresa.deleted_at) {
        console.log('[EMPRESAS POST] Código já existe (ativo):', data.codigo);
        throw new AppError(`Código '${data.codigo}' já está em uso`, 400);
      }

      // Se existe e está deletado, REATIVAR (Restore)
      console.log(
        '[EMPRESAS POST] Código existe (deletado). Reativando empresa ID:',
        existingEmpresa.id,
      );

      await db
        .prepare(
          `
          UPDATE empresas 
          SET nome = ?, cnpj = ?, logo_url = ?, plano = ?, max_funcionarios = ?, max_storage_mb = ?, ativo = 1, deleted_at = NULL, updated_at = datetime('now')
          WHERE id = ?
        `,
        )
        .bind(
          data.nome,
          data.cnpj || null,
          data.logo_url || null,
          data.plano,
          data.max_funcionarios,
          data.max_storage_mb,
          existingEmpresa.id,
        )
        .run();

      return c.json({
        success: true,
        data: {
          id: existingEmpresa.id,
          ...data,
          ativo: 1,
        },
        message: 'Empresa reativada com sucesso',
      });
    }

    // Criar nova empresa (se não existe)
    console.log('[EMPRESAS POST] Criando nova empresa...');
    const result = await db
      .prepare(
        `
      INSERT INTO empresas (nome, cnpj, codigo, logo_url, plano, max_funcionarios, max_storage_mb)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `,
      )
      .bind(
        data.nome,
        data.cnpj || null,
        data.codigo,
        data.logo_url || null,
        data.plano,
        data.max_funcionarios,
        data.max_storage_mb,
      )
      .run();

    const empresaId = result.meta.last_row_id;
    console.log('[EMPRESAS POST] Empresa criada com ID:', empresaId);

    // Criar configuração padrão
    console.log('[EMPRESAS POST] Criando config padrão...');
    await db
      .prepare(
        `
      INSERT INTO empresas_config (empresa_id, modulos_ativos)
      VALUES (?, ?)
    `,
      )
      .bind(empresaId, JSON.stringify(['treinamento', 'compliance']))
      .run();

    console.log('[EMPRESAS POST] Sucesso!');
    const ua = extrairUsuarioAuditoria(c);
    await registrarAuditoria({
      db,
      tabela: 'empresas',
      acao: 'INSERT',
      registro_id: empresaId,
      dados_novos: data,
      ...ua,
    });
    return c.json(
      {
        success: true,
        data: { id: empresaId, ...data },
        message: 'Empresa criada com sucesso',
      },
      201,
    );
  } catch (error: any) {
    createLogger(c, 'Empresas').error('POST / erro ao criar empresa', toError(error));
    throw error;
  }
});

// ============================================
// PUT /api/empresas/:id - Atualizar empresa
// ============================================
empresasRoutes.put('/:id', requireTenantRole('admin'), async (c) => {
  const db = c.env.DB;
  const id = parseInt(c.req.param('id'), 10);
  const tenantCtx = getTenantContext(c);

  try {
    // Verificar permissão
    if (!isPlatformSuperAdmin(c) && tenantCtx.empresaId !== id) {
      throw new AppError('Sem permissão para editar esta empresa', 403);
    }

    const body = await c.req.json();
    console.log('[PUT /empresas/:id] Body recebido:', JSON.stringify(body));

    // Permite updates parciais, inclusive toggle rápido de ativo/inativo.
    if (body.nome !== undefined && (typeof body.nome !== 'string' || body.nome.trim().length < 2)) {
      throw new AppError('Nome deve ter pelo menos 2 caracteres', 400);
    }

    // Verificar se empresa existe
    const exists = await db
      .prepare('SELECT id FROM empresas WHERE id = ? AND deleted_at IS NULL')
      .bind(id)
      .first();

    if (!exists) {
      // AUTO-RECOVERY: Se for ID 1 (AirTrust) e não existir, permitir recriar via PUT
      if (id === 1 && isPlatformSuperAdmin(c)) {
        await db
          .prepare(
            `
          INSERT INTO empresas (id, nome, codigo, plano, max_funcionarios, max_storage_mb, ativo, created_at, updated_at) 
          VALUES (1, ?, 'airtrust', ?, ?, ?, 1, datetime('now'), datetime('now'))
        `,
          )
          .bind(
            body.nome || 'AirTrust System',
            body.plano || 'enterprise',
            body.max_funcionarios || 1000,
            body.max_storage_mb || 10240,
          )
          .run();

        // Config
        await db
          .prepare(
            `
          INSERT INTO empresas_config (empresa_id)
          VALUES (1)
        `,
          )
          .run();

        // Se tinha CNPJ, atualizar depois
        if (body.cnpj) {
          await db.prepare('UPDATE empresas SET cnpj = ? WHERE id = 1').bind(body.cnpj).run();
        }

        return c.json({
          success: true,
          message: 'Empresa AirTrust recriada e atualizada com sucesso',
        });
      }

      throw new AppError('Empresa não encontrada', 404);
    }

    // Construir query de update dinamicamente
    // WHITELIST de campos permitidos (evita erro ao receber campos extras como 'stats')
    const allowedFields = [
      'nome',
      'cnpj',
      'logo_url',
      'plano',
      'max_funcionarios',
      'max_storage_mb',
      'ativo', // ✅ Adicionado para permitir ativar/desativar empresa
      'dominio', // ✅ Domínio de e-mail para auto-detecção de empresa no login
    ];

    const fields: string[] = [];
    const values: unknown[] = [];

    console.log('[PUT /empresas/:id] Iterando campos do body:', Object.keys(body));
    for (const [key, value] of Object.entries(body)) {
      if (value !== undefined && allowedFields.includes(key)) {
        fields.push(`${key} = ?`);
        values.push(value);
      }
    }

    if (fields.length === 0) {
      throw new AppError('Nenhum campo para atualizar', 400);
    }

    fields.push("updated_at = datetime('now')");
    values.push(id);

    await db
      .prepare(
        `
    UPDATE empresas SET ${fields.join(', ')} WHERE id = ?
  `,
      )
      .bind(...values)
      .run();

    const ua2 = extrairUsuarioAuditoria(c);
    await registrarAuditoria({ db, tabela: 'empresas', acao: 'UPDATE', registro_id: id, ...ua2 });

    return c.json({
      success: true,
      message: 'Empresa atualizada com sucesso',
    });
  } catch (error: unknown) {
    createLogger(c, 'Empresas').error('PUT /:id erro ao atualizar empresa', toError(error));

    // Se for erro de validação Zod
    if (error && typeof error === 'object' && 'name' in error && error.name === 'ZodError') {
      return c.json(
        {
          success: false,
          error: 'Erro de validação',
          details: 'errors' in error ? error.errors : undefined,
        },
        400,
      );
    }

    // Se for AppError, relançar
    if (error instanceof AppError) throw error;

    // Erro genérico
    return c.json(
      {
        success: false,
        error: 'Erro interno do servidor',
      },
      500,
    );
  }
});

// ============================================
// DELETE /api/empresas/:id - Soft delete empresa
// ============================================
empresasRoutes.delete('/:id', requireTenantRole('admin'), async (c) => {
  const db = c.env.DB;
  const id = parseInt(c.req.param('id'), 10);

  // Apenas super-admin pode deletar empresas
  if (!isPlatformSuperAdmin(c)) {
    throw new AppError('Apenas administradores do sistema podem remover empresas', 403);
  }

  // Não permitir deletar a empresa AirTrust
  if (id === 1) {
    throw new AppError('Não é possível remover a empresa principal', 400);
  }

  // Verificar se tem dados
  const counts = await db
    .prepare(
      `
    SELECT 
      (SELECT COUNT(*) FROM funcionarios WHERE empresa_id = ? AND deleted_at IS NULL) as funcionarios,
      (SELECT COUNT(*) FROM arquivos a 
       INNER JOIN funcionarios f ON a.funcionario_id = f.id 
       WHERE f.empresa_id = ? AND a.deleted_at IS NULL) as arquivos
  `,
    )
    .bind(id, id)
    .first<{ funcionarios: number; arquivos: number }>();

  if ((counts?.funcionarios || 0) > 0) {
    throw new AppError(
      `Não é possível remover empresa com ${counts?.funcionarios} funcionários ativos. Remova-os primeiro.`,
      400,
    );
  }

  // Soft delete
  await db
    .prepare(
      `
    UPDATE empresas 
    SET deleted_at = datetime('now'), ativo = 0, updated_at = datetime('now')
    WHERE id = ?
  `,
    )
    .bind(id)
    .run();

  const ua3 = extrairUsuarioAuditoria(c);
  await registrarAuditoria({ db, tabela: 'empresas', acao: 'DELETE', registro_id: id, ...ua3 });

  return c.json({
    success: true,
    message: 'Empresa removida com sucesso',
  });
});

// ============================================
// POST /api/empresas/:id/logo - Upload de logo
// ============================================
empresasRoutes.post('/:id/logo', requireTenantRole('admin'), async (c) => {
  const db = c.env.DB;
  const bucket = c.env.BUCKET;

  if (!bucket) {
    createLogger(c, 'Empresas').error('Bucket R2 não configurado no ambiente');
    return c.json({ success: false, error: 'Storage não configurado' }, 500);
  }

  const id = parseInt(c.req.param('id'), 10);
  const target = c.req.query('target') || 'empresa'; // 'empresa' | 'certificado' | 'sistema-logo' | 'sistema-favicon'
  const tenantCtx = getTenantContext(c);

  // Admins e administradores da empresa podem atualizar o logo da própria empresa.
  if (!isPlatformSuperAdmin(c) && tenantCtx.empresaId !== id) {
    throw new AppError('Sem permissão para alterar logo desta empresa', 403);
  }

  // Verificar se empresa existe
  const empresa = await db
    .prepare('SELECT codigo FROM empresas WHERE id = ? AND deleted_at IS NULL')
    .bind(id)
    .first<{ codigo: string }>();

  if (!empresa) {
    throw new AppError('Empresa não encontrada', 404);
  }

  const form = await c.req.formData();
  const file = form.get('file') as File | null;

  if (!file) {
    throw new AppError('Arquivo obrigatório', 400);
  }

  // Validar tamanho
  const MAX_SIZE =
    target === 'sistema-logo'
      ? 10 * 1024 * 1024
      : target === 'sistema-favicon'
        ? 10 * 1024 * 1024
        : 2 * 1024 * 1024;
  if (file.size > MAX_SIZE) {
    const maxSizeLabel = target === 'sistema-logo' || target === 'sistema-favicon' ? '10MB' : '2MB';
    throw new AppError(`Tamanho máximo excedido (${maxSizeLabel})`, 400);
  }

  // Validar tipo
  if (target === 'sistema-logo' || target === 'sistema-favicon') {
    if (file.type !== 'image/png') {
      throw new AppError('Para logo/favicon do sistema, apenas PNG é permitido', 400);
    }
  } else if (!file.type.startsWith('image/')) {
    throw new AppError('Apenas imagens são permitidas', 400);
  } else if (
    !['image/png', 'image/jpeg', 'image/jpg', 'image/webp', 'image/gif', 'image/svg+xml'].includes(
      file.type.toLowerCase(),
    )
  ) {
    throw new AppError('Formato inválido. Use PNG, JPG, WEBP, GIF ou SVG.', 400);
  }

  try {
    // Gerar nome do arquivo no R2
    const fileExt = inferImageExtension(file.name, file.type);
    const cacheBuster = Date.now();
    const r2Key =
      target === 'certificado'
        ? `empresas/${id}/certificado-logo-${cacheBuster}.${fileExt}`
        : target === 'sistema-favicon'
          ? `empresas/${id}/favicon-${cacheBuster}.${fileExt}`
          : target === 'sistema-logo'
            ? `empresas/${id}/sistema-logo-${cacheBuster}.${fileExt}`
            : `empresas/${id}/logo-${cacheBuster}.${fileExt}`;

    // Upload para R2
    await bucket.put(r2Key, file.stream(), {
      httpMetadata: {
        contentType: file.type,
      },
      customMetadata: {
        empresa_id: String(id),
        codigo: empresa.codigo,
        uploaded_at: new Date().toISOString(),
        target,
      },
    });

    // Public URL (assumindo que existe um domínio público configurado para o bucket ou usando worker de assets)
    // Se não tiver domínio público, usar rota de stream ou R2 dev URL
    const publicUrl = `/api/assets/${r2Key}`;

    if (target === 'certificado') {
      // Atualizar empresas_config.certificado_logo_url
      // Upsert config se não existir
      await db
        .prepare(
          `
        INSERT INTO empresas_config (empresa_id, certificado_logo_url)
        VALUES (?, ?)
        ON CONFLICT(empresa_id) DO UPDATE SET
          certificado_logo_url = excluded.certificado_logo_url,
          updated_at = datetime('now')
      `,
        )
        .bind(id, publicUrl)
        .run();
    } else if (target === 'sistema-logo' || target === 'sistema-favicon') {
      await saveEmpresaSystemSettings(db, id, {
        ...(target === 'sistema-logo' ? { logoUrl: publicUrl } : {}),
        ...(target === 'sistema-favicon' ? { faviconUrl: publicUrl } : {}),
      });

      // Compatibilidade: várias telas ainda leem empresas.logo_url diretamente
      if (target === 'sistema-logo') {
        await db
          .prepare("UPDATE empresas SET logo_url = ?, updated_at = datetime('now') WHERE id = ?")
          .bind(publicUrl, id)
          .run();
      }
    } else {
      // Atualizar empresas.logo_url
      await db
        .prepare("UPDATE empresas SET logo_url = ?, updated_at = datetime('now') WHERE id = ?")
        .bind(publicUrl, id)
        .run();
    }

    return c.json({
      success: true,
      data: {
        logo_url: publicUrl,
        target,
      },
      message: 'Logo atualizado com sucesso',
    });
  } catch (error) {
    createLogger(c, 'Empresas').error('Erro no upload de logo', toError(error));
    throw new AppError('Erro ao fazer upload do logo', 500);
  }
});

// ============================================
// GET /api/empresas/:id/config - Config da empresa
// ============================================
empresasRoutes.get('/:id/config', requireTenantRole('admin'), async (c) => {
  const db = c.env.DB;
  const id = parseInt(c.req.param('id'), 10);
  const tenantCtx = getTenantContext(c);

  if (
    tenantCtx.role !== 'admin' &&
    tenantCtx.empresaCodigo !== 'airtrust' &&
    tenantCtx.empresaId !== id
  ) {
    throw new AppError('Sem permissão para acessar configurações desta empresa', 403);
  }

  const config = await db
    .prepare(
      `
    SELECT * FROM empresas_config WHERE empresa_id = ?
  `,
    )
    .bind(id)
    .first();

  const templateAtivo = await db
    .prepare(
      `SELECT template_json
       FROM certificados_templates
       WHERE empresa_id = ? AND ativo = 1 AND deleted_at IS NULL
       ORDER BY padrao DESC, updated_at DESC
       LIMIT 1`,
    )
    .bind(id)
    .first<{ template_json: string | null }>();

  return c.json({
    success: true,
    data: {
      ...(config || {}),
      certificado_template_html:
        templateAtivo?.template_json || (config as any)?.certificado_template_html || null,
    },
  });
});

// ============================================
// PUT /api/empresas/:id/config - Atualizar config
// ============================================
empresasRoutes.put('/:id/config', requireTenantRole('admin'), async (c) => {
  const db = c.env.DB;
  const id = parseInt(c.req.param('id'), 10);
  const tenantCtx = getTenantContext(c);

  if (tenantCtx.empresaCodigo !== 'airtrust' && tenantCtx.empresaId !== id) {
    throw new AppError('Sem permissão para editar configurações desta empresa', 403);
  }

  try {
    const body = await c.req.json();
    const data = EmpresaConfigSchema.parse(body);

    // Upsert config - only use columns that exist in empresas_config table
    await db
      .prepare(
        `
      INSERT INTO empresas_config (
        empresa_id, certificado_template_html, certificado_logo_url, 
        certificado_assinatura_digital, timezone, idioma
      )
      VALUES (?, ?, ?, ?, ?, ?)
      ON CONFLICT(empresa_id) DO UPDATE SET
        certificado_template_html = excluded.certificado_template_html,
        certificado_logo_url = excluded.certificado_logo_url,
        certificado_assinatura_digital = excluded.certificado_assinatura_digital,
        timezone = excluded.timezone,
        idioma = excluded.idioma,
        updated_at = datetime('now')
    `,
      )
      .bind(
        id,
        data.certificado_template_html || null,
        data.certificado_logo_url || null,
        data.certificado_assinatura_digital || null,
        data.timezone ?? 'America/Sao_Paulo',
        data.idioma ?? 'pt-BR',
      )
      .run();

    if (data.certificado_template_html && data.certificado_template_html.trim()) {
      await db
        .prepare(
          `UPDATE certificados_templates
           SET ativo = 0, updated_at = datetime('now')
           WHERE empresa_id = ? AND deleted_at IS NULL`,
        )
        .bind(id)
        .run();

      const existente = await db
        .prepare(
          `SELECT id FROM certificados_templates
           WHERE empresa_id = ? AND deleted_at IS NULL
           ORDER BY updated_at DESC, id DESC
           LIMIT 1`,
        )
        .bind(id)
        .first<{ id: number }>();

      if (existente?.id) {
        await db
          .prepare(
            `UPDATE certificados_templates
             SET template_json = ?, nome = ?, ativo = 1, padrao = 1, updated_at = datetime('now')
             WHERE id = ?`,
          )
          .bind(data.certificado_template_html, 'Template Certificado Ativo', existente.id)
          .run();
      } else {
        await db
          .prepare(
            `INSERT INTO certificados_templates (
               empresa_id, nome, template_json, ativo, padrao, created_at, updated_at
             ) VALUES (?, ?, ?, 1, 1, datetime('now'), datetime('now'))`,
          )
          .bind(id, 'Template Certificado Ativo', data.certificado_template_html)
          .run();
      }
    }

    return c.json({
      success: true,
      message: 'Configurações atualizadas com sucesso',
    });
  } catch (error: unknown) {
    createLogger(c, 'Empresas').error(
      'PUT /:id/config erro ao atualizar configurações',
      toError(error),
    );
    if (error instanceof AppError) throw error;
    return c.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Erro interno do servidor',
      },
      500,
    );
  }
});

// Usuarios e logo-base64 montados via sub-router
empresasRoutes.route('/', empresasUsuariosRoutes);

export { empresasRoutes };

~~~

---
## FILE: worker-airtrust/src/routes/funcionarios-mutations.ts
~~~typescript
/**
 * FUNCIONARIOS — Mutations
 * Sub-router mounted at /api/funcionarios via app.route('/', ...)
 *
 *   POST   /
 *   PUT    /:id
 *   DELETE /:id
 *   GET    /:id/escalas
 */

import { Hono } from 'hono';
import type { Context } from 'hono';
import type { Env, ApiResponse } from '../types';
import { softDelete } from '../utils/db';
import { notFound, badRequest } from '../middleware/error-handler';
import { isValidEmail, isValidCPF, sanitizeString } from '../utils/security';
import { auth } from '../middleware/auth';
import { requireRole } from '../middleware/rbac';
import { getEmpresaId } from '../middleware/tenant';
import { registrarAuditoria, extrairUsuarioAuditoria } from '../utils/auditoria';
import { syncFuncionarioCertificacoes } from '../services/sync-certificacoes-funcionarios';
import { publishDomainEvent } from '../shared/domainEvents';

const app = new Hono<{ Bindings: Env }>();

// Helper: normaliza valores vindos do body para flags inteiras (0|1)
function flagToInt(value: unknown): number {
  if (value === undefined || value === null) return 0;
  if (typeof value === 'number') return value === 1 ? 1 : 0;
  if (typeof value === 'boolean') return value ? 1 : 0;
  const s = String(value).trim().toLowerCase();
  if (s === '1' || s === 'true' || s === 'yes' || s === 'y') return 1;
  return 0;
}

function getEmpresaIdSafe(c: Context<{ Bindings: Env }>): number | undefined {
  try {
    return getEmpresaId(c);
  } catch {
    return undefined;
  }
}

function normalizeFuncionarioStatus(value?: string | null): string {
  const normalized = (value || '').trim().toUpperCase();
  if (!normalized) return 'ATIVO';
  return normalized === 'DESLIGADO' ? 'INATIVO' : normalized;
}

function normalizeFuncionarioQuinzena(value: unknown): string | null {
  if (value === undefined || value === null) return null;

  const normalized = String(value).trim().toLowerCase();
  if (!normalized) return null;

  const validQuinzenas = ['primeira', 'segunda', 'personalizada'];
  if (!validQuinzenas.includes(normalized)) {
    badRequest('Quinzena inválida. Valores aceitos: primeira, segunda, personalizada');
  }

  return normalized;
}

/**
 * POST /api/funcionarios
 * Cria novo funcionário
 *
 * RBAC: admin, manager
 */
app.post('/', auth(), requireRole('admin', 'manager'), async (c) => {
  const db = c.env.DB;
  const body = await c.req.json();

  // Validações obrigatórias (matrícula OPCIONAL agora)
  if (!body.nome || !body.cpf || !body.email) {
    badRequest('Campos obrigatórios: nome, cpf, email');
  }

  // Validar email
  if (!isValidEmail(body.email)) {
    badRequest('Email inválido');
  }

  // Validar CPF
  if (!isValidCPF(body.cpf)) {
    badRequest('CPF inválido');
  }

  // Verificar se matricula já existe (APENAS se fornecida)
  if (body.matricula) {
    const existing = await db
      .prepare('SELECT id FROM funcionarios WHERE matricula = ? AND deleted_at IS NULL')
      .bind(body.matricula)
      .first();

    if (existing) {
      badRequest('Matrícula já cadastrada');
    }
  }

  // Verificar se CPF já existe
  const existingCPF = await db
    .prepare('SELECT id FROM funcionarios WHERE cpf = ? AND deleted_at IS NULL')
    .bind(body.cpf)
    .first();

  if (existingCPF) {
    badRequest('CPF já cadastrado');
  }

  // Inserir com TODOS os campos (novos são opcionais)
  const query = `
    INSERT INTO funcionarios (
      matricula, nome, guerra, cpf, rg, nascimento, sexo, nacionalidade,
      email, telefone, telefone_emergencia, contato_emergencia_nome,
      funcao, cargo, setor, base, modelo_aeronave_id, admissao, codigo_anac,
      nivel_icao, data_realizacao_icao, validade_icao,
      cma, data_realizacao_cma, validade_cma,
      aso, data_realizacao_aso, validade_aso,
      sispat, prestserv,
      cep, logradouro, numero, complemento, bairro, cidade, estado,
      observacoes, foto_url, status, ativo, is_instrutor, is_checador, empresa_id,
      created_at, updated_at
    )
    VALUES (
      ?, ?, ?, ?, ?, ?, ?, ?,
      ?, ?, ?, ?,
      ?, ?, ?, ?, ?, ?, ?,
      ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?,
      ?, ?, ?, ?, ?, ?, ?,
      ?, ?, ?, ?, ?, ?, ?,
      datetime('now'), datetime('now')
    )
  `;

  const insertEmpresaId = getEmpresaIdSafe(c) ?? null;

  const result = await db
    .prepare(query)
    .bind(
      // Dados Pessoais
      body.matricula ? sanitizeString(body.matricula) : null,
      body.nome ? sanitizeString(body.nome) : null,
      body.guerra || null,
      body.cpf ? body.cpf.replace(/\D/g, '') : null,
      body.rg || null,
      body.nascimento || null,
      body.sexo || null,
      body.nacionalidade || 'Brasileira',
      body.email ? body.email.toLowerCase() : null,
      body.telefone || null,
      body.telefone_emergencia || null,
      body.contato_emergencia_nome || null,
      // Dados Profissionais
      body.funcao || null,
      body.cargo || null,
      body.setor || null,
      body.base || null,
      body.modelo_aeronave_id || null,
      body.admissao || null,
      body.codigo_anac || null,
      // Qualificações/Documentação
      body.nivel_icao || null,
      body.data_realizacao_icao || null,
      body.validade_icao || null,
      body.cma || null,
      body.data_realizacao_cma || null,
      body.validade_cma || null,
      body.aso || null,
      body.data_realizacao_aso || null,
      body.validade_aso || null,
      body.sispat || null,
      body.prestserv || null,
      // Endereço
      body.cep || null,
      body.logradouro || null,
      body.numero || null,
      body.complemento || null,
      body.bairro || null,
      body.cidade || null,
      body.estado || null,
      // Outros
      body.observacoes || null,
      body.foto_url || null,
      normalizeFuncionarioStatus(body.status),
      body.ativo !== undefined
        ? body.ativo
          ? 1
          : 0
        : normalizeFuncionarioStatus(body.status) === 'ATIVO'
          ? 1
          : 0,
      flagToInt(body.is_instrutor),
      flagToInt(body.is_checador),
      insertEmpresaId,
    )
    .run();

  const novoId = result.meta.last_row_id;

  // Buscar dados completos para auditoria
  const novoFuncionario = await db
    .prepare('SELECT * FROM funcionarios WHERE id = ?')
    .bind(novoId)
    .first();

  // Registrar auditoria
  const auditoriaInfo = extrairUsuarioAuditoria(c);
  await registrarAuditoria({
    db,
    tabela: 'funcionarios',
    acao: 'INSERT',
    registro_id: novoId,
    dados_novos: novoFuncionario,
    ...auditoriaInfo,
  });

  // Sincronizar certificações para qualificacoes_historico
  try {
    await syncFuncionarioCertificacoes(db, {
      funcionario_id: novoId,
      nivel_icao: body.nivel_icao,
      data_realizacao_icao: body.data_realizacao_icao,
      validade_icao: body.validade_icao,
      cma: body.cma,
      data_realizacao_cma: body.data_realizacao_cma,
      validade_cma: body.validade_cma,
      aso: body.aso,
      data_realizacao_aso: body.data_realizacao_aso,
      validade_aso: body.validade_aso,
    });
  } catch (syncError) {
    console.error('[Funcionarios] Erro ao sincronizar certificações:', syncError);
    // Não falhar a requisição, apenas logar o erro
  }

  const response: ApiResponse<{ id: number }> = {
    success: true,
    data: { id: novoId },
    message: 'Funcionário criado com sucesso',
  };

  return c.json(response, 201);
});

/**
 * PUT /api/funcionarios/:id
 * Atualiza funcionário existente
 *
 * RBAC: admin, manager
 */
app.put('/:id', auth(), requireRole('admin', 'manager'), async (c) => {
  const db = c.env.DB;
  const id = parseInt(c.req.param('id'));
  const body = await c.req.json();

  if (isNaN(id)) {
    badRequest('ID inválido');
  }

  // Verificar se existe
  const existing = await db
    .prepare('SELECT * FROM funcionarios WHERE id = ? AND deleted_at IS NULL')
    .bind(id)
    .first();

  if (!existing) {
    notFound('Funcionário não encontrado');
  }

  // Guardar dados anteriores para auditoria
  const dadosAnteriores = { ...existing };

  // Validações opcionais
  if (body.email && !isValidEmail(body.email)) {
    badRequest('Email inválido');
  }

  // Verificar duplicatas de matrícula (excluindo próprio registro)
  if (body.matricula) {
    const duplicateMatricula = await db
      .prepare('SELECT id FROM funcionarios WHERE matricula = ? AND id != ? AND deleted_at IS NULL')
      .bind(body.matricula, id)
      .first();

    if (duplicateMatricula) {
      badRequest('Matrícula já cadastrada para outro funcionário');
    }
  }

  // Verificar duplicatas de CPF (excluindo próprio registro)
  if (body.cpf) {
    const duplicateCPF = await db
      .prepare('SELECT id FROM funcionarios WHERE cpf = ? AND id != ? AND deleted_at IS NULL')
      .bind(body.cpf, id)
      .first();

    if (duplicateCPF) {
      badRequest('CPF já cadastrado para outro funcionário');
    }
  }

  // Construir UPDATE dinâmico (apenas campos fornecidos)
  const updates: string[] = [];
  const bindings: unknown[] = [];

  if (body.matricula !== undefined) {
    updates.push('matricula = ?');
    bindings.push(body.matricula ? sanitizeString(body.matricula) : null);
  }

  if (body.nome !== undefined) {
    updates.push('nome = ?');
    bindings.push(body.nome ? sanitizeString(body.nome) : null);
  }

  if (body.cpf !== undefined) {
    updates.push('cpf = ?');
    bindings.push(body.cpf ? body.cpf.replace(/\D/g, '') : null);
  }

  if (body.email !== undefined) {
    updates.push('email = ?');
    bindings.push(body.email ? body.email.toLowerCase() : null);
  }

  if (body.telefone !== undefined) {
    updates.push('telefone = ?');
    bindings.push(body.telefone || null);
  }

  if (body.cargo !== undefined) {
    updates.push('cargo = ?');
    bindings.push(body.cargo);
  }

  if (body.setor !== undefined) {
    updates.push('setor = ?');
    bindings.push(body.setor);
  }

  if (body.funcao !== undefined) {
    updates.push('funcao = ?');
    bindings.push(body.funcao);
  }

  if (body.quinzena !== undefined) {
    updates.push('quinzena = ?');
    bindings.push(normalizeFuncionarioQuinzena(body.quinzena));
  }

  if (body.codigo_anac !== undefined) {
    updates.push('codigo_anac = ?');
    bindings.push(body.codigo_anac);
  }

  if (body.ativo !== undefined) {
    updates.push('ativo = ?');
    bindings.push(body.ativo ? 1 : 0);
  }

  if (body.is_instrutor !== undefined) {
    updates.push('is_instrutor = ?');
    bindings.push(flagToInt(body.is_instrutor));
  }

  if (body.is_checador !== undefined) {
    updates.push('is_checador = ?');
    bindings.push(flagToInt(body.is_checador));
  }

  if (body.admissao !== undefined) {
    updates.push('admissao = ?');
    bindings.push(body.admissao);
  }

  if (body.status !== undefined) {
    const normalizedStatus = normalizeFuncionarioStatus(body.status);
    updates.push('status = ?');
    bindings.push(normalizedStatus);
    // Sync ativo column: ATIVO → 1, any other status → 0
    const isAtivo = normalizedStatus === 'ATIVO';
    updates.push('ativo = ?');
    bindings.push(isAtivo ? 1 : 0);
  }

  // ===== NOVOS CAMPOS ADICIONADOS =====

  // Dados Pessoais
  if (body.rg !== undefined) {
    updates.push('rg = ?');
    bindings.push(body.rg);
  }

  if (body.guerra !== undefined) {
    updates.push('guerra = ?');
    bindings.push(body.guerra);
  }

  if (body.nascimento !== undefined) {
    updates.push('nascimento = ?');
    bindings.push(body.nascimento);
  }

  // NOVOS CAMPOS FASE 1
  if (body.sexo !== undefined) {
    updates.push('sexo = ?');
    bindings.push(body.sexo);
  }

  if (body.nacionalidade !== undefined) {
    updates.push('nacionalidade = ?');
    bindings.push(body.nacionalidade);
  }

  if (body.telefone_emergencia !== undefined) {
    updates.push('telefone_emergencia = ?');
    bindings.push(body.telefone_emergencia);
  }

  if (body.contato_emergencia_nome !== undefined) {
    updates.push('contato_emergencia_nome = ?');
    bindings.push(body.contato_emergencia_nome);
  }

  if (body.foto_url !== undefined) {
    updates.push('foto_url = ?');
    bindings.push(body.foto_url);
  }

  // Dados Profissionais
  if (body.base !== undefined) {
    updates.push('base = ?');
    bindings.push(body.base);
  }

  if (body.modelo_aeronave_id !== undefined) {
    updates.push('modelo_aeronave_id = ?');
    bindings.push(body.modelo_aeronave_id);

    // Atualizar coluna legada 'aeronave' quando modelo_aeronave_id mudar
    const modeloAeronave = await db
      .prepare(
        `SELECT COALESCE(modelo, codigo, nome) AS aeronave FROM modelos_aeronave WHERE id = ?`,
      )
      .bind(body.modelo_aeronave_id)
      .first<{ aeronave: string }>();

    if (modeloAeronave?.aeronave) {
      updates.push('aeronave = ?');
      bindings.push(modeloAeronave.aeronave);
    }
  }

  // Qualificações/Documentação
  if (body.nivel_icao !== undefined) {
    updates.push('nivel_icao = ?');
    bindings.push(body.nivel_icao);
  }

  if (body.data_realizacao_icao !== undefined) {
    updates.push('data_realizacao_icao = ?');
    bindings.push(body.data_realizacao_icao);
  }

  if (body.validade_icao !== undefined) {
    updates.push('validade_icao = ?');
    bindings.push(body.validade_icao);
  }

  if (body.cma !== undefined) {
    updates.push('cma = ?');
    bindings.push(body.cma);
  }

  if (body.data_realizacao_cma !== undefined) {
    updates.push('data_realizacao_cma = ?');
    bindings.push(body.data_realizacao_cma);
  }

  if (body.validade_cma !== undefined) {
    updates.push('validade_cma = ?');
    bindings.push(body.validade_cma);
  }

  if (body.aso !== undefined) {
    updates.push('aso = ?');
    bindings.push(body.aso);
  }

  if (body.data_realizacao_aso !== undefined) {
    updates.push('data_realizacao_aso = ?');
    bindings.push(body.data_realizacao_aso);
  }

  if (body.validade_aso !== undefined) {
    updates.push('validade_aso = ?');
    bindings.push(body.validade_aso);
  }

  if (body.sispat !== undefined) {
    updates.push('sispat = ?');
    bindings.push(body.sispat);
  }

  if (body.prestserv !== undefined) {
    updates.push('prestserv = ?');
    bindings.push(body.prestserv);
  }

  // Endereço Completo
  if (body.cep !== undefined) {
    updates.push('cep = ?');
    bindings.push(body.cep);
  }

  if (body.logradouro !== undefined) {
    updates.push('logradouro = ?');
    bindings.push(body.logradouro);
  }

  if (body.numero !== undefined) {
    updates.push('numero = ?');
    bindings.push(body.numero);
  }

  if (body.complemento !== undefined) {
    updates.push('complemento = ?');
    bindings.push(body.complemento);
  }

  if (body.bairro !== undefined) {
    updates.push('bairro = ?');
    bindings.push(body.bairro);
  }

  if (body.cidade !== undefined) {
    updates.push('cidade = ?');
    bindings.push(body.cidade);
  }

  if (body.estado !== undefined) {
    updates.push('estado = ?');
    bindings.push(body.estado);
  }

  // Observações
  if (body.observacoes !== undefined) {
    updates.push('observacoes = ?');
    bindings.push(body.observacoes);
  }

  // ===== FIM DOS NOVOS CAMPOS =====

  if (updates.length === 0) {
    badRequest('Nenhum campo para atualizar');
  }

  updates.push("updated_at = datetime('now')");

  const query = `UPDATE funcionarios SET ${updates.join(', ')} WHERE id = ?`;

  await db
    .prepare(query)
    .bind(...bindings, id)
    .run();

  // Buscar dados atualizados para auditoria
  const dadosNovos = await db.prepare('SELECT * FROM funcionarios WHERE id = ?').bind(id).first();

  // Registrar auditoria
  const auditoriaInfo = extrairUsuarioAuditoria(c);
  await registrarAuditoria({
    db,
    tabela: 'funcionarios',
    acao: 'UPDATE',
    registro_id: id,
    dados_anteriores: dadosAnteriores,
    dados_novos: dadosNovos,
    ...auditoriaInfo,
  });
  // Sincronizar certificações para qualificacoes_historico
  try {
    await syncFuncionarioCertificacoes(db, {
      funcionario_id: id,
      nivel_icao: body.nivel_icao,
      data_realizacao_icao: body.data_realizacao_icao,
      validade_icao: body.validade_icao,
      cma: body.cma,
      data_realizacao_cma: body.data_realizacao_cma,
      validade_cma: body.validade_cma,
      aso: body.aso,
      data_realizacao_aso: body.data_realizacao_aso,
      validade_aso: body.validade_aso,
    });
  } catch (syncError) {
    console.error('[Funcionarios] Erro ao sincronizar certificações (UPDATE):', syncError);
    // Não falhar a requisição, apenas logar o erro
  }
  const response: ApiResponse = {
    success: true,
    message: 'Funcionário atualizado com sucesso',
  };

  return c.json(response);
});

/**
 * DELETE /api/funcionarios/:id
 * Remove funcionário (soft delete)
 *
 * RBAC: apenas admin
 */
app.delete('/:id', auth(), requireRole('admin'), async (c) => {
  const db = c.env.DB;
  const id = parseInt(c.req.param('id'));

  if (isNaN(id)) {
    badRequest('ID inválido');
  }

  // Buscar dados antes de deletar para auditoria
  const funcionario = await db
    .prepare('SELECT * FROM funcionarios WHERE id = ? AND deleted_at IS NULL')
    .bind(id)
    .first();

  if (!funcionario) {
    notFound('Funcionário não encontrado');
  }

  const result = await softDelete(db, 'funcionarios', id);

  if (result.meta.changes === 0) {
    notFound('Funcionário não encontrado');
  }

  // Registrar auditoria
  const auditoriaInfo = extrairUsuarioAuditoria(c);
  await registrarAuditoria({
    db,
    tabela: 'funcionarios',
    acao: 'DELETE',
    registro_id: id,
    dados_anteriores: funcionario,
    ...auditoriaInfo,
  });

  try {
    const empresaId = Number((funcionario as { empresa_id?: number }).empresa_id || 0);
    if (empresaId > 0) {
      await publishDomainEvent(db, 'funcionarios', 'FUNCIONARIO_INATIVADO', {
        origem_modulo: 'funcionarios',
        funcionario_id: String(id),
        empresa_id: empresaId,
      });
    }
  } catch (error) {
    console.error('domain_event_error', error);
  }

  const response: ApiResponse = {
    success: true,
    message: 'Funcionário removido com sucesso',
  };

  return c.json(response);
});

// ================================================================
// INT-02: GET /api/funcionarios/:id/escalas
// Returns escalas history & active allocations for this employee
// ================================================================
app.get('/:id/escalas', auth(), async (c) => {
  const { id } = c.req.param();
  const db = c.env.DB;
  const empresaId = getEmpresaIdSafe(c);
  const limit = Number(c.req.query('limit') || '20');
  const offset = Number(c.req.query('offset') || '0');
  const status = c.req.query('status'); // rascunho|publicada|encerrada

  try {
    // Verify employee exists
    const func = await db
      .prepare(
        'SELECT id, nome FROM funcionarios WHERE id = ? AND empresa_id = ? AND deleted_at IS NULL',
      )
      .bind(id, empresaId)
      .first();
    if (!func) return c.json({ success: false, error: 'Funcionário não encontrado' }, 404);

    // Get escalas where this employee has tripulações (pic_id or sic_id)
    let sql = `
      SELECT DISTINCT
        em.id, em.titulo, em.mes, em.ano, em.status,
        em.created_at, em.updated_at,
        (SELECT COUNT(*) FROM escala_tripulacoes et2
         WHERE et2.escala_id = em.id AND (et2.pic_id = ? OR et2.sic_id = ?) AND et2.deleted_at IS NULL) AS total_tripulacoes,
        (SELECT COUNT(*) FROM escala_eventos ee2
         WHERE ee2.escala_id = em.id AND ee2.funcionario_id = ? AND ee2.deleted_at IS NULL) AS total_eventos
      FROM escalas_mensais em
      JOIN escala_tripulacoes et ON et.escala_id = em.id AND (et.pic_id = ? OR et.sic_id = ?)
      WHERE em.empresa_id = ? AND em.deleted_at IS NULL AND et.deleted_at IS NULL
    `;
    const params: any[] = [id, id, id, id, id, empresaId];

    if (status) {
      sql += ` AND em.status = ?`;
      params.push(status);
    }

    sql += ` ORDER BY em.ano DESC, em.mes DESC LIMIT ? OFFSET ?`;
    params.push(limit, offset);

    const rows = await db
      .prepare(sql)
      .bind(...params)
      .all();

    // Count total
    let countSql = `
      SELECT COUNT(DISTINCT em.id) AS total
      FROM escalas_mensais em
      JOIN escala_tripulacoes et ON et.escala_id = em.id AND (et.pic_id = ? OR et.sic_id = ?)
      WHERE em.empresa_id = ? AND em.deleted_at IS NULL AND et.deleted_at IS NULL
    `;
    const countParams: any[] = [id, id, empresaId];
    if (status) {
      countSql += ` AND em.status = ?`;
      countParams.push(status);
    }
    const countRow = await db
      .prepare(countSql)
      .bind(...countParams)
      .first<{ total: number }>();

    return c.json({
      success: true,
      data: rows.results || [],
      pagination: {
        total: countRow?.total ?? 0,
        limit,
        offset,
      },
    });
  } catch (e) {
    return c.json({ success: false, error: String(e) }, 500);
  }
});

export default app;

~~~
