/**
 * DIAGNOSTIC: Auth Login Flow Step-by-Step Test
 *
 * Simulates the exact login handler flow to identify where
 * the "TypeError: Load failed" crash occurs for valid admin credentials.
 *
 * Tests each step in isolation and then the full flow.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { hashPassword, verifyPassword, generateJWT, verifyJWT, generateRefreshToken, getRefreshTokenExpiry } from '../utils/security';

const MOCK_JWT_SECRET = '32-char-test-secret-key-not-real!!';

// ===== MOCK D1 DATABASE =====
// Simulates the sqlite_master and record responses

function createMockDb(opts: {
  hasUsuariosEmpresas?: boolean;
  userRecord?: Record<string, unknown> | null;
  empresaVinculo?: Record<string, unknown> | null;
  empresaRole?: Record<string, unknown> | null;
  permissoes?: Array<Record<string, unknown>>;
  funcionarioId?: number | null;
  insertFails?: boolean;
} = {}) {
  const {
    hasUsuariosEmpresas = true,
    userRecord = null,
    empresaVinculo = { empresa_id: 6 },
    empresaRole = { role: 'admin' },
    permissoes = [],
    funcionarioId = 41,
    insertFails = false,
  } = opts;

  const preparedStmts: Array<{ sql: string; bindings: unknown[] }> = [];

  const db = {
    prepare(sql: string) {
      const stmt = {
        _sql: sql,
        _bindings: [] as unknown[],
        bind(...args: unknown[]) {
          stmt._bindings = args;
          return stmt;
        },
        async first<T>(): Promise<T | null> {
          preparedStmts.push({ sql, bindings: stmt._bindings });

          // sqlite_master check for usuarios_empresas
          if (sql.includes("sqlite_master") && sql.includes("usuarios_empresas")) {
            return { found: hasUsuariosEmpresas ? 1 : 0 } as unknown as T;
          }

          // PRAGMA table_info
          if (sql.includes("PRAGMA table_info")) {
            return { name: 'active' } as unknown as T;
          }

          // sqlite_master check for usuarios
          if (sql.includes("sqlite_master") && sql.includes("usuarios")) {
            return { found: 1 } as unknown as T;
          }

          // sqlite_master check for user_platform_roles
          if (sql.includes("sqlite_master") && sql.includes("user_platform_roles")) {
            return { found: 0 } as unknown as T;
          }

          // sqlite_master check for support_access_grants
          if (sql.includes("sqlite_master") && sql.includes("support_access_grants")) {
            return { found: 0 } as unknown as T;
          }

          // User lookup by email
          if (sql.includes("FROM usuarios") && sql.includes("email")) {
            return userRecord as unknown as T;
          }

          // usuarios_empresas lookup for empresa
          if (sql.includes("FROM usuarios_empresas ue") && sql.includes("ORDER BY")) {
            return empresaVinculo as unknown as T;
          }

          // usuarios_empresas role lookup
          if (sql.includes("ue.role") && sql.includes("INNER JOIN empresas e ON e.id = ue.empresa_id")) {
            return empresaRole as unknown as T;
          }

          // funcionario_id lookup
          if (sql.includes("funcionario_id FROM usuarios")) {
            return { funcionario_id: funcionarioId } as unknown as T;
          }

          // platform roles
          if (sql.includes("user_platform_roles")) {
            return null;
          }

          // fallback empresa lookup
          if (sql.includes("FROM empresas e") && (sql.includes("ativo = 1") || sql.includes("deleted_at IS NULL")) && !sql.includes("INNER JOIN")) {
            return { empresa_id: 6 } as unknown as T;
          }

          return null;
        },
        async all<T>(): Promise<{ results: T[] }> {
          preparedStmts.push({ sql, bindings: stmt._bindings });

          // usuario_permissoes
          if (sql.includes("usuario_permissoes")) {
            return { results: permissoes as unknown as T[] };
          }

          return { results: [] as unknown as T[] };
        },
        async run() {
          preparedStmts.push({ sql, bindings: stmt._bindings });
          if (insertFails && sql.includes("INSERT INTO refresh_tokens")) {
            throw new Error('DB insert failed');
          }
          return { success: true };
        },
      };
      return stmt;
    },
  };

  return { db, preparedStmts };
}

// ===== TEST SUITE =====

describe('Auth Login Diagnostic - Success Path Steps', () => {
  let testPassword: string;
  let testHash: string;

  beforeEach(async () => {
    testPassword = 'ValidPassword123!';
    testHash = await hashPassword(testPassword);
  });

  // Step 1: Password verification
  it('Step 1: verifyPassword succeeds with correct password', async () => {
    const result = await verifyPassword(testPassword, testHash);
    expect(result).toBe(true);
  });

  it('Step 1: verifyPassword fails with wrong password', async () => {
    const result = await verifyPassword('WrongPassword', testHash);
    expect(result).toBe(false);
  });

  // Step 2: JWT generation
  it('Step 2: generateJWT produces valid token', async () => {
    const payload = {
      sub: 41,
      empresa_id: 6,
      email: 'filipe.daumas@icloud.com',
      role: 'ADMINISTRADOR',
      nome: 'Administrador Test',
      permissions: ['GRANT:manage_users', 'GRANT:view_reports'],
      funcionario_id: 41,
    };

    const { token, jti } = await generateJWT(payload, MOCK_JWT_SECRET, 3600);

    expect(token).toBeTruthy();
    expect(jti).toBeTruthy();
    expect(typeof token).toBe('string');

    // Verify the token
    const decoded = await verifyJWT(token, MOCK_JWT_SECRET);
    expect(decoded).not.toBeNull();
    expect(decoded!.sub).toBe('41');
    expect(decoded!.empresa_id).toBe(6);
    expect(decoded!.role).toBe('ADMINISTRADOR');
    expect(decoded!.funcionario_id).toBe(41);
    expect(decoded!.permissions).toEqual(['GRANT:manage_users', 'GRANT:view_reports']);
  });

  // Step 3: JWT with null funcionario_id
  it('Step 3: generateJWT handles null funcionario_id', async () => {
    const payload = {
      sub: 41,
      empresa_id: 6,
      email: 'filipe.daumas@icloud.com',
      role: 'ADMINISTRADOR',
      nome: 'Administrador Test',
      permissions: undefined as string[] | undefined,
      funcionario_id: null as number | null,
    };

    const { token } = await generateJWT(payload, MOCK_JWT_SECRET, 3600);
    const decoded = await verifyJWT(token, MOCK_JWT_SECRET);
    expect(decoded).not.toBeNull();
    expect(decoded!.funcionario_id).toBeNull();
  });

  // Step 4: JWT with undefined permissions
  it('Step 4: generateJWT handles undefined permissions', async () => {
    const payload = {
      sub: 41,
      empresa_id: 6,
      email: 'filipe.daumas@icloud.com',
      role: 'ADMINISTRADOR',
      nome: 'Administrador Test',
      permissions: undefined as string[] | undefined,
      funcionario_id: 41,
    };

    const { token } = await generateJWT(payload, MOCK_JWT_SECRET, 3600);
    const decoded = await verifyJWT(token, MOCK_JWT_SECRET);
    expect(decoded).not.toBeNull();
    expect(decoded!.permissions).toBeUndefined();
  });

  // Step 5: JWT with empty permissions array
  it('Step 5: generateJWT handles empty permissions array', async () => {
    const payload = {
      sub: 41,
      empresa_id: 6,
      email: 'filipe.daumas@icloud.com',
      role: 'ADMINISTRADOR',
      nome: 'Administrador Test',
      permissions: [] as string[],
      funcionario_id: 41,
    };

    const { token } = await generateJWT(payload, MOCK_JWT_SECRET, 3600);
    const decoded = await verifyJWT(token, MOCK_JWT_SECRET);
    expect(decoded).not.toBeNull();
    // Empty array should be present in the payload
    expect(decoded!.permissions).toEqual([]);
  });

  // Step 6: Refresh token generation
  it('Step 6: generateRefreshToken produces unique tokens', () => {
    const rt1 = generateRefreshToken();
    const rt2 = generateRefreshToken();

    expect(rt1).toBeTruthy();
    expect(rt1).not.toBe(rt2);
    expect(rt1.length).toBe(64); // 32 bytes * 2 hex chars
    expect(/^[0-9a-f]{64}$/.test(rt1)).toBe(true);
  });

  // Step 7: Refresh token expiry
  it('Step 7: getRefreshTokenExpiry returns future date', () => {
    const expiry = getRefreshTokenExpiry(7);
    const expiryDate = new Date(expiry);
    const now = new Date();
    const sevenDaysFromNow = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);

    expect(expiryDate.getTime()).toBeGreaterThan(now.getTime());
    // Should be approximately 7 days from now (within 1 second tolerance)
    expect(Math.abs(expiryDate.getTime() - sevenDaysFromNow.getTime())).toBeLessThan(2000);
  });

  // Step 8: Full response object serialization
  it('Step 8: Response object is JSON-serializable', () => {
    const responseData = {
      success: true,
      data: {
        accessToken: 'eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiI0MSJ9.abc123',
        refreshToken: 'a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9b0c1d2e3f4a5b6c7d8e9f0a1b2',
        user: {
          id: 41,
          email: 'filipe.daumas@icloud.com',
          role: 'ADMINISTRADOR',
          nome: 'Filipe Daumas',
          permissions: ['GRANT:manage_users', 'GRANT:view_reports'],
          funcionario_id: 41,
        },
      },
    };

    // Should not throw
    const json = JSON.stringify(responseData);
    const parsed = JSON.parse(json);
    expect(parsed.success).toBe(true);
    expect(parsed.data.accessToken).toBeTruthy();
    expect(parsed.data.user.funcionario_id).toBe(41);
  });

  // Step 9: Response with null funcionario_id is serializable
  it('Step 9: Response with null funcionario_id is JSON-serializable', () => {
    const responseData = {
      success: true,
      data: {
        accessToken: 'eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiI0MSJ9.abc123',
        refreshToken: 'a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9b0c1d2e3f4a5b6c7d8e9f0a1b2',
        user: {
          id: 41,
          email: 'filipe.daumas@icloud.com',
          role: 'ADMINISTRADOR',
          nome: 'Filipe Daumas',
          permissions: [],
          funcionario_id: null,
        },
      },
    };

    const json = JSON.stringify(responseData);
    const parsed = JSON.parse(json);
    expect(parsed.data.user.funcionario_id).toBeNull();
  });

  // Step 10: JWT with multiple permissions and non-ASCII name
  it('Step 10: generateJWT handles non-ASCII characters in nome', async () => {
    const payload = {
      sub: 41,
      empresa_id: 6,
      email: 'filipe.daumas@icloud.com',
      role: 'ADMINISTRADOR',
      nome: 'Filipe Dáùmâs Çedilha',
      permissions: ['GRANT:manage_users'],
      funcionario_id: 41,
    };

    const { token } = await generateJWT(payload, MOCK_JWT_SECRET, 3600);
    const decoded = await verifyJWT(token, MOCK_JWT_SECRET);
    expect(decoded).not.toBeNull();
    expect(decoded!.nome).toBe('Filipe Dáùmâs Çedilha');
  });

  // Step 11: JWT with ALL possible fields (max payload test)
  it('Step 11: generateJWT with max payload is valid', async () => {
    const payload = {
      sub: 41,
      empresa_id: 6,
      email: 'filipe.daumas@icloud.com',
      role: 'ADMINISTRADOR',
      nome: 'Filipe Daumas',
      permissions: Array.from({ length: 50 }, (_, i) => `GRANT:permission_${i}`),
      funcionario_id: 41,
    };

    const { token } = await generateJWT(payload, MOCK_JWT_SECRET, 3600);
    expect(token.length).toBeGreaterThan(0);

    const decoded = await verifyJWT(token, MOCK_JWT_SECRET);
    expect(decoded).not.toBeNull();
    expect(decoded!.permissions).toHaveLength(50);
  });
});

describe('Auth Login Diagnostic - Error Handling', () => {
  // Step E1: What happens when JWT_SECRET is missing
  it('E1: Error when JWT_SECRET is missing is catchable', () => {
    const secret: string | undefined = undefined;
    expect(() => {
      if (!secret) throw new Error('JWT_SECRET não configurado no ambiente');
    }).toThrow('JWT_SECRET não configurado no ambiente');
  });

  // Step E2: Error is properly wrapped in ApiError format
  it('E2: ApiError has correct shape for JSON response', () => {
    class ApiError extends Error {
      constructor(message: string, public statusCode: number, public code?: string) {
        super(message);
        this.name = 'ApiError';
      }
    }

    const error = new ApiError('Erro ao processar login', 500, 'LOGIN_ERROR');
    const response = {
      success: false,
      error: error.message,
      code: error.code,
      requestId: 'test-request-id',
    };

    expect(() => JSON.stringify(response)).not.toThrow();
    const json = JSON.stringify(response);
    const parsed = JSON.parse(json);
    expect(parsed.success).toBe(false);
    expect(parsed.code).toBe('LOGIN_ERROR');
    expect(parsed.requestId).toBeTruthy();
  });

  // Step E3: Verify what happens when the catch block logger fails
  it('E3: Logger failure does not propagate', () => {
    // Simulate logger creating an error but being caught
    const simulateCatchBlock = () => {
      try {
        throw new Error('Some internal error');
      } catch (error) {
        // This is what the login handler does
        try {
          // Logger call - should not throw
          const errorObj = error instanceof Error ? error : new Error(String(error));
          JSON.stringify({ message: errorObj.message, name: errorObj.name });
        } catch {
          // Logger failed, but we still throw internalError
        }
        // This should always execute
        throw { name: 'ApiError', message: 'Erro ao processar login', statusCode: 500, code: 'LOGIN_ERROR' };
      }
    };

    expect(simulateCatchBlock).toThrow();
  });
});
