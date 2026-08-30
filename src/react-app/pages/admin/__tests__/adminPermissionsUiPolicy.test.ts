import { describe, expect, it } from 'vitest';
import {
  canEditAdminPermissions,
  resolveConfiguredAdminPermission,
} from '../adminPermissionsUiPolicy';

describe('adminPermissionsUiPolicy', () => {
  it('fails closed when a permission row is absent', () => {
    const permissions = new Map<string, boolean>([
      ['GESTOR:funcionarios:visualizar', true],
      ['ALUNO:funcionarios:editar', false],
    ]);

    expect(resolveConfiguredAdminPermission(permissions, 'GESTOR:funcionarios:visualizar')).toBe(true);
    expect(resolveConfiguredAdminPermission(permissions, 'ALUNO:funcionarios:editar')).toBe(false);
    expect(resolveConfiguredAdminPermission(permissions, 'INSTRUTOR:frms:editar')).toBe(false);
  });

  it('only enables editing after a successful load', () => {
    expect(canEditAdminPermissions('loading')).toBe(false);
    expect(canEditAdminPermissions('error')).toBe(false);
    expect(canEditAdminPermissions('ready')).toBe(true);
  });
});
