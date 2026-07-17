/**
 * usePermissions — hook de controle de acesso baseado em perfil + overrides individuais
 *
 * Hierarquia de resolução:
 *   1. DENY override individual → nega, independente do role
 *   2. GRANT override individual → concede, independente do role
 *   3. Permissões padrão do perfil (role defaults)
 *
 * Roles suportados:
 *   ADMINISTRADOR — acesso total
 *   GESTOR        — acesso total exceto configurações críticas / gestão de admins
 *   INSTRUTOR     — simuladores + avaliação + minha escala
 *   ALUNO         — minha escala publicada + minhas fichas
 *
 * Uso:
 *   const { can, role, isAdmin, isGestor, isInstrutor, isAluno } = usePermissions();
 *   if (can('funcionarios.edit')) { ... }
 *
 *   <Gate permission="admin.usuarios">
 *     <UsuariosPage />
 *   </Gate>
 */

import { useAuth } from './useAuth';
import {
  readScopedPerfis,
  clearLegacyPerfisCache,
  type AuthStorageScope,
} from '@/react-app/utils/auth-storage';

function normalizeRole(role?: string | null): string {
  const normalized = String(role || '')
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

// ─── Permissões padrão por perfil ────────────────────────────────────────────

const ROLE_DEFAULTS_BUILTIN: Record<string, string[] | null> = {
  ADMINISTRADOR: null, // wildcard
  ADMIN: null, // alias legado
  GESTOR: null,
  INSTRUTOR: [
    'simuladores.view',
    'simuladores.evaluate',
    'simuladores.sign_own',
    'simuladores.sign_student',
    'escalas.view',
    'self.ficha',
    'self.escala',
  ],
  ALUNO: [
    'simuladores.view', // visualizar sessões onde é participante (backend filtra)
    'self.ficha',
    'self.escala',
  ],
  // Aliases legados
  COMPLIANCE: [
    'dashboard.view',
    'funcionarios.view',
    'qualificacoes.view',
    'relatorios.view',
    'relatorios.export',
    'frms.view',
    'sgso.view',
    'self.ficha',
    'self.escala',
  ],
  USUARIO: ['self.ficha', 'self.escala'],
};

const GESTOR_BLOCKED_PERMISSIONS = new Set(['admin.config', 'admin.multiempresa']);

function toScope(
  userId: number | string | null | undefined,
  empresaId: number | string | null | undefined,
): AuthStorageScope | null {
  if (!userId || !empresaId) return null;
  return { empresaId, userId };
}

/**
 * Resolve the effective permission set for a given role.
 * Priority: scoped localStorage → builtin defaults.
 * Legacy global key `airtrust_perfis_custom` is NEVER used.
 */
function resolveRolePermissions(role: string, scope: AuthStorageScope | null): Set<string> {
  // Limpar chave legada se existir (one-time migration)
  clearLegacyPerfisCache();

  if (scope) {
    const scoped = readScopedPerfis(scope);
    if (scoped) {
      const match = scoped.find((p) => p.value.toUpperCase() === role.toUpperCase());
      if (match !== undefined) {
        if (match.permissoes === null) return new Set(['*']);
        return new Set(match.permissoes);
      }
    }
  }

  const builtin = ROLE_DEFAULTS_BUILTIN[role.toUpperCase()];
  if (builtin === undefined) return new Set();
  if (builtin === null) return new Set(['*']);
  return new Set(builtin);
}

// ─── Hook ─────────────────────────────────────────────────────────────────────

export function usePermissions() {
  const { user, empresaAtualId } = useAuth();

  const role = normalizeRole(user?.role);
  // permissions pode ser undefined em tokens emitidos antes da migration
  const overrides: string[] = Array.isArray(user?.permissions) ? user.permissions : [];

  // Pré-processar overrides em mapas para O(1) lookup
  const grants = new Set<string>();
  const denies = new Set<string>();
  for (const o of overrides) {
    if (o.startsWith('GRANT:')) grants.add(o.slice(6));
    else if (o.startsWith('DENY:')) denies.add(o.slice(5));
  }

  // Resolve role permissions (checks scoped localStorage first, legacy key ignored)
  const scope = toScope(user?.id, empresaAtualId);
  const rolePerms = resolveRolePermissions(role, scope);
  const isWildcard = rolePerms.has('*');

  /**
   * Verifica se o usuário tem permissão para `permission`.
   * Também aceita array: `can(['a','b'])` retorna true se tiver qualquer uma.
   */
  function can(permission: string | string[]): boolean {
    if (!user) return false;

    const permissions = Array.isArray(permission) ? permission : [permission];

    return permissions.some((p) => {
      if (role === 'GESTOR' && GESTOR_BLOCKED_PERMISSIONS.has(p)) return false;
      // 1. DENY override explícito
      if (denies.has(p)) return false;
      // 2. GRANT override explícito
      if (grants.has(p)) return true;
      // 3. Role wildcard (ADMINISTRADOR)
      if (isWildcard) return true;
      // 4. Role defaults
      return rolePerms.has(p);
    });
  }

  /**
   * Verifica se o usuário tem TODAS as permissões da lista.
   */
  function canAll(permissions: string[]): boolean {
    return permissions.every((p) => can(p));
  }

  return {
    can,
    canAll,
    role,
    isAdmin: role === 'ADMINISTRADOR' || role === 'ADMIN',
    isGestor: role === 'GESTOR',
    isInstrutor: role === 'INSTRUTOR',
    isAluno: role === 'ALUNO',
    isAuthenticated: !!user,
    user,
  };
}

export type PermissionsHook = ReturnType<typeof usePermissions>;
