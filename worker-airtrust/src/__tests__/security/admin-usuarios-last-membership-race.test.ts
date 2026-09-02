import { Hono } from 'hono';
import { describe, expect, it, vi } from 'vitest';
import type { Env } from '../../types';

vi.mock('../../middleware/auth', () => ({
  auth:
    () => async (c: { set: (key: string, value: unknown) => void }, next: () => Promise<void>) => {
      c.set('userId', 900);
      c.set('userRole', 'ADMINISTRADOR');
      await next();
    },
}));

vi.mock('../../middleware/tenant', () => ({
  getTenantContext: (c: { req: { header: (name: string) => string | undefined } }) => ({
    empresaId: Number(c.req.header('x-empresa-id')),
  }),
}));

import { adminUsuariosRoutes } from '../../routes/admin-usuarios';

type FakePreparedStatement = {
  sql: string;
  args: unknown[];
  bind: (...args: unknown[]) => FakePreparedStatement;
  first: <T>() => Promise<T | null>;
  all: <T>() => Promise<{ results: T[] }>;
  run: () => Promise<{ success: boolean }>;
};

type RemovalAudit = {
  empresaId: number;
  identityDeactivated: number;
};

class ConcurrentRemovalDatabase {
  readonly memberships = new Map<number, Set<number>>([[42, new Set([10, 20])]]);
  readonly preflightSnapshots: number[] = [];
  readonly audits: RemovalAudit[] = [];
  userActive = true;
  refreshRevoked = false;
  tokenBlocklisted = false;

  private preflightReads = 0;
  private preflightRelease: (() => void) | undefined;
  private readonly preflightBarrier = new Promise<void>((resolve) => {
    this.preflightRelease = resolve;
  });
  private batchTail: Promise<void> = Promise.resolve();

  prepare(sql: string): FakePreparedStatement {
    return this.buildStatement(sql, []);
  }

  async batch(statements: FakePreparedStatement[]) {
    const previousBatch = this.batchTail;
    let releaseBatch: (() => void) | undefined;
    this.batchTail = new Promise<void>((resolve) => {
      releaseBatch = resolve;
    });

    await previousBatch;
    try {
      return statements.map((statement) => this.execute(statement));
    } finally {
      releaseBatch?.();
    }
  }

  private buildStatement(sql: string, args: unknown[]): FakePreparedStatement {
    return {
      sql,
      args,
      bind: (...boundArgs: unknown[]) => this.buildStatement(sql, boundArgs),
      first: async <T>() => {
        if (sql.includes('FROM usuarios u') && sql.includes('INNER JOIN usuarios_empresas ue')) {
          const empresaId = Number(args[0]);
          const targetUserId = Number(args[1]);
          const memberships = this.memberships.get(targetUserId);
          if (!memberships?.has(empresaId)) return null;

          const snapshot = memberships.size;
          this.preflightSnapshots.push(snapshot);
          this.preflightReads += 1;
          if (this.preflightReads === 2) this.preflightRelease?.();
          await this.preflightBarrier;

          return {
            id: targetUserId,
            perfil: 'USUARIO',
            membership_count: snapshot,
          } as T;
        }
        throw new Error(`Unexpected first() query: ${sql}`);
      },
      all: async <T>() => ({ results: [{ name: 'access_token_jti' }] as T[] }),
      run: async () => ({ success: true }),
    };
  }

  private execute(statement: FakePreparedStatement) {
    const { sql, args } = statement;

    if (sql.includes('DELETE FROM usuarios_empresas')) {
      const targetUserId = Number(args[0]);
      const empresaId = Number(args[1]);
      this.memberships.get(targetUserId)?.delete(empresaId);
      return { success: true, results: [] };
    }

    if (sql.includes('INSERT OR IGNORE INTO token_blocklist')) {
      const targetUserId = Number(args[0]);
      if (this.hasNoMemberships(targetUserId)) this.tokenBlocklisted = true;
      return { success: true, results: [] };
    }

    if (sql.includes('UPDATE refresh_tokens')) {
      const targetUserId = Number(args[0]);
      if (this.hasNoMemberships(targetUserId)) this.refreshRevoked = true;
      return { success: true, results: [] };
    }

    if (sql.includes('UPDATE usuarios')) {
      const targetUserId = Number(args[0]);
      if (this.hasNoMemberships(targetUserId)) this.userActive = false;
      return { success: true, results: [] };
    }

    if (sql.includes('INSERT INTO audit_logs')) {
      const empresaId = Number(args[0]);
      const targetUserId = Number(args[2]);
      this.audits.push({
        empresaId,
        identityDeactivated: this.hasNoMemberships(targetUserId) ? 1 : 0,
      });
      return { success: true, results: [] };
    }

    if (sql.includes('SELECT CASE WHEN NOT EXISTS')) {
      const targetUserId = Number(args[0]);
      return {
        success: true,
        results: [
          {
            identity_deactivated: this.hasNoMemberships(targetUserId) ? 1 : 0,
          },
        ],
      };
    }

    if (sql.includes('UPDATE convites_usuarios') || sql.includes('UPDATE setores_gestores')) {
      return { success: true, results: [] };
    }

    throw new Error(`Unexpected batch query: ${sql}`);
  }

  private hasNoMemberships(targetUserId: number): boolean {
    return (this.memberships.get(targetUserId)?.size || 0) === 0;
  }
}

describe('DELETE /admin/usuarios/:id final membership concurrency', () => {
  it('deactivates the identity when two tenant removals read the same initial count', async () => {
    const database = new ConcurrentRemovalDatabase();
    const app = new Hono<{ Bindings: Env }>();
    app.route('/admin/usuarios', adminUsuariosRoutes);
    const env = { DB: database as unknown as D1Database } as unknown as Env;

    const responses = await Promise.all(
      [10, 20].map((empresaId) =>
        app.fetch(
          new Request('http://localhost/admin/usuarios/42', {
            method: 'DELETE',
            headers: { 'x-empresa-id': String(empresaId) },
          }),
          env,
          {} as ExecutionContext,
        ),
      ),
    );

    const bodies = await Promise.all(
      responses.map(
        (response) =>
          response.json() as Promise<{
            success: boolean;
            data: { identity_deactivated: boolean };
          }>,
      ),
    );

    expect(responses.map((response) => response.status)).toEqual([200, 200]);
    expect(database.preflightSnapshots).toEqual([2, 2]);
    expect(database.memberships.get(42)?.size).toBe(0);
    expect(database.userActive).toBe(false);
    expect(database.refreshRevoked).toBe(true);
    expect(database.tokenBlocklisted).toBe(true);
    expect(database.audits.map((audit) => audit.identityDeactivated).sort()).toEqual([0, 1]);
    expect(bodies.filter((body) => body.data.identity_deactivated)).toHaveLength(1);
  });
});
