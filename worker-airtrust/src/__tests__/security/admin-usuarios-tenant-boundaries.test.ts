import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const currentDirectory = dirname(fileURLToPath(import.meta.url));
const source = readFileSync(resolve(currentDirectory, '../../routes/admin-usuarios.ts'), 'utf8');

describe('admin usuarios P0 security boundaries', () => {
  it('registers the hardened routes before the legacy fallback', () => {
    const hardened = source.indexOf("adminUsuariosRoutes.route('/', protectedAdminUsuariosRoutes)");
    const legacy = source.indexOf("adminUsuariosRoutes.route('/', legacyAdminUsuariosRoutes)");
    expect(hardened).toBeGreaterThan(-1);
    expect(legacy).toBeGreaterThan(hardened);
  });

  it('uses persisted platform access instead of tenant ADMIN role for global listing', () => {
    expect(source).toContain('const platformAdmin = await hasPlatformAdminAccess(db, callerId)');
    expect(source).not.toContain(
      "const isGlobalAdmin = callerRole === 'ADMINISTRADOR' || callerRole === 'ADMIN'",
    );
  });

  it('fails closed when platform access cannot resolve an unambiguous target company', () => {
    expect(source).toContain('async function resolveTargetAccess(');
    expect(source).toContain('AMBIGUOUS_TARGET_TENANT');
    expect(source).toContain('target.accessed_cross_tenant');
  });

  it('evaluates the final membership after deletion inside the atomic batch', () => {
    const deletion = source.slice(
      source.indexOf("protectedAdminUsuariosRoutes.delete('/:id'"),
      source.indexOf("protectedAdminUsuariosRoutes.get('/:id/permissoes'"),
    );
    const membershipDelete = deletion.indexOf(
      'DELETE FROM usuarios_empresas WHERE usuario_id = ? AND empresa_id = ?',
    );
    const identityUpdate = deletion.indexOf('UPDATE usuarios');

    // The global identity decision must observe the membership DELETE in the same batch.
    expect(membershipDelete).toBeGreaterThan(-1);
    expect(identityUpdate).toBeGreaterThan(membershipDelete);
    expect(deletion).not.toContain('const isLastMembership');
    expect(deletion.match(/SELECT 1 FROM usuarios_empresas WHERE usuario_id = \?/g)).toHaveLength(
      5,
    );
    expect(deletion).toContain('const batchResults = await db.batch(statements)');
    expect(deletion).toContain("'identity_deactivated' in deactivationRow");
    expect(deletion).toContain('identity_deactivated: identityDeactivated');
  });

  it('revokes sessions and records audit in the same password-reset batch', () => {
    const reset = source.slice(
      source.indexOf("protectedAdminUsuariosRoutes.patch('/:id/reset-senha'"),
    );
    expect(reset).toContain('const target = await findTargetInTenant(db, targetUserId, empresaId)');
    expect(reset).toContain('INSERT OR IGNORE INTO token_blocklist');
    expect(reset).toContain('INSERT OR IGNORE INTO token_blocklist (jti, expires_at)');
    expect(reset).not.toContain('INSERT OR IGNORE INTO token_blocklist (jti, revoked_at, expires_at)');
    expect(reset).toContain('UPDATE refresh_tokens');
    expect(reset).toContain("'ADMIN_RESET_SENHA'");
    expect(reset).toContain('await db.batch([');
    expect(reset).not.toContain('best-effort');
  });

  it('makes permission replacement atomic and blocks tenant admins for multi-company identities', () => {
    const permissions = source.slice(
      source.indexOf("protectedAdminUsuariosRoutes.put('/:id/permissoes'"),
      source.indexOf("protectedAdminUsuariosRoutes.patch('/:id/reset-senha'"),
    );
    expect(permissions).toContain('MULTI_TENANT_PERMISSIONS_REQUIRE_PLATFORM_ADMIN');
    expect(permissions).toContain('await db.batch(statements)');
    expect(permissions).toContain("'ADMIN_REPLACE_USER_PERMISSIONS'");
  });
});
