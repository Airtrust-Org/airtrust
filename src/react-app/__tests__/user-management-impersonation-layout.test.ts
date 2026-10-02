import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const usuariosPage = readFileSync('src/react-app/pages/admin/UsuariosPage.tsx', 'utf8');

describe('user management impersonation and embedded layout contract', () => {
  it('keeps admin impersonation available on the canonical user-management surface', () => {
    expect(usuariosPage).toContain('httpClient.post<ImpersonationResponse>(');
    expect(usuariosPage).toContain("'/auth/impersonate'");
    expect(usuariosPage).toContain('{ retry: 0 }');
    expect(usuariosPage).toContain('{ userId: u.id }');
    expect(usuariosPage).toContain('title="Entrar como este usuário"');
    expect(usuariosPage).toContain('isAdmin && Number(user?.id) !== Number(u.id)');
    expect(usuariosPage).toContain('clearAllScopedAuthStorage()');
    expect(usuariosPage).toContain("writeAuthStorageValue('airtrust_user'");
  });

  it('uses the Settings page width when embedded instead of adding a second max-width margin', () => {
    expect(usuariosPage).toContain("embedded ? 'space-y-4'");
    expect(usuariosPage).toContain("'mx-auto max-w-7xl space-y-6 px-4 py-6 sm:px-6'");
  });

  it('only presents active tenant sectors for manager invitations and removes stale selections', () => {
    expect(usuariosPage).toContain('Number(setor.ativo) === 1');
    expect(usuariosPage).toContain(
      'const selecionadosValidos = selectedIds.filter((id) => idsAtivos.has(id));',
    );
    expect(usuariosPage).toContain('onChange(selecionadosValidos);');
  });
});
