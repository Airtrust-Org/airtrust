export interface DevelopmentModuleVisibilityUser {
  email?: string | null;
  role?: string | null;
}

export const PRIMARY_ADMIN_EMAILS = ['filipe.daumas@icloud.com'] as const;

const PRIMARY_ADMIN_EMAIL_ALLOWLIST = new Set(
  PRIMARY_ADMIN_EMAILS.map((email) => email.trim().toLowerCase()),
);

const PRIMARY_ADMIN_ROLES = new Set(['ADMIN', 'ADMINISTRADOR']);

function normalizeEmail(email: string | null | undefined): string {
  return String(email || '')
    .trim()
    .toLowerCase();
}

function normalizeRole(role: string | null | undefined): string {
  return String(role || '')
    .trim()
    .toUpperCase();
}

export function isPrimaryAdminEmail(email: string | null | undefined): boolean {
  return PRIMARY_ADMIN_EMAIL_ALLOWLIST.has(normalizeEmail(email));
}

export function isPrimaryAdmin(
  user: DevelopmentModuleVisibilityUser | null | undefined,
): boolean {
  if (!user) return false;

  return (
    isPrimaryAdminEmail(user.email) &&
    PRIMARY_ADMIN_ROLES.has(normalizeRole(user.role))
  );
}

export function canSeeDevelopmentModules(
  user: DevelopmentModuleVisibilityUser | null | undefined,
): boolean {
  return isPrimaryAdmin(user);
}

export function canSeeAdministrativeDashboard(
  user: DevelopmentModuleVisibilityUser | null | undefined,
): boolean {
  return isPrimaryAdmin(user);
}

export function shouldShowRestrictedDevelopmentNavItems(
  user: DevelopmentModuleVisibilityUser | null | undefined,
): boolean {
  return canSeeDevelopmentModules(user);
}
